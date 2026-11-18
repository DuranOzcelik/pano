using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pano.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class StepChangedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "step_changed_at",
                table: "projects",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "step_changed_at",
                table: "projects");
        }
    }
}
