using Microsoft.EntityFrameworkCore;
using Pano.Api.Data;

namespace Pano.Api.Endpoints;

public record CheckInput(int CustomerId, string CheckType, int PeriodMonths, DateOnly LastDoneDate);
public record CheckDoneInput(DateOnly? Date, string? Note);

public record CheckRow(int Id, int CustomerId, string CustomerName, string CheckType, int PeriodMonths,
    DateOnly LastDoneDate, DateOnly NextDate, string Status);

public static class CheckEndpoints
{
    public static async Task<List<CheckRow>> ListAsync(PanoDb db, int? customerId = null)
    {
        var today = Rules.Today;
        var rows = await db.PeriodicChecks.AsNoTracking()
            .Where(k => customerId == null || k.CustomerId == customerId)
            .Select(k => new { k.Id, k.CustomerId, CustomerName = k.Customer.Name, Type = k.CheckType.Name, k.PeriodMonths, k.LastDoneDate })
            .ToListAsync();
        return rows.Select(k =>
            {
                var next = k.LastDoneDate.AddMonths(k.PeriodMonths);
                return new CheckRow(k.Id, k.CustomerId, k.CustomerName, k.Type, k.PeriodMonths, k.LastDoneDate, next, Rules.CheckStatus(next, today));
            })
            .OrderBy(k => k.NextDate).ToList();
    }

    public static void MapChecks(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/checks");

        g.MapGet("/", (PanoDb db) => ListAsync(db));

        g.MapGet("/{id:int}/history", async (int id, PanoDb db) =>
            await db.CheckHistory.AsNoTracking().Where(h => h.PeriodicCheckId == id).OrderByDescending(h => h.DoneDate).ToListAsync());

        g.MapPost("/", async (CheckInput r, PanoDb db) =>
        {
            var typeName = r.CheckType?.Trim() ?? "";
            if (typeName == "") return Http.Bad("Kontrol türü zorunlu.");
            if (r.PeriodMonths is < 1 or > 120) return Http.Bad("Periyot 1 ile 120 ay arasında olmalı.");
            if (r.LastDoneDate > Rules.Today) return Http.Bad("Son yapıldığı tarih ileri bir tarih olamaz.");
            if (!await db.Customers.AnyAsync(c => c.Id == r.CustomerId)) return Http.Bad("Müşteri bulunamadı.");

            // Listede olmayan tür yazılırsa yeni tür olarak eklenir.
            var type = await db.CheckTypes.FirstOrDefaultAsync(t => t.Name == typeName)
                       ?? db.CheckTypes.Add(new CheckType { Name = typeName, DefaultPeriodMonths = r.PeriodMonths }).Entity;
            var k = new PeriodicCheck { CustomerId = r.CustomerId, CheckType = type, PeriodMonths = r.PeriodMonths, LastDoneDate = r.LastDoneDate };
            db.PeriodicChecks.Add(k);
            await db.SaveChangesAsync();
            return Results.Created($"/api/checks/{k.Id}", new { k.Id });
        });

        // "Bugün yapıldı": son tarihi günceller, geçmişe kayıt düşer.
        g.MapPost("/{id:int}/done", async (int id, CheckDoneInput r, PanoDb db) =>
        {
            var k = await db.PeriodicChecks.FindAsync(id);
            if (k is null) return Results.NotFound();
            var date = r.Date ?? Rules.Today;
            if (date > Rules.Today) return Http.Bad("İleri bir tarih girilemez.");
            var h = new CheckHistory { PeriodicCheckId = id, DoneDate = date, PreviousDoneDate = k.LastDoneDate, Note = r.Note?.Trim() };
            k.LastDoneDate = date;
            db.CheckHistory.Add(h);
            await db.SaveChangesAsync();
            return Results.Ok(new { k.Id, k.LastDoneDate, k.NextDate, historyId = h.Id });
        });

        // Yanlışlıkla "yapıldı" denirse: son kaydı siler, önceki tarihi geri koyar. Sadece en son işlem geri alınır.
        g.MapPost("/history/{hid:int}/undo", async (int hid, PanoDb db) =>
        {
            var h = await db.CheckHistory.FindAsync(hid);
            if (h is null) return Results.NotFound();
            var latestId = await db.CheckHistory.Where(x => x.PeriodicCheckId == h.PeriodicCheckId).MaxAsync(x => x.Id);
            if (latestId != hid || h.PreviousDoneDate is null) return Http.Conflict("Bu işlem artık geri alınamaz.");
            var k = await db.PeriodicChecks.FindAsync(h.PeriodicCheckId);
            k!.LastDoneDate = h.PreviousDoneDate.Value;
            db.CheckHistory.Remove(h);
            await db.SaveChangesAsync();
            return Results.Ok(new { k.Id, k.LastDoneDate, k.NextDate });
        });

        g.MapDelete("/{id:int}", async (int id, PanoDb db) =>
        {
            await db.CheckHistory.Where(h => h.PeriodicCheckId == id).ExecuteDeleteAsync();
            return await db.PeriodicChecks.Where(k => k.Id == id).ExecuteDeleteAsync() == 1 ? Results.NoContent() : Results.NotFound();
        });
    }
}
