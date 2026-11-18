using Microsoft.EntityFrameworkCore;

namespace Pano.Api.Data;

public class PanoDb(DbContextOptions<PanoDb> options) : DbContext(options)
{
    public DbSet<CompanySettings> Settings => Set<CompanySettings>();
    public DbSet<WorkflowStep> WorkflowSteps => Set<WorkflowStep>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Material> Materials => Set<Material>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<CheckType> CheckTypes => Set<CheckType>();
    public DbSet<PeriodicCheck> PeriodicChecks => Set<PeriodicCheck>();
    public DbSet<CheckHistory> CheckHistory => Set<CheckHistory>();
    public DbSet<Document> Documents => Set<Document>();

    protected override void ConfigureConventions(ModelConfigurationBuilder b) =>
        b.Properties<decimal>().HavePrecision(18, 3); // metre kablo gibi kesirli miktarlar için 3 hane

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Project>().HasIndex(p => p.Code).IsUnique();
        b.Entity<Project>().Property(p => p.Extra).HasColumnType("jsonb");
        b.Entity<Project>().Property(p => p.StepChangedAt).HasDefaultValueSql("now()");
        b.Entity<Material>().HasIndex(m => m.Barcode).IsUnique();
        b.Entity<StockMovement>().Property(m => m.Type).HasConversion<string>().HasMaxLength(3);
        b.Entity<StockMovement>().HasIndex(m => m.CreatedAt);
        b.Entity<CheckType>().HasIndex(t => t.Name).IsUnique();
        b.Entity<Document>().HasIndex(d => new { d.ProjectId, d.Name, d.Revision }).IsUnique();

        // Geçmişi olan kayıt silinemesin: hareketler, kontroller ve belgeler veri kaybına karşı Restrict.
        b.Entity<StockMovement>().HasOne(m => m.Material).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<StockMovement>().HasOne(m => m.Project).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<Project>().HasOne(p => p.Customer).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<Project>().HasOne(p => p.Step).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<PeriodicCheck>().HasOne(k => k.Customer).WithMany().OnDelete(DeleteBehavior.Restrict);
        b.Entity<Document>().HasOne(d => d.Project).WithMany().OnDelete(DeleteBehavior.Restrict);
    }
}
