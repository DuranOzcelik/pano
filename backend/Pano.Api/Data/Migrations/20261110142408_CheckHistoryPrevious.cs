using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pano.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class CheckHistoryPrevious : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "previous_done_date",
                table: "check_history",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "previous_done_date",
                table: "check_history");
        }
    }
}
