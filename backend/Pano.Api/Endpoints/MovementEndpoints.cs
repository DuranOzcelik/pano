using Microsoft.EntityFrameworkCore;
using Pano.Api.Data;

namespace Pano.Api.Endpoints;

// Mal kabulde liste fiyatı + iskonto girilirse o alışın net fiyatı kullanılır ve malzemenin fiyatı güncellenir (son alış fiyatı).
public record MovementInput(int MaterialId, MovementType Type, decimal Quantity, int? ProjectId, string? ReferenceNo, string? Note,
    decimal? ListPrice = null, decimal? DiscountRate = null);

public record MovementRow(int Id, DateTime CreatedAt, MovementType Type, decimal Quantity, decimal UnitPrice,
    decimal? ListPrice, decimal? DiscountRate, decimal SalePrice,
    int MaterialId, string MaterialName, string Unit, int? ProjectId, string? ProjectCode, string? ProjectName,
    string? CustomerName, string? ReferenceNo, string? Note);

public static class MovementEndpoints
{
    // Filtreler Select'ten önce uygulanır; kayıt kurucusuna yansıtılmış satır üzerinde EF Where çeviremez.
    public static IQueryable<MovementRow> Query(PanoDb db, int? materialId = null, MovementType? type = null) => db.StockMovements.AsNoTracking()
        .Where(h => (materialId == null || h.MaterialId == materialId) && (type == null || h.Type == type))
        .OrderByDescending(h => h.CreatedAt).ThenByDescending(h => h.Id)
        .Select(h => new MovementRow(h.Id, h.CreatedAt, h.Type, h.Quantity, h.UnitPrice, h.ListPrice, h.DiscountRate, h.SalePrice,
            h.MaterialId, h.Material.Name, h.Material.Unit,
            h.ProjectId, h.Project!.Code, h.Project.Name, h.Project.Customer.Name, h.ReferenceNo, h.Note));

    public static void MapMovements(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/movements");

        g.MapGet("/", async (MovementType? type, int? take, PanoDb db) =>
            await Query(db, type: type).Take(Math.Clamp(take ?? 50, 1, 500)).ToListAsync());

        // Mal kabul (In) stoğu artırır; projeye çıkış (Out) azaltır ve maliyeti işe yazar.
        g.MapPost("/", async (MovementInput r, PanoDb db) =>
        {
            if (r.Quantity <= 0) return Http.Bad("Miktar sıfırdan büyük olmalı.");
            var m = await db.Materials.AsNoTracking().FirstOrDefaultAsync(x => x.Id == r.MaterialId);
            if (m is null) return Http.Bad("Malzeme bulunamadı.");
            if (r.ProjectId is { } pid && !await db.Projects.AnyAsync(p => p.Id == pid && p.CompletedAt == null))
                return Http.Bad("Proje bulunamadı veya tamamlanmış.");
            var priced = r.Type == MovementType.In && r.ListPrice is not null;
            if (priced && (r.ListPrice < 0 || r.DiscountRate is < 0 or > 100)) return Http.Bad("Fiyat negatif olamaz, iskonto 0 ile 100 arasında olmalı.");
            var discount = r.DiscountRate ?? 0;
            var unitPrice = priced ? Rules.NetPrice(r.ListPrice!.Value, discount) : m.UnitPrice;

            await using var tx = await db.Database.BeginTransactionAsync();
            var delta = r.Type == MovementType.In ? r.Quantity : -r.Quantity;
            // Tek SQL ile kontrol + güncelleme: aynı anda iki çıkış yapılsa bile stok eksiye düşmez.
            var updated = await db.Materials.Where(x => x.Id == m.Id && x.Quantity + delta >= 0)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Quantity, x => x.Quantity + delta));
            if (updated == 0) return Http.Conflict($"Stokta sadece {m.Quantity:0.###} {m.Unit} var.");
            if (priced)
                await db.Materials.Where(x => x.Id == m.Id).ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.ListPrice, r.ListPrice!.Value).SetProperty(x => x.DiscountRate, discount).SetProperty(x => x.UnitPrice, unitPrice));

            var h = new StockMovement
            {
                MaterialId = m.Id, Type = r.Type, Quantity = r.Quantity, UnitPrice = unitPrice, SalePrice = m.SalePrice,
                ListPrice = priced ? r.ListPrice : null, DiscountRate = priced ? discount : null, ProjectId = r.ProjectId,
                ReferenceNo = r.ReferenceNo?.Trim(), Note = r.Note?.Trim()
            };
            db.StockMovements.Add(h);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { movement = h, quantity = m.Quantity + delta });
        });
    }
}
