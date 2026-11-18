using Microsoft.EntityFrameworkCore;
using Pano.Api.Data;

namespace Pano.Api.Endpoints;

public record CustomerInput(string Name, string Type, string? Region, string? Contact, string? Phone, string? Address, double? Lat, double? Lng);

public static class CustomerEndpoints
{
    public static void MapCustomers(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/customers");

        // Liste: aktif iş sayısı, sıradaki kontrol ve genel durum (harita da bunu kullanır).
        g.MapGet("/", async (PanoDb db) =>
        {
            var today = Rules.Today;
            var rows = await db.Customers.AsNoTracking().OrderBy(c => c.Name).Select(c => new
            {
                Customer = c,
                Projects = db.Projects.Where(p => p.CustomerId == c.Id && p.CompletedAt == null)
                    .Select(p => new { p.DueDate, p.Step.IsApproval }).ToList(),
                Checks = db.PeriodicChecks.Where(k => k.CustomerId == c.Id)
                    .Select(k => new { k.CheckType.Name, k.LastDoneDate, k.PeriodMonths }).ToList()
            }).ToListAsync();

            return rows.Select(r =>
            {
                var checks = r.Checks.Select(k => new { k.Name, NextDate = k.LastDoneDate.AddMonths(k.PeriodMonths) })
                    .OrderBy(k => k.NextDate).ToList();
                var c = r.Customer;
                return new
                {
                    c.Id, c.Name, c.Type, c.Region, c.Contact, c.Phone, c.Address, c.Lat, c.Lng,
                    ActiveProjects = r.Projects.Count,
                    NextCheck = checks.FirstOrDefault(),
                    Status = Rules.CustomerStatus(
                        checks.Select(k => Rules.CheckStatus(k.NextDate, today)),
                        r.Projects.Any(p => p.DueDate < today), r.Projects.Any(p => p.IsApproval), r.Projects.Count > 0)
                };
            });
        });

        g.MapPost("/", async (CustomerInput r, PanoDb db) =>
        {
            if (Validate(r) is { } bad) return bad;
            var c = new Customer();
            Apply(c, r);
            db.Customers.Add(c);
            await db.SaveChangesAsync();
            return Results.Created($"/api/customers/{c.Id}", c);
        });

        g.MapPut("/{id:int}", async (int id, CustomerInput r, PanoDb db) =>
        {
            if (Validate(r) is { } bad) return bad;
            var c = await db.Customers.FindAsync(id);
            if (c is null) return Results.NotFound();
            Apply(c, r);
            await db.SaveChangesAsync();
            return Results.Ok(c);
        });

        g.MapDelete("/{id:int}", async (int id, PanoDb db) =>
        {
            if (await db.Projects.AnyAsync(p => p.CustomerId == id) || await db.PeriodicChecks.AnyAsync(k => k.CustomerId == id))
                return Http.Conflict("Bu müşterinin işleri veya kontrolleri var, silinemez.");
            return await db.Customers.Where(c => c.Id == id).ExecuteDeleteAsync() == 1 ? Results.NoContent() : Results.NotFound();
        });
    }

    static IResult? Validate(CustomerInput r) =>
        string.IsNullOrWhiteSpace(r.Name) ? Http.Bad("Müşteri adı zorunlu.")
        : r.Lat is < -90 or > 90 || r.Lng is < -180 or > 180 ? Http.Bad("Koordinat geçersiz.")
        : null;

    static void Apply(Customer c, CustomerInput r)
    {
        c.Name = r.Name.Trim();
        c.Type = string.IsNullOrWhiteSpace(r.Type) ? "Diğer" : r.Type.Trim();
        c.Region = r.Region?.Trim();
        c.Contact = r.Contact?.Trim();
        c.Phone = r.Phone?.Trim();
        c.Address = r.Address?.Trim();
        c.Lat = r.Lat;
        c.Lng = r.Lng;
    }
}
