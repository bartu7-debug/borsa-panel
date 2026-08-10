/**
 * borsa-panel · veri toplayıcı
 *
 * doviz.com (Forinvest verisi) ve fintables.com'dan portföy panelinin ihtiyaç duyduğu
 * tüm veriyi çeker ve data.json olarak yazar.
 *
 * GitHub Actions içinde headless Chromium ile çalışır — kullanıcının bilgisayarına ihtiyaç yoktur.
 *
 * ÖNEMLİ: Bu betik yalnızca HALKA AÇIK piyasa verisi toplar.
 * Kullanıcının pozisyonları (adet, maliyet) buraya hiç girmez; onlar tarayıcıda saklanır.
 */

const { chromium } = require("playwright");
const fs = require("fs");

// ---- Takip edilen semboller ----------------------------------------------
// Yeni hisse eklemek için buraya bir satır ekle; slug doviz.com adresindeki isimdir.
const TRACKED = [
  { k: "ASELS",    slug: "asels-aselsan",                     news: /Aselsan|ASELS|savunma/i },
  { k: "ALTIN.S1", slug: "altins1-darphane-altin-sertifikasi", news: /altın|gram altın|ons/i },
  { k: "THYAO",    slug: "thyao-turk-hava-yollari",           news: /Türk Hava|THY|havacılık|yolcu|uçuş/i },
  { k: "FROTO",    slug: "froto-ford-otosan",                 news: /Ford|Otosan|otomotiv/i },
  { k: "MASFN",    slug: "masfn-masfen-enerji",               news: /Masfen|MASFN/i },
  { k: "METEN",    slug: "meten-metgun-enerji",               news: /Metgün|METEN/i },
  { k: "PGSUS",    slug: "pgsus-pegasus",                     news: /Pegasus|havacılık|yolcu/i },
];

// Sonraki Adım sekmesi için taranan aday evreni
const CANDIDATES = [
  { k: "TUPRS", slug: "tuprs-tupras",              sec: "Rafineri",                news: /Tüpraş|TUPRS|rafineri|petrol/i },
  { k: "KCHOL", slug: "kchol-koc-holding",         sec: "Çeşitlendirilmiş holding", news: /Koç|KCHOL|holding/i },
  { k: "MGROS", slug: "mgros-migros-ticaret",      sec: "Gıda perakendesi",        news: /Migros|MGROS|perakende/i },
  { k: "BIMAS", slug: "bimas-bim-magazalar",       sec: "İndirim perakendesi",     news: /BİM|BIMAS|perakende/i },
  { k: "AKBNK", slug: "akbnk-akbank",              sec: "Bankacılık",              news: /Akbank|AKBNK|banka|faiz/i },
  { k: "SAHOL", slug: "sahol-sabanci-holding",     sec: "Çeşitlendirilmiş holding", news: /Sabancı|SAHOL/i },
  { k: "TTKOM", slug: "ttkom-turk-telekom",        sec: "Telekomünikasyon",        news: /Telekom|TTKOM/i },
  { k: "EREGL", slug: "eregl-eregli-demir-celik",  sec: "Demir-çelik",             news: /Ereğli|EREGL|çelik/i },
  { k: "ISCTR", slug: "isctr-is-bankasi-c",        sec: "Bankacılık",              news: /İş Bankası|ISCTR|banka/i },
];

const BASE = "https://borsa.doviz.com";
const AY = { Ocak:"01", Şubat:"02", Mart:"03", Nisan:"04", Mayıs:"05", Haziran:"06",
             Temmuz:"07", Ağustos:"08", Eylül:"09", Ekim:"10", Kasım:"11", Aralık:"12" };

const log = (...a) => console.log(new Date().toISOString().slice(11,19), ...a);
const sayi = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/[₺%\s]/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(t);
  return isNaN(v) ? null : v;
};

/** Bir hisse sayfasından anlık fiyat + temel oranları çeker. */
async function hisseVerisi(page, slug) {
  await page.goto(`${BASE}/hisseler/${slug}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const T = document.body.innerText;
    const g = (re) => { const m = T.match(re); return m ? m[1].trim() : null; };
    const info = {};
    document.querySelectorAll("table").forEach((t) => {
      if (t.rows[0] && t.rows[0].cells.length === 2 && !/Sembol/.test(t.rows[0].cells[0].textContent)) {
        [...t.rows].forEach((r) => {
          if (r.cells.length === 2) info[r.cells[0].textContent.trim()] = r.cells[1].textContent.trim();
        });
      }
    });
    return {
      pxRaw:  g(/Son \(\d+:\d+\)\s*\n\s*([\d.,]+)/),
      chgRaw: g(/Son \(\d+:\d+\)\s*\n\s*[\d.,]+\s*\n\s*%([-\d.,]+)/),
      saat:   g(/Son \((\d+:\d+)\)/),
      dayR:   g(/Günlük Aralık\s*\n\s*([\d.,\s-]+)\n/),
      w52:    g(/52 Haftalık Aralık\s*\n\s*([\d.,\s-]+)\n/),
      info,
    };
  });
}

/** Tarihsel veri sekmesinden 6 aylık günlük kapanışları çeker. */
async function tarihselVeri(page, slug) {
  await page.goto(`${BASE}/hisseler/${slug}/tarihsel-veri`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  try {
    await page.evaluate(() => {
      const s = document.querySelector("select");
      const o = [...s.options].find((x) => x.textContent.includes("6 Ay"));
      s.value = o.value;
      s.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Verileri Getir")).click();
    });
    await page.waitForTimeout(5000);
    return await page.evaluate((AY) => {
      const t = document.querySelector("table");
      const o = {};
      [...t.rows].slice(1).forEach((r) => {
        const p = r.cells[0].textContent.trim().split(" ");
        const v = parseFloat(r.cells[1].textContent.trim().replace(/\./g, "").replace(",", "."));
        if (!isNaN(v)) o[(AY[p[1]] || "00") + "-" + String(p[0]).padStart(2, "0")] = v;
      });
      return o;
    }, AY);
  } catch (e) {
    log("  ! tarihsel veri alınamadı:", slug, e.message);
    return {};
  }
}

/** Hisse haber sayfasından şirkete özel haberleri süzer. */
async function haberler(page, slug, filtre) {
  try {
    await page.goto(`${BASE}/hisseler/${slug}/haberler`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2200);
    return await page.evaluate((re) => {
      const rx = new RegExp(re.source, re.flags);
      const seen = new Set();
      const out = [];
      [...document.querySelectorAll("a")]
        .filter((a) => /haber\.doviz\.com/.test(a.href) && a.innerText.trim().length > 40 && rx.test(a.innerText))
        .forEach((a) => {
          const t = a.innerText.trim().replace(/\s+/g, " ");
          const key = t.slice(0, 35);
          if (!seen.has(key)) { seen.add(key); out.push({ t: t.slice(0, 300), u: a.href }); }
        });
      return out.slice(0, 6);
    }, { source: filtre.source, flags: filtre.flags });
  } catch (e) {
    log("  ! haber alınamadı:", slug, e.message);
    return [];
  }
}

/** Piyasa geneli: en çok kazandıran/kaybettiren/işlem gören + BIST100 ve makro. */
async function piyasaOzeti(page) {
  await page.goto(`${BASE}/hisseler`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  return page.evaluate(() => {
    const num = (s) => parseFloat(String(s).replace(/[₺%\s]/g, "").replace(/\./g, "").replace(",", "."));
    const t = document.querySelector("table");
    const rows = [...t.rows].slice(1).map((r) => {
      const c = [...r.cells].map((x) => x.innerText.trim());
      return { s: (c[0] || "").split("\n")[0].trim(), px: num(c[1]), vol: num(c[4]), chg: num(c[5]) };
    }).filter((x) => x.s && !isNaN(x.vol));
    const byVol = [...rows].sort((a, b) => b.vol - a.vol).slice(0, 40);
    const byChg = [...rows].filter((x) => !isNaN(x.chg)).sort((a, b) => b.chg - a.chg);
    const T = document.body.innerText;
    const g = (re) => { const m = T.match(re); return m ? m[1].trim() : null; };
    return {
      likit: byVol.map((r) => ({ s: r.s, px: r.px, vol: r.vol, chg: r.chg })),
      kazandiran: byChg.slice(0, 5).map((r) => ({ s: r.s, px: r.px, chg: r.chg })),
      kaybettiren: byChg.slice(-5).reverse().map((r) => ({ s: r.s, px: r.px, chg: r.chg })),
      makro: {
        bist100: g(/BIST 100\s*\n\s*([\d.,]+)/),
        dolar:   g(/DOLAR\s*\n\s*([\d.,]+)/),
        euro:    g(/EURO\s*\n\s*([\d.,]+)/),
        gramAltin: g(/GRAM ALTIN\s*\n\s*([\d.,]+)/),
        brent:   g(/BRENT\s*\n\s*\$([\d.,]+)/),
      },
    };
  });
}

/** TLY fonunun aylık portföy dağılım raporu ve getirileri. */
async function tlyVerisi(page) {
  try {
    await page.goto("https://fintables.com/fonlar/TLY", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(5000);
    return await page.evaluate(() => {
      const T = document.body.innerText.replace(/\n{2,}/g, "\n");
      const g = (re) => { const m = T.match(re); return m ? m[1].trim() : null; };
      // varlık dağılımı: "Hisse Senedi (%78,63)" biçimi
      const alloc = [];
      const rx = /([A-Za-zÇĞİÖŞÜçğıöşü\s.\-]+)\s\(%(-?[\d,.]+)\)/g;
      let m;
      while ((m = rx.exec(T)) !== null) {
        const ad = m[1].trim();
        if (ad.length > 3 && ad.length < 45) alloc.push({ n: ad, v: parseFloat(m[2].replace(",", ".")) });
      }
      // en büyük pozisyonlar
      const top = [];
      const bi = T.indexOf("En Büyük Pozisyonlar");
      if (bi > -1) {
        const blok = T.slice(bi, bi + 800);
        const pr = /\n([A-Z0-9]{4,6})\n%\n(-?[\d,.]+)\n%\n(-?[\d,.]+)/g;
        let p;
        while ((p = pr.exec(blok)) !== null) {
          top.push({ k: p[1], w: parseFloat(p[2].replace(",", ".")), chg: parseFloat(p[3].replace(",", ".")) });
        }
      }
      return {
        fiyat: g(/Birinci Serbest Fon\s*\n\s*([\d.,]+)/),
        tarih: g(/\n(\d{2} \w+ \d{4})\n/),
        rapor: g(/tüm veriler ([^.]+portföy dağılım raporu)/),
        fonBuyukluk: g(/Fon Toplam Değer\s*\n\s*([\d.,]+)/),
        yatirimci: g(/Yatırımcı Sayısı\s*\n\s*([\d.,]+)/),
        yonetimUcreti: g(/Yıllık Yönetim Ücreti\s*\n?%?\s*([\d,]+)/),
        riskDeger: g(/Risk Değeri\s*\n?\s*(\d)/),
        volatilite: g(/Tarihsel Volatilite[\s\S]{0,120}?%([\d,]+)/),
        getiri: {
          hafta: g(/1 Hafta\s*\n%\s*([\d,.-]+)/),
          ay:    g(/1 Ay\s*\n%\s*([\d,.-]+)/),
          ay6:   g(/6 Ay\s*\n%\s*([\d,.-]+)/),
          yil:   g(/1 Yıl\s*\n%\s*([\d,.-]+)/),
        },
        alloc: alloc.slice(0, 8),
        top: top.slice(0, 9),
      };
    });
  } catch (e) {
    log("  ! TLY verisi alınamadı:", e.message);
    return null;
  }
}

// ---- Ana akış -------------------------------------------------------------
(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    locale: "tr-TR",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  // Önceki veriyi oku — bu turda alınamayan alanlar için yedek olarak kullanılır
  let onceki = {};
  try { onceki = JSON.parse(fs.readFileSync("data.json", "utf8")); } catch (e) {}

  const out = {
    guncelleme: new Date().toISOString(),
    kaynak: "doviz.com (Forinvest) · fintables.com",
    uyari: "BIST verisi 15 dakika gecikmelidir. Yatırım tavsiyesi değildir.",
    hisseler: {},
    seriler: {},
    haberler: {},
    adaylar: {},
    piyasa: null,
    tly: null,
    hatalar: [],
  };

  // 1) Portföy hisseleri
  for (const h of TRACKED) {
    try {
      log("Çekiliyor:", h.k);
      const d = await hisseVerisi(page, h.slug);
      out.hisseler[h.k] = {
        px: sayi(d.pxRaw),
        dPct: sayi(d.chgRaw),
        saat: d.saat,
        dayR: d.dayR ? d.dayR.split("-").map((x) => sayi(x)) : null,
        w52: d.w52 ? d.w52.split("-").map((x) => sayi(x)) : null,
        wk: sayi(d.info["Haftalık Değişim Oranı"]),
        mo: sayi(d.info["Aylık Değişim Oranı"]),
        yr: sayi(d.info["Yıllık Değişim Oranı"]),
        fk: d.info["F/K"] || null,
        pddd: d.info["PD/DD"] || null,
        pd: d.info["Piyasa Değeri"] || null,
        dd: d.info["Defter Değeri"] || null,
        vol: d.info["Hacim (TL)"] || null,
        halka: d.info["Fiili Dolaşım Oranı"] || null,
      };
      out.seriler[h.k] = await tarihselVeri(page, h.slug);
      out.haberler[h.k] = await haberler(page, h.slug, h.news);
    } catch (e) {
      log("HATA:", h.k, e.message);
      out.hatalar.push(`${h.k}: ${e.message}`);
      if (onceki.hisseler && onceki.hisseler[h.k]) out.hisseler[h.k] = { ...onceki.hisseler[h.k], eski: true };
      if (onceki.seriler && onceki.seriler[h.k]) out.seriler[h.k] = onceki.seriler[h.k];
    }
  }

  // 2) Aday hisseler (tarama)
  for (const c of CANDIDATES) {
    try {
      log("Aday:", c.k);
      const d = await hisseVerisi(page, c.slug);
      out.adaylar[c.k] = {
        sec: c.sec,
        px: sayi(d.pxRaw),
        dPct: sayi(d.chgRaw),
        w52: d.w52 ? d.w52.split("-").map((x) => sayi(x)) : null,
        wk: sayi(d.info["Haftalık Değişim Oranı"]),
        mo: sayi(d.info["Aylık Değişim Oranı"]),
        yr: sayi(d.info["Yıllık Değişim Oranı"]),
        fk: d.info["F/K"] || null,
        pddd: d.info["PD/DD"] || null,
        pd: d.info["Piyasa Değeri"] || null,
        halka: d.info["Fiili Dolaşım Oranı"] || null,
        haberler: await haberler(page, c.slug, c.news),
      };
    } catch (e) {
      log("HATA (aday):", c.k, e.message);
      out.hatalar.push(`aday ${c.k}: ${e.message}`);
      if (onceki.adaylar && onceki.adaylar[c.k]) out.adaylar[c.k] = { ...onceki.adaylar[c.k], eski: true };
    }
  }

  // 3) Piyasa geneli
  try { out.piyasa = await piyasaOzeti(page); }
  catch (e) { out.hatalar.push("piyasa: " + e.message); out.piyasa = onceki.piyasa || null; }

  // 4) TLY fonu
  out.tly = await tlyVerisi(page);
  if (!out.tly && onceki.tly) { out.tly = { ...onceki.tly, eski: true }; out.hatalar.push("TLY: eski veri korundu"); }

  await browser.close();

  fs.writeFileSync("data.json", JSON.stringify(out, null, 1));
  log("Tamamlandı. Hisse:", Object.keys(out.hisseler).length,
      "Aday:", Object.keys(out.adaylar).length,
      "Hata:", out.hatalar.length);
  if (out.hatalar.length) log("Hatalar:", out.hatalar.join(" | "));

  // Tüm portföy hisseleri başarısızsa iş akışını da başarısız say
  const basarili = Object.values(out.hisseler).filter((h) => h.px && !h.eski).length;
  if (basarili === 0) { console.error("Hiçbir hisse verisi alınamadı — betik büyük ihtimalle bozuldu."); process.exit(1); }
})();
