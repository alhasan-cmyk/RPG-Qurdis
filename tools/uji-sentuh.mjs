// Uji baris "Tombol sentuh" di Pengaturan.
//
// Kenapa perlu: tombol sentuh adalah satu-satunya bagian antarmuka yang bisa
// muncul padahal perangkatnya tidak butuh (ponsel yang salah lapor, tablet
// dengan papan ketik Bluetooth). Sebelum ada baris Pengaturan, satu-satunya
// jalan keluar adalah menghapus simpanan peramban. Uji ini mengunci janji itu:
// pilihan bisa diubah, dan pilihan itu diingat.
//
// Uji ini butuh DOM (jsdom):  npm i jsdom
// Jalankan:  node tools/uji-sentuh.mjs
// Kalau jsdom tidak ada, berkas keluaran 0 dengan catatan "dilewati" — bukan
// gagal: pemeriksaan lain (tests/uji.mjs) tetap bisa jalan tanpa pemasangan.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  // Tanpa pemasangan lokal, jsdom yang terpasang global (NODE_PATH) masih bisa
  // dipakai — supaya CI yang sudah menyiapkannya tidak perlu npm init di sini.
  try {
    const { createRequire } = await import('node:module');
    ({ JSDOM } = createRequire(import.meta.url)('jsdom'));
  } catch {
    console.log('dilewati: jsdom belum terpasang (npm i jsdom).');
    process.exit(0);
  }
}

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://contoh.test/', pretendToBeVisual: true,
});
// Ponsel: pointer kasar + sentuhan.
Object.defineProperty(dom.window, 'matchMedia', {
  value: (q) => ({ matches: q.includes('pointer: coarse'), addEventListener() {}, removeEventListener() {} }),
  configurable: true, writable: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.matchMedia = dom.window.matchMedia;

const { pasangSentuh } = await import(`${AKAR}/src/ui/touch.js`);

let lulus = 0, gagal = 0;
const ok = (nama, syarat, info = '') => {
  if (syarat) lulus++; else { gagal++; console.error(`  GAGAL: ${nama}${info ? ' — ' + info : ''}`); }
};

// --- pemasangan pertama: mengikuti perangkat (sentuh -> tampil)
const s1 = pasangSentuh({ onPetunjuk: () => {} });
ok('perangkat terdeteksi sentuh', s1.perangkatSentuh === true);
ok('tombol tampil di awal', s1.tampil === true);
ok('API baru ada', typeof s1.aturTampil === 'function' && typeof s1.alihkan === 'function');
ok('API lama sudah hilang', s1.tampil_ === undefined);

// --- alihkan: mati
s1.alihkan();
ok('alihkan mematikan', s1.tampil === false);
ok('pilihan disimpan', localStorage.getItem('lk_sentuh') === '0');
ok('elemen disembunyikan', document.querySelector('.lk-touch').hidden === true);

// --- halaman dimuat ulang: pilihan diingat
const s2 = pasangSentuh({ onPetunjuk: () => {} });
ok('setelah muat ulang tetap mati', s2.tampil === false, String(s2.tampil));

// --- nyalakan lagi lewat aturTampil
s2.aturTampil(true);
ok('aturTampil menyalakan', s2.tampil === true);
ok('tersimpan sebagai 1', localStorage.getItem('lk_sentuh') === '1');

// --- kembali mengikuti perangkat
s2.ikutiPerangkat();
ok('ikutiPerangkat: kembali tampil', s2.tampil === true);
ok('kunci dihapus', localStorage.getItem('lk_sentuh') === null);

// --- munculkan() tidak menyalakan kalau pemain sudah mematikan
const s3 = pasangSentuh({ onPetunjuk: () => {} });
s3.aturTampil(false);
s3.munculkan();
ok('munculkan() tidak melawan pilihan pemain', s3.tampil === false);

// --- perangkat TANPA sentuh (laptop): bawaan mati, tapi bisa dinyalakan
localStorage.clear();
Object.defineProperty(dom.window, 'matchMedia', {
  value: (q) => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  configurable: true, writable: true,
});
const s4 = pasangSentuh({ onPetunjuk: () => {} });
ok('laptop: bawaan mati', s4.tampil === false);
ok('laptop: perangkatSentuh false', s4.perangkatSentuh === false);
s4.aturTampil(true);
ok('laptop: bisa dinyalakan manual', s4.tampil === true, 'inilah gunanya baris Pengaturan');
const s5 = pasangSentuh({ onPetunjuk: () => {} });
ok('laptop: nyala itu diingat', s5.tampil === true);

// --- Menu: baris "Tombol sentuh" muncul, nilai & aksi benar
const menuModul = await import(`${AKAR}/src/ui/menu.js`);
const { Menu } = menuModul;
// Daftar baris menu diekspor supaya uji memakai daftar yang SAMA dengan yang
// digambar — bukan salinan yang bisa basi.
const ROOT = menuModul.ROOT;
const audio = {
  settings: { musicVolume: .5, sfxVolume: .5, muted: false },
  ui() {}, setVolume() {}, setSfxVolume() {}, toggleMute() {},
};
const renderer = { zoomOverride: 0, skalaNama: 'normal', stepZoom() {}, stepSkala() {}, skala: 1 };
const menu = new Menu({ audio, renderer, onQuit() {}, ilmu: null, sentuh: s5 });
/** Lapisan sentuh yang sedang hidup, dipakai blok-blok uji berikutnya. */
const sentuh = s5;
const baris = menu.settingsRows();
const i = baris.findIndex((r) => r.id === 'sentuh');
ok('menu: baris Tombol sentuh ada', i >= 0, baris.map((r) => r.id).join(','));
ok('menu: nilainya "Tampil"', baris[i].value === 'Tampil', baris[i].value);
ok('menu: semua baris punya keterangan', baris.every((r) => typeof r.hint === 'string'));

menu.page = 'settings';
menu.cursor = i;
menu.key('left');
ok('menu: ← mematikan tombol', s5.tampil === false);
menu.key('right');
ok('menu: → menampilkan lagi', s5.tampil === true);
menu.key('interact');
ok('menu: E membalik', s5.tampil === false);

// --- menu tanpa lapisan sentuh (mis. game.html lama): barisnya tidak muncul
const menu2 = new Menu({ audio, renderer, onQuit() {}, ilmu: null });
ok('tanpa lapisan: baris tidak muncul', !menu2.settingsRows().some((r) => r.id === 'sentuh'));

// --- pagar gulir: baris "Kembali" tetap terjangkau di layar pendek
const { view } = await import(`${AKAR}/src/render/renderer.js`);
for (const h of [320, 360, 390, 720]) {
  view.w = 844; view.h = h;
  const muat = menu.barisPengaturanMu(40);
  ok(`layar ${h}px: ada baris yang digambar`, muat >= 1, String(muat));
  // kursor di baris terakhir harus tetap terlihat setelah jendela bergeser
  const rows = menu.settingsRows();
  menu.cursor = rows.length - 1;
  const lihat = Math.min(rows.length, muat);
  const atas = Math.max(0, Math.min(menu.cursor - lihat + 1, rows.length - lihat));
  ok(`layar ${h}px: baris terakhir terlihat`, menu.cursor >= atas && menu.cursor < atas + lihat,
    `kursor ${menu.cursor}, jendela ${atas}..${atas + lihat - 1}`);
}

// ------------------------------------------------- tata letak layar Pengaturan
// Baris baru menambah satu baris lagi ke panel Pengaturan. Di layar 320 px
// daftar setinggi tujuh baris tidak muat, jadi panelnya harus bergulir — dan
// itu mudah rusak diam-diam. Setiap baris digambar, lalu semua tulisan
// diperiksa terhadap batas panel.
for (const [w, h] of [[844, 390], [568, 320], [640, 360], [390, 844], [1280, 720]]) {
  view.w = w; view.h = h;
  const rows = menu.settingsRows();
  for (let i = 0; i < rows.length; i++) {
    menu.cursor = i;
    const tulis = [];
    const ctx = {
      fillStyle: '#000', textAlign: 'left', font: '16px x', canvas: {},
      measureText(s) {
        const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 16);
        return { width: s.length * px * 0.6 };
      },
      fillText(s, x, y) {
        const ww = this.measureText(s).width;
        const kiri = this.textAlign === 'right' ? x - ww : this.textAlign === 'center' ? x - ww / 2 : x;
        tulis.push({ s, x: kiri, y, w: ww, size: Number(/(\d+)px/.exec(this.font)?.[1] ?? 16) });
      },
      fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, save() {}, restore() {},
      translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {},
      lineTo() {}, stroke() {}, fill() {}, arc() {}, ellipse() {}, quadraticCurveTo() {},
      bezierCurveTo() {}, clip() {}, setTransform() {}, strokeText() {},
    };
    menu.drawSettings(ctx);
    const BARIS = 40;
    const PW = Math.min(420, w - 32);
    const lihat = Math.min(rows.length, menu.barisPengaturanMu(BARIS));
    const PH = 76 + lihat * BARIS + 34;
    const kiri = Math.round((w - PW) / 2), kanan = kiri + PW;
    const atas = Math.max(8, Math.round((h - PH) / 2)), bawah = atas + PH;
    for (const t of tulis) {
      if (t.x < kiri + 4 || t.x + t.w > kanan - 4) {
        ok(`${w}x${h} baris ${i}: di dalam panel (kiri/kanan)`, false, t.s);
      }
      // Naik ~0,8 em di atas garis dasar, turun ~0,2 em di bawahnya.
      if (t.y - t.size * 0.8 < atas - 2 || t.y + t.size * 0.2 > bawah + 2) {
        ok(`${w}x${h} baris ${i}: di dalam panel (atas/bawah)`, false, `${t.s} (y ${Math.round(t.y)})`);
      }
    }
    ok(`${w}x${h} baris ${i}: kursor terlihat`, menu.cursor >= (menu._geserPengaturan ?? 0)
      && menu.cursor < (menu._geserPengaturan ?? 0) + lihat);
  }
  ok(`${w}x${h}: baris Kembali terjangkau`, menu.settingsRows().length <= menu.barisPengaturanMu(40)
    || menu.barisPengaturanMu(40) >= 1);
}

// ------------------------------------------------ Keluar dari permainan (menu)
//
// Yang diuji bukan "apakah ada tombol Keluar" — tombolnya sudah ada sejak awal.
// Yang diuji: apakah progres sudah tersimpan SEBELUM pertanyaan muncul, dan
// apakah membatalkan pertanyaan benar-benar kembali ke permainan.
{
  const jejak = [];
  const renderer2 = { zoomOverride: 0, skalaNama: 'normal', stepZoom() {}, stepSkala() {} };
  let keluar = 0;
  const menuKeluar = new Menu({
    audio, renderer: renderer2, ilmu: null, sentuh,
    onSimpan: () => { jejak.push('simpan'); return 'Tersimpan di peramban ini.'; },
    onQuit: () => { jejak.push('keluar'); keluar++; },
  });
  menuKeluar.toggle();
  const iKeluar = ROOT.findIndex((r) => r.id === 'quit');
  ok('menu: baris "Keluar ke menu utama" ada', iKeluar >= 0, ROOT.map((r) => r.id).join(','));
  ok('menu: baris "Simpan sekarang" ada', ROOT.some((r) => r.id === 'simpan'));

  // Simpan sekarang
  menuKeluar.cursor = ROOT.findIndex((r) => r.id === 'simpan');
  menuKeluar.key('interact');
  ok('simpan: menulis simpanan', jejak.includes('simpan'));
  ok('simpan: pesan tampil di kaki panel', /Tersimpan/.test(menuKeluar.pesan), menuKeluar.pesan);
  ok('simpan: tidak keluar dari permainan', keluar === 0);

  // Keluar: simpan DULU, lalu bertanya
  jejak.length = 0;
  menuKeluar.cursor = iKeluar;
  menuKeluar.key('interact');
  ok('keluar: simpanan ditulis sebelum bertanya', jejak[0] === 'simpan', jejak.join(' -> '));
  ok('keluar: belum benar-benar keluar', keluar === 0 && jejak.length === 1);
  ok('keluar: meminta konfirmasi', menuKeluar.konfirmasiKeluar === true);
  ok('keluar: menu masih terbuka di belakang', menuKeluar.open === true);

  // Esc membatalkan -> kembali ke permainan, simpanan tetap ada
  menuKeluar.key('menu');
  ok('batal: pertanyaan hilang', menuKeluar.konfirmasiKeluar === false);
  ok('batal: tidak keluar', keluar === 0);
  ok('batal: simpanan tetap ditulis', jejak.filter((x) => x === 'simpan').length === 1);
  ok('batal: menu tetap terbuka', menuKeluar.open === true);

  // E setelah batal tidak boleh langsung keluar (bug lama: E kedua meneruskan)
  menuKeluar.cursor = ROOT.findIndex((r) => r.id === 'resume');
  menuKeluar.key('interact');
  ok('batal: E berikutnya kembali ke permainan', menuKeluar.open === false && keluar === 0);

  // Sekarang benar-benar keluar
  menuKeluar.toggle();
  menuKeluar.cursor = iKeluar;
  menuKeluar.key('interact');
  menuKeluar.key('interact');
  ok('keluar: E kedua benar-benar keluar', keluar === 1);
  ok('keluar: menu tertutup', menuKeluar.open === false);
  ok('keluar: dua kali simpan (tanya + keluar)', jejak.filter((x) => x === 'simpan').length === 2,
    jejak.join(' -> '));

  // Tanpa onSimpan: jujur, bukan "Tersimpan"
  const menuJujur = new Menu({ audio, renderer: renderer2, ilmu: null, sentuh });
  menuJujur.toggle();
  menuJujur.cursor = ROOT.findIndex((r) => r.id === 'simpan');
  menuJujur.key('interact');
  ok('tanpa simpanan: mengaku tidak tersedia', /tidak tersedia/i.test(menuJujur.pesan), menuJujur.pesan);
}

// Tata letak panel jeda (enam baris) di layar pendek.
for (const [w, h] of [[844, 390], [568, 320], [640, 360], [390, 844]]) {
  view.w = w; view.h = h;
  const m = new Menu({ audio, renderer, ilmu: null, sentuh, onSimpan: () => 'Tersimpan.', onQuit() {} });
  m.toggle();
  for (let i = 0; i < ROOT.length; i++) {
    m.cursor = i;
    const tulis = [];
    const ctx = {
      fillStyle: '#000', textAlign: 'left', font: '16px x', canvas: {},
      measureText(s) { const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 16); return { width: s.length * px * 0.6 }; },
      fillText(s, x, y) {
        const ww = this.measureText(s).width;
        const kiri = this.textAlign === 'right' ? x - ww : this.textAlign === 'center' ? x - ww / 2 : x;
        tulis.push({ s, x: kiri, y, w: ww, size: Number(/(\d+)px/.exec(this.font)?.[1] ?? 16) });
      },
      fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, save() {}, restore() {},
      translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {},
      lineTo() {}, stroke() {}, fill() {}, arc() {}, ellipse() {}, quadraticCurveTo() {},
      bezierCurveTo() {}, clip() {}, setTransform() {}, strokeText() {},
    };
    m.draw(ctx);
    const BARIS = 40;
    const lihat = Math.min(ROOT.length, m.barisJedaMu(BARIS));
    const PW = Math.min(320, w - 32);
    const PH = 76 + lihat * BARIS + 34;
    const kiri = Math.round((w - PW) / 2), kanan = kiri + PW;
    const atas = Math.max(8, Math.round((h - PH) / 2)), bawah = atas + PH;
    for (const t of tulis) {
      // Teks yang dipotong "…" berarti ada keterangan yang tidak terbaca utuh.
      if (t.s.includes('…')) ok(`jeda ${w}x${h} baris ${i}: teks tidak terpotong`, false, t.s);
      if (t.x < kiri + 4 || t.x + t.w > kanan - 4) ok(`jeda ${w}x${h} baris ${i}: di dalam panel (kiri/kanan)`, false, t.s);
      if (t.y - t.size * 0.8 < atas - 2 || t.y + t.size * 0.2 > bawah + 2) {
        ok(`jeda ${w}x${h} baris ${i}: di dalam panel (atas/bawah)`, false, `${t.s} (y ${Math.round(t.y)})`);
      }
    }
    ok(`jeda ${w}x${h} baris ${i}: kursor terlihat`, m.cursor >= (m._geserJeda ?? 0)
      && m.cursor < (m._geserJeda ?? 0) + lihat);
  }

  // Panel konfirmasi juga harus utuh.
  m.konfirmasiKeluar = true;
  const tulisKonf = [];
  const ctxKonf = {
    fillStyle: '#000', textAlign: 'left', font: '16px x', canvas: {},
    measureText(s) { const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 16); return { width: s.length * px * 0.6 }; },
    fillText(s, x, y) {
      const ww = this.measureText(s).width;
      const kiri2 = this.textAlign === 'right' ? x - ww : this.textAlign === 'center' ? x - ww / 2 : x;
      tulisKonf.push({ s, x: kiri2, y, w: ww, size: Number(/(\d+)px/.exec(this.font)?.[1] ?? 16) });
    },
    fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, save() {}, restore() {},
    translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {},
    lineTo() {}, stroke() {}, fill() {}, arc() {}, ellipse() {}, quadraticCurveTo() {},
    bezierCurveTo() {}, clip() {}, setTransform() {}, strokeText() {},
  };
  m.draw(ctxKonf);
  const KW = Math.min(360, w - 32), KH = 132;
  const kx = Math.round((w - KW) / 2), ky = Math.max(8, Math.round((h - KH) / 2));
  for (const t of tulisKonf) {
    if (t.s.includes('…')) ok(`keluar ${w}x${h}: teks tidak terpotong`, false, t.s);
    if (t.x < kx + 4 || t.x + t.w > kx + KW - 4) ok(`keluar ${w}x${h}: teks di dalam panel`, false, t.s);
    if (t.y - t.size * 0.8 < ky - 2 || t.y + t.size * 0.2 > ky + KH + 2) {
      ok(`keluar ${w}x${h}: teks di dalam panel (atas/bawah)`, false, `${t.s} (y ${Math.round(t.y)})`);
    }
  }
  ok(`keluar ${w}x${h}: tidak ada teks keluar panel`, tulisKonf.length > 0);
}

// ------------------------------------------------------- Tombol keluar di kanvas
//
// Sudah DIHAPUS: satu tombol keluar untuk semua perangkat (tombol power), jadi
// HUD tidak boleh lagi menggambar tombol apa pun di pojok kanan atas. Uji ini
// menjaga agar tombol lama tidak kembali tanpa sengaja.
{
  const { drawHud } = await import(`${AKAR}/src/ui/hud.js`);
  const { assets } = await import(`${AKAR}/src/render/assets.js`);
  assets.manifest = assets.manifest ?? { sprites: {} };
  assets.manifest.sprites = new Proxy(assets.manifest.sprites ?? {}, {
    get: (t, k) => (k in t ? t[k] : { frame: [16, 16], cols: 1 }),
  });
  const { Inventory, setItemData: setItem } = await import(`${AKAR}/src/systems/inventory.js`);
  setItem(JSON.parse(readFileSync(`${AKAR}/src/data/items.json`, 'utf8')));
  const waktu = { dateText: 'Musim Semi 1, Th 1', clockText: '06:00', season: 'spring' };
  const cuaca = { name: 'Cerah', iconIndex: 0 };
  const pemain = { money: 1234, energy: 80, maxEnergy: 100 };

  for (const [w, h] of [[844, 390], [568, 320], [390, 844]]) {
    view.w = w; view.h = h;
    const isian = [];
    const ctx = {
      fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, textAlign: 'left',
      font: '16px x', canvas: {},
      measureText() { return { width: 10 }; }, fillText() {}, strokeText() {},
      fillRect(x, y, rw, rh) { isian.push({ x, y, w: rw, h: rh }); },
      strokeRect() {}, clearRect() {}, drawImage() {}, save() {}, restore() {},
      translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {},
      moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, ellipse() {},
      quadraticCurveTo() {}, bezierCurveTo() {}, clip() {}, setTransform() {},
    };
    drawHud(ctx, { time: waktu, player: pemain, inv: new Inventory(), weather: cuaca });
    // Tidak ada isian persegi di pojok kanan atas selain panel gold (150x40 di
    // y 8). Tombol lama berukuran 34x30 di y 52 — bentuk itu harus hilang.
    const sisa = isian.filter((r) => r.y > 44 && r.y < 100 && r.x > w - 60 && r.w <= 45 && r.h <= 40);
    ok(`HUD ${w}x${h}: tidak ada tombol di pojok kanan atas`, sisa.length === 0,
      JSON.stringify(sisa));
  }
}

// ------------------------------------------- Tata letak tombol sentuh (grid)
//
// Posisi tombol ditentukan oleh KELAS CSS (mis. `.kanan .tombol.e`), bukan oleh
// urutan array. Uji ini membaca aturan CSS yang benar-benar dipasang dan
// memastikan setiap tombol punya tempat di grid — kalau satu tombol lupa
// diberi kelas posisi, ia akan menumpuk di sel pertama dan menutupi tombol lain
// tanpa ada yang error.
{
  const css = document.getElementById('lk-gaya-sentuh')?.textContent
    ?? [...document.querySelectorAll('style')].map((e) => e.textContent).join('\n');
  const aturan = (sel) => {
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
    return re.exec(css)?.[1] ?? '';
  };
  const posisi = (sel) => {
    const isi = aturan(sel);
    const kol = /grid-column:\s*([^;]+)/.exec(isi)?.[1]?.trim();
    const bar = /grid-row:\s*([^;]+)/.exec(isi)?.[1]?.trim();
    return kol && bar ? `${kol} / ${bar}` : null;
  };

  const wajib = ['e', 'lari', 'esc', 'nilai', 'ujian', 'alat-mundur', 'alat-maju'];
  const terpakai = new Map();
  for (const k of wajib) {
    const p = posisi(`.lk-touch .kanan .tombol.${k}`);
    ok(`grid: tombol "${k}" punya posisi`, !!p, p ?? '(tidak ada aturan grid)');
    if (!p) continue;
    const mulaiKol = parseInt(p.split('/')[0]);
    const mulaiBar = parseInt(p.split('/')[1]);
    // E membentang dua baris (row 2 / span 2) -> sel yang dipakai (3,2) dan (3,3)
    const sel = k === 'e' ? [`${mulaiKol},${mulaiBar}`, `${mulaiKol},${mulaiBar + 1}`]
      : [`${mulaiKol},${mulaiBar}`];
    for (const sel1 of sel) {
      ok(`grid: sel ${sel1} tidak dipakai dua tombol`, !terpakai.has(sel1),
        terpakai.has(sel1) ? `dipakai "${terpakai.get(sel1)}" dan "${k}"` : '');
      terpakai.set(sel1, k);
    }
  }

  // Permintaan pemain: alat di baris paling ATAS, E di pojok kanan bawah.
  ok('grid: alat (◀) di baris paling atas', /^1 \/ *1$/.test(posisi('.lk-touch .kanan .tombol.alat-mundur') ?? ''), posisi('.lk-touch .kanan .tombol.alat-mundur'));
  ok('grid: alat (▶) di baris paling atas', /^2 \/ *1$/.test(posisi('.lk-touch .kanan .tombol.alat-maju') ?? ''), posisi('.lk-touch .kanan .tombol.alat-maju'));
  ok('grid: E di kolom paling kanan', (posisi('.lk-touch .kanan .tombol.e') ?? '').startsWith('3 /'), posisi('.lk-touch .kanan .tombol.e'));
  ok('grid: E paling besar', /font-size:\s*clamp/.test(aturan('.lk-touch .kanan .tombol.e')));

  // Power + inventori di kiri atas, BERJAJAR dan tidak menempel panel gold.
  const matikanPosisi = aturan('.lk-touch .matikan');
  ok('kiri atas: memakai posisi dari --lk-gold-*', /--lk-gold-kiri/.test(matikanPosisi) && /--lk-gold-b/.test(matikanPosisi), matikanPosisi.trim());
  ok('kiri atas: berjajar ke samping', /grid-auto-flow:\s*column/.test(matikanPosisi));
  // Gaya tombol power ada di berkasnya sendiri (#lk-tombol-daya), bukan di CSS
  // lapisan sentuh — ia harus tampil juga di komputer.
  // Dibaca dari BERKAS, bukan dari <style> di DOM: blok ini berjalan sebelum
  // tombolnya dipasang pada sebagian jalur uji, jadi elemennya belum tentu ada.
  const sumberGayaDaya = readFileSync(`${AKAR}/src/ui/tombolKeluar.js`, 'utf8');
  ok('power: bulat, bukan kotak', /#\$\{ID\}[^}]*border-radius:\s*50%/.test(sumberGayaDaya),
    'aturan #${ID} { border-radius: 50% } tidak ditemukan');

  // Sejajar dengan panel gold: posisi yang dikirim adalah TITIK TENGAH panel
  // (bukan tepi bawahnya), dan tombol menggeser dirinya setengah tinggi.
  ok('kiri atas: digantung pada titik tengah panel gold',
    /translateY\(-50%\)/.test(matikanPosisi), matikanPosisi.trim());
  ok('power: ikut titik tengah, bukan tepi bawah panel',
    /translateY\(-50%\)/.test(sumberGayaDaya) && /goldBawah = 28/.test(sumberGayaDaya),
    'aturPosisi/transform titik tengah tidak ada');
  const mainSumber2 = readFileSync(`${AKAR}/src/main.js`, 'utf8');
  ok('main: gold diukur ke titik tengah panel (28), bukan tepi bawah (48)',
    /goldTengah = 28 \* z/.test(mainSumber2), 'goldTengah tidak ditemukan');
  ok('main: layar sempit tetap menurunkan pasangan power+inventori',
    /goldBawah = sempit \? 124 \* z/.test(mainSumber2), 'cabang layar sempit hilang');

  // Turun ke dasar layar: D-pad dan kluster kanan punya jarak bawah sendiri,
  // dan main.js menghitungnya dari apakah hotbar ikut tertimpa.
  ok('D-pad: jarak bawah dari --lk-kiri-b', /bottom:\s*var\(--lk-kiri-b\)/.test(aturan('.lk-touch .kiri')),
    aturan('.lk-touch .kiri').trim());
  ok('kanan: jarak bawah dari --lk-kanan-b', /bottom:\s*var\(--lk-kanan-b\)/.test(aturan('.lk-touch .kanan')),
    aturan('.lk-touch .kanan').trim());
  ok('main: kluster turun ke 10 px hanya kalau tidak menimpa hotbar',
    /klusterKiri > hotbarKanan \? 10 \* z : hudBawah \+ 4 \* z/.test(mainSumber2), 'rumus kananBawah tidak ada');
  ok('main: D-pad turun ke 8 px hanya kalau tidak menimpa hotbar',
    /dpadKanan \+ 4 < hotbarKiri \? 8 \* z : hudBawah \+ 4 \* z/.test(mainSumber2), 'rumus kiriBawah tidak ada');

  // Transparansi: isi tombol paling banyak 62% (dulu 86%) supaya dunia di
  // belakangnya masih terlihat. E boleh sedikit lebih pekat karena tombol utama.
  // Ambil alpha dari `background:` saja — `border:` juga rgba(), dan kalau
  // dibaca sembarangan uji ini mengukur border, bukan isi tombol.
  const alfa = (sel) => {
    const m = /background:\s*rgba\([^)]*?,\s*([\d.]+)\s*\)/.exec(aturan(sel));
    return m ? Number(m[1]) : NaN;
  };
  const alfaTombol = alfa('.lk-touch .tombol');
  ok('tombol: isi lebih tembus pandang (<= 0,62)', alfaTombol <= 0.62, `alpha ${alfaTombol}`);
  const alfaE = alfa('.lk-touch .tombol.e');
  ok('tombol E: lebih tembus pandang tapi tetap paling tegas',
    alfaE > alfaTombol && alfaE <= 0.72, `alpha E ${alfaE} vs ${alfaTombol}`);
  ok('tombol: border ikut dilembutkan', /border:\s*2px solid rgba\(122,\s*74,\s*34,\s*\.\d+\)/.test(aturan('.lk-touch .tombol')),
    aturan('.lk-touch .tombol').trim().slice(0, 90));

  // Inventori hanya di SATU tempat (kiri atas). Dulu ia muncul dua kali — di
  // kluster kanan dan di kluster kiri atas — dan di layar 390 px itu memakan
  // satu sel yang bisa dipakai tombol lain. Dihitung dari ELEMEN yang benar-
  // benar dipasang, bukan dari teks CSS (kelasnya cuma `inv`, bukan "inventory").
  // Uji sebelumnya memasang beberapa lapisan; DOM menyimpan semuanya. Yang
  // benar adalah lapisan TERAKHIR (yang dipakai pemain sekarang).
  const lapisan = [...document.querySelectorAll('.lk-touch')].pop();
  const semuaLabel = [...lapisan.querySelectorAll('.tombol')]
    .map((b) => b.textContent.trim())
    .filter(Boolean);
  const hitung = (l) => semuaLabel.filter((t) => t === l).length;
  ok('inventori (I) muncul tepat satu kali', hitung('I') === 1, `"I" muncul ${hitung('I')} kali: ${semuaLabel.join(' ')}`);
  ok('tombol Esc muncul tepat satu kali', hitung('Esc') === 1, String(hitung('Esc')));
  ok('tombol E muncul tepat satu kali', hitung('E') === 1, String(hitung('E')));
  const isiMatikan = [...lapisan.querySelectorAll('.matikan .tombol')].map((b) => b.textContent.trim()).join(',');
  // Power sudah pindah ke ui/tombolKeluar.js (satu tombol untuk semua
  // perangkat), jadi kluster ini tinggal inventori.
  ok('kluster kiri atas berisi inventori saja', isiMatikan === 'I', isiMatikan);
}

// --------------------------------------------- Tombol power (satu untuk semua)
//
// Satu-satunya jalan keluar yang terlihat. Harus ada JUGA di komputer, karena
// itulah alasannya dipisah dari lapisan sentuh.
{
  const { pasangTombolKeluar } = await import(`${AKAR}/src/ui/tombolKeluar.js`);
  // Perangkat tanpa sentuh (laptop).
  Object.defineProperty(dom.window, 'matchMedia', {
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    configurable: true, writable: true,
  });
  const power = pasangTombolKeluar();
  ok('power: terpasang di laptop (tanpa layar sentuh)', !!document.getElementById('lk-tombol-daya'));
  ok('power: tampil di awal', power.tampil === true);

  // Menekan tombol = menekan Esc. Aksi 'menu' dipakai bersama; kalau tombol ini
  // memanggil jalur lain, dua jalan keluar bisa berperilaku berbeda.
  const sumberDaya = readFileSync(`${AKAR}/src/ui/tombolKeluar.js`, 'utf8');
  ok('power: memakai jalur aksi yang sama dengan Esc',
    /pressAction\('menu'/.test(sumberDaya), 'tidak memanggil pressAction("menu")');
  ok('power: tidak memanggil onQuit sendiri',
    !/onQuit|location\.href/.test(sumberDaya), 'ada jalur keluar kedua di tombol power');

  // Posisi dikirim pemanggil: di kiri panel gold.
  power.aturPosisi({ goldBawah: 48, goldKiri: 166 });
  ok('power: posisi dari panel gold', power.elemen.style.top === '48px' && power.elemen.style.right === '166px',
    `${power.elemen.style.top} / ${power.elemen.style.right}`);

  // Saat pertanyaan "Keluar?" tampil, tombol disembunyikan.
  power.saatTanya(true);
  ok('power: disembunyikan saat pertanyaan keluar', power.elemen.classList.contains('saat-tanya'));
  power.saatTanya(false);
  ok('power: muncul lagi setelah batal', !power.elemen.classList.contains('saat-tanya'));

  // Bisa dimatikan dari Pengaturan, dan Esc tetap jadi jalan keluar.
  power.aturTampil(false);
  ok('power: bisa dimatikan', power.elemen.hidden === true);
  power.aturTampil(true);
  ok('power: bisa dinyalakan lagi', power.elemen.hidden === false);

  // Tombol power TIDAK ikut lapisan sentuh: ia muncul juga saat tombol sentuh
  // dimatikan. Tanpa ini, ia akan hilang di laptop.
  const lapisanSentuh = [...document.querySelectorAll('.lk-touch')].pop();
  ok('power: bukan bagian lapisan sentuh', !lapisanSentuh.contains(power.elemen));

  // Baris Pengaturan untuk tombol power.
  const m = new Menu({ audio, renderer, ilmu: null, sentuh, tombolKeluar: power });
  const baris = m.settingsRows().find((r) => r.id === 'power');
  ok('menu: ada baris "Tombol power"', !!baris, m.settingsRows().map((r) => r.id).join(','));
  m.page = 'settings';
  m.cursor = m.settingsRows().findIndex((r) => r.id === 'power');
  m.key('interact');
  ok('menu: E mematikan tombol power', power.tampil === false);
  m.key('interact');
  ok('menu: E menyalakan lagi', power.tampil === true);
}

// Tombol keluar di KANVAS harus tetap terhapus: dua jalan keluar yang terlihat
// adalah persis hal yang mau dihindari.
{
  const hudSumber = readFileSync(`${AKAR}/src/ui/hud.js`, 'utf8');
  ok('kanvas: tidak lagi menggambar tombol keluar', !/kotakTombolKeluar/.test(hudSumber));
  const mainSumber = readFileSync(`${AKAR}/src/main.js`, 'utf8');
  ok('main: tidak lagi memeriksa ketukan tombol keluar', !/kotakTombolKeluar/.test(mainSumber));
}

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
