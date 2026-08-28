using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MSProjectManager.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddCredentialVault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "vault_entries",
                columns: table => new
                {
                    id = table.Column<string>(type: "TEXT", nullable: false),
                    user_id = table.Column<string>(type: "TEXT", nullable: false),
                    ciphertext = table.Column<string>(type: "TEXT", nullable: false),
                    iv = table.Column<string>(type: "TEXT", nullable: false),
                    created_at = table.Column<string>(type: "TEXT", nullable: false),
                    updated_at = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_vault_entries", x => x.id);
                    table.ForeignKey(
                        name: "FK_vault_entries_AspNetUsers_user_id",
                        column: x => x.user_id,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "vault_profiles",
                columns: table => new
                {
                    user_id = table.Column<string>(type: "TEXT", nullable: false),
                    kdf = table.Column<string>(type: "TEXT", nullable: false),
                    iterations = table.Column<int>(type: "INTEGER", nullable: false),
                    salt = table.Column<string>(type: "TEXT", nullable: false),
                    verifier = table.Column<string>(type: "TEXT", nullable: false),
                    verifier_iv = table.Column<string>(type: "TEXT", nullable: false),
                    created_at = table.Column<string>(type: "TEXT", nullable: false),
                    updated_at = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_vault_profiles", x => x.user_id);
                    table.ForeignKey(
                        name: "FK_vault_profiles_AspNetUsers_user_id",
                        column: x => x.user_id,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_vault_entries_user_id",
                table: "vault_entries",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "vault_entries");

            migrationBuilder.DropTable(
                name: "vault_profiles");
        }
    }
}
