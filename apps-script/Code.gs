/**
 * APPS SCRIPT — LEMBAH ILMU (spreadsheet guru)
 * ============================================
 *
 * Berkas ini adalah SERVER-nya: satu Web App yang menulis ke spreadsheet guru.
 * Permainan memanggilnya lewat `src/core/nilai-api.js` (URL berakhiran `/exec`).
 *
 *   Taruh di spreadsheet : Extensions -> Apps Script -> tempel berkas ini
 *                          (ganti isi Code.gs bawaan) -> Save.
 *   Pasang               : Deploy -> New deployment -> type "Web app"
 *                          Execute as: Me
 *                          Who has access: Anyone
 *                          lalu SALIN URL /exec ke APPS_SCRIPT_URL.
 *   Setiap kali diubah   : Deploy -> Manage deployments -> Edit (ikon pensil)
 *                          -> Version: New version -> Deploy.
 *                          Tanpa langkah ini, URL /exec masih menjalankan
 *                          kode LAMA dan nilai murid akan gagal terkirim.
 *
 * Aksi yang dikenal (medan `aksi` pada isi permintaan):
 *   daftar  -> menambah baris di tab `Akun`
 *   masuk   -> memeriksa PIN, mengembalikan kelas
 *   nilai   -> menulis satu baris ujian BAB ke tab `Nilai` (hanya yang lulus)
 *   jalur   -> menulis satu baris REMEDIAL/PENGAYAAN ke tab `Remedial`
 *   rekap   -> menyusun/menyegarkan tab `Rekap` (nilai murid berjejer ke samping)
 *
 * PIN tidak pernah disimpan sebagai teks: hanya SHA-256 + garam.
 */

var TAB_AKUN = 'Akun';
var TAB_NILAI = 'Nilai';
var TAB_REMEDIAL = 'Remedial';
var TAB_REKAP = 'Rekap';
var BATAS_LULUS = 80;          // sama dengan BATAS_LULUS di src/core/nilai-api.js
var LEMBAR_REKAP = 'Rekap Nilai';   // lembar nilai berjejer (satu per kelas)

/* ------------------------------------------------------------------ masuk */

function doPost(e) {
  var out = { ok: false };
  try {
    var isi = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var aksi = String(isi.aksi || '');
    if (aksi === 'daftar') out = daftar(isi);
    else if (aksi === 'masuk') out = masuk(isi);
    else if (aksi === 'nilai') out = tulisNilai(isi);
    else if (aksi === 'jalur') out = tulisJalur(isi);
    else if (aksi === 'rekap') out = { ok: true, dibuat: rekapSemua() };
    else out = { ok: false, error: 'Aksi tidak dikenal: ' + aksi };
  } catch (err) {
    out = { ok: false, error: 'Server gagal: ' + (err && err.message ? err.message : err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Jalan pintas untuk guru: buka URL /exec (atau /exec?aksi=rekap) di peramban. */
function doGet(e) {
  var aksi = String((e && e.parameter && e.parameter.aksi) || '');
  var out;
  if (aksi === 'rekap') {
    try { out = { ok: true, murid: rekapSemua(), waktu: now() }; }
    catch (err) { out = { ok: false, error: String(err && err.message ? err.message : err) }; }
  } else {
    out = { ok: true, pesan: 'Server Lembah Ilmu hidup. Tambahkan ?aksi=rekap untuk menyegarkan rekap.', waktu: now() };
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* -------------------------------------------------------------- perkakas */

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function now() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
}

/** Lembar dengan nama tertentu; dibuat (beserta judul kolomnya) kalau belum ada. */
function lembar(nama, judul) {
  var buku = ss();
  var s = buku.getSheetByName(nama);
  if (!s) {
    s = buku.insertSheet(nama);
    if (judul && judul.length) {
      s.getRange(1, 1, 1, judul.length).setValues([judul]).setFontWeight('bold');
      s.setFrozenRows(1);
    }
  }
  return s;
}

function sha256(teks) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, teks, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}

function garamBaru() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function samaPersis(a, b) { return String(a) === String(b); }

/** Baris pertama pada kolom A yang isinya `nama`, atau 0. */
function cariAkun(nama) {
  var s = lembar(TAB_AKUN, ['Nama', 'Kelas', 'PIN (hash)', 'Garam', 'Dibuat', 'Terakhir masuk', 'Catatan']);
  var isi = s.getRange(1, 1, Math.max(1, s.getLastRow()), 1).getValues();
  for (var i = 1; i < isi.length; i++) {
    if (samaPersis(isi[i][0], nama)) return i + 1;
  }
  return 0;
}

/* ------------------------------------------------------------------ akun */

function daftar(isi) {
  var nama = String(isi.nama || '').trim();
  var kelas = String(isi.kelas || '').trim();
  var pin = String(isi.pin || '').trim();
  if (!nama) return { ok: false, error: 'Nama kosong.' };
  if (!pin) return { ok: false, error: 'PIN kosong.' };

  var s = lembar(TAB_AKUN, ['Nama', 'Kelas', 'PIN (hash)', 'Garam', 'Dibuat', 'Terakhir masuk', 'Catatan']);
  var baris = cariAkun(nama);
  if (baris) {
    // Nama sudah terdaftar: jangan menimpa PIN murid lain. Permainan akan
    // mencoba masuk dengan PIN yang diketik, dan PIN yang salah ditolak.
    return { ok: false, sudahAda: true, error: 'Nama sudah terdaftar.' };
  }
  var garam = garamBaru();
  s.appendRow([nama, kelas, sha256(garam + pin), garam, now(), now(), '']);
  return { ok: true, nama: nama, kelas: kelas };
}

function masuk(isi) {
  var nama = String(isi.nama || '').trim();
  var pin = String(isi.pin || '').trim();
  var s = lembar(TAB_AKUN, ['Nama', 'Kelas', 'PIN (hash)', 'Garam', 'Dibuat', 'Terakhir masuk', 'Catatan']);
  var baris = cariAkun(nama);
  if (!baris) return { ok: false, error: 'Nama belum terdaftar.' };
  var isiBaris = s.getRange(baris, 1, 1, 6).getValues()[0];
  if (!samaPersis(isiBaris[2], sha256(isiBaris[3] + pin))) {
    return { ok: false, error: 'PIN tidak cocok.' };
  }
  s.getRange(baris, 6).setValue(now());
  return { ok: true, nama: nama, kelas: isiBaris[1] };
}

/* ------------------------------------------------------- nilai per bab */

/**
 * Satu baris = satu ujian bab. Baris baru DITAMBAH (bukan ditimpa) supaya
 * riwayat percobaan utuh; yang lebih rendah dari yang sudah tercatat ditandai
 * "diperbaiki (nilai lebih tinggi)" dan tidak menurunkan nilai murid.
 */
function tulisNilai(isi) {
  var nama = String(isi.nama || '').trim();
  var pin = String(isi.pin || '').trim();
  var akun = cekPin(nama, pin);
  if (!akun.ok) return akun;

  var nilai = Number(isi.nilai) || 0;
  // Aturan sekolah: nilai bab di bawah 80% tidak dicatat. Dijaga di sini juga,
  // bukan hanya di peramban, supaya tidak bisa dilangkahi dari konsol.
  if (nilai < BATAS_LULUS) return { ok: false, ditolak: true, error: 'Nilai di bawah ' + BATAS_LULUS + '%.' };

  var s = lembar(TAB_NILAI, ['Nama', 'Kelas', 'Bab', 'Judul bab', 'Nilai', 'Benar', 'Jumlah soal', 'Waktu kirim', 'Keterangan']);
  var bab = String(isi.bab || '');
  var ket = 'lulus';

  // Nilai terbaik dipertahankan: kalau sudah ada yang lebih tinggi, baris ini
  // tetap ditulis sebagai riwayat tetapi diberi keterangan.
  var terbaik = terbaikUntuk(s, nama, bab);
  if (terbaik !== null && nilai < terbaik) ket = 'diulang (nilai terbaik tetap ' + terbaik + ')';
  else if (terbaik !== null && nilai > terbaik) ket = 'diperbaiki (nilai lebih tinggi)';

  s.appendRow([nama, akun.kelas, bab, String(isi.judul || ''), nilai,
    Number(isi.benar) || 0, Number(isi.jumlah) || 0, now(), ket]);
  // Rekap disegarkan otomatis. Dibungkus try: rekap yang gagal tidak boleh
  // membuat nilai yang sudah tersimpan dilaporkan gagal ke murid.
  try { rekapSemua(); } catch (err) {}
  return { ok: true, nilai: nilai, keterangan: ket };
}

function cekPin(nama, pin) {
  if (!nama || !pin) return { ok: false, error: 'Nama/PIN kosong.' };
  var s = lembar(TAB_AKUN, ['Nama', 'Kelas', 'PIN (hash)', 'Garam', 'Dibuat', 'Terakhir masuk', 'Catatan']);
  var baris = cariAkun(nama);
  if (!baris) return { ok: false, error: 'Nama belum terdaftar.' };
  var isiBaris = s.getRange(baris, 1, 1, 6).getValues()[0];
  if (!samaPersis(isiBaris[2], sha256(isiBaris[3] + pin))) return { ok: false, error: 'PIN tidak cocok.' };
  return { ok: true, nama: nama, kelas: isiBaris[1] };
}

/** Nilai tertinggi yang sudah tercatat untuk (nama, bab), atau null. */
function terbaikUntuk(s, nama, bab) {
  var akhir = s.getLastRow();
  if (akhir < 2) return null;
  var isi = s.getRange(2, 1, akhir - 1, 5).getValues();
  var terbaik = null;
  for (var i = 0; i < isi.length; i++) {
    if (samaPersis(isi[i][0], nama) && samaPersis(isi[i][2], bab)) {
      var n = Number(isi[i][4]) || 0;
      if (terbaik === null || n > terbaik) terbaik = n;
    }
  }
  return terbaik;
}

/* ------------------------------------------- remedial & pengayaan Tasoro */

/**
 * Satu baris = satu percobaan remedial/pengayaan.
 *
 * Bedanya dengan `Nilai` sengaja dibuat jelas:
 *   - yang GAGAL pun ditulis (itulah gunanya remedial bagi guru);
 *   - tabnya sendiri, jadi tidak pernah tercampur nilai sekolah;
 *   - rincian per bab ikut ditulis sebagai teks di kolom terakhir, karena
 *     guru perlu tahu bab mana yang merah tanpa membuka permainan murid.
 */
function tulisJalur(isi) {
  var nama = String(isi.nama || '').trim();
  var pin = String(isi.pin || '').trim();
  var akun = cekPin(nama, pin);
  if (!akun.ok) return akun;

  var jalur = String(isi.jalur || '');
  if (jalur !== 'remedial' && jalur !== 'pengayaan') {
    return { ok: false, error: 'Jalur tidak dikenal: ' + jalur };
  }

  var s = lembar(TAB_REMEDIAL, ['Nama', 'Kelas', 'Jalur', 'Nilai', 'Benar', 'Jumlah soal',
    'Lulus', 'Rincian per bab', 'Waktu kirim']);
  var nilai = Number(isi.nilai) || 0;
  var benar = Number(isi.benar) || 0;
  var jumlah = Number(isi.jumlah) || 0;
  var lulus = nilai >= BATAS_LULUS;

  s.appendRow([nama, akun.kelas, jalur, nilai, benar, jumlah,
    lulus ? 'LULUS' : 'belum lulus', rincianTeks(isi.perBab), now()]);
  try { rekapSemua(); } catch (err) {}
  return { ok: true, jalur: jalur, nilai: nilai, lulus: lulus };
}

/** { 'x-wahyu': [9,10] } -> "x-wahyu 9/10 · x-nuzul 8/10". */
function rincianTeks(perBab) {
  if (!perBab) return '';
  var bagian = [];
  for (var id in perBab) {
    if (!Object.prototype.hasOwnProperty.call(perBab, id)) continue;
    var v = perBab[id] || [0, 0];
    bagian.push(id + ' ' + v[0] + '/' + v[1]);
  }
  return bagian.join(' · ');
}

/* ------------------------------------------------- rekap nilai berjejer */

/**
 * Lembar `Rekap Nilai`: SATU BARIS PER MURID, satu KOLOM PER UJIAN, sehingga
 * nilai berjejer ke samping seperti yang diminta guru ("ahmad 90 90 90 87 80").
 *
 * Sumbernya tiga tab lain, dibaca ulang setiap kali dipanggil — jadi rekap
 * tidak pernah basi. Baris pertama dibekukan (nama + kelas tetap terlihat saat
 * menggeser ke kanan), dan nilai yang lulus diwarnai hijau supaya yang belum
 * tuntas langsung terlihat.
 *
 * Dipanggil: (a) otomatis setiap kali ada nilai/jalur baru masuk, dan
 *            (b) manual lewat menu "Lembah Ilmu -> Segarkan Rekap"
 *                atau dengan membuka URL /exec?aksi=rekap.
 */
function rekapSemua() {
  var buku = ss();
  var s = buku.getSheetByName(LEMBAR_REKAP) || buku.insertSheet(LEMBAR_REKAP);

  var akun = bacaAkun();
  var ujian = bacaNilaiPerBab();          // [{ nama, bab, judul, nilai }]
  var jalur = bacaJalur();                // [{ nama, jalur, nilai }]
  if (!akun.length) return 0;

  // ---- kolom: satu per bab (urut kurikulum), lalu remedial & pengayaan
  var urutBab = kolomBab(ujian);
  var judulKolom = ['Nama', 'Kelas'];
  var nilaiTerbaik = {};                  // nama|kolom -> nilai tertinggi
  urutBab.forEach(function (b) {
    judulKolom.push(b.judul);
    ujian.forEach(function (u) {
      if (u.bab !== b.id) return;
      var k = u.nama + '|' + b.id;
      if (!(k in nilaiTerbaik) || u.nilai > nilaiTerbaik[k]) nilaiTerbaik[k] = u.nilai;
    });
  });
  var kolomJalur = [
    { id: 'remedial', judul: 'Remedial (dari 50)' },
    { id: 'pengayaan', judul: 'Pengayaan (dari 50)' },
  ];
  kolomJalur.forEach(function (j) {
    judulKolom.push(j.judul);
    jalur.forEach(function (x) {
      if (x.jalur !== j.id) return;
      var k = x.nama + '|' + j.id;
      if (!(k in nilaiTerbaik) || x.nilai > nilaiTerbaik[k]) nilaiTerbaik[k] = x.nilai;
    });
  });

  // ---- isi: satu baris per murid, nilai berjejer ke samping
  var baris = [judulKolom];
  akun.forEach(function (a) {
    var r = [a.nama, a.kelas];
    urutBab.forEach(function (b) {
      var k = a.nama + '|' + b.id;
      r.push(k in nilaiTerbaik ? nilaiTerbaik[k] : '');
    });
    kolomJalur.forEach(function (j) {
      var k = a.nama + '|' + j.id;
      r.push(k in nilaiTerbaik ? nilaiTerbaik[k] : '');
    });
    baris.push(r);
  });

  // Tulis ulang dari kiri atas. Lembar ini murni hasil hitungan, jadi aman
  // dikosongkan setiap kali; tidak ada yang diketik manual di sini.
  s.clear();
  s.getRange(1, 1, baris.length, judulKolom.length).setValues(baris);
  s.getRange(1, 1, 1, judulKolom.length).setFontWeight('bold').setBackground('#e8efe4');
  s.setFrozenRows(1);
  s.setFrozenColumns(2);

  // Warna: hijau = tuntas (>= 80), merah muda = belum.
  // `getRange` menolak jumlah baris 0, jadi lembar yang baru berisi judul
  // (mis. belum ada satu nilai pun) dilewati saja.
  if (baris.length > 1 && judulKolom.length > 2) {
    var data = s.getRange(2, 3, baris.length - 1, judulKolom.length - 2);
    var aturan = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThanOrEqualTo(BATAS_LULUS)
      .setBackground('#d9ead3')
      .setRanges([data])
      .build();
    var aturan2 = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(BATAS_LULUS)
      .setBackground('#fce5cd')
      .setRanges([data])
      .build();
    var lama = s.getConditionalFormatRules();
    s.setConditionalFormatRules([aturan, aturan2].concat(lama.filter(function (r) {
      // Buang aturan lama pada rentang yang sama supaya tidak menumpuk.
      var g = r.getRanges()[0];
      return !(g && g.getSheet().getName() === s.getName());
    })));
  }
  return baris.length - 1;
}

function bacaAkun() {
  var s = lembar(TAB_AKUN, ['Nama', 'Kelas']);
  var akhir = s.getLastRow();
  if (akhir < 2) return [];
  return s.getRange(2, 1, akhir - 1, 2).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) { return { nama: String(r[0]).trim(), kelas: String(r[1] || '').trim() }; });
}

function bacaNilaiPerBab() {
  var s = ss().getSheetByName(TAB_NILAI);
  if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 5).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return { nama: String(r[0]).trim(), bab: String(r[2] || '').trim(),
               judul: String(r[3] || '').trim(), nilai: Number(r[4]) || 0 };
    });
}

function bacaJalur() {
  var s = ss().getSheetByName(TAB_REMEDIAL);
  if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 4).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return { nama: String(r[0]).trim(), jalur: String(r[2] || '').trim(), nilai: Number(r[3]) || 0 };
    });
}

/**
 * Urutan kolom bab: mengikuti urutan kemunculan pertama di tab `Nilai`, yang
 * ditulis game sesuai urutan kurikulum (bab I dulu, lalu II, dst).
 */
function kolomBab(ujian) {
  var keluar = [];
  var sudah = {};
  ujian.forEach(function (u) {
    if (sudah[u.bab]) return;
    sudah[u.bab] = true;
    keluar.push({ id: u.bab, judul: u.judul || u.bab });
  });
  return keluar;
}

/* ------------------------------------------------------------ menu guru */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Lembah Ilmu')
    .addItem('Segarkan Rekap', 'menuRekap')
    .addItem('Pasang judul kolom Remedial', 'siapkanRemedial')
    .addToUi();
}

function menuRekap() {
  var n = rekapSemua();
  SpreadsheetApp.getActiveSpreadsheet().toast(n + ' murid ditulis ke lembar "' + LEMBAR_REKAP + '".', 'Rekap', 5);
}

function siapkanRemedial() {
  lembar(TAB_REMEDIAL, ['Nama', 'Kelas', 'Jalur', 'Nilai', 'Benar', 'Jumlah soal',
    'Lulus', 'Rincian per bab', 'Waktu kirim']);
  SpreadsheetApp.getActiveSpreadsheet().toast('Tab Remedial siap.', 'Lembah Ilmu', 5);
}
