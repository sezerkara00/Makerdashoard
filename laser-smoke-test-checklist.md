# Laser & CNC Smoke Test Checklist

Bu checklist, MakerDashboard içindeki Lazer ve CNC araçlarının temel işlevselliğini doğrulamak içindir.

## Hazırlık

- Uygulamayı aç: `npm start`
- Home ekranından **Laser** veya **CNC** butonuna bas.
- Test için bir `SVG` ve bir `PNG/JPG` dosyası hazır bulunsun.

## 1. Araç Başlatma (Launcher)

1. **Laser Butonu**
   - Beklenen: "OpenBuilds CAM" başlıklı yeni bir pencere açılır.
   - Pencere içeriği (OpenBuilds CAM arayüzü) doğru şekilde yüklenir.

2. **CNC Butonu**
   - Beklenen: "OpenBuilds CAM" başlıklı yeni bir pencere açılır (CNC modu desteklenir).

## 2. OpenBuilds CAM Temel İşlevler

3. **Dosya Import**
   - OpenBuilds CAM içinde `Open Drawing` butonuna bas.
   - Bir `SVG` dosyası seç.
   - Beklenen: Çizim canvas üzerinde görüntülenir.

4. **Toolpath Oluşturma**
   - Canvas üzerindeki objeyi seç.
   - `Add Toolpath` (veya benzeri) butonuna bas.
   - Beklenen: Sağ paneldeki toolpath listesinde operasyon belirir.

5. **G-Code Üretimi**
   - `Generate G-Code` butonuna bas.
   - Beklenen: G-Code başarıyla üretilir ve önizleme ekranı güncellenir.

## 3. Sistem Entegrasyonu

6. **Log Kontrolü**
   - Dashboard ana ekranındaki `Tanı Log'unu Göster` linkine bas.
   - Beklenen: Log dosyası açılır ve OpenBuilds CAM başlatma logları görülür.

7. **Kapatma**
   - OpenBuilds CAM penceresini kapat.
   - Dashboard üzerinden tekrar aç.
   - Beklenen: Pencere sorunsuz şekilde tekrar açılır.

## Hızlı Kabul Özeti

- Lazer/CNC butonları OpenBuilds CAM'i başlatıyorsa.
- CAM içinde dosya açılıp G-Code üretilebiliyorsa.
- Dashboard logları süreci takip edebiliyorsa test başarılıdır.

