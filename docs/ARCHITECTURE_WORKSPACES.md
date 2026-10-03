# Persistent User Workspace Architecture

## 1. Architecture Summary

```text
Authentication (Bearer tokens)
     ↓
User (Postgres users / user_identities)
     ↓
Workspace (user_workspaces)  ← one active + many archived
     ↓
Workflow State (workspace_workflow_states.StateJson jsonb)
     ↓
User Data (wizard snapshot: profile, choice, funds, results)
     ↓
Documents (workspace_documents metadata)
     ↓
Persistent Storage (IFileStorage → LocalFileStorage; Azure/S3-ready)
```

- **Source of truth:** Postgres + file volume (not browser storage).
- **Guests:** remain local-only until sign-in (no forgeable anonymous workspace IDs).
- **Payslip OCR images:** for signed-in users, stored as `DocumentType=payslip` after successful OCR; guests keep the previous “not stored” behavior.

## 2. Database Diagram

```text
users 1──* user_identities
  │
  └──1──* user_workspaces
            │ 1──1 workspace_workflow_states
            │ 1──* workspace_documents
            └──* workspace_audit
```

Schema is applied via `EnsureCreated` (fresh) + `WorkspaceSchema.EnsureAsync` (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) so existing databases evolve without data loss.

## 3. API Endpoints

All under `.RequireAuthorization()`. Ownership is always `ClaimTypes.NameIdentifier` — never trust `userId` from the body.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/workspaces` | List workspaces |
| GET | `/api/workspaces/current` | Get-or-create active workspace + resume |
| POST | `/api/workspaces` | Create new active workspace |
| GET | `/api/workspaces/{id}` | Get one (owner only) |
| PUT | `/api/workspaces/{id}/state` | Autosave workflow + snapshot (`ExpectedVersion` → 409) |
| POST | `/api/workspaces/{id}/activate` | Switch active workspace |
| DELETE | `/api/workspaces/{id}` | Soft-delete / archive |
| GET | `/api/workspaces/{id}/documents` | List documents |
| POST | `/api/workspaces/{id}/documents` | Upload (multipart `file`) |
| GET | `/api/documents/{id}` | Authorized download |
| DELETE | `/api/documents/{id}` | Soft-delete document |

## 4. Storage Architecture

- Abstraction: `IFileStorage`, chosen by `FileStorage:Provider`
  - `local` (default): `LocalFileStorage` (`FileStorage:LocalRoot`, default `/data/documents`, Docker volume `docstore`)
  - `s3`: `S3FileStorage` — a private AWS S3 bucket (`FileStorage:S3:Bucket`, `:Region`, optional `:KeyPrefix`).
    Credentials come from the standard AWS chain (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or an IAM role on AWS).
    Objects are written with SSE-S3 encryption; startup fails if the provider is `s3` and no bucket is set.
- Keys: `{userId}/{workspaceId}/{documentId}-{safeName}` (no `..`, no leading `/`; under `KeyPrefix` in S3)
- `workspace_documents.StorageProvider` records where each file went (`local` / `s3`). Switching providers does not
  move existing files: documents saved under the old provider stop opening until they are copied over.
- Upload reliability: **write file → insert DB**; on DB failure **delete file**
- Soft-delete keeps blob for recovery; purge job can be added later (in S3, a lifecycle rule can expire objects)

### S3 bucket setup (one bucket per environment)

| Setting | Value |
|---------|-------|
| Region | `il-central-1` (opt-in region: enable it under Account → AWS Regions first) |
| Object Ownership | ACLs disabled |
| Block all public access | On |
| Default encryption | SSE-S3 |
| Versioning | Off in dev, on in production |
| Lifecycle | Expire objects (dev 30 days; production per privacy policy), abort incomplete multipart uploads after 7 days |
| Bucket policy | Deny `aws:SecureTransport = false` |

IAM user for the API (no console access), policy limited to the bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<bucket>/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<bucket>"
    }
  ]
}
```

`s3:ListBucket` is what lets S3 answer a missing object with 404 (read as "file missing") instead of 403.

## 5. State Restoration Flow

1. User signs in → tokens issued.
2. Client navigates to `/resume`.
3. `GET /api/workspaces/current` loads or creates active workspace.
4. `WizardStore.hydrate(snapshot)` restores profile/choice/funds/results.
5. UI shows welcome-back card (step, document count, last updated) or skips if empty.
6. **Continue** → `currentRoute` (or inferred from data).
7. Autosave (debounce 800ms + on navigation + before logout) keeps Postgres in sync.
8. Save status shown in desk header: שומרים… / נשמר / error+retry.

## 6. Failure / Recovery

| Failure | Behavior |
|---------|----------|
| Browser refresh | Re-login session from tokens → `/resume` → hydrate |
| Logout | Flush save → soft state cleared locally; server data remains |
| App/container restart | DB + `docstore` volume persist |
| Network / save error | UI error + automatic retry; no silent loss |
| Upload: storage OK, DB fail | File deleted (orphan cleanup) |
| Upload: validation fail | No file, no row |
| Concurrent tabs | Optimistic `Version`; 409 → re-fetch |

## 7. Security Review

- Every workspace/document route requires auth.
- Queries filter `UserId == claim` (IDOR-safe).
- Downloads stream through API (no public blob URLs).
- Content-type allowlist + 10MB limit + sanitized file names.
- Path traversal blocked in `LocalFileStorage.Resolve`.
- Audit log records actions without file contents.

## 8. Tests

- `WizardSnapshotTests` — JSON round-trip + constants (`RoshShaket.Application.Tests`)
- Manual acceptance: login → work → refresh → resume; logout → login → continue; upload payslip when signed in → document listed.

## Known compromises / next improvements

1. Replace `EnsureCreated` + raw SQL with formal EF Core migrations for production.
2. ~~S3 `IFileStorage` adapter~~ — done (`S3FileStorage`). A migration tool from `docstore` to S3 is still open.
3. Background purge for soft-deleted blobs.
4. Guest→account merge of in-memory wizard on first sign-in.
5. Broader integration tests for IDOR and upload failure matrix.
6. Update privacy policy copy: signed-in payslips are now retained in the account.
