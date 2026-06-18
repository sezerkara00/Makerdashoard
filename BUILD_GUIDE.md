# MakerDashboard Build & Geliştirme Rehberi

Bu dosya, Dashboard projesine dış araçların (OrcaSlicer, MeerK40t) nasıl entegre edileceğini ve projenin nasıl paketleneceğini açıklar.

## 1. Geliştirme Akışı

### OrcaSlicer Derleme & Güncelleme
Eğer `C:\gelistirme\OrcaSlicer` dizininde bir geliştirme yaptıysan ve Dashboard içindeki sürümü güncellemek istiyorsan:

1. Önce OrcaSlicer dizininde derleme işlemini yap:
   ```powershell
   cd C:\gelistirme\OrcaSlicer
   # Sadece dilimleyiciyi derlemek için:
   .\build_release_vs2022.bat slicer
   # Veya manuel olarak:
   cmake --build build --target install --config Release
   ```
2. Derleme bittikten sonra Dashboard dizininde senkronizasyon komutunu çalıştır:
   ```powershell
   cd C:\gelistirme\MakerDashboard
   npm run sync-tools
   ```
   Bu komut, derlenmiş güncel OrcaSlicer dosyalarını Dashboard'un `bin/OrcaSlicer` klasörüne kopyalar.

### LaserGRBL Derleme & Güncelleme
Eğer `C:\gelistirme\LaserGRBL-master` dizinindeki C# kodlarında bir geliştirme yaptıysan ve Dashboard içindeki sürümü güncellemek istiyorsan:

1. Önce LaserGRBL dizininde MSBuild ile projeyi derle:
   ```powershell
   cd C:\gelistirme\LaserGRBL-master
   msbuild /p:Configuration=Debug
   ```
2. Derleme bittikten sonra Dashboard dizininde senkronizasyon komutunu çalıştır:
   ```powershell
   cd C:\gelistirme\MakerDashboard
   npm run sync-tools
   ```
   Bu komut, derlenmiş güncel `LaserGRBL.exe` ve ilişkili tüm dosyaları `bin/LaserGRBL` klasörüne kopyalar.

### OpenBuilds CAM Güncelleme
OpenBuilds CAM bir web tabanlı araç olduğu için doğrudan `OpenBuilds-CAM-master` klasörü üzerinden çalışır. Eğer bu klasördeki dosyalarda (HTML/JS/CSS) bir değişiklik yaptıysan:
1. Dashboard kök dizininde `npm run sync-tools` çalıştır.
2. Bu komut, güncel dosyaları `bin/OpenBuildsCAM` klasörüne kopyalar (paketleme için).


## 2. Kurulum Dosyası Oluşturma (Setup EXE)

Dashboard'u tüm araçlarla birlikte bir kurulum sihirbazı (Installer) haline getirmek için:

1. Terminali **Yönetici Olarak (Run as Administrator)** aç.
2. Şu komutu çalıştır:
```powershell
npm run build
```

İşlem bittiğinde **`dist/MakerDashboard Setup 2.0.0.exe`** adında bir kurulum dosyası oluşacaktır. Bu dosyayı kullanıcılara gönderebilirsin. Kullanıcı bu dosyayı çalıştırdığında uygulama bilgisayarına kurulur ve masaüstüne bir kısayol oluşturulur.

## 3. Klasör Yapısı

- `/bin`: Dışarıdan paketlenen EXE'lerin ve araçların (OrcaSlicer, LaserGRBL) bulunduğu yer.
- `/pages`: Dashboard arayüz kodları.
- `/bin/LaserGRBL`: Lazer işlemleri için kullanılan LaserGRBL uygulamasının bulunduğu klasör.
- `main.js`: Uygulama mantığı ve araçların başlatılma kodları.
- `package.json`: Build ayarları ve bağımlılıklar.

## 4. İpuçları
- Uygulama çalışırken paketleme yapmaya çalışırsan `EBUSY` hatası alırsın. Önce Dashboard'u kapat.
- **Araç Güncelleme**: `bin` klasörü içindeki araçları (OrcaSlicer veya LaserGRBL) değiştirdiğinizde, `npm run build` komutu bu yeni dosyaları otomatik olarak kurulum paketine (`Setup.exe`) dahil edecektir.
- **CNC Desteği**: Şu anki yapı lazer için LaserGRBL'e geçmiştir. CNC butonu da varsayılan olarak lazer modülünü tetiklemektedir.

