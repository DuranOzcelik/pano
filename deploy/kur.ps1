#Requires -RunAsAdministrator
# Ofis bilgisayarında, yönetici PowerShell'de çalışır. İlk kurulum ve güncelleme için aynı script:
# servis varsa durdurur, dosyaları yeniler, ayar dosyasına ve verilere dokunmaz, servisi başlatır.
param(
    [string]$Hedef = 'C:\Pano',
    [string]$Veri = 'C:\PanoVeri',
    # Yedek klasörü mümkünse harici disk ya da Google Drive senkron klasörü olsun.
    [string]$YedekKlasoru = 'C:\PanoVeri\yedek',
    [string]$YedekSaati = '19:00',
    # Günlük e-posta özeti (isteğe bağlı). Alıcı verilirse SMTP şifresi sorulur, ayar dosyasına yazılır
    # ve kurulum sonunda deneme e-postası gönderilir. Birden çok alıcı virgülle.
    [string]$EpostaAlici = '',
    [string]$SmtpKullanici = '',
    [string]$SmtpSunucu = 'smtp.gmail.com',
    [int]$SmtpPort = 587,
    [int]$BildirimSaati = 8
)
$ErrorActionPreference = 'Stop'
$app = Join-Path $Hedef 'app'
$ayar = Join-Path $app 'appsettings.Production.json'
$arsiv = Join-Path $Veri 'arsiv'

# Yeniden çalıştırmada (güncelleme, sonradan e-posta ekleme) -YedekKlasoru verilmezse var olan yedek görevinin
# klasörü korunur; yoksa görev varsayılan C:\PanoVeri\yedek'e döner ve yedek aynı diske düşerdi.
if (-not $PSBoundParameters.ContainsKey('YedekKlasoru')) {
    $eski = (Get-ScheduledTask 'Pano Yedek' -ErrorAction SilentlyContinue).Actions.Arguments
    if ($eski -match '-Hedef "([^"]+)"') { $YedekKlasoru = $Matches[1] }
}

$pg = Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pg) { throw 'PostgreSQL servisi bulunamadı. Önce KURULUM.md adım 1.' }

$svc = Get-Service Pano -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne 'Stopped') {
    Stop-Service Pano
    $svc.WaitForStatus('Stopped', '00:00:30')
}

New-Item -ItemType Directory -Force $app, $arsiv, $YedekKlasoru | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'app\*') $app -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot 'yedek.ps1') $Hedef -Force

if (-not (Test-Path $ayar)) {
    $guvenli = Read-Host 'PostgreSQL kurulumunda verdiğiniz postgres şifresi' -AsSecureString
    $sifre = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($guvenli))
    if ($sifre -match ';') { throw "Şifrede ';' olamaz (bağlantı cümlesini böler)." }
    @{
        ConnectionStrings = @{ Pano = "Host=localhost;Port=5432;Database=pano;Username=postgres;Password=$sifre" }
        Archive = @{ Path = $arsiv }
    } | ConvertTo-Json | Set-Content $ayar -Encoding UTF8
    # Dosya şifre içeriyor: sadece yöneticiler ve SYSTEM okuyabilsin.
    icacls $ayar /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null
}

if ($EpostaAlici) {
    if (-not $SmtpKullanici) { $SmtpKullanici = Read-Host 'Gönderen e-posta adresi (SMTP kullanıcısı)' }
    $guvenli = Read-Host "$SmtpKullanici için SMTP şifresi (Gmail'de uygulama şifresi)" -AsSecureString
    $smtpSifre = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($guvenli))
    # Var olan ayar dosyasına Email bölümü eklenir ya da değiştirilir; dosyanın erişim izinleri korunur.
    $cfg = Get-Content $ayar -Raw | ConvertFrom-Json
    $cfg | Add-Member -Force -NotePropertyName Email -NotePropertyValue ([ordered]@{
        Host = $SmtpSunucu; Port = $SmtpPort; Ssl = $true; User = $SmtpKullanici; Password = $smtpSifre
        From = $SmtpKullanici; To = $EpostaAlici; Hour = $BildirimSaati })
    $cfg | ConvertTo-Json -Depth 5 | Set-Content $ayar -Encoding UTF8
}

if (-not $svc) {
    New-Service -Name Pano -DisplayName 'Pano' -Description 'Pano iş ve stok takibi' `
        -BinaryPathName "`"$app\Pano.Api.exe`"" -StartupType Automatic -DependsOn $pg.Name | Out-Null
    # Çökerse 5 sn sonra yeniden başlat.
    sc.exe failure Pano reset= 86400 actions= restart/5000/restart/5000/restart/60000 | Out-Null
}
Start-Service Pano

$gorev = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
    "-NoProfile -ExecutionPolicy Bypass -File `"$Hedef\yedek.ps1`" -Ayar `"$ayar`" -Hedef `"$YedekKlasoru`" -Arsiv `"$arsiv`"")
Register-ScheduledTask -TaskName 'Pano Yedek' -Action $gorev -Trigger (New-ScheduledTaskTrigger -Daily -At $YedekSaati) `
    -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -User 'SYSTEM' -RunLevel Highest -Force | Out-Null

for ($i = 0; $i -lt 30; $i++) {
    try { Invoke-WebRequest 'http://localhost:5080/api/settings' -UseBasicParsing -TimeoutSec 2 | Out-Null; break }
    catch { Start-Sleep 1 }
}
if ($i -eq 30) { throw "Pano cevap vermiyor. Olay Görüntüleyicisi > Uygulama günlüğüne bakın." }
Write-Host 'Pano çalışıyor: http://localhost:5080' -ForegroundColor Green
if ($EpostaAlici) {
    try {
        $r = Invoke-RestMethod -Method Post 'http://localhost:5080/api/notify/test' -Headers @{ 'X-Pano' = '1' }
        Write-Host "Deneme e-postası gönderildi: $($r.to -join ', ')" -ForegroundColor Green
    } catch {
        Write-Warning "Deneme e-postası gönderilemedi: $($_.ErrorDetails.Message)"
    }
}
if ($YedekKlasoru -like "$Veri*") { Write-Warning 'Yedek aynı diskte. Harici disk ya da Drive klasörü için: .\kur.ps1 -YedekKlasoru E:\PanoYedek' }
