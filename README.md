# El Oyunları 🖐️

Kamera ve el hareketleriyle oynanan üç oyunu tek sitede toplayan proje.
Python + OpenCV + MediaPipe prototiplerinin web sürümüdür; tarayıcıda
**MediaPipe Tasks Vision (hand_landmarker)** ile çalışır, aynı model kullanılır.

## Oyunlar

| Oyun | Kontrol | Rekor |
|---|---|---|
| ✊ Taş Kağıt Makas | Tek el, jest tanıma | — |
| 🎯 Parmak Avı (Süreli / Sonsuz) | İşaret parmağı (2 el) | En yüksek puan (mod başına) |
| 🧩 El Puzzle | İki el + çimdik | En kısa süre |

Rekorlar tarayıcının `localStorage`'ında saklanır.

## Çalıştırma

Kamera erişimi **HTTPS veya localhost** gerektirir; dosyaya çift tıklayarak
(`file://`) açmak çalışmaz. İki kolay yol:

**1) Bilgisayarında dene:**
```bash
cd el-oyunlari
python -m http.server 8000
# tarayıcıda: http://localhost:8000
```

**2) İnternette yayınla (GitHub Pages):**
1. GitHub'da yeni bir depo aç, bu klasördeki dosyaları yükle.
2. Depo → Settings → Pages → Source: `main` branch, `/ (root)` seç.
3. Birkaç dakika sonra `https://kullaniciadin.github.io/depoadi/` adresinde yayında.

Alternatifler: Netlify / Vercel / Cloudflare Pages'e klasörü sürükle-bırak.

## Dosya yapısı

```
index.html      Menü + oyun ekranı
style.css       Görsel kimlik
js/main.js      Uygulama akışı, kamera, oyun döngüsü
js/hand.js      MediaPipe sarmalayıcı (ayna düzeltmesi, jest, çimdik)
js/rps.js       Taş Kağıt Makas
js/dots.js      Parmak Avı (iki mod)
js/puzzle.js    El Puzzle
js/sound.js     Web Audio ses efektleri
js/store.js     Rekor deposu (localStorage)
```

## Online skor tablosu (ileriki adım)

Tüm rekor okuma/yazma işlemleri `js/store.js` içinde toplandı. Kullanıcıların
birbirinin rekorlarını görmesi için:

1. Ücretsiz bir **Supabase** projesi aç, `skorlar (isim, oyun, mod, skor, tarih)`
   tablosu oluştur.
2. `store.js` içindeki `submit*` fonksiyonlarına Supabase `insert`,
   `get*` fonksiyonlarına `select ... order by skor` ekle.
3. Menüye bir "Skor Tablosu" paneli koy.

Backend olmadan da site tamamen çalışır.

## Notlar

- Python sürümündeki "bilgisayar 4 puanda hile yapar" davranışı kaldırıldı;
  bilgisayar her zaman rastgele oynar.
- Model ve WASM dosyaları CDN'den yüklenir; ilk açılışta birkaç saniye sürebilir.
- Görüntü hiçbir sunucuya gönderilmez, tüm işlem cihazda yapılır.
