using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace Pano.Api.Data;

// Tek satırlık firma ayarı. Şablon seçimi ve modüller Ayarlar ekranından değişecek.
public class CompanySettings
{
    public int Id { get; set; }
    public string Template { get; set; } = "elektrik";
    public List<string> Modules { get; set; } = [];
    public List<string> CustomFields { get; set; } = [];
    public DateOnly? LastDigestOn { get; set; } // günlük e-posta özeti en son hangi gün gönderildi
}

public class WorkflowStep
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
    public bool IsApproval { get; set; } // "onay bekleyen" sayacı bu adımı sayar
}

public class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Type { get; set; } = "Otel";
    public string? Region { get; set; }
    public string? Contact { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Project
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public int CustomerId { get; set; }
    [JsonIgnore] public Customer Customer { get; set; } = null!;
    public int StepId { get; set; }
    [JsonIgnore] public WorkflowStep Step { get; set; } = null!;
    public DateTime StepChangedAt { get; set; } = DateTime.UtcNow; // "EDAŞ'ta kaç gündür" için
    public DateOnly StartDate { get; set; }
    public DateOnly DueDate { get; set; }
    public Dictionary<string, string> Extra { get; set; } = []; // firmaya özel alanlar (jsonb)
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; } // son adıma gelince dolar
}

public class Material
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public string Unit { get; set; } = "adet";
    public decimal Quantity { get; set; } // sadece stok hareketleriyle değişir
    public decimal MinQuantity { get; set; }
    public string? Location { get; set; }
    public decimal ListPrice { get; set; }    // tedarikçinin liste fiyatı
    public decimal DiscountRate { get; set; } // toptan alım iskontosu, %
    public decimal UnitPrice { get; set; }    // net alış = liste × (1 − iskonto); stok değeri ve iş maliyeti bununla
    public decimal SalePrice { get; set; }    // müşteriye satış fiyatı
    public string Barcode { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [NotMapped] public bool IsCritical => Quantity < MinQuantity;
}

public enum MovementType { In, Out }

public class StockMovement
{
    public int Id { get; set; }
    public int MaterialId { get; set; }
    [JsonIgnore] public Material Material { get; set; } = null!;
    public MovementType Type { get; set; }
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; } // hareket anındaki net alış; iş maliyeti sonradan değişmesin
    public decimal? ListPrice { get; set; }    // mal kabulde girilen liste fiyatı
    public decimal? DiscountRate { get; set; } // mal kabulde girilen iskonto %
    public decimal SalePrice { get; set; }     // hareket anındaki satış fiyatı; işin satış tutarı için
    public int? ProjectId { get; set; }
    [JsonIgnore] public Project? Project { get; set; }
    public string? ReferenceNo { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class CheckType
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int DefaultPeriodMonths { get; set; } = 12;
}

public class PeriodicCheck
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    [JsonIgnore] public Customer Customer { get; set; } = null!;
    public int CheckTypeId { get; set; }
    [JsonIgnore] public CheckType CheckType { get; set; } = null!;
    public int PeriodMonths { get; set; }
    public DateOnly LastDoneDate { get; set; }
    [NotMapped] public DateOnly NextDate => LastDoneDate.AddMonths(PeriodMonths);
}

public class CheckHistory
{
    public int Id { get; set; }
    public int PeriodicCheckId { get; set; }
    [JsonIgnore] public PeriodicCheck PeriodicCheck { get; set; } = null!;
    public DateOnly DoneDate { get; set; }
    public DateOnly? PreviousDoneDate { get; set; } // geri alma için önceki son tarih
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Document
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    [JsonIgnore] public Project Project { get; set; } = null!;
    public string Name { get; set; } = "";       // revizyon eki olmadan, ör. "Tek hat şeması"
    public string Kind { get; set; } = "DIGER";  // DWG, PDF, FOTO, DIGER
    public int Revision { get; set; }
    public string FilePath { get; set; } = "";   // arşiv klasörüne göre göreli yol
    public string OriginalFileName { get; set; } = "";
    public long SizeBytes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
