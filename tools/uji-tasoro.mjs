// Uji tata letak layar Ustadz Tasoro tanpa browser.
//
// Kenapa perlu — dan kenapa terpisah dari `uji-tata-letak.mjs`: layar ini punya
// dua masalah ruang yang khas dan tidak akan tertangkap uji logika mana pun:
//
//   1. UJIAN 50 SOAL jauh lebih panjang daripada 30 soal per bab. Baris kepala
//      ("Soal 1 / 50 · benar 0 · lulus ≥ 40") dan catatan "lima bab pertama
//      kelasmu · tidak masuk nilai sekolah" harus muat di panel sekecil ponsel
//      mendatar (568x320), bukan hanya di desktop.
//   2. LAYAR HASIL memuat rincian lima bab dalam dua kolom. Nama bab terpanjang
//      ("Kebenaran Al-Qur'an pada Semua Aspek Kehidupan") bisa menabrak kolom
//      kanan kalau dipotong sembarangan.
//
// Cara kerjanya sama dengan uji tata letak papan: kanvas tiruan yang mengukur
// lebar teks dengan perkiraan font (lebih lebar daripada VT323 asli), semua
// tulisan dicatat, lalu diperiksa terhadap batas panel di lima ukuran layar.
//
// Jalankan:  node tools/uji-tasoro.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(AKAR, p), 'utf8');

// Modul renderer memakai `window`/`document` saat diimpor; cukup tiruan kosong.
globalThis.window ??= { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1, addEventListener() {} };
globalThis.document ??= { createElement: () => ({ getContext: () => null }), addEventListener() {} };

const { view } = await import(join(AKAR, 'src/render/renderer.js'));
const { assets } = await import(join(AKAR, 'src/render/assets.js'));
assets.manifest = assets.manifest ?? { sprites: {} };
assets.manifest.sprites = new Proxy(assets.manifest.sprites ?? {}, {
  get: (t, k) => (k in t ? t[k] : { frame: [24, 24], cols: 1 }),
});
assets.images.set('ui_diamond', { width: 24, height: 24 });

const { Ilmu } = await import(join(AKAR, 'src/systems/ilmu.js'));
const { IlmuUI } = await import(join(AKAR, 'src/ui/ilmu-ui.js'));

const dataIlmu = JSON.parse(baca('src/data/ilmu.json'));

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

/** Batas panel yang sama persis dengan IlmuUI.draw(). */
function batasPanel(w, h) {
  const W = Math.min(620, w - 60);
  const H = Math.min(460, h - 120);
  return { W, H, x: Math.round((w - W) / 2), y: Math.round((h - H) / 2) };
}

for (const kelas of ['X', 'XI', 'XII']) {
  for (const jalur of ['remedial', 'pengayaan']) {
    for (const [w, h, nama] of UKURAN) {
      view.w = w;
      view.h = h;
      const ilmu = new Ilmu(dataIlmu);
      ilmu.tingkat = kelas;
      const ui = new IlmuUI(ilmu, null);
      ui.diamond = { terakhir: 1 };

      if (!ui.bukaJalur(jalur, 'tasoro', 'Ustadz Tasoro', 3)) {
        salah(`${kelas}/${jalur}/${nama}: ujian jalur tidak bisa dibuka (${ui.pesan})`);
        continue;
      }
      const { W, H, x, y } = batasPanel(w, h);
      const label = `${kelas}/${jalur} · ${nama} (${w}x${h})`;

      // --- layar soal: halaman pertama, tengah, dan terakhir. Soal terakhir
      // yang paling berbahaya karena angkanya jadi dua digit.
      for (const posisi of [0, 25, 49]) {
        ui.ujian.i = posisi;
        ui.cursor = 0;
        const { ctx, tulisan } = kanvasTiruan(w, h);
        ui.draw(ctx);
        for (const t of tulisan) {
          if (t.x < x - 1 || t.x + t.w > x + W + 1) {
            salah(`${label} soal ${posisi + 1}: "${t.s}" keluar panel (${t.x}..${t.x + t.w} vs ${x}..${x + W})`);
          }
          if (t.y < y - 1 || t.y > y + H - 6) {
            salah(`${label} soal ${posisi + 1}: "${t.s}" keluar tinggi (y=${t.y})`);
          }
        }
        const semuaTeks = tulisan.map((t) => t.s).join(' ');
        if (!/Soal \d+ \/ 50/.test(semuaTeks)) {
          salah(`${label} soal ${posisi + 1}: jumlah soal 50 tidak tertulis`);
        }
        // Kalimat janji boleh dibungkus menjadi beberapa baris di panel sempit,
        // jadi yang diperiksa adalah gabungan seluruh tulisan di layar
        // (`semuaTeks` sudah dihitung di atas).
        if (!/bukan nilai sekolah/.test(semuaTeks)) {
          salah(`${label} soal ${posisi + 1}: janji "tidak masuk nilai sekolah" tidak tampil`);
        }
      }

      // --- layar hasil: semua benar (lulus, ada diamond) dan banyak yang salah
      // (tidak lulus, ada daftar pembahasan panjang).
      for (const [benar, sebut] of [[50, 'semua benar'], [30, 'banyak salah']]) {
        const u = ui.ujian;
        u.benar = benar;
        u.perlu = 40;
        u.nilai = Math.round((benar / u.soal.length) * 100);
        u.lulus = benar >= 40;
        u.diamond = u.lulus ? 1 : 0;
        u.salah = u.soal.slice(0, 50 - benar).map((s) => ({ soal: s.tanya, bahas: s.bahas }));
        u.jawaban = u.soal.map((s, i) => ({ bab: s.bab, tepat: i < benar }));
        u.perBab = {};
        for (const j of u.jawaban) {
          u.perBab[j.bab] = u.perBab[j.bab] ?? { benar: 0, jumlah: 0 };
          u.perBab[j.bab].jumlah++;
          if (j.tepat) u.perBab[j.bab].benar++;
        }
        ui.mode = 'ujianHasil';
        // Skenario ini menggambar layar hasil langsung, tanpa melewati
        // `jawabUjian()` — jadi status pengiriman diisi sendiri. Tanpa ini,
        // yang diuji adalah layar yang belum pernah terjadi di permainan.
        // Ketiga keadaan diuji bergiliran supaya tidak ada yang terpotong:
        //   mengirim (teks panjang), ok (pendek), antre (paling panjang).
        u.terkirim = ['mengirim', 'ok', 'antre'][(benar === 50 ? 0 : 2)];
        const { ctx, tulisan } = kanvasTiruan(w, h);
        ui.draw(ctx);
        for (const t of tulisan) {
          if (t.x < x - 1 || t.x + t.w > x + W + 1) {
            salah(`${label} hasil (${sebut}): "${t.s}" keluar panel (${t.x}..${t.x + t.w} vs ${x}..${x + W})`);
          }
          if (t.y < y - 1 || t.y > y + H - 6) {
            salah(`${label} hasil (${sebut}): "${t.s}" keluar tinggi (y=${t.y})`);
          }
        }
        // Rincian per bab WAJIB ada: itulah gunanya remedial.
        const jumlahBab = tulisan.filter((t) => /: \d+\/10/.test(t.s)).length;
        if (jumlahBab !== 5) {
          salah(`${label} hasil (${sebut}): rincian per bab ${jumlahBab}, seharusnya 5`);
        }
        // Janji yang berlaku sejak 2026-11-10: hasilnya MASUK catatan guru
        // (tab `Remedial`), tetapi TIDAK masuk nilai sekolah. Kalimat lama
        // ("tidak dikirim") sudah tidak benar dan tidak boleh muncul lagi.
        const semuaHasil = tulisan.map((t) => t.s).join(' ');
        if (!/tidak masuk nilai sekolah/.test(semuaHasil)) {
          salah(`${label} hasil (${sebut}): janji "tidak masuk nilai sekolah" tidak tampil`);
        }
        if (!/masuk catatan guru/.test(semuaHasil)) {
          salah(`${label} hasil (${sebut}): keterangan "masuk catatan guru" tidak tampil`);
        }
        if (/tidak dikirim ke spreadsheet guru/.test(semuaHasil)) {
          salah(`${label} hasil (${sebut}): kalimat lama "tidak dikirim" masih tampil`);
        }
        // Status pengiriman juga harus terbaca — murid berhak tahu hasilnya
        // sudah sampai, masih ditahan, atau gagal.
        if (!/spreadsheet guru/.test(semuaHasil)) {
          salah(`${label} hasil (${sebut}): status pengiriman ke spreadsheet tidak tampil`);
        }
        // Baris kaki (tombol tutup) harus digambar paling akhir, di bawah isi.
        const kaki = tulisan.find((t) => /E\s+tutup/.test(t.s));
        if (!kaki) salah(`${label} hasil (${sebut}): baris "E tutup" tidak ada`);
        else {
          const isiTerbawah = Math.max(...tulisan.filter((t) => t !== kaki).map((t) => t.y));
          if (kaki.y < isiTerbawah) {
            salah(`${label} hasil (${sebut}): baris tutup (y=${kaki.y}) tertimpa isi (y=${isiTerbawah})`);
          }
        }
      }
    }
  }
}

if (masalah) {
  console.error(`\n${masalah} masalah tata letak layar Ustadz Tasoro.`);
  process.exit(1);
}
console.log('Tata letak layar Ustadz Tasoro aman di lima ukuran layar × tiga kelas × dua jalur:');
console.log('  judul & jumlah 50 soal muat, rincian lima bab tampil, janji "tidak masuk nilai sekolah" tertulis,');
console.log('  baris tutup tidak tertimpa isi.');
