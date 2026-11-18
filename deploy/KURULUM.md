# Pano – ofis bilgisayarına kurulum

Uygulama ofisteki tek bilgisayarda Windows servisi olarak çalışır ve tarayıcıdan `http://localhost:5080` ile açılır. İnternete açılmaz; telefonlar Tailscale özel ağıyla bağlanır.

## 1. PostgreSQL 18 (bir kez)

Yönetici PowerShell'de, `GÜÇLÜ_ŞİFRE` yerine bir şifre yazın (içinde `;` olmasın) ve şifreyi bir yere not edin:

```powershell
winget install --id PostgreSQL.PostgreSQL.18 --exact --override "--mode unattended --unattendedmodeui minimal --superpassword GÜÇLÜ_ŞİFRE --serverport 5432 --locale tr-TR --disable-components stackbuilder"
```

> `--locale tr-TR` şart. Türkçe Windows dil adını "Turkish_Türkiye.1254" olarak verir; içindeki "ü" yüzünden PostgreSQL veritabanını oluşturamaz ve kurulum "Failed to initialise the database cluster" hatasıyla biter.

## 2. Pano'yu kur

1. Geliştirme bilgisayarında `deploy\publish.ps1` çalıştırın. `dist\Pano` klasörü oluşur.
2. Bu klasörü USB ile ofis bilgisayarına kopyalayın.
3. Klasörde **yönetici** PowerShell açın:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\kur.ps1 -YedekKlasoru 'E:\PanoYedek' -EpostaAlici 'yetkili@ornek.com' -SmtpKullanici 'pano.firma@gmail.com'
```

- `-YedekKlasoru` harici disk ya da Google Drive senkron klasörü olmalı.
- `-EpostaAlici` ve `-SmtpKullanici` isteğe bağlı (aşağıda 5. adım). Yazılmazsa e-posta bildirimi kapalı kalır.
- Script ilk seferde PostgreSQL şifresini (e-posta verildiyse SMTP şifresini de) sorar, `C:\Pano` altına kurar, `Pano` servisini ve her gün 19:00'daki `Pano Yedek` görevini oluşturur. Veritabanı tabloları ilk açılışta kendiliğinden oluşur; veritabanı boş başlar.

Belgeler (çizim, PDF, fotoğraf) `C:\PanoVeri\arsiv` altında, iş koduna göre klasörlenir. Silinen belgeler `C:\PanoVeri\arsiv\_silinenler` klasörüne taşınır.

## 3. Güncelleme

Yeni sürüm için aynı iki adım: `publish.ps1`, kopyala, `kur.ps1`. Ayar dosyası, veritabanı, arşiv, yedek klasörü ve e-posta ayarı korunur; `-YedekKlasoru` yeniden yazılmazsa var olan yedek klasörü kullanılır.

E-posta bildirimi kurulumdan sonra da eklenebilir. Kurulum klasöründe (yönetici PowerShell) şunu çalıştırın; sadece Gmail uygulama şifresi sorulur, veriler değişmez:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\kur.ps1 -EpostaAlici 'yetkili@ornek.com' -SmtpKullanici 'pano.firma@gmail.com'
```

Bunun için kurulum klasörünü (içindeki `app` klasörüyle birlikte) ofis bilgisayarında saklayın, ör. `C:\PanoKurulum`.

## 4. Telefondan erişim (Tailscale)

1. Ofis bilgisayarına ve telefonlara Tailscale kurun, aynı hesapla giriş yapın.
2. Ofis bilgisayarında: `tailscale serve --bg 5080`
3. Telefonda Tailscale açıkken çıkan `https://<bilgisayar-adı>.<tailnet>.ts.net` adresini açın, tarayıcı menüsünden "Ana ekrana ekle".

Kamera ile barkod okuma (barkod kutusundaki kamera düğmesi) tarayıcı kuralı gereği yalnızca güvenli adreste çalışır: telefonda bu `https` adresi, ofis bilgisayarında `http://localhost:5080`. İlk kullanımda tarayıcı kamera izni ister. Okuma internetsiz çalışır.

## 5. E-posta bildirimi (isteğe bağlı)

Her gün saat 08:00'de (`-BildirimSaati` ile değişir) alıcıya bir özet gider: geciken ve 7 gün içinde teslim edilecek işler, EDAŞ onayında bekleyenler, geciken ve 30 gün içindeki periyodik kontroller, kritik stok. Bildirilecek bir şey yoksa e-posta gönderilmez. Bilgisayar 08:00'de kapalıysa açıldığında gönderilir; aynı gün ikinci kez gitmez.

Gönderen hesap için Gmail önerilir:

1. Firma için bir Gmail hesabı açın (ör. `pano.firma@gmail.com`), iki adımlı doğrulamayı açın.
2. Google Hesabı → Güvenlik → **Uygulama şifreleri** bölümünden "Pano" adıyla bir şifre oluşturun (16 harf).
3. `kur.ps1` SMTP şifresini sorduğunda bu uygulama şifresini girin. Kurulum sonunda alıcıya deneme e-postası gider.

Gmail dışı bir sunucu için `-SmtpSunucu` ve `-SmtpPort` verin; port 587 (STARTTLS) olmalı, 465 desteklenmez.

Denemeyi sonradan yeniden göndermek için:

```powershell
Invoke-RestMethod -Method Post http://localhost:5080/api/notify/test -Headers @{ 'X-Pano' = '1' }
```

## 6. Yedekten geri dönme

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' -h localhost -U postgres -d pano --clean --if-exists 'E:\PanoYedek\pano-2026-11-10_1900.dump'
```

Arşiv dosyaları `E:\PanoYedek\arsiv` klasöründen `C:\PanoVeri\arsiv` içine geri kopyalanır. Yedek günlüğü: `E:\PanoYedek\yedek.log`.

## Sorun giderme

- Servis durumu: `Get-Service Pano`, yeniden başlatma: `Restart-Service Pano`
- Hata kayıtları (e-posta gönderilemedi dahil): Olay Görüntüleyicisi → Windows Günlükleri → Uygulama, kaynak "Pano".
- E-posta ayarları `C:\Pano\app\appsettings.Production.json` içindeki `Email` bölümündedir; elle değiştirirseniz `Restart-Service Pano`.
