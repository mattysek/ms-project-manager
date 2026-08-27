/// EF Core kontext: Identity tabulky (ADR-003) plus vlastní tabulky z PRD-00.
module MSProjectManager.Persistence.AppDbContext

open System
open Microsoft.AspNetCore.Identity.EntityFrameworkCore
open Microsoft.EntityFrameworkCore
open Microsoft.EntityFrameworkCore.Metadata.Builders
open MSProjectManager.Persistence.Entities

let private projects (builder: ModelBuilder) =
    let entity = builder.Entity<ProjectRow>()
    entity.ToTable "projects" |> ignore
    entity.HasKey(fun row -> row.Id :> obj) |> ignore
    entity.Property(fun row -> row.Id).HasColumnName "id" |> ignore

    entity.Property(fun row -> row.Name).HasColumnName("name").IsRequired()
    |> ignore

    entity.Property(fun row -> row.StateJson).HasColumnName("state_json").IsRequired()
    |> ignore

    entity.Property(fun row -> row.CreatedAt).HasColumnName("created_at").IsRequired()
    |> ignore

    entity.Property(fun row -> row.UpdatedAt).HasColumnName("updated_at").IsRequired()
    |> ignore

    entity.Property(fun row -> row.ArchivedAt).HasColumnName("archived_at").IsRequired(false)
    |> ignore

let private projectMembers (builder: ModelBuilder) =
    let entity = builder.Entity<ProjectMemberRow>()

    entity.ToTable(
        "project_members",
        fun (table: TableBuilder<ProjectMemberRow>) ->
            table.HasCheckConstraint("ck_project_members_role", "role IN ('pm', 'dev')")
            |> ignore
    )
    |> ignore

    entity.HasKey([| "ProjectId"; "UserId" |]) |> ignore
    entity.Property(fun row -> row.ProjectId).HasColumnName "project_id" |> ignore
    entity.Property(fun row -> row.UserId).HasColumnName "user_id" |> ignore

    entity.Property(fun row -> row.Role).HasColumnName("role").IsRequired()
    |> ignore

    entity.Property(fun row -> row.JoinedAt).HasColumnName("joined_at").IsRequired()
    |> ignore

    entity.HasOne<ProjectRow>().WithMany().HasForeignKey("ProjectId").OnDelete(DeleteBehavior.Cascade)
    |> ignore

    entity.HasOne<AppUser>().WithMany().HasForeignKey("UserId").OnDelete(DeleteBehavior.Cascade)
    |> ignore

let private files (builder: ModelBuilder) =
    let entity = builder.Entity<FileRow>()
    entity.ToTable "files" |> ignore
    entity.HasKey(fun row -> row.Id :> obj) |> ignore
    entity.Property(fun row -> row.Id).HasColumnName "id" |> ignore
    entity.Property(fun row -> row.ProjectId).HasColumnName "project_id" |> ignore

    entity.Property(fun row -> row.Name).HasColumnName("name").IsRequired()
    |> ignore

    entity.Property(fun row -> row.MimeType).HasColumnName("mime_type").IsRequired()
    |> ignore

    entity.Property(fun row -> row.Size).HasColumnName "size" |> ignore

    entity.Property(fun row -> row.Data).HasColumnName("data").IsRequired()
    |> ignore

    entity.Property(fun row -> row.Note).HasColumnName("note").HasDefaultValue ""
    |> ignore

    entity.Property(fun row -> row.AddedAt).HasColumnName("added_at").IsRequired()
    |> ignore

    entity.Property(fun row -> row.AddedBy).HasColumnName("added_by").IsRequired()
    |> ignore

    entity.HasIndex("ProjectId") |> ignore

    entity.HasOne<ProjectRow>().WithMany().HasForeignKey("ProjectId").OnDelete(DeleteBehavior.Cascade)
    |> ignore

    entity.HasOne<AppUser>().WithMany().HasForeignKey("AddedBy").OnDelete(DeleteBehavior.Restrict)
    |> ignore

let private adoCredentials (builder: ModelBuilder) =
    let entity = builder.Entity<AdoCredentialRow>()
    entity.ToTable "ado_credentials" |> ignore
    entity.HasKey([| "ProjectId"; "UserId" |]) |> ignore
    entity.Property(fun row -> row.ProjectId).HasColumnName "project_id" |> ignore
    entity.Property(fun row -> row.UserId).HasColumnName "user_id" |> ignore

    entity.Property(fun row -> row.PatEncrypted).HasColumnName("pat_encrypted").IsRequired()
    |> ignore

    entity.Property(fun row -> row.SnapshotJson).HasColumnName("snapshot_json").IsRequired(false)
    |> ignore

    entity.Property(fun row -> row.UpdatedAt).HasColumnName("updated_at").IsRequired()
    |> ignore

    entity.HasOne<AppUser>().WithMany().HasForeignKey("UserId").OnDelete(DeleteBehavior.Cascade)
    |> ignore

let private quickNotes (builder: ModelBuilder) =
    let entity = builder.Entity<QuickNoteRow>()
    entity.ToTable "quick_notes" |> ignore
    entity.HasKey(fun row -> row.Id :> obj) |> ignore
    entity.Property(fun row -> row.Id).HasColumnName "id" |> ignore
    entity.Property(fun row -> row.UserId).HasColumnName "user_id" |> ignore

    entity.Property(fun row -> row.Content).HasColumnName("content").IsRequired()
    |> ignore

    entity.Property(fun row -> row.LinkedProjectId).HasColumnName("linked_project_id").IsRequired(false)
    |> ignore

    entity.Property(fun row -> row.ConvertedToTaskId).HasColumnName("converted_to_task_id").IsRequired(false)
    |> ignore

    entity.Property(fun row -> row.CreatedAt).HasColumnName("created_at").IsRequired()
    |> ignore

    entity.Property(fun row -> row.UpdatedAt).HasColumnName("updated_at").IsRequired()
    |> ignore

    entity.HasIndex("UserId") |> ignore

    entity.HasOne<AppUser>().WithMany().HasForeignKey("UserId").OnDelete(DeleteBehavior.Cascade)
    |> ignore

    entity.HasOne<ProjectRow>().WithMany().HasForeignKey("LinkedProjectId").OnDelete(DeleteBehavior.SetNull)
    |> ignore

let private kbRevisions (builder: ModelBuilder) =
    let entity = builder.Entity<KbRevisionRow>()
    entity.ToTable "kb_page_revisions" |> ignore
    entity.HasKey(fun row -> row.Id :> obj) |> ignore
    entity.Property(fun row -> row.Id).HasColumnName "id" |> ignore
    entity.Property(fun row -> row.ProjectId).HasColumnName "project_id" |> ignore
    entity.Property(fun row -> row.PageId).HasColumnName "page_id" |> ignore

    entity.Property(fun row -> row.Title).HasColumnName("title").IsRequired()
    |> ignore

    entity.Property(fun row -> row.Content).HasColumnName("content").IsRequired()
    |> ignore

    entity.Property(fun row -> row.SavedAt).HasColumnName("saved_at").IsRequired()
    |> ignore

    entity.Property(fun row -> row.SavedBy).HasColumnName("saved_by").IsRequired()
    |> ignore

    entity.HasIndex([| "ProjectId"; "PageId" |]) |> ignore

    entity.HasOne<ProjectRow>().WithMany().HasForeignKey("ProjectId").OnDelete(DeleteBehavior.Cascade)
    |> ignore

/// Kontext aplikace. Identity tabulky si přidá `IdentityDbContext` sám.
type AppDbContext(options: DbContextOptions<AppDbContext>) =
    inherit IdentityDbContext<AppUser>(options)

    member this.Projects = this.Set<ProjectRow>()
    member this.ProjectMembers = this.Set<ProjectMemberRow>()
    member this.Files = this.Set<FileRow>()
    member this.AdoCredentials = this.Set<AdoCredentialRow>()
    member this.QuickNotes = this.Set<QuickNoteRow>()
    member this.KbRevisions = this.Set<KbRevisionRow>()

    override _.OnModelCreating(builder: ModelBuilder) =
        base.OnModelCreating builder
        projects builder
        projectMembers builder
        files builder
        adoCredentials builder
        quickNotes builder
        kbRevisions builder
