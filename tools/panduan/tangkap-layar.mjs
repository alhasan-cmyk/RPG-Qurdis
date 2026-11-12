// Ambil tangkapan layar untuk panduan siswa — dari KODE PERMAINAN, bukan gambar
// tangan. Setiap gambar di bawah memanggil kelas UI yang sebenarnya
// (`IlmuUI`, `PilihanUI`, `Dialog`, `UpgradeUI`, `Menu`, `drawHud`) dengan
// keadaan yang memang bisa terjadi saat bermain, lalu menulis PNG-nya.
//
//   node tools/panduan/tangkap-layar.mjs [akar-repo]
//
// Hasilnya masuk ke docs/panduan/ (dipakai tools/panduan/buat-panduan.mjs).
// Teks di gambar bertanda `[...]` karena font VT323 tidak ada di luar peramban;
// bentuk, ukuran, dan posisinya nyata. Lihat tools/panduan/README.md.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from './png.mjs';
import { Kanvas, siapkanSprite } from './kanvas.mjs';

const AKAR = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KELUAR = join(AKAR, 'docs', 'panduan');
if (!existsSync(KELUAR)) mkdirSync(KELUAR, { recursive: true });

const manifest = JSON.parse(readFileSync(join(AKAR, 'assets', 'manifest.json'), 'utf8'));
const ilmuData = JSON.parse(readFileSync(join(AKAR, 'src', 'data', 'ilmu.json'), 'utf8'));
const itemsData = JSON.parse(readFileSync(join(AKAR, 'src', 'data', 'items.json'), 'utf8'));

/**
 * `assets.js` dan `ilmu-ui.js` memakai `window`/`document` saat modulnya dibaca
 * (ilmu-ui membuat kanvas tak terlihat untuk mengukur teks Arab). Keduanya cukup
 * ditirukan: yang dipakai hanya `measureText` dan `createElement('canvas')`,
 * dan di sini Kanvas-lah yang menggambar.
 */
globalThis.window ??= { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
globalThis.document ??= {
  createElement() {
    const k = new Kanvas(1, 1);
    return { width: 1, height: 1, getContext: () => k };
  },
};

const { assets } = await import(join(AKAR, 'src', 'render', 'assets.js'));
assets.manifest = manifest;
const { view } = await import(join(AKAR, 'src', 'render', 'renderer.js'));
const { Ilmu } = await import(join(AKAR, 'src', 'systems', 'ilmu.js'));
const { Inventory, setItemData } = await import(join(AKAR, 'src', 'systems', 'inventory.js'));
const { Diamond } = await import(join(AKAR, 'src', 'systems', 'diamond.js'));
const { Kendaraan } = await import(join(AKAR, 'src', 'systems', 'kendaraan.js'));
const { Upgrade } = await import(join(AKAR, 'src', 'systems', 'upgrade.js'));
const { IlmuUI } = await import(join(AKAR, 'src', 'ui', 'ilmu-ui.js'));
const { PilihanUI } = await import(join(AKAR, 'src', 'ui', 'pilihan.js'));
const { Dialog } = await import(join(AKAR, 'src', 'ui', 'dialog.js'));
const { UpgradeUI } = await import(join(AKAR, 'src', 'ui', 'upgrade-ui.js'));
const { Menu } = await import(join(AKAR, 'src', 'ui', 'menu.js'));
const { drawHud } = await import(join(AKAR, 'src', 'ui', 'hud.js'));
setItemData(itemsData);

/**
 * Ukuran kanvas logis. Dipilih LEBIH BESAR dari ponsel landscape supaya panel
 * yang tinggi (rak 460 px, ujian) tidak terpotong: di panel sempit, baris yang
 * tidak muat memang tidak digambar, dan tangkapan layarnya jadi tampak kosong.
 * HUD tetap memakai ukuran ponsel, karena di situlah tata letaknya diuji.
 */
const W = 844, H = 560;
const W_PONSEL = 844, H_PONSEL = 390;

/** Siapkan kanvas + objek `img` tiruan yang dicari kode permainan. */
function kanvasBaru({ latar = '#100c09', skala = 1, w = W, h = H } = {}) {
  const k = new Kanvas(w, h);
  siapkanSprite(k, AKAR, manifest);
  // Kode permainan memanggil assets.images.get(nama) lalu menggambarnya; di sini
  // objeknya cukup punya `nama` supaya Kanvas tahu PNG mana yang ditempel.
  assets.images = new Map(Object.keys(manifest.sprites).map((n) => [n, { nama: n }]));
  k.fillStyle = latar;
  k.fillRect(0, 0, k.width, k.height);
  view.w = k.width; view.h = k.height; view.dunW = k.width; view.dunH = k.height; view.skala = skala;
  return k;
}

function simpan(nama, kanvas) {
  const jalur = join(KELUAR, `game-${nama}.png`);
  writeFileSync(jalur, kanvas.png.kePNG());
  // Posisi tiap teks ikut disimpan: skrip PDF menimpa pitanya dengan huruf
  // sungguhan pada posisi & lebar yang sama (lihat tools/panduan/buat-panduan.py).
  writeFileSync(join(KELUAR, `game-${nama}.json`),
    JSON.stringify({ w: kanvas.width, h: kanvas.height, teks: kanvas.catatanTeks }, null, 1));
  console.log(`  docs/panduan/game-${nama}.png  (${kanvas.width}x${kanvas.height}, ${kanvas.catatanTeks.length} teks)`);
  return jalur;
}

/** Latar dunia sederhana: rumput + beberapa pohon, memakai sprite asli. */
function latarDunia(k, { indoor = false } = {}) {
  const LW = k.width, LH = k.height;
  if (indoor) { k.fillStyle = '#241a12'; k.fillRect(0, 0, LW, LH); return; }
  const rumput = manifest.sprites.grass_spring;
  const ubin = rumput.frame[0];
  for (let y = 0; y < LH; y += ubin) {
    for (let x = 0; x < LW; x += ubin) {
      k.drawImage({ nama: 'grass_spring' }, x, y, ubin, ubin);
    }
  }
  // Beberapa pohon & batu supaya terlihat seperti desa, bukan lapangan kosong.
  for (const [nama, x, y] of [['oak', 120, 150], ['oak', 700, 120], ['oak', 260, LH - 70], ['rock', 600, LH - 60]]) {
    const def = manifest.sprites[nama];
    if (!def) continue;
    k.drawImage({ nama }, x, y - def.frame[1], def.frame[0], def.frame[1]);
  }
}

const hari = 3;

/* ------------------------------------------------------------ 1. HUD di dunia */
{
  const k = kanvasBaru({ w: W_PONSEL, h: H_PONSEL });
  latarDunia(k);
  const def = manifest.sprites.player_m;
  k.drawImage({ nama: 'player_m' }, k.width / 2 - def.frame[0] / 2, k.height / 2 - def.frame[1], def.frame[0], def.frame[1]);
  drawHud(k, {
    time: { dateText: 'Musim Semi 3 · Tahun 1', clockText: '07:20', season: 'spring' },
    player: { energy: 78, maxEnergy: 100, money: 1250 },
    inv: { slots: [{ id: 'hoe' }, { id: 'axe' }, { id: 'seed_turnip', count: 5 }, null, null, null, null, null, null], index: 0 },
    weather: { name: 'Cerah', iconIndex: 0 },
  });
  // Diamond ditulis sesudah HUD karena HUD membacanya dari objek state terpisah.
  simpan('hud', k);
}

/* --------------------------------------- 2. bicara dengan warga: kotak pilihan */
{
  const k = kanvasBaru();
  latarDunia(k);
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  const pilihan = new PilihanUI(null);
  const tawaran = ilmu.tawaranWarga('dadang');
  const opsi = [{ label: 'Halo. Aku cuma mau menyapa.', nilai: 'sapa' }];
  for (const t of tawaran) {
    const inti = t.judul.split(' — ')[1] ?? '';
    opsi.push({
      label: t.bukaAlat && !t.lulus ? `Aku ingin belajar ${t.kata} (${t.labelBab}).`
        : t.lulus ? `Aku ingin mengulang ${t.labelBab}: ${inti}.` : `Aku ingin belajar ${t.labelBab}: ${inti}.`,
      nilai: 'bab:' + t.kitab,
      mati: !t.boleh,
      catatan: t.boleh ? (t.lulus ? 'sudah lulus — boleh diulang' : null) : t.alasan,
    });
  }
  pilihan.buka({
    judul: 'KANG DADANG',
    kata: `Apa yang ingin kau lakukan?  (${tawaran.filter((t) => t.lulus).length}/${tawaran.length} bab sudah lulus)`,
    opsi,
  });
  pilihan.draw(k);
  simpan('pilih-warga', k);
}

/* ----------------------------------------------- 3. dialog warga (potret+hati) */
{
  const k = kanvasBaru();
  latarDunia(k);
  const d = new Dialog();
  d.open({
    speaker: 'Kang Dadang',
    portrait: 'portrait_npc_dadang',
    text: 'Nak Dadang. Kalau mau mencangkul, kau harus paham dulu apa itu wahyu.|Bacalah Bab I di rak perpustakaan, lalu kembali ke sini.',
    hearts: { filled: 1, max: 5 },
  });
  d.chars = 999;
  d.draw(k);
  simpan('dialog', k);
}

/* --------------------------------------------------- 4. rak perpustakaan (bab) */
{
  const k = kanvasBaru();
  latarDunia(k, { indoor: true });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  const ui = new IlmuUI(ilmu, null);
  ui.bukaRak();
  ui.cursor = 0;
  ui.draw(k);
  simpan('rak', k);
}

/* ------------------------------------------------------- 5. membaca satu bab */
{
  const k = kanvasBaru();
  latarDunia(k, { indoor: true });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  const ui = new IlmuUI(ilmu, null);
  ui.bukaRak();
  ui.key('interact', hari);      // E pada baris pertama -> mode baca
  ui.draw(k);
  simpan('baca', k);
}

/* ------------------------------------------------- 6. ujian: soal & pilihan */
{
  const k = kanvasBaru();
  latarDunia(k, { indoor: true });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  const ui = new IlmuUI(ilmu, null);
  ui.bukaUjian('x-wahyu', 'dadang', 'Kang Dadang', hari);
  ui.draw(k);
  simpan('ujian', k);
}

/* --------------------------------------------- 7. hasil ujian: LULUS (80%) */
{
  const k = kanvasBaru();
  latarDunia(k, { indoor: true });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  const ui = new IlmuUI(ilmu, null);
  ui.bukaUjian('x-wahyu', 'dadang', 'Kang Dadang', hari);
  const u = ui.ujian;
  // Jawab benar semua kecuali tiga, lalu tutup ujian seperti pemain menekan E
  // pada soal terakhir: layar hasil memakai jalur yang sama dengan permainan.
  u.benar = u.soal.length; u.i = u.soal.length - 1;
  ui.ujian.perlu = u.perlu;
  ui.mode = 'ujianHasil';
  ui.ujian.lulus = true; ui.ujian.nilai = 100; ui.ujian.diamond = 1;
  ui.draw(k);
  simpan('ujian-lulus', k);
}

/* ------------------------------------------ 8. hasil ujian: BELUM LULUS */
{
  const k = kanvasBaru();
  latarDunia(k, { indoor: true });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  const ui = new IlmuUI(ilmu, null);
  ui.bukaUjian('x-wahyu', 'dadang', 'Kang Dadang', hari);
  const s = ui.ujian.soal;
  // Kasus yang paling ingin dilihat siswa: GAGAL TIPIS — benar 23 dari 30
  // (77%), kurang satu jawaban dari batas 80%. Dua pembahasan saja ditampilkan
  // supaya layarnya tidak penuh dan mudah dibaca di panduan.
  ui.ujian.benar = 23;
  ui.ujian.salah = s.slice(0, 2).map((soal) => ({ soal, bahas: soal.bahas }));
  ui.ujian.lulus = false;
  ui.ujian.nilai = Math.round((23 / s.length) * 100);
  ui.mode = 'ujianHasil';
  ui.draw(k);
  simpan('ujian-gagal', k);
}

/* ------------------------------- 9. layar Nilai & Pengiriman (rekap per bab) */
{
  const k = kanvasBaru();
  latarDunia(k, { indoor: true });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  // Beberapa bab sudah ada nilainya: persis seperti setelah ujian.
  ilmu.lulusUjian('x-wahyu');
  ilmu.catatNilai('x-wahyu', 27, 30, hari);
  ilmu.lulusUjian('x-nuzul');
  ilmu.catatNilai('x-nuzul', 22, 30, hari);
  const { NilaiUI } = await import(join(AKAR, 'src', 'ui', 'nilai-ui.js'));
  const ui = new NilaiUI(ilmu);
  if (typeof ui.buka === 'function') ui.buka();
  for (const isi of ['murid', 'nama', 'profil']) {
    try { Object.assign(ui, { [isi]: 'Iqbal21 · Kelas X 1' }); } catch { /* bukan bidangnya */ }
  }
  ui.draw(k);
  simpan('nilai', k);
}

/* ------------------------------------- 10. papan Ragam Usaha (syarat bab) */
{
  const k = kanvasBaru();
  latarDunia(k, { indoor: true });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  const kendaraan = new Kendaraan();
  const inv = new Inventory(24);
  const hitung = { uang: 1250 };
  const diamond = new Diamond(3);
  const up = new Upgrade(kendaraan);
  const ui = new UpgradeUI(up, null);
  ui.buka({
    ilmu, inv,
    uang: () => hitung.uang,
    tingkatKelas: () => ilmu.tingkat,
    diamond,
    kendaraan,
    bayar: (n) => { hitung.uang -= n; },
  });
  ui.draw(k);
  simpan('papan-usaha', k);
}

/* -------------------- 10b. papan usaha dengan bahan & uang cukup (bisa dibeli) */
{
  const k = kanvasBaru();
  latarDunia(k, { indoor: true });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  ilmu.tingkat = 'X';
  const kendaraan = new Kendaraan();
  const inv = new Inventory(24);
  // Bahan yang diminta baris pertama (rumah tingkat 1): cukup, jadi barisnya
  // tampil "boleh dibeli" — supaya siswa melihat bedanya dengan yang terkunci.
  for (const b of ['stone', 'wood', 'fiber']) inv.add(b, 40);
  const hitung = { uang: 5000 };
  const up = new Upgrade(kendaraan);
  const ui = new UpgradeUI(up, null);
  ui.buka({
    ilmu, inv,
    uang: () => hitung.uang,
    tingkatKelas: () => ilmu.tingkat,
    diamond: new Diamond(3),
    kendaraan,
    bayar: (n) => { hitung.uang -= n; },
  });
  ui.draw(k);
  simpan('papan-usaha-siap', k);
}

/* ------------------------------------------------------ 11. menu (Pengaturan) */
{
  const k = kanvasBaru({ w: W_PONSEL, h: H_PONSEL });
  latarDunia(k);
  drawHud(k, {
    time: { dateText: 'Musim Semi 3 · Tahun 1', clockText: '07:20', season: 'spring' },
    player: { energy: 78, maxEnergy: 100, money: 1250 },
    inv: { slots: [null, null, null, null, null, null, null, null, null], index: 0 },
    weather: { name: 'Cerah', iconIndex: 0 },
  });
  const ilmu = new Ilmu(structuredClone(ilmuData));
  const menu = new Menu({ audio: null, renderer: { toggleLayarPenuh() {}, layarPenuh: false }, onQuit: () => {} });
  menu.open = true;
  if (typeof menu.buka === 'function') menu.buka();
  menu.draw(k);
  simpan('menu', k);
}

// 12. (Tidak ada.) Baris perintah mode debug sengaja TIDAK ditangkap di sini:
//     modul baris perintah itu datang bersama PR kode debug, jadi panduan ini
//     tidak boleh bergantung padanya — kalau bergantung, membangun ulang gambar
//     gagal di cabang yang belum memuatnya. Layar debug dijelaskan dengan teks.

console.log(`\nSelesai: ${KELUAR}`);
