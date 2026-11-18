# Geliştirme bilgisayarında çalışır: arayüzü derler, API ile birlikte tek klasöre paketler.
# Çıktı: dist\Pano  ->  USB ile ofis bilgisayarına taşınır, orada kur.ps1 çalıştırılır.
# Paket self-contained: ofis bilgisayarına .NET kurmak gerekmez.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'dist\Pano'

Push-Location (Join-Path $root 'frontend')
npm ci; if ($LASTEXITCODE) { throw 'npm ci başarısız' }
npm run build; if ($LASTEXITCODE) { throw 'Arayüz derlenemedi' }
Pop-Location

# Kuruma özel logo depoda yok: deploy\brand varsa (logo.svg, apple-touch-icon.png) genel logonun üstüne yazılır.
$brand = Join-Path $PSScriptRoot 'brand'
if (Test-Path $brand) { Copy-Item (Join-Path $brand '*') (Join-Path $root 'backend\Pano.Api\wwwroot') -Force }

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
dotnet publish (Join-Path $root 'backend\Pano.Api') -c Release -r win-x64 --self-contained true -o (Join-Path $out 'app')
if ($LASTEXITCODE) { throw 'dotnet publish başarısız' }

Copy-Item (Join-Path $PSScriptRoot 'kur.ps1'), (Join-Path $PSScriptRoot 'yedek.ps1'), (Join-Path $PSScriptRoot 'KURULUM.md') $out
Write-Host "Hazır: $out" -ForegroundColor Green
