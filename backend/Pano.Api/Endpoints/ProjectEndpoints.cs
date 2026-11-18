using Microsoft.EntityFrameworkCore;
using Pano.Api.Data;

namespace Pano.Api.Endpoints;

public record ProjectInput(string Name, int CustomerId, DateOnly? StartDate, DateOnly DueDate, Dictionary<string, string>? Extra);
public record StepInput(int StepId);

public static class ProjectEndpoints
{
    public static void MapProjects(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/projects");

        g.MapGet("/", async (PanoDb db) => await db.Projects.AsNoTracking().OrderBy(p => p.DueDate).Select(p => new
        {
            p.Id, p.Code, p.Name, p.CustomerId, CustomerName = p.Customer.Name, p.StepId, p.StepChangedAt,
            p.StartDate, p.DueDate, p.CompletedAt, p.Extra,
            LatestDrawingRev = db.Documents.Where(d => d.ProjectId == p.Id && d.Kind == "DWG").Max(d => (int?)d.Revision)
        }).ToListAsync());

        // Detay paneli: kullanılan malzeme ve gerçek maliyet, belgeler, tesisin kontrolleri.
        g.MapGet("/{id:int}", async (int id, PanoDb db) =>
        {
            var p = await db.Projects.AsNoTracking().Include(x => x.Customer).FirstOrDefaultAsync(x => x.Id == id);
            if (p is null) return Results.NotFound();

            // Projeye bağlı giriş = sahadan iade; maliyetten düşülür.
            var materials = await db.StockMovements.Where(m => m.ProjectId == id)
                .GroupBy(m => new { m.MaterialId, m.Material.Name, m.Material.Unit })
                .Select(x => new
                {
                    x.Key.MaterialId, x.Key.Name, x.Key.Unit,
                    Quantity = x.Sum(m => m.Type == MovementType.Out ? m.Quantity : -m.Quantity),
                    Cost = x.Sum(m => (m.Type == MovementType.Out ? m.Quantity : -m.Quantity) * m.UnitPrice),
                    Revenue = x.Sum(m => (m.Type == MovementType.Out ? m.Quantity : -m.Quantity) * m.SalePrice)
                }).ToListAsync();

            var checks = await CheckEndpoints.ListAsync(db, p.CustomerId);
            var documents = await DocumentEndpoints.ListAsync(db, id);
            return Results.Ok(new { project = p, customer = p.Customer, materials, cost = materials.Sum(m => m.Cost), revenue = materials.Sum(m => m.Revenue), documents, checks });
        });

        g.MapPost("/", async (ProjectInput r, PanoDb db) =>
        {
            if (await Validate(r, db) is { } bad) return bad;
            var today = Rules.Today;
            var prefix = $"P-{today.Year}-";
            var codes = await db.Projects.Where(p => p.Code.StartsWith(prefix)).Select(p => p.Code).ToListAsync();
            var next = codes.Select(c => int.TryParse(c[prefix.Length..], out var n) ? n : 0).DefaultIfEmpty(0).Max() + 1;

            var p = new Project
            {
                Code = $"{prefix}{next:000}",
                StepId = await db.WorkflowSteps.OrderBy(s => s.SortOrder).Select(s => s.Id).FirstAsync(),
                StartDate = r.StartDate ?? today
            };
            Apply(p, r);
            db.Projects.Add(p);
            await db.SaveChangesAsync();
            return Results.Created($"/api/projects/{p.Id}", p);
        });

        g.MapPut("/{id:int}", async (int id, ProjectInput r, PanoDb db) =>
        {
            if (await Validate(r, db) is { } bad) return bad;
            var p = await db.Projects.FindAsync(id);
            if (p is null) return Results.NotFound();
            Apply(p, r);
            if (r.StartDate is { } s) p.StartDate = s;
            await db.SaveChangesAsync();
            return Results.Ok(p);
        });

        // Kanban: aşama değiştirme. Son adıma gelen iş tamamlanmış sayılır.
        g.MapPut("/{id:int}/step", async (int id, StepInput r, PanoDb db) =>
        {
            var p = await db.Projects.FindAsync(id);
            if (p is null) return Results.NotFound();
            var stepIds = await db.WorkflowSteps.OrderBy(s => s.SortOrder).Select(s => s.Id).ToListAsync();
            if (!stepIds.Contains(r.StepId)) return Http.Bad("Geçersiz aşama.");
            if (p.StepId != r.StepId) p.StepChangedAt = DateTime.UtcNow;
            p.StepId = r.StepId;
            p.CompletedAt = r.StepId == stepIds[^1] ? p.CompletedAt ?? DateTime.UtcNow : null;
            await db.SaveChangesAsync();
            return Results.Ok(p);
        });

        g.MapDelete("/{id:int}", async (int id, PanoDb db) =>
        {
            if (await db.StockMovements.AnyAsync(m => m.ProjectId == id) || await db.Documents.AnyAsync(d => d.ProjectId == id))
                return Http.Conflict("Bu işe malzeme çıkılmış veya belge yüklenmiş, silinemez.");
            return await db.Projects.Where(p => p.Id == id).ExecuteDeleteAsync() == 1 ? Results.NoContent() : Results.NotFound();
        });
    }

    static async Task<IResult?> Validate(ProjectInput r, PanoDb db) =>
        string.IsNullOrWhiteSpace(r.Name) ? Http.Bad("İş adı zorunlu.")
        : r.StartDate is { } s && r.DueDate < s ? Http.Bad("Teslim tarihi başlangıçtan önce olamaz.")
        : !await db.Customers.AnyAsync(c => c.Id == r.CustomerId) ? Http.Bad("Müşteri bulunamadı.")
        : null;

    static void Apply(Project p, ProjectInput r)
    {
        p.Name = r.Name.Trim();
        p.CustomerId = r.CustomerId;
        p.DueDate = r.DueDate;
        if (r.Extra is not null)
            p.Extra = r.Extra.Where(kv => !string.IsNullOrWhiteSpace(kv.Value)).ToDictionary(kv => kv.Key, kv => kv.Value.Trim());
    }
}
