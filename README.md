# Borsa Panel

Portföy takip paneli. Veriyi GitHub'ın sunucularında toplar, telefonda açılır, bilgisayarın kapalı olsa bile çalışır.

---

## Nasıl çalışır

```
GitHub Actions (hafta içi yarım saatte bir)
        │
        ├── scrape.js  →  headless Chromium ile doviz.com + fintables.com
        │                 fiyat · temel oranlar · 6 aylık seri · haber · TLY fon dağılımı
        │
        └── data.json  →  depoya commit edilir
                            │
                    GitHub Pages yayınlar
                            │
              Telefonundaki tarayıcı index.html'i açar,
              data.json'u okur, senin pozisyonlarınla birleştirir
```

**Senin pozisyonların (adet, maliyet) depoya hiç girmez.** Onlar yalnızca telefonunun/tarayıcının yerel hafızasında (`localStorage`) durur. Depoda sadece halka açık piyasa verisi bulunur — yani depo herkese açık olsa bile kimse portföyünü göremez, sadece ASELS'in fiyatını görür ki onu zaten herkes görebiliyor.

---

## Kurulum — 6 adım

### 1. Depoyu oluştur
GitHub'da sağ üstteki **+** → **New repository**.
- İsim: `borsa-panel`
- **Public** seç (GitHub Pages ücretsiz planda yalnızca açık depolarda çalışır — yukarıdaki gizlilik notunu oku, sorun değil)
- **Add a README file** kutusunu işaretleme
- **Create repository**

### 2. Dosyaları yükle
Yeni açılan sayfada **uploading an existing file** bağlantısına tıkla. Şu dosyaları sürükle:

```
index.html
scrape.js
data.json
.github/workflows/guncelle.yml
```

> `.github/workflows/` klasörü önemli. Tarayıcıdan yüklerken klasör yapısını korumak için dosyaları klasörleriyle birlikte sürükle-bırak yap. Olmazsa: **Add file → Create new file** de, isim kutusuna `.github/workflows/guncelle.yml` yaz (eğik çizgiler klasörü otomatik oluşturur), içeriği yapıştır.

Sonra **Commit changes**.

### 3. Actions'a yazma izni ver
**Settings** → sol menüde **Actions** → **General** → en altta **Workflow permissions**:
- **Read and write permissions** seç
- **Save**

Bu adım atlanırsa bot güncellenen veriyi depoya yazamaz.

### 4. Pages'i aç
**Settings** → sol menüde **Pages**:
- **Source**: `Deploy from a branch`
- **Branch**: `main`, klasör `/ (root)`
- **Save**

Bir iki dakika sonra adresin hazır olur:
`https://KULLANICI-ADIN.github.io/borsa-panel/`

### 5. İlk veriyi çek
**Actions** sekmesi → soldan **Veri güncelle** → sağda **Run workflow** → yeşil butona bas.

İlk çalışma 3–5 dakika sürer (tarayıcı kuruluyor). Yeşil tik görünce veri hazırdır.

### 6. Telefona ekle
Adresi telefonda aç:
- **iPhone (Safari):** Paylaş simgesi → *Ana Ekrana Ekle*
- **Android (Chrome):** ⋮ menü → *Ana ekrana ekle*

Artık ana ekranında ikon olarak durur ve tam ekran açılır.

İlk açılışta **+ İşlem** butonuyla pozisyonlarını gir. Bir kez girmen yeterli, telefon hatırlar.

---

## Zamanlama

Hafta içi **09:30 – 18:30** (Türkiye saati) arası yarım saatte bir çalışır. Hafta sonu çalışmaz.

`.github/workflows/guncelle.yml` içindeki cron **UTC** ile yazılıdır (`0,30 6-15 * * 1-5`). Türkiye UTC+3 olduğu için 3 saat geri yazılmıştır. Kış saati uygulaması olan ülkelerde bu kayar, Türkiye'de sabit saat uygulandığı için sorun olmaz.

> GitHub, yoğun saatlerde zamanlanmış işleri birkaç dakika geciktirebilir. Ayrıca 60 gün hiç aktivite olmayan depolarda zamanlamayı durdurur — arada bir depoya girmen yeterli.

---

## Bir şey bozulursa

**Actions** sekmesinde kırmızı çarpı görürsen, çalışmaya tıklayıp log'a bak. En sık iki sebep:

| Belirti | Sebep | Çözüm |
|---|---|---|
| `Hiçbir hisse verisi alınamadı` | doviz.com sayfa yapısını değiştirmiş | `scrape.js` içindeki seçicilerin güncellenmesi gerekir |
| `Permission denied` / push hatası | Adım 3 atlanmış | Settings → Actions → Read and write permissions |

Betik veriyi kısmen alabilirse eski değerleri korur ve `data.json` içindeki `hatalar` dizisine not düşer — panel yine açılır, sadece o kalem eski kalır.

---

## Takip edilen hisseleri değiştirmek

`scrape.js` dosyasının başındaki iki listeyi düzenle:

- `TRACKED` — portföyündeki hisseler
- `CANDIDATES` — "Sonraki Adım" sekmesinde taranan adaylar

Her satırda `slug`, doviz.com adresindeki isimdir. Örnek: `https://borsa.doviz.com/hisseler/asels-aselsan` → slug `asels-aselsan`.

---

## Sınırlar — dürüst liste

- **Veri 15 dakika gecikmelidir.** BIST'in ücretsiz verisi böyle. Anlık işlem kararı için uygun değildir.
- **Betik siteye bağımlıdır.** doviz.com tasarımını değiştirirse betik bozulur ve düzeltilmesi gerekir.
- **TLY fon dağılımı ayda bir açıklanır.** Panelde gördüğün dağılım son yayımlanan rapordur, bugünkü gerçek dağılım farklı olabilir.
- **Yatırım tavsiyesi değildir.** Panel veri gösterir ve analiz yapar; alım-satım kararı senindir.
