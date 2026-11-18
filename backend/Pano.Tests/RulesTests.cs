using Pano.Api;

namespace Pano.Tests;

public class RulesTests
{
    [Theory]
    [InlineData("400638133393", "4006381333931")] // bilinen geçerli EAN-13
    [InlineData("869041200001", "8690412000013")]
    public void Ean13_adds_correct_check_digit(string first12, string expected) =>
        Assert.Equal(expected, Rules.Ean13(first12));

    [Fact]
    public void Internal_barcode_is_13_digits_with_store_prefix() =>
        Assert.Equal("2900000000131", Rules.InternalBarcode(13));

    [Theory]
    [InlineData("2026-11-09", "late")]
    [InlineData("2026-11-10", "soon")]
    [InlineData("2026-12-10", "soon")] // tam 30 gün
    [InlineData("2026-12-11", "ok")]
    public void Check_status_by_days_left(string next, string expected) =>
        Assert.Equal(expected, Rules.CheckStatus(DateOnly.Parse(next), new DateOnly(2026, 11, 10)));

    [Theory]
    [InlineData("Tek hat şeması_Rev2.dwg", "Tek hat şeması")]
    [InlineData("Tek hat şeması-rev 10.DWG", "Tek hat şeması")]
    [InlineData("Tek hat şeması.dwg", "Tek hat şeması")]
    [InlineData("Rev1.pdf", "Rev1")] // ad tamamen silinmesin
    public void Document_base_name_strips_revision_suffix(string file, string expected) =>
        Assert.Equal(expected, Rules.DocumentBaseName(file));

    [Fact]
    public void Safe_file_name_keeps_extension_and_removes_path_chars() =>
        Assert.Equal("a_b_Rev0.dwg", Rules.SafeFileName("a/b_Rev0.dwg"));

    [Fact]
    public void Season_order_follows_formula()
    {
        // 90 günde 90 çıkış -> 60 günde 60 × 1,4 = 84 ihtiyaç; + min 10 - stok 20 = 74 sipariş
        Assert.Equal((84m, 74m), Rules.SeasonOrder(90, 10, 20));
        Assert.Equal((0m, 0m), Rules.SeasonOrder(0, 5, 50)); // stok yeterliyse öneri yok
        Assert.Equal((0m, 5m), Rules.SeasonOrder(-3, 10, 5)); // iade çıkıştan fazla: tüketim sıfır
    }

    [Fact]
    public void Digest_mail_lists_only_nonempty_sections()
    {
        var mail = Rules.DigestMail(new DateOnly(2026, 11, 18), [
            new("geciken iş", ["P-2026-030 Aydınlatma · 10 gün gecikti", "P-2026-031 Depo · 3 gün gecikti"]),
            new("yaklaşan kontrol", []),
            new("kritik stok", ["NYY kablo · 120 / 200 m"]),
        ]);
        Assert.NotNull(mail);
        Assert.Equal("Pano · 18 Kasım: 2 geciken iş, 1 kritik stok", mail.Value.Subject);
        Assert.Contains("Geciken iş (2)\n• P-2026-030", mail.Value.Body);
        Assert.DoesNotContain("kontrol", mail.Value.Body);
        Assert.Null(Rules.DigestMail(new DateOnly(2026, 11, 18), [new("kritik stok", [])]));
        var en = Rules.DigestMail(new DateOnly(2026, 11, 18), [new("overdue jobs", ["P-2026-030 Lighting · 10 days overdue"])], en: true);
        Assert.Equal("Pano · 18 November: overdue jobs (1)", en!.Value.Subject);
        Assert.EndsWith("Open Pano for details.", en.Value.Body);
    }

    [Theory]
    [InlineData(100, 15, 85)]
    [InlineData(38.50, 0, 38.50)]
    [InlineData(19.99, 12.5, 17.49)] // 17.49125 -> kuruşa yuvarlanır
    [InlineData(500, 100, 0)]
    public void Net_price_applies_discount(decimal list, decimal discount, decimal expected) =>
        Assert.Equal(expected, Rules.NetPrice(list, discount));

    [Fact]
    public void Customer_status_picks_most_urgent()
    {
        Assert.Equal("late", Rules.CustomerStatus(["ok", "late"], false, true, true));
        Assert.Equal("soon", Rules.CustomerStatus(["ok"], false, true, true));
        Assert.Equal("active", Rules.CustomerStatus([], false, false, true));
        Assert.Equal("ok", Rules.CustomerStatus([], false, false, false));
    }
}
