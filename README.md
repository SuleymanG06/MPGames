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
main.js         Uygulama akışı, kamera, oyun döngüsü
hand.js         MediaPipe sarmalayıcı (ayna düzeltmesi, jest, çimdik)
rps.js          Taş Kağıt Makas
dots.js         Parmak Avı (iki mod)
puzzle.js       El Puzzle
sound.js        Web Audio ses efektleri
store.js        Rekor deposu (localStorage)
```

## Online skor tablosu (ileriki adım)

Tüm rekor okuma/yazma işlemleri `store.js` içinde toplandı. Kullanıcıların
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

## Kendi alan adını bağlama (GitHub'sız görünüm)

GitHub Pages zaten gerçek bir web sitesi barındırır; adresin `github.io`
olmasını istemiyorsan:

1. Bir alan adı satın al (isimtescil, Namecheap vb. — yılda ~200-400 TL).
2. Depo → Settings → Pages → **Custom domain** kısmına alan adını yaz.
3. Alan adı panelinde DNS'e `CNAME` kaydı ekle: `www → suleymang06.github.io`.
4. "Enforce HTTPS" kutusunu işaretle (kamera için şart).

Alternatif: klasörü Netlify ya da Vercel'e sürükle-bırak; ikisi de ücretsiz,
HTTPS'li ve alan adı bağlamayı destekler.
