CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
    "ProductVersion" TEXT NOT NULL
);

BEGIN TRANSACTION;
CREATE TABLE "AspNetRoles" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_AspNetRoles" PRIMARY KEY,
    "Name" TEXT NULL,
    "NormalizedName" TEXT NULL,
    "ConcurrencyStamp" TEXT NULL
);

CREATE TABLE "AspNetUsers" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_AspNetUsers" PRIMARY KEY,
    "DisplayName" TEXT NOT NULL,
    "IsActive" INTEGER NOT NULL,
    "UserName" TEXT NULL,
    "NormalizedUserName" TEXT NULL,
    "Email" TEXT NULL,
    "NormalizedEmail" TEXT NULL,
    "EmailConfirmed" INTEGER NOT NULL,
    "PasswordHash" TEXT NULL,
    "SecurityStamp" TEXT NULL,
    "ConcurrencyStamp" TEXT NULL,
    "PhoneNumber" TEXT NULL,
    "PhoneNumberConfirmed" INTEGER NOT NULL,
    "TwoFactorEnabled" INTEGER NOT NULL,
    "LockoutEnd" TEXT NULL,
    "LockoutEnabled" INTEGER NOT NULL,
    "AccessFailedCount" INTEGER NOT NULL
);

CREATE TABLE "projects" (
    "id" TEXT NOT NULL CONSTRAINT "PK_projects" PRIMARY KEY,
    "name" TEXT NOT NULL,
    "state_json" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

CREATE TABLE "AspNetRoleClaims" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_AspNetRoleClaims" PRIMARY KEY AUTOINCREMENT,
    "RoleId" TEXT NOT NULL,
    "ClaimType" TEXT NULL,
    "ClaimValue" TEXT NULL,
    CONSTRAINT "FK_AspNetRoleClaims_AspNetRoles_RoleId" FOREIGN KEY ("RoleId") REFERENCES "AspNetRoles" ("Id") ON DELETE CASCADE
);

CREATE TABLE "ado_credentials" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pat_encrypted" TEXT NOT NULL,
    "snapshot_json" TEXT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "PK_ado_credentials" PRIMARY KEY ("project_id", "user_id"),
    CONSTRAINT "FK_ado_credentials_AspNetUsers_user_id" FOREIGN KEY ("user_id") REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE
);

CREATE TABLE "AspNetUserClaims" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_AspNetUserClaims" PRIMARY KEY AUTOINCREMENT,
    "UserId" TEXT NOT NULL,
    "ClaimType" TEXT NULL,
    "ClaimValue" TEXT NULL,
    CONSTRAINT "FK_AspNetUserClaims_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE
);

CREATE TABLE "AspNetUserLogins" (
    "LoginProvider" TEXT NOT NULL,
    "ProviderKey" TEXT NOT NULL,
    "ProviderDisplayName" TEXT NULL,
    "UserId" TEXT NOT NULL,
    CONSTRAINT "PK_AspNetUserLogins" PRIMARY KEY ("LoginProvider", "ProviderKey"),
    CONSTRAINT "FK_AspNetUserLogins_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE
);

CREATE TABLE "AspNetUserRoles" (
    "UserId" TEXT NOT NULL,
    "RoleId" TEXT NOT NULL,
    CONSTRAINT "PK_AspNetUserRoles" PRIMARY KEY ("UserId", "RoleId"),
    CONSTRAINT "FK_AspNetUserRoles_AspNetRoles_RoleId" FOREIGN KEY ("RoleId") REFERENCES "AspNetRoles" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_AspNetUserRoles_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE
);

CREATE TABLE "AspNetUserTokens" (
    "UserId" TEXT NOT NULL,
    "LoginProvider" TEXT NOT NULL,
    "Name" TEXT NOT NULL,
    "Value" TEXT NULL,
    CONSTRAINT "PK_AspNetUserTokens" PRIMARY KEY ("UserId", "LoginProvider", "Name"),
    CONSTRAINT "FK_AspNetUserTokens_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE
);

CREATE TABLE "files" (
    "id" TEXT NOT NULL CONSTRAINT "PK_files" PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "added_at" TEXT NOT NULL,
    "added_by" TEXT NOT NULL,
    CONSTRAINT "FK_files_AspNetUsers_added_by" FOREIGN KEY ("added_by") REFERENCES "AspNetUsers" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_files_projects_project_id" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE
);

CREATE TABLE "project_members" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" TEXT NOT NULL,
    CONSTRAINT "PK_project_members" PRIMARY KEY ("project_id", "user_id"),
    CONSTRAINT "ck_project_members_role" CHECK (role IN ('pm', 'dev')),
    CONSTRAINT "FK_project_members_AspNetUsers_user_id" FOREIGN KEY ("user_id") REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_project_members_projects_project_id" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE
);

CREATE TABLE "quick_notes" (
    "id" TEXT NOT NULL CONSTRAINT "PK_quick_notes" PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "linked_project_id" TEXT NULL,
    "converted_to_task_id" TEXT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "FK_quick_notes_AspNetUsers_user_id" FOREIGN KEY ("user_id") REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_quick_notes_projects_linked_project_id" FOREIGN KEY ("linked_project_id") REFERENCES "projects" ("id") ON DELETE SET NULL
);

CREATE INDEX "IX_ado_credentials_user_id" ON "ado_credentials" ("user_id");

CREATE INDEX "IX_AspNetRoleClaims_RoleId" ON "AspNetRoleClaims" ("RoleId");

CREATE UNIQUE INDEX "RoleNameIndex" ON "AspNetRoles" ("NormalizedName");

CREATE INDEX "IX_AspNetUserClaims_UserId" ON "AspNetUserClaims" ("UserId");

CREATE INDEX "IX_AspNetUserLogins_UserId" ON "AspNetUserLogins" ("UserId");

CREATE INDEX "IX_AspNetUserRoles_RoleId" ON "AspNetUserRoles" ("RoleId");

CREATE INDEX "EmailIndex" ON "AspNetUsers" ("NormalizedEmail");

CREATE UNIQUE INDEX "UserNameIndex" ON "AspNetUsers" ("NormalizedUserName");

CREATE INDEX "IX_files_added_by" ON "files" ("added_by");

CREATE INDEX "IX_files_project_id" ON "files" ("project_id");

CREATE INDEX "IX_project_members_user_id" ON "project_members" ("user_id");

CREATE INDEX "IX_quick_notes_linked_project_id" ON "quick_notes" ("linked_project_id");

CREATE INDEX "IX_quick_notes_user_id" ON "quick_notes" ("user_id");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260810120000_InitialCreate', '10.0.10');

COMMIT;

BEGIN TRANSACTION;
ALTER TABLE "projects" ADD "archived_at" TEXT NULL;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260817075011_AddProjectArchive', '10.0.10');

COMMIT;

BEGIN TRANSACTION;
CREATE TABLE "kb_page_revisions" (
    "id" TEXT NOT NULL CONSTRAINT "PK_kb_page_revisions" PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "saved_at" TEXT NOT NULL,
    "saved_by" TEXT NOT NULL,
    CONSTRAINT "FK_kb_page_revisions_projects_project_id" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE
);

CREATE INDEX "IX_kb_page_revisions_project_id_page_id" ON "kb_page_revisions" ("project_id", "page_id");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260817075338_AddKbRevisionsAndTags', '10.0.10');

COMMIT;

