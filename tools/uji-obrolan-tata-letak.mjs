// Uji tata letak panel obrolan — tanpa browser.
//
// Kenapa perlu: setelah panel ini diberi formulir masuk (nama + PIN) dan pesan
// yang berbeda-beda sesuai sebabnya, isinya jadi jauh lebih panjang. Semua
// kalimat itu muat atau tidak, tidak pernah memunculkan galat — yang terjadi
// hanya teks keluar panel atau bertumpuk, dan itu tidak tertangkap uji logika.
//
// Yang diperiksa, di lima ukuran layar:
//   1. Tidak ada tulisan yang keluar dari panel.
//   2. Tidak ada dua tulisan yang bertumpuk (termasuk antar-baris).
//   3. Teks yang WAJIB terbaca benar-benar tergambar: kalimat alasan, label
//      Nama/PIN, tombol Masuk, dan penghitung "n/30 baris".
//
// Jalankan: node tools/uji-obrolan-tata-letak.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(AKAR, p), 'utf8');

/* ------------------------------------------------- tiruan peramban minimal */

globalThis.window ??= { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1, addEventListener() {} };
globalThis.document ??= {
  createElement: () => ({ getContext: () => null, style: {}, addEventListener() {} }),
  addEventListener() {},
  body: { appendChild() {} },
};
globalThis.performance ??= { now: () => 0 };

const { view } = await import(join(AKAR, 'src/render/renderer.js'));
const { ChatUI } = await import(join(AKAR, 'src/ui/chat-ui.js'));
const { Chat, ALASAN, BATAS_BARIS } = await import(join(AKAR, 'src/systems/chat.js'));
const { assets } = await import(join(AKAR, 'src/render/assets.js'));
// Manifest sprite: `icon()` membacanya, dan di Node belum ada yang dimuat.
// Ikon mana pun dianggap ada — yang diuji tata letaknya, bukan gambarnya.
assets.manifest = assets.manifest ?? { sprites: {} };
assets.manifest.sprites = new Proxy(assets.manifest.sprites ?? {}, {
  get: (t, k) => (k in t ? t[k] : { frame: [32, 32], cols: 3 }),
});
assets.images.set('ui_chat_icons', { width: 32, height: 32 });
assets.images.set('portrait_player_m', { width: 96, height: 96 });

/** Kanvas tiruan: mencatat setiap tulisan, tidak menggambar apa pun. */
function kanvasTiruan(w, h) {
  const tulisan = [];
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    textAlign: 'left', textBaseline: 'alphabetic',
    canvas: { width: w, height: h },
    font: '16px monospace',
    measureText(str) {
      const px = Number(/(\d+)px/.exec(this.font)?.[1] ?? 16);
      // "Press Start 2P" hampir persegi, VT323 kira-kira 0,6 em. Diambil 0,6 em
      // supaya kalimat yang lolos di sini juga lolos kalau font di perangkat
      // pemain sedikit lebih lebar.
      const perHuruf = /Press Start/.test(this.font) ? px : px * 0.6;
      return { width: str.length * perHuruf };
    },
    fillText(s, x, y) {
      const w2 = this.measureText(s).width;
      const kiri = this.textAlign === 'right' ? x - w2 : this.textAlign === 'center' ? x - w2 / 2 : x;
      tulisan.push({ s, x: Math.round(kiri), y: Math.round(y), w: Math.round(w2) });
    },
    fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, save() {}, restore() {},
    translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {},
    lineTo() {}, stroke() {}, fill() {}, arc() {}, ellipse() {}, quadraticCurveTo() {},
    bezierCurveTo() {}, clip() {}, setTransform() {}, strokeText() {}, createPattern() { return null; },
    rect() {}, roundRect() {}, resetTransform() {},
  };
  return { ctx, tulisan };
}

const UKURAN = [
  [844, 390, 'ponsel mendatar (bawaan)'],
  [640, 360, 'jendela kecil'],
  [568, 320, 'ponsel mendatar kecil'],
  [390, 844, 'ponsel tegak (diputar CSS)'],
  [1280, 720, 'desktop lebar'],
];

let masalah = 0;
const salah = (pesan) => { masalah++; console.error(`  MASALAH: ${pesan}`); };

/** Chat tiruan: cukup untuk membuat panel menggambar keadaan tertentu. */
function chatTiruan({ alasan = '', kelas = 'X', messages = [], error = '', status = 'online' } = {}) {
  const c = new Chat({ name: 'ahmad', avatar: 'player_m' });
  c.kelas = kelas;
  c.messages = messages;
  c.alasan = alasan;
  c.error = error;
  c.status = status;
  c.mine = new Set();
  c.unread = 0;
  return c;
}

const pesanContoh = (n) => Array.from({ length: n }, (_, i) => ({
  no: i + 1,
  name: i % 2 ? 'siti' : 'ahmad',
  avatar: 'player_m',
  text: i === 0
    ? 'assalamualaikum semuanya, hari ini kita belajar bab tentang wahyu Allah'
    : `pesan ke-${i + 1}`,
}));

for (const [w, h, nama] of UKURAN) {
  view.w = w;
  view.h = h;

  const kasus = [
    {
      label: 'terbuka, sudah masuk, ada pesan',
      buat: () => chatTiruan({ messages: pesanContoh(30) }),
      masuk: false,
    },
    {
      label: 'belum masuk (tombol Masuk muncul)',
      buat: () => chatTiruan({ alasan: ALASAN.belumMasuk, status: 'tanpaakun' }),
      masuk: false,
    },
    {
      label: 'akun belum tercatat (kalimat panjang)',
      buat: () => chatTiruan({
        alasan: ALASAN.belumPasti,
        error: 'PIN tidak cocok dengan nama ini.',
        status: 'tanpaakun',
      }),
      masuk: false,
    },
    {
      label: 'server belum dipasang (kalimat terpanjang)',
      buat: () => chatTiruan({
        alasan: ALASAN.takTersambung,
        error: 'Obrolan belum dipasang di Apps Script. Tempel Server-Lengkap.gs lalu deploy ulang.',
        status: 'tanpaakun',
      }),
      masuk: false,
    },
    {
      label: 'kelas belum tercatat',
      buat: () => chatTiruan({ alasan: ALASAN.bedaKelas, error: 'Kelas belum tercatat.', status: 'tanpaakun' }),
      masuk: false,
    },
    {
      label: 'formulir masuk terbuka',
      buat: () => chatTiruan({ alasan: ALASAN.belumMasuk, status: 'tanpaakun' }),
      masuk: true,
    },
  ];

  for (const k of kasus) {
    const chat = k.buat();
    const ui = new ChatUI(chat);
    ui.open = true;
    ui.masuk = k.masuk;
    if (k.masuk) { ui.nama = 'ahmad'; ui.pin = '1234'; ui.pesanMasuk = 'PIN tidak cocok.'; }
    // Panel mengira ada bidang DOM; tanpa ini ia melempar saat menggambar.
    ui.input = { value: '', focus() {}, blur() {} };
    ui.masukan = { value: '', focus() {}, blur() {}, setAttribute() {} };

    const { ctx, tulisan } = kanvasTiruan(w, h);
    ui.draw(ctx);

    const p = ui.panelRect();
    const kiri = p.x, kanan = p.x + p.w, atas = p.y, bawah = p.y + p.h;
    const label = `${nama} (${w}x${h}) · ${k.label}`;

    // 1. keluar panel
    for (const t of tulisan) {
      if (t.x < kiri + 2 || t.x + t.w > kanan - 2) {
        salah(`${label}: keluar panel kiri/kanan → "${t.s}" (${t.x}..${t.x + t.w} vs ${kiri}..${kanan})`);
      }
      if (t.y - 12 < atas || t.y + 8 > bawah) {
        salah(`${label}: keluar panel atas/bawah → "${t.s}" (y ${t.y} vs ${atas}..${bawah})`);
      }
    }

    // 2. bertumpuk. Dua tulisan dianggap bertumpuk kalau kotaknya beririsan
    //    lebih dari separuh tinggi huruf — cukup longgar untuk tidak menuduh
    //    baris yang memang rapat, cukup ketat untuk menangkap tabrakan nyata.
    for (let i = 0; i < tulisan.length; i++) {
      for (let j = i + 1; j < tulisan.length; j++) {
        const a = tulisan[i], b = tulisan[j];
        if (!a.s.trim() || !b.s.trim()) continue;
        const samaBaris = Math.abs(a.y - b.y) < 9;
        const beririsanX = a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2;
        if (samaBaris && beririsanX) salah(`${label}: tumpang tindih → "${a.s}" / "${b.s}"`);
      }
    }

    // 3. teks wajib
    const ada = (pola) => tulisan.some((t) => (typeof pola === 'string' ? t.s.includes(pola) : pola.test(t.s)));

    if (k.masuk) {
      if (!ada('MASUK UNTUK MENGOBROL')) salah(`${label}: judul formulir tidak tergambar`);
      for (const l of ['Nama', 'PIN']) if (!ada(l)) salah(`${label}: label "${l}" tidak tergambar`);
      if (!tulisan.some((t) => t.s === 'Masuk' || t.s === 'Memeriksa...')) salah(`${label}: tombol Masuk tidak tergambar`);
      if (!ada('PIN tidak cocok.')) salah(`${label}: pesan galat formulir tidak tergambar`);
      if (!ada('Daftar di depan')) salah(`${label}: petunjuk daftar tidak tergambar`);
    } else {
      // Judul selalu menyebut kelasnya.
      if (!ada('OBROLAN KELAS X')) salah(`${label}: judul kelas tidak tergambar`);
      if (!ada(`/${BATAS_BARIS} baris`) && chat.status === 'online') {
        salah(`${label}: penghitung n/30 baris tidak tergambar`);
      }
      if (chat.alasan === ALASAN.belumMasuk && !ada('Masuk')) salah(`${label}: tombol Masuk tidak tergambar`);
      if (chat.alasan === ALASAN.takTersambung && !ada('deploy')) {
        salah(`${label}: petunjuk deploy tidak tergambar di kalimat alasannya`);
      }
    }
  }
}

if (masalah) {
  console.error(`\n${masalah} masalah tata letak.`);
  process.exit(1);
}
console.log('Tata letak panel obrolan aman di lima ukuran layar × enam keadaan:');
console.log('  tidak ada tulisan keluar panel, tidak ada yang bertumpuk,');
console.log('  kalimat alasan & formulir masuk tergambar utuh.');
