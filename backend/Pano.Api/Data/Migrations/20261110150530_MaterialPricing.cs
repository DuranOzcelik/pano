using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pano.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MaterialPricing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "discount_rate",
                table: "stock_movements",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "list_price",
                table: "stock_movements",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "sale_price",
                table: "stock_movements",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "discount_rate",
                table: "materials",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "list_price",
                table: "materials",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "sale_price",
                table: "materials",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            // Var olan malzemelerde bilinen tek fiyat net alıştır: liste = net, iskonto 0 kabul edilir. Satış fiyatı boş kalır.
            migrationBuilder.Sql("UPDATE materials SET list_price = unit_price WHERE list_price = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "discount_rate",
                table: "stock_movements");

            migrationBuilder.DropColumn(
                name: "list_price",
                table: "stock_movements");

            migrationBuilder.DropColumn(
                name: "sale_price",
                table: "stock_movements");

            migrationBuilder.DropColumn(
                name: "discount_rate",
                table: "materials");

            migrationBuilder.DropColumn(
                name: "list_price",
                table: "materials");

            migrationBuilder.DropColumn(
                name: "sale_price",
                table: "materials");
        }
    }
}
