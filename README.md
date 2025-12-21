# 🗺️ Smart Route Finder

OpenStreetMap tabanlı rota bulma uygulaması. Dijkstra algoritması ve Priority Queue kullanarak en kısa yolu bulur.

## 🚀 Özellikler

- OpenStreetMap entegrasyonu ile gerçek yol verileri
- Çoklu ara nokta desteği (TSP optimizasyonu)
- Animasyonlu rota görselleştirme
- Min-Heap ile optimize edilmiş Dijkstra algoritması
- Tek yönlü yol ve kavşak desteği

## 📁 Dosyalar

```
├── index.html          # Ana sayfa
├── style.css           # Stil dosyası
├── script.js           # Ana uygulama
├── dijkstra.js         # Dijkstra algoritması
├── min-heap.js         # Min-Heap veri yapısı
├── osm-service.js      # OpenStreetMap servisi
└── graph-data.json     # Muğla bölgesi hazır veri
```

## 🎮 Kullanım

1. Tarayıcıda `index.html` dosyasını açın
2. Harita üzerinde başlangıç ve bitiş noktalarını seçin
3. İsterseniz ara noktalar ekleyin (maks 8)
4. Rota otomatik olarak hesaplanır ve gösterilir

## 🛠️ Teknolojiler

- HTML5, CSS3, JavaScript (ES6+)
- Leaflet.js (harita görselleştirme)
- OpenStreetMap (harita ve yol verileri)
- Overpass API (OSM veri sorgulama)

## ⚡ Performans

- Min-Heap ile 5-10x hızlanma
- O((V+E) log V) zaman karmaşıklığı
- 3000-7000 düğümlü graflar için 10-30ms

## 📝 Lisans

CENG 3511 - Yapay Zeka dersi final projesi
