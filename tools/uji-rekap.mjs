// Uji apps-script/Code.gs TANPA Google: SpreadsheetApp ditiru secukupnya.
//
// Yang diuji bukan gaya penulisan, tetapi janji-janji yang mudah rusak diam-diam:
//   1. `nilai` menolak nilai di bawah 80 (aturan sekolah dijaga di server).
//   2. `jalur` MENERIMA nilai di bawah 80 — justru itu gunanya remedial — dan
//      menulisnya ke tab `Remedial`, bukan ke `Nilai`.
//   3. PIN salah ditolak; PIN benar diterima.
//   4. `Rekap Nilai` berisi SATU BARIS PER MURID dan nilai berjejer ke samping,
//      dengan nilai terbaik per bab (bukan percobaan terakhir yang kebetulan
//      lebih rendah).
//   5. Ujian bab yang gagal tidak pernah menambah kolom/baris di tab `Nilai`.
//
// Jalankan: node tools/uji-rekap.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let lulus = 0;
let gagal = 0;
function ok(nama, syarat, tambahan = '') {
  if (syarat) { lulus++; }
  else { gagal++; console.error(`GAGAL: ${nama}${tambahan ? ' — ' + tambahan : ''}`); }
}

/* ------------------------------------------------------- tiruan Spreadsheet */

class Lembar {
  constructor(nama) {
    this.nama = nama;
    this.baris = [];               // array of array
    this.beku = { baris: 0, kolom: 0 };
    this.aturan = [];
  }
  getName() { return this.nama; }
  getLastRow() {
    let n = 0;
    for (let i = 0; i < this.baris.length; i++) {
      if ((this.baris[i] ?? []).some((c) => String(c ?? '').trim() !== '')) n = i + 1;
    }
    return n;
  }
  getLastColumn() {
    return this.baris.reduce((m, r) => Math.max(m, (r ?? []).length), 0);
  }
  _pastikan(r, c) {
    while (this.baris.length < r) this.baris.push([]);
    for (let i = 0; i < r; i++) {
      const row = this.baris[i];
      while (row.length < c) row.push('');
    }
  }
  getRange(r, c, nr = 1, nc = 1) {
    const lembar = this;
    const api = {
      getValues() {
        const keluar = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) {
            row.push((lembar.baris[r - 1 + i] ?? [])[c - 1 + j] ?? '');
          }
          keluar.push(row);
        }
        return keluar;
      },
      setValues(nilai) {
        lembar._pastikan(r - 1 + nilai.length, c - 1 + (nilai[0]?.length ?? 0));
        nilai.forEach((row, i) => row.forEach((v, j) => {
          lembar._pastikan(r + i, c + j);
          lembar.baris[r - 1 + i][c - 1 + j] = v;
        }));
        return api;
      },
      setValue(v) {
        lembar._pastikan(r, c);
        lembar.baris[r - 1][c - 1] = v;
        return api;
      },
      setFontWeight() { return api; },
      setBackground() { return api; },
      getSheet() { return lembar; },
    };
    return api;
  }
  appendRow(row) {
    const i = this.getLastRow();
    this._pastikan(i + 1, row.length);
    this.baris[i] = row.slice();
  }
  insertRowAfter() {}
  clear() { this.baris = []; }
  setFrozenRows(n) { this.beku.baris = n; }
  setFrozenColumns(n) { this.beku.kolom = n; }
  getConditionalFormatRules() { return this.aturan; }
  setConditionalFormatRules(a) { this.aturan = a; }
}

class Buku {
  constructor() { this.lembar = new Map(); }
  getSheetByName(n) { return this.lembar.get(n) ?? null; }
  insertSheet(n) { const s = new Lembar(n); this.lembar.set(n, s); return s; }
  toast() {}
}

let buku = new Buku();   // bisa diganti untuk menguji spreadsheet kosong

const SpreadsheetApp = {
  getActiveSpreadsheet: () => buku,
  getUi: () => ({ createMenu: () => ({ addItem: () => ({ addToUi: () => {} }) }) }),
  newConditionalFormatRule: () => {
    const r = {
      _ranges: [],
      whenNumberGreaterThanOrEqualTo() { return r; },
      whenNumberLessThan() { return r; },
      setBackground() { return r; },
      setRanges(a) { r._ranges = a; return r; },
      build() { return { getRanges: () => r._ranges }; },
    };
    return r;
  },
};

const Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256' },
  Charset: { UTF_8: 'utf8' },
  // SHA tiruan: cukup unik per masukan, tidak perlu kriptografis untuk uji.
  computeDigest(_alg, teks) {
    const s = String(teks);
    let h = 0;
    const keluar = [];
    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < s.length; j++) h = (h * 31 + s.charCodeAt(j) + i) % 256;
      keluar.push(h > 128 ? h - 256 : h);
    }
    return keluar;
  },
  getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  formatDate: () => '2026-11-10 10:00:00',
};

const Session = { getScriptTimeZone: () => 'Asia/Jakarta' };

const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(teks) {
    return { _teks: teks, setMimeType() { return this; }, getContent() { return this._teks; } };
  },
};

/* ------------------------------------------------------------- jalankan */

const sumber = readFileSync(join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const pabrik = new Function('SpreadsheetApp', 'Utilities', 'Session', 'ContentService',
  `${sumber}\nreturn { doPost, doGet, rekapSemua, tulisNilai, tulisJalur, daftar, masuk };`);
const gs = pabrik(SpreadsheetApp, Utilities, Session, ContentService);

const kirim = (isi) => JSON.parse(gs.doPost({ postData: { contents: JSON.stringify(isi) } }).getContent());

/* ---- 1. akun */
ok('daftar: murid baru diterima', kirim({ aksi: 'daftar', nama: 'ahmad', kelas: 'X-M / X-13', pin: '1234' }).ok);
ok('daftar: nama kembar ditolak', kirim({ aksi: 'daftar', nama: 'ahmad', kelas: 'X-M / X-13', pin: '9999' }).sudahAda === true);
ok('masuk: PIN salah ditolak', kirim({ aksi: 'masuk', nama: 'ahmad', pin: '0000' }).ok === false);
ok('masuk: PIN benar diterima + kelas ikut', (() => {
  const r = kirim({ aksi: 'masuk', nama: 'ahmad', pin: '1234' });
  return r.ok && r.kelas === 'X-M / X-13';
})());
kirim({ aksi: 'daftar', nama: 'siti', kelas: 'X-M / X-13', pin: '5678' });

/* ---- 2. nilai bab: hanya yang lulus */
const gagalKirim = kirim({ aksi: 'nilai', nama: 'ahmad', pin: '1234', bab: 'x-wahyu', judul: 'Bab I — Al-Qur\'an adalah Wahyu Allah', nilai: 70, benar: 21, jumlah: 30 });
ok('nilai: 70% DITOLAK (aturan sekolah di server)', gagalKirim.ok === false && gagalKirim.ditolak === true);
// Tab `Nilai` bahkan belum perlu dibuat: penolakan terjadi sebelum menulis.
ok('nilai: penolakan tidak membuat/menambah baris di tab Nilai',
  !buku.getSheetByName('Nilai') || buku.getSheetByName('Nilai').getLastRow() <= 1);

kirim({ aksi: 'nilai', nama: 'ahmad', pin: '1234', bab: 'x-wahyu', judul: 'Bab I — Wahyu', nilai: 90, benar: 27, jumlah: 30 });
kirim({ aksi: 'nilai', nama: 'ahmad', pin: '1234', bab: 'x-nuzul', judul: 'Bab II — Nuzul', nilai: 90, benar: 27, jumlah: 30 });
kirim({ aksi: 'nilai', nama: 'ahmad', pin: '1234', bab: 'x-otentik', judul: 'Bab III — Otentik', nilai: 90, benar: 27, jumlah: 30 });
kirim({ aksi: 'nilai', nama: 'ahmad', pin: '1234', bab: 'x-mukjizat', judul: 'Bab IV — Mukjizat', nilai: 87, benar: 26, jumlah: 30 });
// percobaan ulang lebih rendah: nilai terbaik harus tetap 90
kirim({ aksi: 'nilai', nama: 'ahmad', pin: '1234', bab: 'x-wahyu', judul: 'Bab I — Wahyu', nilai: 83, benar: 25, jumlah: 30 });
kirim({ aksi: 'nilai', nama: 'siti', pin: '5678', bab: 'x-wahyu', judul: 'Bab I — Wahyu', nilai: 100, benar: 30, jumlah: 30 });

/* ---- 3. remedial & pengayaan: SEMUA hasil, tab sendiri */
const rem = kirim({ aksi: 'jalur', nama: 'ahmad', pin: '1234', jalur: 'remedial', nilai: 62, benar: 31, jumlah: 50, perBab: { 'x-wahyu': [9, 10], 'x-nuzul': [6, 10] } });
ok('jalur: remedial 62% DITERIMA (bukan nilai sekolah)', rem.ok === true && rem.lulus === false);
ok('jalur: rincian per bab tertulis', /x-wahyu 9\/10/.test(buku.getSheetByName('Remedial').baris[1][7]));
ok('jalur: tidak menambah baris di tab Nilai', buku.getSheetByName('Nilai').getLastRow() === 7);
const peng = kirim({ aksi: 'jalur', nama: 'ahmad', pin: '1234', jalur: 'pengayaan', nilai: 88, benar: 44, jumlah: 50, perBab: { 'x-wahyu': [10, 10] } });
ok('jalur: pengayaan 88% LULUS', peng.ok === true && peng.lulus === true);
ok('jalur: nama jalur tidak dikenal ditolak', kirim({ aksi: 'jalur', nama: 'ahmad', pin: '1234', jalur: 'ujian', nilai: 90 }).ok === false);
ok('jalur: PIN salah ditolak', kirim({ aksi: 'jalur', nama: 'ahmad', pin: '9999', jalur: 'remedial', nilai: 90 }).ok === false);

/* ---- 4. rekap: satu baris per murid, nilai berjejer ke samping */
const rekap = buku.getSheetByName('Rekap Nilai');
const judul = rekap.baris[0];
const barisAhmad = rekap.baris.find((r) => r[0] === 'ahmad');
const barisSiti = rekap.baris.find((r) => r[0] === 'siti');
ok('rekap: judul kolom dimulai Nama, Kelas', judul[0] === 'Nama' && judul[1] === 'Kelas');
ok('rekap: satu baris per murid', rekap.baris.length === 3);
ok('rekap: kolom remedial & pengayaan ada',
  judul.includes('Remedial (dari 50)') && judul.includes('Pengayaan (dari 50)'));
const kolomBab = (id) => judul.indexOf(id);
ok('rekap: nilai ahmad berjejer ke samping (90 90 90 87)',
  [barisAhmad[2], barisAhmad[3], barisAhmad[4], barisAhmad[5]].join(' ') === '90 90 90 87',
  'dapat: ' + barisAhmad.slice(2, 6).join(' '));
ok('rekap: nilai terbaik dipakai, bukan percobaan terakhir (83 -> 90)',
  barisAhmad[2] === 90, 'dapat: ' + barisAhmad[2]);
ok('rekap: remedial & pengayaan di kolom paling kanan',
  barisAhmad[judul.indexOf('Remedial (dari 50)')] === 62
  && barisAhmad[judul.indexOf('Pengayaan (dari 50)')] === 88);
ok('rekap: murid tanpa nilai tetap punya baris (sel kosong)',
  barisSiti[3] === '' && barisSiti[judul.indexOf('Remedial (dari 50)')] === '');
ok('rekap: nama + kelas dibekukan', rekap.beku.baris === 1 && rekap.beku.kolom === 2);
ok('rekap: baris pertama dibekukan, kolom nama ikut', rekap.beku.kolom >= 2);

/* ---- 5. doGet: halaman hidup & segarkan manual */
ok('doGet: hidup', JSON.parse(gs.doGet({}).getContent()).ok === true);
const viaUrl = JSON.parse(gs.doGet({ parameter: { aksi: 'rekap' } }).getContent());
ok('doGet ?aksi=rekap: menyegarkan rekap', viaUrl.ok === true && viaUrl.murid === 2);

/* ---- 6. kasus tepi: akun ada, tetapi BELUM ada satu pun nilai.
   Lembar Rekap hanya berisi baris judul; getRange(2, 3, 0, n) ditolak Google,
   jadi jalur ini dulu melempar galat dan nilainya ikut dilaporkan gagal. */
buku = new Buku();
kirim({ aksi: 'daftar', nama: 'baru', kelas: 'X-A / X-1', pin: '1111' });
let hasilKosong;
try { hasilKosong = gs.rekapSemua(); }
catch (e) { hasilKosong = 'ERROR: ' + e.message; }
ok('rekap kosong: tidak melempar galat', hasilKosong === 1, String(hasilKosong));
const rekapKosong = buku.getSheetByName('Rekap Nilai');
ok('rekap kosong: baris murid tetap ditulis walau semua sel kosong',
  !!rekapKosong && rekapKosong.baris.length === 2 && rekapKosong.baris[1][0] === 'baru');
ok('rekap kosong: nilai bab belum ada, kolom jalur tetap disiapkan',
  rekapKosong.baris[0].includes('Remedial (dari 50)'));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
