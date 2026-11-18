# Günlük yedek (kur.ps1 bunu "Pano Yedek" zamanlanmış görevi olarak kaydeder).
# Veritabanını pg_dump ile alır, arşiv klasörünü kopyalar, eski dökümleri siler.
param(
    [Parameter(Mandatory)][string]$Ayar,
    [Parameter(Mandatory)][string]$Hedef,
    [Parameter(Mandatory)][string]$Arsiv,
    [int]$SaklaGun = 30
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $Hedef 'yedek.log'
New-Item -ItemType Directory -Force $Hedef | Out-Null

try {
    $cs = @{}
    foreach ($p in ((Get-Content $Ayar -Raw | ConvertFrom-Json).ConnectionStrings.Pano -split ';')) {
        $k, $v = $p -split '=', 2
        if ($k) { $cs[$k.Trim()] = $v }
    }
    $pgDump = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $pgDump) { throw 'pg_dump.exe bulunamadı' }

    $dosya = Join-Path $Hedef ('pano-{0:yyyy-MM-dd_HHmm}.dump' -f (Get-Date))
    $env:PGPASSWORD = $cs['Password']
    & $pgDump.FullName -h $cs['Host'] -p $cs['Port'] -U $cs['Username'] -F c -f $dosya $cs['Database']
    if ($LASTEXITCODE) { throw "pg_dump hata kodu $LASTEXITCODE" }

    # /E: sadece ekler. Arşivden yanlışlıkla silinen dosya yedekte kalsın diye /MIR kullanılmıyor.
    robocopy $Arsiv (Join-Path $Hedef 'arsiv') /E /R:2 /W:5 /NP /NFL /NDL | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy hata kodu $LASTEXITCODE" }

    Get-ChildItem $Hedef -Filter 'pano-*.dump' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-$SaklaGun) | Remove-Item
    "$(Get-Date -f s) TAMAM $dosya ($([math]::Round((Get-Item $dosya).Length / 1MB, 1)) MB)" | Add-Content $log
}
catch {
    "$(Get-Date -f s) HATA $_" | Add-Content $log
    throw
}
finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
