using Microsoft.EntityFrameworkCore;
using Pano.Api.Data;

namespace Pano.Api.Endpoints;

// Fiyat: liste fiyatı + iskonto % girilir, net alış sunucuda hesaplanır. Satış fiyatı ayrı girilir.
public record MaterialInput(string Name, string Category, string Unit, decimal MinQuantity, string? Location,
    decimal ListPrice, decimal DiscountRate, decimal SalePrice, string? Barcode, decimal InitialQuantity = 0);

public static class MaterialEndpoints
{
    public static void MapMaterials(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/materials");

        g.MapGet("/", async (PanoDb db) => await db.Materials.AsNoTracking().OrderBy(m => m.Name).ToListAsync());

        // Barkod okutunca malzemeyi bulur. Bulamazsa arayüz "yeni malzeme tanımla" önerir.
        g.MapGet("/barcode/{code}", async (string code, PanoDb db) =>
            await db.Materials.AsNoTracking().FirstOrDefaultAsync(m => m.Barcode == code.Trim()) is { } m
                ? Results.Ok(m) : Results.NotFound());

        g.MapGet("/{id:int}", async (int id, PanoDb db) =>
        {
            var m = await db.Materials.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (m is null) return Results.NotFound();
            var movements = await MovementEndpoints.Query(db, materialId: id).ToListAsync();
            var usedBy = movements.Where(h => h.ProjectId != null)
                .GroupBy(h => new { h.ProjectId, h.ProjectCode, h.ProjectName, h.CustomerName })
                .Select(x => new { x.Key.ProjectId, x.Key.ProjectCode, x.Key.ProjectName, x.Key.CustomerName,
                    Quantity = x.Sum(h => h.Type == MovementType.Out ? h.Quantity : -h.Quantity) });
            return Results.Ok(new { material = m, movements, usedBy });
        });

        g.MapPost("/", async (MaterialInput r, PanoDb db, IConfiguration cfg) =>
        {
            if (await Validate(r, db, null) is { } bad) return bad;
            if (r.InitialQuantity < 0) return Http.Bad("Başlangıç miktarı negatif olamaz.");

            var m = new Material { Quantity = r.InitialQuantity };
            Apply(m, r);
            if (m.Barcode == "")
            {
                var last = await db.Materials.Where(x => x.Barcode.StartsWith(Rules.InternalPrefix) && x.Barcode.Length == 13)
                    .MaxAsync(x => (string?)x.Barcode);
                m.Barcode = Rules.InternalBarcode(last is null ? 1 : long.Parse(last[2..12]) + 1);
            }
            db.Materials.Add(m);
            // Stok her zaman hareketlerin toplamı olsun: başlangıç miktarı bir giriş hareketi olarak yazılır.
            if (r.InitialQuantity > 0)
                db.StockMovements.Add(new StockMovement { Material = m, Type = MovementType.In, Quantity = r.InitialQuantity,
                    UnitPrice = m.UnitPrice, ListPrice = m.ListPrice, DiscountRate = m.DiscountRate, SalePrice = m.SalePrice, ReferenceNo = cfg["Language"] == "en" ? "Opening stock" : "Açılış stoğu" });
            await db.SaveChangesAsync();
            return Results.Created($"/api/materials/{m.Id}", m);
        });

        // Miktar burada değişmez; sadece mal kabul / çıkış ile değişir.
        g.MapPut("/{id:int}", async (int id, MaterialInput r, PanoDb db) =>
        {
            if (await Validate(r, db, id) is { } bad) return bad;
            var m = await db.Materials.FindAsync(id);
            if (m is null) return Results.NotFound();
            var oldBarcode = m.Barcode;
            Apply(m, r);
            if (m.Barcode == "") m.Barcode = oldBarcode;
            await db.SaveChangesAsync();
            return Results.Ok(m);
        });

        // Yanlış açılan malzeme için: hiç hareketi yoksa silinir. Hareketi olan (açılış stoğu dahil) geçmiştir, silinmez.
        g.MapDelete("/{id:int}", async (int id, PanoDb db) =>
        {
            if (await db.StockMovements.AnyAsync(h => h.MaterialId == id))
                return Http.Conflict("Bu malzemenin hareketi var, silinemez.");
            return await db.Materials.Where(m => m.Id == id).ExecuteDeleteAsync() == 1 ? Results.NoContent() : Results.NotFound();
        });
    }

    static async Task<IResult?> Validate(MaterialInput r, PanoDb db, int? id)
    {
        if (string.IsNullOrWhiteSpace(r.Name)) return Http.Bad("Malzeme adı zorunlu.");
        if (string.IsNullOrWhiteSpace(r.Unit)) return Http.Bad("Birim zorunlu.");
        if (r.MinQuantity < 0 || r.ListPrice < 0 || r.SalePrice < 0) return Http.Bad("Minimum seviye ve fiyatlar negatif olamaz.");
        if (r.DiscountRate is < 0 or > 100) return Http.Bad("İskonto 0 ile 100 arasında olmalı.");
        var code = r.Barcode?.Trim() ?? "";
        if (code.Length > 64) return Http.Bad("Barkod çok uzun.");
        if (code != "" && await db.Materials.AnyAsync(m => m.Barcode == code && m.Id != id))
            return Http.Conflict("Bu barkod başka bir malzemede kayıtlı.");
        return null;
    }

    static void Apply(Material m, MaterialInput r)
    {
        m.Name = r.Name.Trim();
        m.Category = r.Category?.Trim() ?? "";
        m.Unit = r.Unit.Trim();
        m.MinQuantity = r.MinQuantity;
        m.Location = r.Location?.Trim();
        m.ListPrice = r.ListPrice;
        m.DiscountRate = r.DiscountRate;
        m.UnitPrice = Rules.NetPrice(r.ListPrice, r.DiscountRate);
        m.SalePrice = r.SalePrice;
        m.Barcode = r.Barcode?.Trim() ?? "";
    }
}
