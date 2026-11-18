using Microsoft.EntityFrameworkCore;
using Pano.Api.Data;

namespace Pano.Api.Endpoints;

public static class DashboardEndpoints
{
    public static void MapDashboard(this RouteGroupBuilder api)
    {
        api.MapGet("/settings", async (PanoDb db, IConfiguration cfg) => new
        {
            language = cfg["Language"] == "en" ? "en" : "tr",
            settings = await db.Settings.AsNoTracking().FirstAsync(),
            steps = await db.WorkflowSteps.AsNoTracking().OrderBy(s => s.SortOrder).ToListAsync(),
            checkTypes = await db.CheckTypes.AsNoTracking().OrderBy(t => t.Name).ToListAsync()
        });

        api.MapGet("/dashboard", async (PanoDb db) =>
        {
            var today = Rules.Today;
            var materials = await db.Materials.AsNoTracking().ToListAsync();
            var since = DateTime.UtcNow.AddDays(-90);
            // Tüketim = çıkışlar − işten iadeler (işe bağlı giriş); sahadan dönen malzeme tüketim sayılmaz.
            var used90 = await db.StockMovements.Where(h => h.CreatedAt >= since && (h.Type == MovementType.Out || h.ProjectId != null))
                .GroupBy(h => h.MaterialId).Select(x => new { x.Key, Qty = x.Sum(h => h.Type == MovementType.Out ? h.Quantity : -h.Quantity) })
                .ToDictionaryAsync(x => x.Key, x => x.Qty);

            var season = materials.Select(m =>
                {
                    var (need, order) = Rules.SeasonOrder(used90.GetValueOrDefault(m.Id), m.MinQuantity, m.Quantity);
                    return new { m.Id, m.Name, m.Unit, m.Quantity, Need = need, Order = order, Value = order * m.UnitPrice };
                })
                .Where(x => x.Order > 0).OrderByDescending(x => x.Value).Take(5).ToList();

            var active = await db.Projects.Where(p => p.CompletedAt == null).Select(p => new { p.DueDate, p.Step.IsApproval }).ToListAsync();
            var checks = await CheckEndpoints.ListAsync(db);
            var upcoming = checks.Where(k => k.Status != "ok").ToList();

            return new
            {
                criticalMaterials = materials.Count(m => m.IsCritical),
                stockValue = materials.Sum(m => m.Quantity * m.UnitPrice),
                activeProjects = active.Count,
                lateProjects = active.Count(p => p.DueDate < today),
                waitingApproval = active.Count(p => p.IsApproval),
                upcomingChecks = upcoming.Take(6),
                upcomingCount = upcoming.Count,
                lateChecks = upcoming.Count(k => k.Status == "late"),
                stepCounts = await db.WorkflowSteps.OrderBy(s => s.SortOrder)
                    .Select(s => new { s.Id, s.Name, Count = db.Projects.Count(p => p.StepId == s.Id) }).ToListAsync(),
                recentMovements = await MovementEndpoints.Query(db).Take(6).ToListAsync(),
                seasonSuggestions = season
            };
        });
    }
}
