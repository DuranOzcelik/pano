using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting.WindowsServices;
using Pano.Api.Data;
using Pano.Api.Endpoints;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    // Windows servisi olarak çalışırken çalışma dizini System32 olur; ayar ve wwwroot exe'nin yanından okunsun.
    ContentRootPath = WindowsServiceHelpers.IsWindowsService() ? AppContext.BaseDirectory : default
});
builder.Host.UseWindowsService(o => o.ServiceName = "Pano");

var isDev = builder.Environment.IsDevelopment();
// Varsayılan arayüz dili ve örnek verinin, e-posta özetinin dili: "tr" (varsayılan) ya da "en".
var english = builder.Configuration["Language"] == "en";
builder.Services.AddDbContext<PanoDb>(o => o
    .UseNpgsql(builder.Configuration.GetConnectionString("Pano"), npg => npg.ConfigureDataSource(ds => ds.EnableDynamicJson()))
    .UseSnakeCaseNamingConvention()
    .UseAsyncSeeding((ctx, _, ct) => Seed.RunAsync((PanoDb)ctx, isDev, english, ct)));

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
const long maxUpload = 200L * 1024 * 1024; // DWG ve fotoğraf paketleri büyük olabiliyor
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = maxUpload);
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = maxUpload);

var archiveRoot = Path.GetFullPath(builder.Configuration["Archive:Path"] ?? "arsiv", builder.Environment.ContentRootPath);

// Günlük e-posta özeti; ayar dosyasında Email bölümü yoksa kapalı.
builder.Services.AddSingleton(builder.Configuration.GetSection("Email").Get<EmailOptions>() ?? new EmailOptions());
builder.Services.AddHostedService<DigestService>();

var app = builder.Build();

// Ofis kurulumunda elle migration çalıştırmaya gerek kalmasın.
await using (var scope = app.Services.CreateAsyncScope())
    await scope.ServiceProvider.GetRequiredService<PanoDb>().Database.MigrateAsync();

app.UseExceptionHandler();
app.UseStatusCodePages();

// CSRF koruması: veri değiştiren her /api isteği X-Pano başlığı taşımalı. Başka bir site bu başlığı
// CORS ön kontrolüne takılmadan gönderemez, yani tarayıcı üzerinden sahte istek atılamaz.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(ctx.Request.Method)
        && !HttpMethods.IsHead(ctx.Request.Method) && !ctx.Request.Headers.ContainsKey("X-Pano"))
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");
api.MapDashboard();
api.MapCustomers();
api.MapProjects();
api.MapMaterials();
api.MapMovements();
api.MapChecks();
api.MapDocuments(archiveRoot);
api.MapNotify();
api.MapFallback(() => Results.NotFound());

app.MapFallbackToFile("index.html"); // React yönlendirmesi

app.Run();
