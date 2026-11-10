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
const { Kendaraan } = await import(join(AKAR, 'src/systems/kendaraan.js'));
const { Diamond } = await import(join(AKAR, 'src/systems/diamond.js'));
// `icon()` membaca manifest sprite; di Node tidak ada yang dimuat, jadi manifest
// tiruan dipasang. Ikon mana pun dianggap ada — yang diuji tata letaknya, bukan
// gambarnya.
const { assets } = await import(join(AKAR, 'src/render/assets.js'));
assets.manifest = assets.manifest ?? { sprites: {} };
assets.manifest.sprites = new Proxy(assets.manifest.sprites ?? {}, {
  get: (t, k) => (k in t ? t[k] : { frame: [24, 24], cols: 1 }),
});
assets.images.set('ui_diamond', { width: 24, height: 24 });
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
      // Untuk teks biasa dipakai 0,6 em — LEBIH LEBAR daripada VT323 — supaya
      // kalimat yang lolos di sini juga lolos kalau font di perangkat pemain
      // sedikit lebih lebar (mis. pengganti DejaVu Sans Mono di Android).
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
    // Bahan dipenuhi sampai 99 tiap jenis yang dipakai papan, supaya baris
    // "Batu 25/25 · Kayu 30/30 …" benar-benar tergambar dan bisa diukur.
    const bahanPapan = new Set(UPGRADE.flatMap((u) => Object.keys(u.bahan ?? {})));
    for (const b of bahanPapan) inv.add(b, 99);

    // Papan menjual DUA jenis barang: bangunan (uang + bahan + bab) dan
    // kendaraan (diamond). Saldo diamond dibuat 0 supaya baris "Kurang N
    // diamond" — kalimat terpanjang — ikut diuji.
    //
    // Bahannya sengaja DIPENUHI: kalau kosong, kalimat pertama yang muncul
    // adalah "Kurang N batu" dan baris bahan/harga tidak pernah diukur —
    // tiga bahan sekaligus (dapur) baru terlihat sesudah syarat itu lewat.
    const kendaraan = new Kendaraan();
    const up = new Upgrade(kendaraan);
    const ui = new UpgradeUI(up, null);
    ui.buka({
      ilmu, inv, tingkatKelas: kelas,
      uang: () => 0, bayar: () => {},
      diamond: () => 0, kendaraan,
    });

    // Setiap baris daftar digambar, jadi nama guru di baris bangunan dan harga
    // di baris kendaraan ikut diperiksa.
    const semuaBaris = up.papan();
    for (let i = 0; i < semuaBaris.length; i++) {
      const barisIni = semuaBaris[i];
      ui.cursor = i;
      ui.scroll = Math.max(0, Math.min(i, semuaBaris.length - (ui.barisTerlihat ?? 4)));
      const { ctx, tulisan } = kanvasTiruan(w, h);
      ui.draw(ctx);

      // Batas panel — angka dan rumus yang sama persis dengan UpgradeUI.draw(),
      // diambil dari UpgradeUI.TATA supaya uji ini tidak bisa "lulus" hanya
      // karena salinannya ikut basi.
      const { LEBAR_MAKS, HUD, ROW, RINCI, KEPALA, BARIS_MAKS } = UpgradeUI.TATA;
      const PW = Math.min(LEBAR_MAKS, w - 24);
      const lihat = Math.max(3, Math.min(BARIS_MAKS, semuaBaris.length));
      const PH = Math.min(h - HUD - 8, KEPALA + lihat * ROW + RINCI + 8);
      const kiri = Math.round((w - PW) / 2), kanan = kiri + PW;
      const atas = Math.max(4, Math.min(Math.round((h - PH) / 2), h - PH - HUD));
      const bawah = atas + PH;
      const label = `${kelas} · ${nama} (${w}x${h}) · baris ${barisIni.judul}`;

      for (const t of tulisan) {
        if (t.x < kiri + 4 || t.x + t.w > kanan - 4) salah(`${label}: keluar panel kiri/kanan → "${t.s}"`);
        if (t.y - 14 < atas || t.y + 6 > bawah) salah(`${label}: keluar panel atas/bawah → "${t.s}"`);
      }

      // Judul baris HARUS tergambar. Uji ini ditambahkan karena judul sempat
      // hilang sama sekali saat layar ditulis ulang untuk dua jenis barang:
      // satu-satunya tulisan di kiri baris itu nama guru, dan tidak ada uji lain
      // yang sadar. Dicocokkan per kata pertama supaya pemotongan "…" pada
      // tingkat ("· 2/4") tidak membuat uji gagal karena sebab yang salah.
      const kataJudul = barisIni.judul.split(' ')[0];
      if (!tulisan.some((t) => t.s.includes(kataJudul))) {
        salah(`${label}: judul baris tidak tergambar ("${barisIni.judul}")`);
      }

      // Kolom kanan: harga diamond untuk kendaraan, nomor bab untuk bangunan.
      // Keduanya satu-satunya petunjuk "apa yang masih kurang", jadi tidak
      // boleh hilang atau terpotong "…".
      const st = ui.status(i);
      if (st.jenis === 'kendaraan') {
        if (!st.punya) {
          const barisHarga = tulisan.find((t) => t.s.startsWith(`${st.harga}`));
          if (!barisHarga) salah(`${label}: harga ${st.harga} tidak tergambar`);
          if (barisHarga && barisHarga.s.includes('…')) salah(`${label}: harga terpotong → "${barisHarga.s}"`);
        }
      } else {
        if (!st.labelBab) salah(`${label}: nomor bab syarat kosong`);
        if (st.labelBab && !tulisan.some((t) => t.s.startsWith(st.labelBab))) {
          salah(`${label}: nomor bab "${st.labelBab}" tidak tergambar`);
        } else {
          const barisBab = tulisan.find((t) => t.s.startsWith(st.labelBab));
          if (barisBab && barisBab.s.includes('…')) salah(`${label}: nomor bab terpotong → "${barisBab.s}"`);
        }
        // Baris pertama rincian: status bahan (kiri) + harga uang (kanan).
        // Keduanya harus utuh — "G1.200" tidak boleh terpotong "…".
        if (!tulisan.some((t) => /^Bahan \d+\/\d+$|^Bahan lengkap$|^Tanpa bahan$/.test(t.s))) {
          salah(`${label}: status bahan tidak tergambar utuh`);
        }
        if (!tulisan.some((t) => /^G[\d.]+$/.test(t.s))) salah(`${label}: harga uang tidak tergambar utuh`);
      }

      // Kalimat alasan tidak boleh berakhir "…": di situlah angka kekurangan
      // diamond ditulis, satu-satunya hal yang memberi tahu murid berapa ujian
      // lagi yang harus ia lulus.
      for (const t of tulisan) {
        if (t.s.includes('…') && /Kurang|diamond|Sudah/.test(t.s)) {
          salah(`${label}: alasan terpotong → "${t.s}"`);
        }
      }

      // Guna kendaraan harus tertulis, bukan "—": pemain harus tahu apa yang
      // dibelinya sebelum mengumpulkan 50 diamond.
      const barisGuna = tulisan.find((t) => t.s.startsWith('Guna:'));
      if (!barisGuna) salah(`${label}: baris Guna tidak ada`);
      else if (/Guna: —$/.test(barisGuna.s)) salah(`${label}: guna kosong`);

      // TIDAK BOLEH ADA DUA TULISAN YANG BERTUMPUK.
      //
      // Uji lama hanya memeriksa tulisan keluar panel. Itu tidak menangkap
      // kalimat alasan yang memanjang sampai menimpa tombol "E beli · Esc
      // tutup" di kanan — persis yang terlihat saat pratinjau digambar dengan
      // huruf yang lebih lebar daripada VT323. Diukur per baris teks.
      const perBaris = new Map();
      for (const t of tulisan) {
        if (!t.s.trim()) continue;
        const kunci = Math.round(t.y / 6);      // toleransi 6 px = satu baris
        if (!perBaris.has(kunci)) perBaris.set(kunci, []);
        perBaris.get(kunci).push(t);
      }
      for (const [, isi] of perBaris) {
        // Urutkan berdasarkan tepi kiri, lalu pastikan tidak ada yang beririsan
        // lebih dari 2 px (batas aman untuk spasi antar kolom).
        const urut = isi.slice().sort((a, b) => a.x - b.x);
        for (let j = 1; j < urut.length; j++) {
          const kiri = urut[j - 1];
          const kanan = urut[j];
          if (kiri.x + kiri.w - 2 > kanan.x) {
            salah(`${label}: tulisan bertumpuk → "${kiri.s}" × "${kanan.s}"`);
          }
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
console.log('  tidak ada tulisan keluar panel, harga utuh, guna tertulis, kalimat alasan tidak terpotong.');
