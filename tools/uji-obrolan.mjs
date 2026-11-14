// Uji obrolan kelas (apps-script/Obrolan.gs) TANPA Google.
//
// Yang diuji bukan gaya penulisan, tetapi janji-janji yang mudah rusak diam-diam
// dan justru paling mahal kalau salah:
//   1. Hanya 30 baris terakhir yang disimpan per kelas; baris tertua dihapus
//      saat yang ke-31 masuk.
//   2. Ruang dipisah per kelas. Kelas X tidak pernah melihat/menghapus baris
//      kelas XI, dan pemangkasan kelas X tidak menyentuh baris kelas XI.
//   3. PIN diperiksa untuk SETIAP pesan. Tanpa ini siapa pun bisa menulis atas
//      nama temannya.
//   4. Ruang ditentukan dari tab `Akun`, bukan dari yang dikirim peramban.
//   5. Pesan kosong / kepanjangan / terlalu cepat ditolak, dan kata terlarang
//      disensor sebelum tersimpan.
//
// Jalankan: node tools/uji-obrolan.mjs
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
    this.baris = [];
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
    };
    return api;
  }
  appendRow(row) {
    const i = this.getLastRow();
    this._pastikan(i + 1, row.length);
    this.baris[i] = row.slice();
  }
  /** Tiruan deleteRow: menggeser baris di bawahnya naik satu. */
  deleteRow(n) {
    this.baris.splice(n - 1, 1);
  }
  clear() { this.baris = []; }
  setFrozenRows() {}
  setFrozenColumns() {}
  getConditionalFormatRules() { return []; }
  setConditionalFormatRules() {}
}

class Buku {
  constructor() { this.lembar = new Map(); }
  getSheetByName(n) { return this.lembar.get(n) ?? null; }
  insertSheet(n) { const s = new Lembar(n); this.lembar.set(n, s); return s; }
  toast() {}
}

let buku = new Buku();

const SpreadsheetApp = {
  getActiveSpreadsheet: () => buku,
  getUi: () => ({ createMenu: () => ({ addItem: () => ({ addToUi: () => {} }) }) }),
  newConditionalFormatRule: () => {
    const r = {
      whenNumberGreaterThanOrEqualTo() { return r; },
      whenNumberLessThan() { return r; },
      setBackground() { return r; },
      setRanges() { return r; },
      build() { return { getRanges: () => [] }; },
    };
    return r;
  },
};

// Jam tiruan yang BERGERAK, dibangun di atas Date asli.
//
// Dua kesalahan yang pernah terjadi di sini dan perlu dihindari:
//   - formatDate mengembalikan detik yang TETAP, sehingga uji "jeda antar-pesan"
//     selalu lolos karena waktu tidak pernah maju (bug tersembunyi).
//   - Date.now diganti sepenuhnya, sehingga batas tunggu `obrolanAmbil` tidak
//     pernah habis dan ujinya menggantung sembilan detik per panggilan.
// Sekarang Date.now() tetap nyata (jadi batas tunggu berjalan), dan waktu yang
// DITULIS ke sel memakai Date.now() + OFFSET yang dinaikkan tiap permintaan.
let OFFSET = 0;
const MAJU_MS = 3000;
// Server memakai Date.now() untuk menulis kolom `Ms` DAN untuk memeriksa jeda.
// Keduanya harus memakai jam yang sama, jadi Date.now sendiri yang digeser.
// `Utilities.sleep` menggeser jam yang sama, sehingga batas tunggu `obrolanAmbil`
// tetap habis (dulu tidak, dan ujinya menggantung sembilan detik per panggilan).
// Simpan FUNGSINYA, bukan objek Date-nya: `DateAsli.now` pada objek yang sama
// adalah Date.now yang sudah diganti, dan memanggilnya dari dalam dirinya
// sendiri membuat rekursi tanpa ujung (stack overflow).
const nowAsli = Date.now;
Date.now = () => nowAsli() + OFFSET;

const Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256' },
  Charset: { UTF_8: 'utf8' },
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
  // Jam tiruan yang BERGERAK. Dulu tetap di satu detik, dan itu menyembunyikan
  // bug: uji "jeda antar-pesan" selalu lolos karena waktu tidak pernah maju.
  // Sekarang tiap panggilan memajukan jam 3 detik, cukup untuk melewati jeda
  // 1,2 detik, dan `tidur()` memajukannya sesuai lama menunggu.
  formatDate: () => {
    const d = new Date(Date.now());
    const p2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} `
      + `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  },
  // Menunggu panjang tidak ada gunanya di uji: waktu dilompati.
  sleep(ms) { OFFSET += Number(ms) || 0; },
};

const Session = { getScriptTimeZone: () => 'Asia/Jakarta' };

const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(teks) {
    return { _teks: teks, setMimeType() { return this; }, getContent() { return this._teks; } };
  },
};

/* ---------------------------------------------------------------- jalankan */

// Dua berkas digabung persis seperti Apps Script menggabungkan semua .gs
// dalam satu proyek: Code.gs + Obrolan.gs.
const code = readFileSync(join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const obrolan = readFileSync(join(ROOT, 'apps-script', 'Obrolan.gs'), 'utf8');
// Server-Lengkap.gs adalah berkas yang BENAR-BENAR ditempel guru ke Apps
// Script. Menguji dua berkas terpisah saja tidak cukup: kalau penggabungnya
// lupa menyertakan satu fungsi, uji di sini tetap hijau sementara yang dialami
// murid adalah obrolan yang mati. Jadi yang diuji adalah berkas gabungannya.
const gabungan = readFileSync(join(ROOT, 'apps-script', 'Server-Lengkap.gs'), 'utf8');
const pabrik = new Function('SpreadsheetApp', 'Utilities', 'Session', 'ContentService',
  `${gabungan}\nreturn { doPost, doGet, obrolanAmbil, obrolanTulis, obrolanGuru, pangkasObrolan, kelasRuang, rapikanPesan };`);

// Berkas gabungan harus memuat SEMUA yang dibutuhkan, bukan sebagian.
for (const f of ['doPost', 'doGet', 'daftar', 'masuk', 'tulisNilai', 'tulisJalur',
  'rekapSemua', 'obrolanAmbil', 'obrolanTulis', 'obrolanGuru', 'cekPin', 'lembar']) {
  ok(`gabungan: memuat ${f}`, new RegExp(`function ${f}\\b`).test(gabungan));
}
ok('gabungan: tidak memuat kepala berkas dua kali',
  (gabungan.match(/SERVER LEMBAH ILMU/g) ?? []).length === 1);
const gs = pabrik(SpreadsheetApp, Utilities, Session, ContentService);

// Tiap permintaan memajukan jam 3 detik: melewati jeda 1,2 detik antar-pesan,
// tetapi masih jauh di bawah batas tunggu, jadi tidak ada uji yang menggantung.
const kirim = (isi) => {
  OFFSET += MAJU_MS;
  return JSON.parse(gs.doPost({ postData: { contents: JSON.stringify(isi) } }).getContent());
};
/** Kirim tanpa memajukan jam — untuk menguji jeda. */
const kirimSegera = (isi) => JSON.parse(gs.doPost({ postData: { contents: JSON.stringify(isi) } }).getContent());

// Baca selalu hampir tanpa menunggu: 1 ms cukup untuk satu pemeriksaan, dan
// jauh lebih cepat daripada batas 9 detik yang sebenarnya.
const baca = (isi) => kirim({ ...isi, tunggu: 1 });
const tab = () => buku.getSheetByName('Obrolan');

/* ---- 0. perkakas kecil */
ok('kelasRuang: "X-M / X-13" -> X', gs.kelasRuang('X-M / X-13') === 'X');
ok('kelasRuang: "XI-A / XI-1" -> XI', gs.kelasRuang('XI-A / XI-1') === 'XI');
ok('kelasRuang: "XII-B / XII-2" -> XII', gs.kelasRuang('XII-B / XII-2') === 'XII');
ok('kelasRuang: kosong -> kosong', gs.kelasRuang('') === '');
ok('rapikanPesan: spasi dirapikan', gs.rapikanPesan('  halo   dunia  ') === 'halo dunia');
ok('rapikanPesan: kata terlarang disensor', gs.rapikanPesan('dasar anjing') === 'dasar a*****',
  gs.rapikanPesan('dasar anjing'));
ok('rapikanPesan: sensor tidak peka huruf besar', gs.rapikanPesan('ANJING').indexOf('*') > 0);

/* ---- 1. akun: tiga murid, dua kelas */
kirim({ aksi: 'daftar', nama: 'ahmad', kelas: 'X-M / X-13', pin: '1234' });
kirim({ aksi: 'daftar', nama: 'siti', kelas: 'X-M / X-13', pin: '5678' });
kirim({ aksi: 'daftar', nama: 'budi', kelas: 'XI-A / XI-1', pin: '9999' });

/* ---- 2. kirim pesan: PIN & ruang */
ok('tulis: PIN salah ditolak', kirim({ aksi: 'obrolanTulis', nama: 'ahmad', pin: '0000', pesan: 'hai' }).ok === false);
ok('tulis: nama tak terdaftar ditolak', kirim({ aksi: 'obrolanTulis', nama: 'hacker', pin: '1234', pesan: 'hai' }).ok === false);
ok('tulis: pesan kosong ditolak', kirim({ aksi: 'obrolanTulis', nama: 'ahmad', pin: '1234', pesan: '   ' }).ok === false);
ok('tulis: pesan kepanjangan ditolak',
  kirim({ aksi: 'obrolanTulis', nama: 'ahmad', pin: '1234', pesan: 'x'.repeat(161) }).ok === false);

const kirim1 = kirim({ aksi: 'obrolanTulis', nama: 'ahmad', pin: '1234', pesan: 'assalamualaikum' });
ok('tulis: pesan pertama diterima', kirim1.ok === true && kirim1.kelas === 'X', JSON.stringify(kirim1));
kirim({ aksi: 'obrolanTulis', nama: 'ahmad', pin: '1234', pesan: 'kelas palsu', kelas: 'XII' });
ok('tulis: ruang diambil dari tab Akun, bukan dari kiriman peramban',
  tab().baris[tab().baris.length - 1][0] === 'X',
  'baris tersimpan di kelas ' + tab().baris[tab().baris.length - 1][0]);

/* ---- 3. pemisahan kelas */

const budi1 = kirim({ aksi: 'obrolanTulis', nama: 'budi', pin: '9999', pesan: 'halo kelas sebelas' });
ok('tulis: murid XI menulis di ruang XI', budi1.ok === true && budi1.kelas === 'XI');
kirim({ aksi: 'obrolanTulis', nama: 'siti', pin: '5678', pesan: 'halo juga' });

const lihatX = baca({ aksi: 'obrolan', nama: 'ahmad', pin: '1234', sejak: 0 });
const lihatXI = baca({ aksi: 'obrolan', nama: 'budi', pin: '9999', sejak: 0 });
ok('baca: kelas X hanya melihat baris kelas X',
  lihatX.ok && lihatX.pesan.length === 3 && lihatX.pesan.every((p) => p.name !== 'budi'),
  JSON.stringify(lihatX.pesan?.map((p) => p.name)));
ok('baca: kelas XI hanya melihat baris kelas XI',
  lihatXI.ok && lihatXI.pesan.length === 1 && lihatXI.pesan[0].name === 'budi');
ok('baca: guru bisa menengok satu kelas',
  gs.obrolanGuru('X').jumlah === 3 && gs.obrolanGuru('XI').jumlah === 1,
  `${gs.obrolanGuru('X').jumlah} / ${gs.obrolanGuru('XI').jumlah}`);
ok('baca: kelas tak dikenal ditolak guru', gs.obrolanGuru('').ok === false);

/* ---- 4. batas 30 baris */
// Kelas X menulis sampai 35 baris.
for (let i = 0; i < 33; i++) {
    kirim({ aksi: 'obrolanTulis', nama: i % 2 ? 'ahmad' : 'siti', pin: i % 2 ? '1234' : '5678', pesan: `pesan ${i + 4}` });
}
const kelasX = gs.obrolanGuru('X');
ok('batas: kelas X tepat 30 baris (bukan 31, bukan 35)', kelasX.jumlah === 30, String(kelasX.jumlah));
ok('batas: baris tertua yang tersisa adalah pesan ke-7',
  kelasX.pesan[0].pesan === 'pesan 7', kelasX.pesan[0].pesan);
ok('batas: baris terbaru tetap yang terakhir ditulis',
  kelasX.pesan[kelasX.pesan.length - 1].pesan === 'pesan 36',
  kelasX.pesan[kelasX.pesan.length - 1].pesan);
ok('batas: kelas XI tidak tersentuh pemangkasan kelas X',
  gs.obrolanGuru('XI').jumlah === 1);

// Nomor pesan harus terus naik walau baris lama dihapus: peramban memakai
// nomor ini untuk "pesan baru sejak kapan", jadi nomor yang mengulang akan
// membuat pesan hilang dari layar.
const nomorX = kelasX.pesan.map((p) => p.no);
ok('batas: nomor pesan tetap naik dan tidak berulang',
  nomorX.every((n, i) => i === 0 || n > nomorX[i - 1]), JSON.stringify(nomorX));

/* ---- 5. `sejak`: hanya pesan baru */
const terakhir = Math.max(...nomorX);
const baru = baca({ aksi: 'obrolan', nama: 'ahmad', pin: '1234', sejak: terakhir });
ok('baca: sejak = nomor terakhir menghasilkan nol pesan', baru.ok && baru.pesan.length === 0, JSON.stringify(baru));
kirim({ aksi: 'obrolanTulis', nama: 'siti', pin: '5678', pesan: 'satu lagi' });
const baru2 = baca({ aksi: 'obrolan', nama: 'ahmad', pin: '1234', sejak: terakhir });
ok('baca: sejak mengembalikan hanya pesan yang lebih baru',
  baru2.pesan.length === 1 && baru2.pesan[0].text === 'satu lagi', JSON.stringify(baru2.pesan));
ok('baca: baris ke-31 tetap memangkas satu baris',
  gs.obrolanGuru('X').jumlah === 30);

/* ---- 6. jeda antar-pesan */
buku = new Buku();
kirim({ aksi: 'daftar', nama: 'cepat', kelas: 'XII-A / XII-1', pin: '1111' });
kirimSegera({ aksi: 'obrolanTulis', nama: 'cepat', pin: '1111', pesan: 'pertama' });
// Tanpa memajukan jam: dua pesan dalam detik yang sama harus ditolak.
const kedua = kirimSegera({ aksi: 'obrolanTulis', nama: 'cepat', pin: '1111', pesan: 'kedua' });
ok('jeda: pesan kedua dalam 1,2 detik ditolak', kedua.ok === false && kedua.lambat === true, JSON.stringify(kedua));
ok('jeda: pesan yang ditolak tidak masuk tab', gs.obrolanGuru('XII').jumlah === 1);

/* ---- 7. sensor tersimpan, bukan hanya ditampilkan */
buku = new Buku();
kirim({ aksi: 'daftar', nama: 'sopan', kelas: 'X-A / X-1', pin: '2222' });
kirim({ aksi: 'obrolanTulis', nama: 'sopan', pin: '2222', pesan: 'dasar anjing' });
const tersimpan = gs.obrolanGuru('X');
ok('sensor: kata terlarang TIDAK tersimpan sebagai teks asli',
  tersimpan.pesan[0].pesan.indexOf('anjing') === -1, tersimpan.pesan[0].pesan);
ok('sensor: bentuk pesan lain tetap utuh',
  tersimpan.pesan[0].pesan.startsWith('dasar '), tersimpan.pesan[0].pesan);

/* ---- 8. kelas kosong di tab Akun: tidak boleh masuk ruang mana pun */
buku = new Buku();
kirim({ aksi: 'daftar', nama: 'tanpakelas', kelas: '', pin: '3333' });
const tanpa = kirim({ aksi: 'obrolanTulis', nama: 'tanpakelas', pin: '3333', pesan: 'halo' });
ok('tanpa kelas: menulis ditolak dengan alasan jelas',
  tanpa.ok === false && /kelas/i.test(tanpa.error), JSON.stringify(tanpa));
ok('tanpa kelas: membaca juga ditolak',
  baca({ aksi: 'obrolan', nama: 'tanpakelas', pin: '3333', sejak: 0 }).ok === false);

/* ---- 9. Code.gs yang belum diperbarui tidak boleh melempar galat */
ok('doPost mengenal aksi obrolan', baca({ aksi: 'obrolan', nama: 'x', pin: 'y', sejak: 0 }).ok === false);
ok('doGet menyebut obrolan di pesan bantuan', /obrolan/.test(
  JSON.parse(gs.doGet({ parameter: {} }).getContent()).pesan));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
