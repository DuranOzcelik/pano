using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pano.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class EmailDigest : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "last_digest_on",
                table: "settings",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "last_digest_on",
                table: "settings");
        }
    }
}
