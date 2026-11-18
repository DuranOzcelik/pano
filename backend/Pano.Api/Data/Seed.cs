using Microsoft.EntityFrameworkCore;

namespace Pano.Api.Data;

// İlk çalıştırmada elektrik şablonunu yükler. Örnek veri sadece Development ortamında eklenir;
// ofis kurulumunda (Production) veritabanı boş başlar. en: aşama, kontrol türü ve örnek veri İngilizce
// (ayar dosyasında "Language": "en"). Kayıtlar bir kez yazılır, sonradan dil değişse de kayıtlar değişmez.
public static class Seed
{
    public static async Task RunAsync(PanoDb db, bool withSampleData, bool en, CancellationToken ct)
    {
        if (await db.WorkflowSteps.AnyAsync(ct)) return;
        string L(string tr, string english) => en ? english : tr;

        string[] fields = [L("Kurulu güç (kW)", "Installed power (kW)"), L("EDAŞ başvuru no", "Utility application no.")];
        db.Settings.Add(new CompanySettings
        {
            Template = "elektrik",
            Modules = ["hareket", "hatirlatici", "harita", "arsiv"],
            CustomFields = [.. fields]
        });
        // Üçüncü aşama (EDAŞ onayı) onay bekleme aşamasıdır.
        var steps = new[] { L("Keşif", "Survey"), L("Çizim", "Drawing"), L("EDAŞ onayı", "Utility approval"), L("Uygulama", "Installation"), L("Tamamlandı", "Done") }
            .Select((n, i) => new WorkflowStep { Name = n, SortOrder = i, IsApproval = i == 2 }).ToArray();
        db.WorkflowSteps.AddRange(steps);
        // ⚠ Yasal periyotlar şirketteki mühendise teyit ettirilecek.
        var types = new (string, int)[]
        {
            (L("Topraklama ölçümü", "Earthing measurement"), 12), (L("Jeneratör periyodik bakım", "Generator service"), 6),
            (L("Paratoner kontrolü", "Lightning protection check"), 12), (L("Pano termal kamera kontrolü", "Switchboard thermal imaging"), 12),
            (L("Kompanzasyon kontrolü", "Power factor correction check"), 3), (L("Yangın algılama enerji hattı", "Fire alarm power supply check"), 12)
        }.Select(t => new CheckType { Name = t.Item1, DefaultPeriodMonths = t.Item2 }).ToArray();
        db.CheckTypes.AddRange(types);
        await db.SaveChangesAsync(ct);

        if (withSampleData) await AddSampleData(db, steps, types, fields, L, ct);
    }

    // Uydurma örnek veri: gerçek işletme adı değildir.
    static async Task AddSampleData(PanoDb db, WorkflowStep[] steps, CheckType[] types, string[] fields, Func<string, string, string> L, CancellationToken ct)
    {
        var today = Rules.Today;
        var now = DateTime.UtcNow;
        Customer C(string name, string type, string region, string contact, double lat, double lng) =>
            new() { Name = name, Type = type, Region = region, Contact = contact, Lat = lat, Lng = lng };
        string hotel = L("Otel", "Hotel"), manager = L("Teknik müdür", "Technical manager");
        var cs = new[]
        {
            C(L("Side Mavi Koy Resort", "Side Blue Cove Resort"), hotel, "Side", $"{manager} · Hakan B.", 36.7712, 31.3925),
            C(L("Sorgun Çam Park Otel", "Sorgun Pine Park Hotel"), hotel, "Sorgun", L("Teknik şef · Serkan Y.", "Chief technician · Serkan Y."), 36.7765, 31.4235),
            C(L("Kumköy Palmiye Hotel", "Kumköy Palm Hotel"), hotel, "Kumköy", L("İşletme müdürü · Elif K.", "Operations manager · Elif K."), 36.7790, 31.3640),
            C(L("Titreyengöl Lagün Resort", "Titreyengöl Lagoon Resort"), hotel, "Titreyengöl", $"{manager} · Murat A.", 36.7700, 31.4440),
            C(L("Evrenseki Liman Suites", "Evrenseki Harbour Suites"), hotel, "Evrenseki", L("Satın alma · Derya T.", "Purchasing · Derya T."), 36.7905, 31.3290),
            C(L("Kızılağaç Sahil Apart", "Kızılağaç Beach Apartments"), L("Apart", "Apartments"), "Kızılağaç", L("Sahibi · Ramazan Ö.", "Owner · Ramazan Ö."), 36.7480, 31.5230),
            C(L("Irmak Evleri Sitesi", "Riverside Homes Estate"), L("Konut", "Residential"), L("Merkez", "Centre"), L("Site yönetimi", "Estate management"), 36.7870, 31.4430),
            C(L("Oymapınar Soğuk Hava Deposu", "Oymapınar Cold Store"), L("Sanayi", "Industrial"), "Oymapınar", L("Fabrika müdürü · Kemal D.", "Plant manager · Kemal D."), 36.9170, 31.5330),
            C(L("Çolaklı Gün Resort", "Çolaklı Sun Resort"), hotel, "Çolaklı", $"{manager} · Cem S.", 36.8130, 31.2400),
        };
        db.Customers.AddRange(cs);

        // stepDays: işin şimdiki aşamaya kaç gün önce geçtiği. power/appNo: ayarlardaki ek alanlar.
        Project P(string code, Customer c, string name, int step, int start, int due, string? power = null, string? appNo = null, int stepDays = 5) =>
            new()
            {
                Code = code, Customer = c, Name = name, StepId = steps[step].Id, StepChangedAt = now.AddDays(-stepDays),
                StartDate = today.AddDays(start), DueDate = today.AddDays(due),
                Extra = new[] { (fields[0], power), (fields[1], appNo) }.Where(x => x.Item2 != null).ToDictionary(x => x.Item1, x => x.Item2!),
                CompletedAt = step == steps.Length - 1 ? now.AddDays(due) : null
            };
        var ps = new[]
        {
            P("P-2026-024", cs[0], L("Mutfak ve çamaşırhane güç dağıtımı", "Kitchen and laundry power distribution"), 3, -40, 12, "180", "AKD-24-11872", stepDays: 20),
            P("P-2026-027", cs[1], L("Ana pano yenileme ve kompanzasyon", "Main switchboard renewal and power factor correction"), 2, -25, 20, "420", "AKD-24-12405", stepDays: 18),
            P("P-2026-029", cs[3], L("Otopark şarj istasyonları (4×22 kW)", "Car park EV chargers (4×22 kW)"), 1, -10, 30, "88", stepDays: 6),
            P("P-2026-030", cs[2], L("Aydınlatma LED dönüşümü", "LED lighting retrofit"), 3, -18, -2, "35", stepDays: 10),
            P("P-2026-031", cs[7], L("Soğuk hava deposu enerji projesi", "Cold store power supply project"), 2, -30, 5, "260", "AKD-24-12190", stepDays: 9),
            P("P-2026-033", cs[4], L("Yeni blok iç tesisat projesi", "New block interior wiring design"), 0, -3, 45, stepDays: 3),
            P("P-2026-034", cs[6], L("Site ortak alan aydınlatma", "Estate common area lighting"), 1, -6, 25, "14", stepDays: 3),
            P("P-2026-019", cs[8], L("Havuz alanı topraklama ve eş potansiyel", "Pool area earthing and equipotential bonding"), 4, -120, -60, stepDays: 60),
            P("P-2026-021", cs[5], L("Sayaç panosu taşıma", "Meter board relocation"), 4, -90, -55, stepDays: 55),
        };
        db.Projects.AddRange(ps);

        var seq = 1;
        // Örnek fiyatlar: liste fiyatı, kategoriye göre toptan iskonto (kablo ve koruma %20), satış ≈ net alış × 1,35.
        Material M(string name, string cat, string unit, decimal qty, decimal min, string loc, decimal list, bool bigDiscount = false)
        {
            var discount = bigDiscount ? 20m : 12.5m;
            var net = Rules.NetPrice(list, discount);
            return new() { Name = name, Category = cat, Unit = unit, Quantity = qty, MinQuantity = min, Location = loc,
                ListPrice = list, DiscountRate = discount, UnitPrice = net, SalePrice = Math.Round(net * 1.35m), Barcode = Rules.InternalBarcode(seq++) };
        }
        string pcs = L("adet", "pcs"), protection = L("Koruma", "Protection"), cable = L("Kablo", "Cable"), control = L("Kumanda", "Control"),
            wiring = L("Tesisat", "Wiring accessories");
        var ms = new[]
        {
            M(L("Otomatik sigorta C16 1P", "Circuit breaker C16 1P"), protection, pcs, 140, 60, "A-01", 85, true),
            M(L("Kaçak akım rölesi 4P 40A 30mA", "RCD 4P 40A 30mA"), protection, pcs, 12, 15, "A-02", 1450, true),
            M(L("NYM kablo 3×2,5 mm²", "NYM cable 3×2.5 mm²"), cable, "m", 850, 400, "B-01", 32, true),
            M(L("NYY kablo 4×16 mm²", "NYY cable 4×16 mm²"), cable, "m", 120, 200, "B-02", 410, true),
            M(L("Topraklama çubuğu 1,5 m", "Earth rod 1.5 m"), L("Topraklama", "Earthing"), pcs, 18, 20, "C-01", 390),
            M("LED panel 60×60 40W", L("Aydınlatma", "Lighting"), pcs, 64, 30, "D-01", 520),
            M(L("Kontaktör 3P 25A", "Contactor 3P 25A"), control, pcs, 22, 10, "A-04", 760),
            M(L("Buat IP65 100×100", "Junction box IP65 100×100"), wiring, pcs, 210, 80, "C-03", 48),
            M(L("Kablo kanalı 40×60 (2 m)", "Cable trunking 40×60 (2 m)"), wiring, pcs, 95, 40, "C-02", 115),
            M(L("Dağıtım panosu 1000×800×300", "Distribution board 1000×800×300"), L("Pano", "Switchboard"), pcs, 3, 2, "E-01", 14800),
            M(L("AC şarj ünitesi 22 kW", "AC charger 22 kW"), L("Şarj", "EV charging"), pcs, 2, 4, "E-02", 38500),
            M(L("Termik röle 9–13 A", "Thermal overload relay 9–13 A"), control, pcs, 15, 8, "A-05", 640),
        };
        db.Materials.AddRange(ms);

        var dn = L("İRS", "DN"); // irsaliye / delivery note
        StockMovement H(int daysAgo, Material m, MovementType t, decimal qty, Project? p = null, string? refNo = null, string? note = null) =>
            new() { Material = m, Type = t, Quantity = qty, UnitPrice = m.UnitPrice, SalePrice = m.SalePrice, Project = p, ReferenceNo = refNo, Note = note, CreatedAt = now.AddDays(-daysAgo) };
        var hs = new List<StockMovement>
        {
            H(1, ms[5], MovementType.Out, 24, ps[3], note: L("2. kat koridorlar", "2nd floor corridors")),
            H(1, ms[2], MovementType.In, 500, refNo: $"{dn}-2026-4471", note: L("Bölge bayisi", "Regional dealer")),
            H(3, ms[0], MovementType.Out, 36, ps[0]),
            H(3, ms[6], MovementType.Out, 6, ps[0]),
            H(6, ms[3], MovementType.Out, 80, ps[0], note: L("Mutfak besleme hattı", "Kitchen feeder")),
            H(8, ms[5], MovementType.Out, 30, ps[3]),
            H(12, ms[1], MovementType.Out, 4, ps[0]),
            H(15, ms[5], MovementType.In, 80, refNo: $"{dn}-2026-4302"),
            H(20, ms[2], MovementType.Out, 320, ps[0]),
            H(28, ms[4], MovementType.Out, 12, ps[7]),
            H(33, ms[9], MovementType.Out, 1, ps[0], note: L("Mutfak tali pano", "Kitchen sub-board")),
            H(40, ms[0], MovementType.In, 100, refNo: $"{dn}-2026-3980"),
            H(55, ms[7], MovementType.Out, 60, ps[8]),
            H(70, ms[4], MovementType.Out, 14, ps[7]),
        };
        // Stok = hareketlerin toplamı kalsın diye her malzemeye 120 gün önceden açılış girişi.
        foreach (var m in ms)
        {
            var opening = m.Quantity - hs.Where(h => h.Material == m).Sum(h => h.Type == MovementType.In ? h.Quantity : -h.Quantity);
            if (opening > 0) hs.Add(H(120, m, MovementType.In, opening, refNo: L("Açılış stoğu", "Opening stock")));
        }
        db.StockMovements.AddRange(hs);

        PeriodicCheck K(Customer c, int type, int period, int lastDaysAgo) =>
            new() { Customer = c, CheckTypeId = types[type].Id, PeriodMonths = period, LastDoneDate = today.AddDays(-lastDaysAgo) };
        db.PeriodicChecks.AddRange(
            K(cs[0], 0, 12, 352), K(cs[1], 1, 6, 172), K(cs[3], 2, 12, 370), K(cs[2], 3, 12, 300),
            K(cs[7], 4, 3, 84), K(cs[8], 0, 12, 60), K(cs[4], 5, 12, 340), K(cs[6], 3, 6, 100));

        await db.SaveChangesAsync(ct);
    }
}
