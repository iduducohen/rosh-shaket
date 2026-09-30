using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace RoshShaket.Infrastructure.Postgres;

/// <summary>
/// Ensures workspace tables exist on databases that were created earlier with EnsureCreated
/// (which does not evolve schemas). Safe to run repeatedly.
/// </summary>
public static class WorkspaceSchema
{
    public static async Task EnsureAsync(RightsDbContext db, ILogger logger, CancellationToken ct = default)
    {
        // Users may be missing on a partially-initialized DB; create the auth tables if needed.
        await Exec(db, """
            CREATE TABLE IF NOT EXISTS users (
              "Id" uuid PRIMARY KEY,
              "Email" varchar(254) NULL,
              "Name" varchar(100) NULL,
              "CreatedAt" timestamptz NOT NULL,
              "LastLoginAt" timestamptz NOT NULL,
              "UpdatedAt" timestamptz NOT NULL DEFAULT TIMESTAMPTZ '0001-01-01 00:00:00+00',
              "LastActiveAt" timestamptz NOT NULL DEFAULT TIMESTAMPTZ '0001-01-01 00:00:00+00'
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users ("Email");
            """, ct);

        await Exec(db, """
            CREATE TABLE IF NOT EXISTS user_identities (
              "Id" uuid PRIMARY KEY,
              "UserId" uuid NOT NULL REFERENCES users("Id") ON DELETE CASCADE,
              "Provider" varchar(32) NOT NULL,
              "Subject" varchar(254) NOT NULL,
              "CreatedAt" timestamptz NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_user_identities_provider_subject ON user_identities ("Provider", "Subject");
            """, ct);

        await Exec(db, """
            ALTER TABLE users ADD COLUMN IF NOT EXISTS "UpdatedAt" timestamptz NOT NULL DEFAULT TIMESTAMPTZ '0001-01-01 00:00:00+00';
            """, ct);
        await Exec(db, """
            ALTER TABLE users ADD COLUMN IF NOT EXISTS "LastActiveAt" timestamptz NOT NULL DEFAULT TIMESTAMPTZ '0001-01-01 00:00:00+00';
            """, ct);

        await Exec(db, """
            CREATE TABLE IF NOT EXISTS user_workspaces (
              "Id" uuid PRIMARY KEY,
              "UserId" uuid NOT NULL REFERENCES users("Id") ON DELETE CASCADE,
              "Name" varchar(120) NOT NULL,
              "Status" varchar(32) NOT NULL,
              "CurrentStep" varchar(64) NOT NULL,
              "CurrentRoute" varchar(200) NOT NULL,
              "IsActive" boolean NOT NULL,
              "Version" integer NOT NULL,
              "CreatedAt" timestamptz NOT NULL,
              "UpdatedAt" timestamptz NOT NULL,
              "LastAccessedAt" timestamptz NOT NULL,
              "CompletedAt" timestamptz NULL,
              "DeletedAt" timestamptz NULL
            );
            CREATE INDEX IF NOT EXISTS ix_user_workspaces_userid ON user_workspaces ("UserId");
            CREATE INDEX IF NOT EXISTS ix_user_workspaces_userid_active ON user_workspaces ("UserId", "IsActive");
            CREATE INDEX IF NOT EXISTS ix_user_workspaces_updated ON user_workspaces ("UpdatedAt");
            CREATE INDEX IF NOT EXISTS ix_user_workspaces_status ON user_workspaces ("Status");
            """, ct);

        await Exec(db, """
            CREATE TABLE IF NOT EXISTS workspace_workflow_states (
              "WorkspaceId" uuid PRIMARY KEY REFERENCES user_workspaces("Id") ON DELETE CASCADE,
              "CurrentStep" varchar(64) NOT NULL,
              "PreviousStep" varchar(64) NULL,
              "Status" varchar(32) NOT NULL,
              "ProgressPercentage" integer NOT NULL,
              "StateJson" jsonb NOT NULL,
              "Version" integer NOT NULL,
              "StateSchemaVersion" integer NOT NULL,
              "StartedAt" timestamptz NOT NULL,
              "LastUpdatedAt" timestamptz NOT NULL,
              "CompletedAt" timestamptz NULL
            );
            """, ct);

        await Exec(db, """
            CREATE TABLE IF NOT EXISTS workspace_documents (
              "Id" uuid PRIMARY KEY,
              "WorkspaceId" uuid NOT NULL REFERENCES user_workspaces("Id") ON DELETE CASCADE,
              "UserId" uuid NOT NULL,
              "DocumentType" varchar(64) NOT NULL,
              "OriginalFileName" varchar(260) NOT NULL,
              "StoredFileName" varchar(260) NOT NULL,
              "ContentType" varchar(120) NOT NULL,
              "FileSize" bigint NOT NULL,
              "StorageProvider" varchar(32) NOT NULL,
              "StorageKey" varchar(500) NOT NULL,
              "HashSha256" varchar(64) NOT NULL,
              "Version" integer NOT NULL,
              "Status" varchar(32) NOT NULL,
              "MetadataJson" jsonb NULL,
              "UploadedAt" timestamptz NOT NULL,
              "UpdatedAt" timestamptz NOT NULL,
              "DeletedAt" timestamptz NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ix_workspace_documents_storagekey ON workspace_documents ("StorageKey");
            CREATE INDEX IF NOT EXISTS ix_workspace_documents_userid ON workspace_documents ("UserId");
            CREATE INDEX IF NOT EXISTS ix_workspace_documents_workspaceid ON workspace_documents ("WorkspaceId");
            CREATE INDEX IF NOT EXISTS ix_workspace_documents_uploaded ON workspace_documents ("UploadedAt");
            CREATE INDEX IF NOT EXISTS ix_workspace_documents_status ON workspace_documents ("Status");
            """, ct);

        await Exec(db, """
            CREATE TABLE IF NOT EXISTS workspace_audit (
              "Id" uuid PRIMARY KEY,
              "UserId" uuid NOT NULL,
              "WorkspaceId" uuid NULL,
              "Action" varchar(64) NOT NULL,
              "EntityType" varchar(64) NULL,
              "EntityId" uuid NULL,
              "PreviousValue" text NULL,
              "NewValue" text NULL,
              "MetadataJson" text NULL,
              "CreatedAt" timestamptz NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_workspace_audit_userid ON workspace_audit ("UserId");
            CREATE INDEX IF NOT EXISTS ix_workspace_audit_workspaceid ON workspace_audit ("WorkspaceId");
            CREATE INDEX IF NOT EXISTS ix_workspace_audit_created ON workspace_audit ("CreatedAt");
            """, ct);

        logger.LogInformation("Workspace schema ensured.");
    }

    private static Task<int> Exec(RightsDbContext db, string sql, CancellationToken ct) =>
        db.Database.ExecuteSqlRawAsync(sql, ct);
}
