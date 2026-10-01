# Authentication setup (Rosh Shaket)

This project already implements a **single User** with multiple identity rows (`users` + `user_identities`), passwordless **Email OTP**, and **Google / Apple / Microsoft** as external identity providers. Sessions are ASP.NET **BearerToken** (access ~1h, refresh ~30d) stored in the browser as `localStorage` key `rs-auth`.

There is **no** Node-generated `SESSION_SECRET`. ASP.NET **Data Protection** encrypts bearer/refresh ticket payloads. Keys are stored in **Postgres** so Railway container replacements do not log everyone out.

## Why Bearer + localStorage (not HttpOnly cookies)

The client is an Angular/Ionic SPA plus Capacitor native apps that call the API on another origin (Railway). Cross-origin HttpOnly cookies need a strict CSRF strategy and are awkward for native WebViews. The API validates provider ID tokens / OTP server-side and never trusts client-supplied user ids for authorization.

---

## Architecture

```
Client (Angular)
  ├─ Google GIS / Capgo  ──► POST /api/auth/external   (code or idToken)
  ├─ Apple JS / Capgo    ──► POST /api/auth/external   (idToken)
  ├─ Microsoft MSAL      ──► POST /api/auth/external   (idToken)
  └─ Email OTP           ──► POST /api/auth/email/start
                             POST /api/auth/email/verify
                                    │
                                    ▼
                              Server Auth Layer
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              users table    user_identities    Redis OTP hash
                    │
                    ▼
              BearerToken (Data Protection keys in Postgres)
```

---

## Local development — User Secrets (preferred)

Do **not** put OAuth/SMTP secrets in a project `.env` for `dotnet run`. .NET stores User Secrets **outside** the repo (they never hit Git).

From the API project folder:

```powershell
cd C:\Dev\rosh-shaket\rosh-shaket\server\src\RoshShaket.Api

# Already initialized in the csproj (UserSecretsId). Re-run only if needed:
# dotnet user-secrets init

dotnet user-secrets set "Authentication:Google:ClientId" "YOUR_GOOGLE_WEB_CLIENT_ID"
dotnet user-secrets set "Authentication:Google:ClientSecret" "YOUR_GOOGLE_CLIENT_SECRET"
dotnet user-secrets set "Authentication:Google:IosClientId" "YOUR_IOS_CLIENT_ID"

dotnet user-secrets set "Authentication:Apple:ClientId" "YOUR_APPLE_SERVICES_ID"

dotnet user-secrets set "Authentication:Microsoft:ClientId" "YOUR_MICROSOFT_CLIENT_ID"
dotnet user-secrets set "Authentication:Microsoft:TenantId" "common"

dotnet user-secrets set "Authentication:RedirectOrigin" "http://localhost:5051"

dotnet user-secrets set "Authentication:Otp:Pepper" "long-random-dev-pepper"

dotnet user-secrets set "Authentication:Smtp:Host" "smtp.example.com"
dotnet user-secrets set "Authentication:Smtp:User" "..."
dotnet user-secrets set "Authentication:Smtp:Password" "..."
dotnet user-secrets set "Authentication:Smtp:From" "noreply@example.com"
```

List / clear:

```powershell
dotnet user-secrets list
dotnet user-secrets clear
```

Connection strings for local Postgres/Redis/Mongo stay in `appsettings.json` / `appsettings.Development.json` (non-secret defaults) or can also be overridden via User Secrets (`ConnectionStrings:Postgres`, …).

Root `.env.example` exists only for **docker-compose** flat env mapping — not required for local `dotnet run`.

---

## Config key convention

Preferred section name: **`Authentication`**.

| User Secrets / appsettings | Railway / docker env |
|----------------------------|----------------------|
| `Authentication:Google:ClientId` | `Authentication__Google__ClientId` |
| `Authentication:Google:ClientSecret` | `Authentication__Google__ClientSecret` |
| `Authentication:Apple:ClientId` | `Authentication__Apple__ClientId` |
| `Authentication:Microsoft:ClientId` | `Authentication__Microsoft__ClientId` |
| `Authentication:Microsoft:TenantId` | `Authentication__Microsoft__TenantId` |
| `Authentication:RedirectOrigin` | `Authentication__RedirectOrigin` |
| `Authentication:Otp:Pepper` | `Authentication__Otp__Pepper` |
| `Authentication:Smtp:Host` | `Authentication__Smtp__Host` |

Legacy `Auth__*` / `Auth:*` still binds for backward compatibility; **`Authentication` wins** when both are set.

Optional flat aliases: `AUTH_OTP_PEPPER`, `AUTH_REDIRECT_ORIGIN`.

---

## Data Protection (critical on Railway)

Bearer and refresh tokens are protected by the ASP.NET Data Protection key ring.

- **With Postgres** (normal for this app): keys are stored in table `data_protection_keys` via `PersistKeysToDbContext<RightsDbContext>`.
- **Without Postgres connection string**: falls back to a filesystem folder (`DataProtection:KeysPath` or a temp path).

On Railway the container filesystem is **ephemeral** — a new deploy replaces the container. If keys lived only on disk, every deploy would invalidate all sessions and force every user to log in again. **Postgres persistence fixes that.** You do **not** need a `DataProtection__KeysPath` volume in production when Postgres is configured.

After deploy, startup logs should say:

`DataProtection: persisting keys to Postgres (data_protection_keys).`

If you still see `FileSystemXmlRepository` / `/tmp/rosh-shaket-dp-keys`, either the new build is not deployed or `ConnectionStrings__Postgres` is missing on the service.

No separate `SESSION_SECRET` env var is required.

---

## Mongo content (`/api/sources`, `/api/checklist`)

Editorial sources live in MongoDB. If `ConnectionStrings__Mongo` is wrong, unreachable, or the plugin is sleeping, those endpoints used to hang ~30s and return 500.

The API now uses short Mongo timeouts and returns an **empty list** (with an error log) instead of failing the request. `/api/partners` is unaffected (JSON file).

On Railway, verify:

1. A Mongo service (or Atlas) is linked.
2. `ConnectionStrings__Mongo` is the **private/internal** Railway URL when both services are in the same project (or a working public URI with auth).
3. Database name matches `Mongo__Database` (default `rosh_shaket`) and collections `sources` / `checklist_items` are seeded.

---

## API routes (actual)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/auth/providers` | Public | Enabled providers + public client ids |
| POST | `/api/auth/external` | Public | Google / Apple / Microsoft |
| POST | `/api/auth/email/start` | Public | Send OTP (204, no enumeration) |
| POST | `/api/auth/email/verify` | Public | Verify OTP → session |
| POST | `/api/auth/refresh` | Public | Rejects denylisted refresh |
| POST | `/api/auth/logout` | Public | Revoke refresh token |
| GET | `/api/auth/me` | Bearer | Current user |
| GET | `/api/auth/identities` | Bearer | Linked providers |
| POST | `/api/auth/link` | Bearer | Link provider |
| DELETE | `/api/auth/link/{provider}` | Bearer | Unlink (keeps ≥1 method) |

There is **no** server redirect like `/auth/google/callback`. Web OAuth uses popup / GIS / MSAL; the backend only accepts verified tokens/codes.

---

## Local URLs

| Surface | URL |
|---------|-----|
| Frontend (`npm start`) | http://localhost:5051 |
| Backend API | http://localhost:5080 |
| Health | http://localhost:5080/health |
| Swagger | http://localhost:5080/swagger |

`Authentication:RedirectOrigin=http://localhost:5051` → Apple/Microsoft `redirectUri` = `http://localhost:5051/login`.

Google web uses GIS popup code exchange with `redirect_uri=postmessage`.

---

## Production URLs

| Surface | URL |
|---------|-----|
| API (Railway) | https://rosh-shaket-production.up.railway.app |
| Frontend | Your Vercel (or other) deployment origin |

Set `Cors__Origins__0` to the production frontend. `*.vercel.app` previews are already allowed in code.

---

## Railway environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `Authentication__Google__ClientId` | For Google | Web OAuth client id |
| `Authentication__Google__ClientSecret` | For Google | Code exchange |
| `Authentication__Google__IosClientId` | Native iOS | Extra allowed `aud` |
| `Authentication__Apple__ClientId` | For Apple web | Services ID |
| `Authentication__Apple__BundleId` | Optional | Default `il.roshshaket.app` |
| `Authentication__Microsoft__ClientId` | For Microsoft | Entra app id |
| `Authentication__Microsoft__TenantId` | Optional | Default `common` |
| `Authentication__RedirectOrigin` | Apple/MS web | Frontend origin |
| `Authentication__Otp__Pepper` | **Prod yes** | HMAC pepper for OTP |
| `Authentication__Smtp__Host` | Prod email | SMTP |
| `Authentication__Smtp__User` / `Password` / `From` | As needed | SMTP |
| `ConnectionStrings__Postgres` | **Yes** | Users + **Data Protection keys** |
| `ConnectionStrings__Redis` | Strongly recommended | OTP + refresh denylist |
| `Cors__Origins__0` | Prod yes | Exact frontend origin |

**Do not rely on `DataProtection__KeysPath` on Railway** when Postgres is available.

---

## Provider console setup

### Google

1. [Google Cloud Console](https://console.cloud.google.com/) → Credentials.
2. OAuth consent screen.
3. OAuth client type **Web application**.
4. Authorized JavaScript origins: `http://localhost:5051` + production frontend.
5. Copy Client ID / Secret into User Secrets or Railway `Authentication__Google__*`.
6. iOS client id → `Authentication:Google:IosClientId` and `client/src/environments/native-auth.json`.

### Apple

1. App ID with Sign in with Apple.
2. Services ID → `Authentication:Apple:ClientId`.
3. Return URL: `{RedirectOrigin}/login` (local `http://localhost:5051/login`).
4. Identity key is Apple `sub`, not email (private relay / hidden email are normal).

### Microsoft

1. Entra app registration; SPA redirect `{RedirectOrigin}/login`.
2. Client ID → `Authentication:Microsoft:ClientId`.
3. Tenant must match `Authentication:Microsoft:TenantId` (`common` by default).

### Email (SMTP)

1. Set `Authentication:Smtp:*` via User Secrets locally / Railway in production.
2. Without SMTP host, codes are logged (`DEV login code…`) — development only.
3. OTP: 6 digits, HMAC with pepper, 10 min TTL, 5 attempts, ~60s cooldown, 5/hour/email.

---

## Security notes

- Raw OTP never stored; HMAC hash in Redis.
- Refresh logout denylists SHA-256(refreshToken).
- OAuth: RS256 JWKS (issuer, audience, expiry, signature).
- Data Protection keys in Postgres survive deploys.
- `/email/start` returns 204 (no account enumeration).

---

## Manual steps

- [ ] User Secrets locally (commands above)
- [ ] Google / Apple / Microsoft console setup
- [ ] SMTP for production OTP
- [ ] Railway: `Authentication__*` + Postgres + Redis + Cors
- [ ] Confirm `data_protection_keys` table exists after first API boot (`EnsureCreated`)

Code already wires login UI, OTP step, social providers, session restore, and guest continue.
