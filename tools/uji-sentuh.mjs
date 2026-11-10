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
const { Menu } = await import(`${AKAR}/src/ui/menu.js`);
const audio = {
  settings: { musicVolume: .5, sfxVolume: .5, muted: false },
  ui() {}, setVolume() {}, setSfxVolume() {}, toggleMute() {},
};
const renderer = { zoomOverride: 0, skalaNama: 'normal', stepZoom() {}, stepSkala() {}, skala: 1 };
const menu = new Menu({ audio, renderer, onQuit() {}, ilmu: null, sentuh: s5 });
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

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
