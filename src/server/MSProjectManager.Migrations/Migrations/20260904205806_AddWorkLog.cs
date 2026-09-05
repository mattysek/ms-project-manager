using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MSProjectManager.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "work_log_entries",
                columns: table => new
                {
                    id = table.Column<string>(type: "TEXT", nullable: false),
                    user_id = table.Column<string>(type: "TEXT", nullable: false),
                    title = table.Column<string>(type: "TEXT", nullable: false),
                    description = table.Column<string>(type: "TEXT", nullable: false, defaultValue: ""),
                    project_id = table.Column<string>(type: "TEXT", nullable: true),
                    started_at = table.Column<string>(type: "TEXT", nullable: false),
                    ended_at = table.Column<string>(type: "TEXT", nullable: true),
                    tags = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    created_at = table.Column<string>(type: "TEXT", nullable: false),
                    updated_at = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_work_log_entries", x => x.id);
                    table.ForeignKey(
                        name: "FK_work_log_entries_AspNetUsers_user_id",
                        column: x => x.user_id,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_work_log_entries_projects_project_id",
                        column: x => x.project_id,
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_work_log_entries_project_id",
                table: "work_log_entries",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "IX_work_log_entries_user_id_started_at",
                table: "work_log_entries",
                columns: new[] { "user_id", "started_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "work_log_entries");
        }
    }
}
