// Membuat apps-script/Server-Lengkap.gs dari Code.gs + Obrolan.gs.
//
// Kenapa ada berkas gabungan
//   Instruksi lama menyuruh guru menempel DUA berkas ke Apps Script — dan
//   yang kedua harus diletakkan "di bagian paling bawah" yang pertama. Itu
//   mudah salah: menempel terlalu tinggi, atau menempel di file baru padahal
//   doPut/doPost ada di file lain. Guru yang salah tempel tidak mendapat galat
//   yang jelas, hanya obrolan yang tetap "belum dipasang".
//
//   Dengan satu berkas, langkahnya tinggal: buka Apps Script, hapus isi
//   Code.gs, tempel, simpan, deploy New version. Tidak ada urutan yang bisa
//   salah.
//
// Berkas ini SUMBER KEBENARANNYA tetap dua berkas terpisah; Server-Lengkap.gs
// hanya hasil gabungan. Jangan menyunting hasil gabungan dengan tangan.
//
// Jalankan: node tools/gabung-server.mjs          (menulis berkas)
//           node tools/gabung-server.mjs --periksa (hanya memeriksa, exit 1
//                                                 kalau berkas sudah basi)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Buang komentar kepala /** ... *​/ supaya tidak ada dua kepala berkas. */
function tanpaKepala(teks) {
  const akhir = teks.indexOf('*/');
  if (akhir === -1) return teks;
  return teks.slice(akhir + 2).replace(/^\n+/, '');
}

const KEPALA = `/**
 * =============================================================================
 * SERVER LEMBAH ILMU — SATU BERKAS, SIAP TEMPEL
 * =============================================================================
 *
 * CARA PAKAI (cukup sekali, sekitar 3 menit):
 *
 *   1. Buka spreadsheet guru:
 *      https://docs.google.com/spreadsheets/d/1PS2l3B1E24ysgCmeVUFMCEBndsTwd-eiLiijdn0688Q/edit
 *   2. Menu:  Extensions  ->  Apps Script
 *   3. Di kiri ada file bernama  Code.gs . Klik file itu.
 *   4. SELECT ALL isi kotak kanan (Ctrl+A), lalu HAPUS.
 *   5. Tempel SELURUH isi berkas ini (apps-script/Server-Lengkap.gs).
 *   6. Tekan ikon SIMPAN (disket) atau Ctrl+S.
 *   7. Kanan atas:  Deploy  ->  Manage deployments
 *      ->  ikon PENSIL (Edit)  ->  Version:  New version  ->  Deploy.
 *      (Kalau belum pernah deploy sama sekali: Deploy -> New deployment ->
 *       pilih "Web app", Execute as: Me, Who has access: Anyone.)
 *   8. Buka lagi permainan. Panel obrolan tidak lagi menulis
 *      "belum dipasang".
 *
 * PENTING: langkah 7 tidak boleh dilewati. Tanpa "New version", URL /exec
 * masih menjalankan kode LAMA, dan obrolan maupun nilai akan gagal.
 *
 * Berkas ini adalah GABUNGAN dari:
 *   - apps-script/Code.gs     (akun, nilai, remedial, rekap)
 *   - apps-script/Obrolan.gs  (obrolan kelas 30 baris)
 * Keduanya masih ada terpisah di repo; yang ini hanya versi sekali-tempel.
 * Kalau salah satu diubah, jalankan \`node tools/gabung-server.mjs\` untuk
 * membuat ulang berkas ini — jangan disunting tangan, isinya akan tertimpa.
 *
 * =============================================================================
 */

`;

const PEMISAH = `

/* ============================================================================
 * BAGIAN 2 — OBROLAN KELAS  (dari apps-script/Obrolan.gs)
 * ==========================================================================*/

`;

const isi = KEPALA
  + tanpaKepala(baca('apps-script/Code.gs')).replace(/\s*$/, '\n')
  + PEMISAH
  + tanpaKepala(baca('apps-script/Obrolan.gs'));

const TUJUAN = 'apps-script/Server-Lengkap.gs';
const periksaSaja = process.argv.includes('--periksa');

if (periksaSaja) {
  let sekarang = '';
  try { sekarang = baca(TUJUAN); } catch { /* belum ada */ }
  if (sekarang !== isi) {
    console.error(`${TUJUAN} sudah basi. Jalankan: node tools/gabung-server.mjs`);
    process.exit(1);
  }
  console.log(`${TUJUAN} sesuai dengan Code.gs + Obrolan.gs.`);
  process.exit(0);
}

writeFileSync(join(ROOT, TUJUAN), isi);
const baris = isi.split('\n').length;
console.log(`${TUJUAN} dibuat: ${baris} baris (Code.gs + Obrolan.gs).`);
