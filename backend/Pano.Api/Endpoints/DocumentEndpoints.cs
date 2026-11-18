using Microsoft.EntityFrameworkCore;
using Pano.Api.Data;

namespace Pano.Api.Endpoints;

public record DocumentRow(int Id, int ProjectId, string ProjectCode, string ProjectName, string CustomerName,
    string Name, string Kind, int Revision, long SizeBytes, DateTime CreatedAt, bool IsLatest);

// Dosyalar ofis bilgisayarındaki arşiv klasöründe durur: {arşiv}/{iş kodu}/{ad}_Rev{n}{uzantı}.
// Veritabanında sadece kayıt tutulur.
public static class DocumentEndpoints
{
    public static async Task<List<DocumentRow>> ListAsync(PanoDb db, int? projectId = null) =>
        await db.Documents.AsNoTracking()
            .Where(d => projectId == null || d.ProjectId == projectId)
            .OrderBy(d => d.ProjectId).ThenBy(d => d.Name).ThenByDescending(d => d.Revision)
            .Select(d => new DocumentRow(d.Id, d.ProjectId, d.Project.Code, d.Project.Name, d.Project.Customer.Name,
                d.Name, d.Kind, d.Revision, d.SizeBytes, d.CreatedAt,
                !db.Documents.Any(x => x.ProjectId == d.ProjectId && x.Name == d.Name && x.Revision > d.Revision)))
            .ToListAsync();

    public static void MapDocuments(this RouteGroupBuilder api, string archiveRoot)
    {
        api.MapGet("/documents", (int? projectId, PanoDb db) => ListAsync(db, projectId));

        // Aynı adla yüklenen dosya otomatik olarak yeni revizyon olur (Rev0, Rev1, ...).
        api.MapPost("/projects/{id:int}/documents", async (int id, IFormFileCollection files, PanoDb db) =>
        {
            var p = await db.Projects.FindAsync(id);
            if (p is null) return Results.NotFound();
            if (files.Count == 0) return Http.Bad("Dosya seçilmedi.");

            var dir = Path.Combine(archiveRoot, Rules.SafeFileName(p.Code));
            Directory.CreateDirectory(dir);
            var added = new List<Document>();
            foreach (var f in files)
            {
                var original = Path.GetFileName(f.FileName); // istemcinin gönderdiği yolu at
                var name = Rules.DocumentBaseName(original);
                var rev = (await db.Documents.Where(d => d.ProjectId == id && d.Name == name).MaxAsync(d => (int?)d.Revision) ?? -1) + 1;
                var fileName = Rules.SafeFileName($"{name}_Rev{rev}{Path.GetExtension(original).ToLowerInvariant()}");
                await using (var s = File.Create(Path.Combine(dir, fileName)))
                    await f.CopyToAsync(s);

                var d = new Document
                {
                    ProjectId = id, Name = name, Kind = Rules.DocumentKind(original), Revision = rev,
                    FilePath = Path.Combine(Rules.SafeFileName(p.Code), fileName), OriginalFileName = original, SizeBytes = f.Length
                };
                db.Documents.Add(d);
                await db.SaveChangesAsync(); // sonraki dosya aynı adlıysa revizyonu doğru görsün
                added.Add(d);
            }
            return Results.Ok(added);
        }).DisableAntiforgery(); // CSRF koruması Program.cs'teki X-Pano başlığıyla yapılıyor

        // Yanlış yüklenen dosya için: sadece son revizyon silinir, eski revizyonlar geçmiş olarak kalır.
        // Dosya silinmez, arşivdeki _silinenler klasörüne taşınır; yanlışlıkla silinirse oradan geri alınır.
        api.MapDelete("/documents/{id:int}", async (int id, PanoDb db) =>
        {
            var d = await db.Documents.FindAsync(id);
            if (d is null) return Results.NotFound();
            if (await db.Documents.AnyAsync(x => x.ProjectId == d.ProjectId && x.Name == d.Name && x.Revision > d.Revision))
                return Http.Conflict("Sadece belgenin son revizyonu silinebilir.");
            db.Documents.Remove(d);
            await db.SaveChangesAsync();
            var root = Path.GetFullPath(archiveRoot);
            var path = Path.GetFullPath(Path.Combine(root, d.FilePath));
            if (path.StartsWith(root, StringComparison.OrdinalIgnoreCase) && File.Exists(path))
            {
                var trash = Path.Combine(root, "_silinenler", d.FilePath);
                Directory.CreateDirectory(Path.GetDirectoryName(trash)!);
                try { File.Move(path, trash, overwrite: true); }
                catch (IOException) { } // taşınamazsa dosya yerinde kalır; kayıt silindi, veri kaybı yok
            }
            return Results.NoContent();
        });

        api.MapGet("/documents/{id:int}/file", async (int id, bool? download, PanoDb db) =>
        {
            var d = await db.Documents.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (d is null) return Results.NotFound();
            var path = Path.GetFullPath(Path.Combine(archiveRoot, d.FilePath));
            if (!path.StartsWith(Path.GetFullPath(archiveRoot), StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
                return Results.NotFound();
            var downloadName = $"{d.Name}_Rev{d.Revision}{Path.GetExtension(d.OriginalFileName)}";
            return download == true || d.Kind is "DWG" or "DIGER"
                ? Results.File(path, "application/octet-stream", downloadName)
                : Results.File(path, d.Kind == "PDF" ? "application/pdf" : $"image/{Path.GetExtension(path).TrimStart('.').Replace("jpg", "jpeg")}");
        });
    }
}
