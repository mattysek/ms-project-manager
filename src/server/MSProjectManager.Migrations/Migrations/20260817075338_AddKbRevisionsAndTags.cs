using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MSProjectManager.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddKbRevisionsAndTags : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "kb_page_revisions",
                columns: table => new
                {
                    id = table.Column<string>(type: "TEXT", nullable: false),
                    project_id = table.Column<string>(type: "TEXT", nullable: false),
                    page_id = table.Column<string>(type: "TEXT", nullable: false),
                    title = table.Column<string>(type: "TEXT", nullable: false),
                    content = table.Column<string>(type: "TEXT", nullable: false),
                    saved_at = table.Column<string>(type: "TEXT", nullable: false),
                    saved_by = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_kb_page_revisions", x => x.id);
                    table.ForeignKey(
                        name: "FK_kb_page_revisions_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_kb_page_revisions_project_id_page_id",
                table: "kb_page_revisions",
                columns: new[] { "project_id", "page_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "kb_page_revisions");
        }
    }
}
