using System.Text.RegularExpressions;

namespace Pano.Api;

// Veritabanından bağımsız iş kuralları. Pano.Tests bunları test eder.
public static partial class Rules
{
    public const int SoonDays = 30;

    public static DateOnly Today => DateOnly.FromDateTime(DateTime.Now);

    // late = gecikti, soon = 30 gün içinde, ok = planlı
    public static string CheckStatus(DateOnly next, DateOnly today) =>
        next < today ? "late" : next.DayNumber - today.DayNumber <= SoonDays ? "soon" : "ok";

    public static string Ean13(string first12)
    {
        var sum = 0;
        for (var i = 0; i < 12; i++) sum += (first12[i] - '0') * (i % 2 == 1 ? 3 : 1);
        return first12 + (10 - sum % 10) % 10;
    }

    // Barkodsuz ürünlere verilen kod. GS1 "29" önekini mağaza içi kullanıma ayırır,
    // bu yüzden gerçek ürün barkodlarıyla (Türkiye 869...) çakışmaz.
    public const string InternalPrefix = "29";
    public static string InternalBarcode(long seq) => Ean13(InternalPrefix + seq.ToString("D10"));

    // "Tek hat şeması_Rev2.dwg" -> "Tek hat şeması". Aynı ad = aynı belgenin yeni revizyonu.
    public static string DocumentBaseName(string fileName)
    {
        var stem = Path.GetFileNameWithoutExtension(fileName).Trim();
        var name = RevSuffix().Replace(stem, "").Trim();
        return name.Length > 0 ? name : stem;
    }

    [GeneratedRegex(@"[\s_.-]*rev\s?\d+$", RegexOptions.IgnoreCase)]
    private static partial Regex RevSuffix();

    public static string DocumentKind(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".dwg" or ".dxf" => "DWG",
        ".pdf" => "PDF",
        ".jpg" or ".jpeg" or ".png" or ".heic" or ".webp" => "FOTO",
        _ => "DIGER"
    };

    // Sezon önerisi: son 90 günün tüketimi (çıkış − işten iade) 60 güne oranlanır, 1,4 sezon katsayısıyla
    // çarpılır, minimum stok eklenir, mevcut stok düşülür. İade çıkıştan fazlaysa tüketim sıfır sayılır.
    public const decimal SeasonFactor = 1.4m;
    public static (decimal Need, decimal Order) SeasonOrder(decimal used90Days, decimal minQty, decimal qty)
    {
        var need = Math.Ceiling(Math.Max(0, used90Days) * 60 / 90 * SeasonFactor);
        return (need, Math.Max(0, need + minQty - qty));
    }

    // Günlük e-posta özeti. Başlıklar sayıyla okunacak biçimde: "geciken iş" -> "2 geciken iş".
    // Bildirilecek satır yoksa null: boş e-posta gönderilmez.
    public record DigestSection(string Title, List<string> Lines);
    // İngilizcede sayı başlığın arkasına gelir: "overdue jobs (2)" (tekil/çoğul derdi olmasın).
    public static (string Subject, string Body)? DigestMail(DateOnly today, IEnumerable<DigestSection> sections, bool en = false)
    {
        var culture = System.Globalization.CultureInfo.GetCultureInfo(en ? "en-GB" : "tr-TR");
        var s = sections.Where(x => x.Lines.Count > 0).ToList();
        if (s.Count == 0) return null;
        var counts = s.Select(x => en ? $"{x.Title} ({x.Lines.Count})" : $"{x.Lines.Count} {x.Title}");
        var subject = $"Pano · {today.ToString("d MMMM", culture)}: {string.Join(", ", counts)}";
        var body = string.Join("\n\n", s.Select(x =>
            $"{char.ToUpper(x.Title[0], culture)}{x.Title[1..]} ({x.Lines.Count})\n{string.Join("\n", x.Lines.Select(l => "• " + l))}"));
        return (subject, body + (en ? "\n\nOpen Pano for details." : "\n\nAyrıntılar için Pano'yu açın."));
    }

    // Toptan alımda iskontolu (net) birim fiyat, kuruşa yuvarlanır.
    public static decimal NetPrice(decimal listPrice, decimal discountRate) =>
        Math.Round(listPrice * (1 - discountRate / 100m), 2, MidpointRounding.AwayFromZero);

    // Harita pini ve müşteri listesi için tek durum: en acil olan kazanır.
    public static string CustomerStatus(IEnumerable<string> checkStatuses, bool anyOverdue, bool anyWaiting, bool anyActive)
    {
        var s = checkStatuses.ToList();
        if (anyOverdue || s.Contains("late")) return "late";
        if (anyWaiting || s.Contains("soon")) return "soon";
        return anyActive ? "active" : "ok";
    }

    // Arşivde klasör/dosya adı olarak güvenle kullanılabilir hale getirir.
    public static string SafeFileName(string name) =>
        string.Concat(name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c)).Trim(' ', '.');
}
