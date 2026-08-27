using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MSProjectManager.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectArchive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "archived_at",
                table: "projects",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "archived_at",
                table: "projects");
        }
    }
}
