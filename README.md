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

## Online özellikler: Supabase kurulumu (5 dakika)

Skor tablosu ve TKM online modu için ücretsiz bir Supabase projesi gerekir:

1. **supabase.com** → ücretsiz hesap aç → "New project" (bölge: Europe/Frankfurt uygun).
2. Sol menüden **SQL Editor** → aşağıdaki kodu yapıştır → **Run**:

```sql
create table public.skorlar (
  id bigint generated always as identity primary key,
  isim text not null check (char_length(isim) between 2 and 16),
  oyun text not null check (oyun in ('parmak_sureli','parmak_sonsuz','puzzle','tkm_online')),
  skor numeric not null check (skor >= 0 and skor < 100000),
  created_at timestamptz default now()
);

alter table public.skorlar enable row level security;
create policy "herkes okur" on public.skorlar for select using (true);
create policy "herkes ekler" on public.skorlar for insert with check (true);

create view public.liderler as
select oyun, isim,
  case
    when oyun = 'puzzle' then min(skor)
    when oyun = 'tkm_online' then sum(skor)
    else max(skor)
  end as skor
from public.skorlar
group by oyun, isim;

grant select on public.liderler to anon;
```

3. **Project Settings → API** sayfasından `Project URL` ve `anon public` anahtarını
   kopyala, `config.js` içindeki iki alana yapıştır.
4. `config.js`'i depoya yükle. Bitti — skor tablosu dolmaya, TKM online
   eşleşmeler çalışmaya başlar.

Notlar:
- `anon` anahtarının sitede görünmesi normaldir; yalnızca izin verdiğin
  işlemleri (skor ekleme/okuma) yapabilir.
- TKM online eşleşme Supabase **Realtime** kanallarını kullanır; yeni
  projelerde varsayılan olarak açıktır, ek ayar gerekmez.
- Skorlar kullanıcı beyanına dayanır; ciddi bir yarışma için ileride
  sunucu doğrulaması eklenebilir.
