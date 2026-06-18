# Snapmaker Lazer & CNC Eksik Analizi (MakerDashboard)

Bu dokuman, `Snapmaker-Luban` lazer akisini referans alarak `MakerDashboard` icin sunulan cozumlerin analizini sunar.

## 1) Strateji Degisikligi: OpenBuilds CAM Entegrasyonu

Daha once internal bir lazer workspace (`pages/laser/`) uzerinden ilerlenmesi planlanmisti. Ancak Snapmaker Luban seviyesinde bir vector/raster isleme kalitesi ve toolpath yonetimi sunabilmek adina, endustri standardi olan **OpenBuilds CAM** projenin ana lazer/CNC motoru olarak entegre edilmistir.

## 2) Gap Matrix (Guncel Durum)

| Alan | Durum | Cozum | Not |
|---|---|---|---|
| UI tasarim akisi | Tamam | OpenBuilds CAM | Modern ve profesyonel arayuz |
| Parametre paneli | Tamam | OpenBuilds CAM | Detayli materyal ve operasyon ayarlari |
| Toolpath yonetimi | Tamam | OpenBuilds CAM | Multi-operasyon, siralama ve optimizasyon |
| G-code olusturma | Tamam | OpenBuilds CAM | Yuksek hassasiyetli G-code generator |
| Cihaz baglantisi | Tamam | OpenBuilds CAM / Dashboard | Dashboard uzerinden izleme, CAM uzerinden gonderim |
| Dosya transferi | Tamam | OpenBuilds CAM | USB/Serial uzerinden doğrudan gonderim |
| Runtime kontrol | Tamam | OpenBuilds CAM | Real-time simulation ve job control |

## 3) Mevcut Durum (MakerDashboard)

### Aktif Bileşenler
- **OrcaSlicer**: 3D Yazici dilimleme ve kontrolu icin.
- **OpenBuilds CAM**: Lazer engrave/cut ve CNC carving islemleri icin.
- **Maker Dashboard**: Tum bu araclari tek bir merkezden baslatan ve yoneten ana hub.

### Tespit Edilen Kritik Avantajlar
- **Meerk40t**'den OpenBuilds CAM'e gecilerek web teknolojileriyle tam uyumlu, daha performansli ve görsel olarak zengin bir CAM deneyimi saglandi.
- **CNC** destegi otomatik olarak kazanildi (OpenBuilds CAM her iki modu da destekler).

## 4) Kabul Kriterleri (Uygulama Hazirlik)

- [x] OrcaSlicer entegrasyonu (Layerstech presetleri ile otomatik baslatma).
- [x] OpenBuilds CAM entegrasyonu (Yeni pencerede kesintisiz calisma).
- [x] Home ekranindan Laser ve CNC butonlarinin OpenBuilds CAM'i tetiklemesi.
- [x] Paketleme (Installer) surecinin tum aracları icermesi.

## 5) Gelecek Planlari (Roadmap)

1. **Dashboard - CAM Veri Koprusu**: Dashboard'da secilen bir dosyanin otomatik olarak OpenBuilds CAM'e gonderilmesi.
2. **Ortak Kutuphane**: OrcaSlicer ve OpenBuilds CAM arasinda ortak materyal/parametre paylasimi.
3. **Unified Machine Status**: Ana dashboard uzerinde makinanin anlik durumunun (sicaklik, ilerleme) her iki arac acikken de izlenebilmesi.

