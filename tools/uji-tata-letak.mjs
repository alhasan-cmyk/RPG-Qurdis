// Uji tata letak layar "Ragam Usaha Desa" tanpa browser.
//
// Kenapa perlu: seluruh masalah yang dilaporkan pemain tentang layar ini bukan
// soal logika, melainkan soal ruang — nama guru terpotong "...", kalimat syarat
// menabrak tombol, alasan hanya berbunyi "Bahan belum cukup" tanpa angka. Tak
// satu pun dari itu membuat game error, jadi tak satu pun tertangkap uji biasa.
//
// Cara kerjanya: kanvas tiruan yang mengukur lebar teks dengan perkiraan font
// (VT323 16 px ≈ 0,5 px per huruf, "Press Start 2P" 10 px ≈ 1 px per huruf —
// keduanya cocok dengan hasil pengukuran di peramban). Semua tulisan yang
// digambar dicatat, lalu diperiksa terhadap batas panel pada lima ukuran layar,
// dari ponsel tegak sampai desktop lebar.
//
// Jalankan:  node tools/uji-tata-letak.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(AKAR, p), 'utf8');

// Modul renderer memakai `window`/`document` saat diimpor; cukup tiruan kosong,
// karena yang diuji hanya tata letak layar, bukan gambarnya.
globalThis.window ??= { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1, addEventListener() {} };
globalThis.document ??= { createElement: () => ({ getContext: () => null }), addEventListener() {} };

const { view } = await import(join(AKAR, 'src/render/renderer.js'));
const { UpgradeUI } = await import(join(AKAR, 'src/ui/upgrade-ui.js'));
const { Upgrade, UPGRADE } = await import(join(AKAR, 'src/systems/upgrade.js'));
const { Ilmu } = await import(join(AKAR, 'src/systems/ilmu.js'));
const { Inventory, setItemData } = await import(join(AKAR, 'src/systems/inventory.js'));

const dataIlmu = JSON.parse(baca('src/data/ilmu.json'));
setItemData(JSON.parse(baca('src/data/items.json')));

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
      // "Press Start 2P" hampir persegi; VT323 kira-kira setengah lebar huruf.
      const perHuruf = /Press Start/.test(this.font) ? px : px * 0.5;
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

for (const kelas of ['X', 'XI', 'XII']) {
  for (const [w, h, nama] of UKURAN) {
    view.w = w;
    view.h = h;

    const ilmu = new Ilmu(dataIlmu);
    ilmu.tingkat = kelas;
    ilmu.lulus = new Set();                       // semua bab syarat belum lulus
    const inv = new Inventory();
    inv.add('stone', 25); inv.add('wood', 10);

    const up = new Upgrade();
    const ui = new UpgradeUI(up, null);
    ui.buka({ ilmu, inv, tingkatKelas: kelas, uang: () => 500, bayar: () => {} });

    // Setiap baris daftar digambar, jadi nama guru di ketujuh baris ikut diperiksa.
    for (let i = 0; i < UPGRADE.length; i++) {
      ui.cursor = i;
      ui.scroll = Math.max(0, Math.min(i, UPGRADE.length - (ui.barisTerlihat ?? 4)));
      const { ctx, tulisan } = kanvasTiruan(w, h);
      ui.draw(ctx);

      // Batas panel — rumus yang sama dengan UpgradeUI.draw().
      const PAD = 18, HUD = 34, ROW = 30, RINCI = 84, KEPALA = 40;
      const PW = Math.min(600, w - 24);
      const lihat = Math.max(3, Math.min(4, UPGRADE.length));
      const PH = Math.min(h - HUD - 8, KEPALA + lihat * ROW + RINCI + 8);
      const kiri = Math.round((w - PW) / 2), kanan = kiri + PW;
      const atas = Math.max(4, Math.min(Math.round((h - PH) / 2), h - PH - HUD));
      const bawah = atas + PH;
      const label = `${kelas} · ${nama} (${w}x${h}) · baris ${UPGRADE[i].judul}`;

      for (const t of tulisan) {
        if (t.x < kiri + 4 || t.x + t.w > kanan - 4) salah(`${label}: keluar panel kiri/kanan → "${t.s}"`);
        if (t.y - 14 < atas || t.y + 6 > bawah) salah(`${label}: keluar panel atas/bawah → "${t.s}"`);
      }

      // Nama guru harus terbaca utuh di kolom kanan — bukan dipotong "...".
      const st = ui.status(i);
      if (st.kitab && !st.lulus && st.guru) {
        const barisGuru = tulisan.find((t) => t.s === st.guru.nama);
        if (!barisGuru) {
          const dipotong = tulisan.find((t) => t.s.startsWith(st.guru.nama.slice(0, 6)) && t.s.includes('…'));
          salah(`${label}: nama guru tidak utuh`
            + (dipotong ? ` → "${dipotong.s}"` : ' (tidak tergambar sama sekali)'));
        }
      }

      // Kalimat alasan tidak boleh berakhir "…": akhir kalimat itulah yang
      // menyebut nama guru atau nama alat.
      for (const t of tulisan) {
        if (t.s.includes('…') && /Lulus|Ujian|Kurang|Uangnya|tertinggi/.test(t.s)) {
          salah(`${label}: alasan terpotong → "${t.s}"`);
        }
      }
    }
  }
}

if (masalah) {
  console.error(`\n${masalah} masalah tata letak.`);
  process.exit(1);
}
console.log('Tata letak layar Ragam Usaha aman di lima ukuran layar × tiga kelas:');
console.log('  tidak ada tulisan keluar panel, nama guru utuh, kalimat alasan tidak terpotong.');
