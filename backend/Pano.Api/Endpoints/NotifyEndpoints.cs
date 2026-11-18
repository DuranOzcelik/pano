using System.Globalization;
using System.Net;
using System.Net.Mail;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Pano.Api.Data;

namespace Pano.Api.Endpoints;

// Ayar dosyasındaki "Email" bölümü. Host ya da alıcı boşsa bildirim kapalıdır (geliştirmede de kapalı).
// SmtpClient STARTTLS kullanır: port 587 (Gmail'de uygulama şifresi gerekir). 465 (doğrudan SSL) desteklenmez.
public record EmailOptions
{
    public string Host { get; init; } = "";
    public int Port { get; init; } = 587;
    public bool Ssl { get; init; } = true;
    public string User { get; init; } = "";
    public string Password { get; init; } = "";
    public string From { get; init; } = "";
    public string To { get; init; } = "";  // birden çok alıcı virgülle
    public int Hour { get; init; } = 8;    // günlük özetin gönderileceği saat
    public string[] Recipients => To.Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    public bool Enabled => Host != "" && Recipients.Length > 0;
}

public static class NotifyEndpoints
{
    // Günlük özet: geciken ve yaklaşan işler, EDAŞ'ta bekleyenler, kontroller, kritik stok. en: İngilizce metin.
    public static async Task<(string Subject, string Body)?> ComposeAsync(PanoDb db, DateOnly today, bool en = false)
    {
        var culture = CultureInfo.GetCultureInfo(en ? "en-GB" : "tr-TR");
        var projects = await db.Projects.AsNoTracking().Where(p => p.CompletedAt == null).OrderBy(p => p.DueDate)
            .Select(p => new { p.Code, p.Name, Customer = p.Customer.Name, p.DueDate, p.StepChangedAt, p.Step.IsApproval }).ToListAsync();
        var checks = await CheckEndpoints.ListAsync(db);
        var critical = await db.Materials.AsNoTracking().Where(m => m.Quantity < m.MinQuantity).OrderBy(m => m.Name).ToListAsync();
        int Days(DateOnly d) => d.DayNumber - today.DayNumber;
        string Qty(decimal q) => q.ToString("0.###", culture);
        string L(string tr, string english) => en ? english : tr;
        string N(int n) => en ? (n == 1 ? "1 day" : $"{n} days") : $"{n} gün";
        string Late(int n) => L($"{N(n)} gecikti", $"{N(n)} overdue");
        string Left(int n) => n == 0 ? L("bugün", "today") : L($"{N(n)} kaldı", $"{N(n)} left");
        string Waiting(DateTime since)
        {
            var w = (int)Math.Max(0, (DateTime.UtcNow - since).TotalDays); // Bugün ekranıyla aynı: tam gün
            return L($"{w} gündür bekliyor", $"waiting {N(w)}");
        }

        return Rules.DigestMail(today, [
            new(L("geciken iş", "overdue jobs"), projects.Where(p => Days(p.DueDate) < 0)
                .Select(p => $"{p.Code} {p.Name} · {p.Customer} · {Late(-Days(p.DueDate))}").ToList()),
            new(L("yaklaşan teslim", "jobs due soon"), projects.Where(p => Days(p.DueDate) is >= 0 and <= 7)
                .Select(p => $"{p.Code} {p.Name} · {p.Customer} · {Left(Days(p.DueDate))}").ToList()),
            new(L("EDAŞ onayında bekleyen iş", "jobs awaiting approval"), projects.Where(p => p.IsApproval)
                .Select(p => $"{p.Code} {p.Name} · {Waiting(p.StepChangedAt)}").ToList()),
            new(L("geciken kontrol", "overdue inspections"), checks.Where(k => k.Status == "late")
                .Select(k => $"{k.CheckType} · {k.CustomerName} · {Late(-Days(k.NextDate))}").ToList()),
            new(L("yaklaşan kontrol", "inspections due soon"), checks.Where(k => k.Status == "soon")
                .Select(k => $"{k.CheckType} · {k.CustomerName} · {k.NextDate.ToString("d MMMM yyyy", culture)} ({Left(Days(k.NextDate))})").ToList()),
            new(L("kritik stok", "critical stock"), critical.Select(m => $"{m.Name} · {Qty(m.Quantity)} / {Qty(m.MinQuantity)} {m.Unit}").ToList()),
        ], en);
    }

    public static async Task SendAsync(EmailOptions o, string subject, string body, CancellationToken ct)
    {
        using var client = new SmtpClient(o.Host, o.Port)
        {
            EnableSsl = o.Ssl,
            Credentials = o.User == "" ? null : new NetworkCredential(o.User, o.Password)
        };
        using var msg = new MailMessage
        {
            From = new MailAddress(o.From != "" ? o.From : o.User, "Pano"),
            Subject = subject, Body = body, SubjectEncoding = Encoding.UTF8, BodyEncoding = Encoding.UTF8
        };
        foreach (var to in o.Recipients) msg.To.Add(to);
        await client.SendMailAsync(msg, ct);
    }

    public static void MapNotify(this RouteGroupBuilder api)
    {
        api.MapGet("/notify", async (EmailOptions o, PanoDb db) => new
        {
            o.Enabled, To = o.Recipients, o.Hour, (await db.Settings.AsNoTracking().FirstAsync()).LastDigestOn
        });

        // Kurulumda ayarları denemek için: özeti hemen gönderir, günlük gönderim kaydını değiştirmez.
        api.MapPost("/notify/test", async (EmailOptions o, PanoDb db, IConfiguration cfg, CancellationToken ct) =>
        {
            var en = cfg["Language"] == "en";
            if (!o.Enabled) return Http.Bad(en ? "E-mail is not configured: fill in the Email section of the settings file."
                : "E-posta ayarlı değil: ayar dosyasındaki Email bölümünü doldurun.");
            var m = await ComposeAsync(db, Rules.Today, en) ?? (en
                ? ("Pano · test e-mail", "Nothing to report today. The e-mail settings work.")
                : ("Pano · deneme e-postası", "Bugün bildirilecek bir şey yok. E-posta ayarları çalışıyor."));
            try { await SendAsync(o, m.Subject, m.Body, ct); }
            catch (Exception e) when (e is SmtpException or InvalidOperationException or FormatException)
            {
                return Http.Bad(en ? $"Could not send the e-mail: {e.Message}" : $"E-posta gönderilemedi: {e.Message}");
            }
            return Results.Ok(new { To = o.Recipients, m.Subject });
        });
    }
}

// Her 10 dakikada bakar; ayarlanan saatten sonra günde bir kez özeti gönderir. Gönderildiği gün veritabanına
// yazılır, servis yeniden başlasa da aynı gün ikinci kez gönderilmez. Hata olursa bir saat sonra yeniden dener.
public class DigestService(IServiceScopeFactory scopes, EmailOptions o, IConfiguration cfg, ILogger<DigestService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!o.Enabled) return;
        var retryAt = DateTime.MinValue;
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));
        do
        {
            if (DateTime.Now.Hour < o.Hour || DateTime.Now < retryAt) continue;
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<PanoDb>();
                var s = await db.Settings.FirstAsync(ct);
                var today = Rules.Today;
                if (s.LastDigestOn == today) continue;
                if (await NotifyEndpoints.ComposeAsync(db, today, cfg["Language"] == "en") is { } m) await NotifyEndpoints.SendAsync(o, m.Subject, m.Body, ct);
                s.LastDigestOn = today;
                await db.SaveChangesAsync(ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Günlük e-posta özeti gönderilemedi, bir saat sonra yeniden denenecek.");
                retryAt = DateTime.Now.AddHours(1);
            }
        } while (await timer.WaitForNextTickAsync(ct));
    }
}
