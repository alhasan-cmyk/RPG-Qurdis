/**
 * APPS SCRIPT — OBROLAN KELAS (Lembah Ilmu)
 * =========================================
 *
 * Chat antar murid, SATU RUANG PER KELAS. Murid kelas X hanya melihat obrolan
 * kelas X; kelas XI dan XII tidak pernah tercampur.
 *
 * Cara pasang ada DUA, pilih salah satu:
 *
 *   A. Ditempel ke Code.gs (paling mudah, satu berkas)
 *      Salin SELURUH isi berkas ini ke BAGIAN PALING BAWAH `apps-script/Code.gs`,
 *      lalu Deploy -> Manage deployments -> Edit -> Version: New version.
 *      Jangan lupa: `doPost` di Code.gs harus meneruskan aksi `obrolan` dan
 *      `obrolanTulis` (lihat catatan di kepala Code.gs).
 *
 *   B. Berkas terpisah (kalau tidak mau menambah panjang Code.gs)
 *      Di editor Apps Script: File -> New -> Script, beri nama `Obrolan`,
 *      tempel isi berkas ini, Save, lalu deploy ulang seperti di atas.
 *      Apps Script menggabungkan semua berkas .gs dalam satu proyek, jadi
 *      fungsinya saling melihat tanpa `import`.
 *
 * KENAPA DI APPS SCRIPT
 *   GitHub Pages tidak bisa menerima POST sama sekali, jadi chat yang dulu
 *   direncanakan lewat `tools/serve.py` (berkas itu tidak pernah ada di repo)
 *   tidak mungkin hidup di alamat sekolah. Apps Script sudah dipakai nilai,
 *   jadi obrolan menumpang di situ: tidak perlu server sendiri.
 *
 * HARGA YANG DIBAYAR
 *   Apps Script bukan server real-time. Tiap pesan = satu permintaan HTTP, dan
 *   `obrolanAmbil` ditahan sebentar (maksimal BATAS_TAHAN_MS) sambil menunggu
 *   ada pesan baru, supaya tidak perlu bertanya terus-menerus. Hasilnya pesan
 *   sampai dalam ~1-2 detik, bukan seketika seperti WebSocket. Untuk kelas,
 *   itu cukup.
 *
 * ATURAN YANG DIJAGA DI SINI (bukan hanya di peramban)
 *   1. PIN diperiksa untuk SETIAP pesan. Tanpa ini siapa pun yang tahu nama
 *      temannya bisa menulis atas nama dia.
 *   2. Ruang ditentukan dari KELAS DI TAB `Akun`, bukan dari yang dikirim
 *      peramban. Murid tidak bisa menyelinap ke obrolan kelas lain dengan
 *      mengubah satu variabel di konsol.
 *   3. Hanya 30 baris terakhir yang disimpan per kelas. Baris tertua dihapus
 *      saat baris ke-31 masuk — persis seperti yang diminta.
 *   4. Pesan terlarang disaring di sini juga, bukan hanya di layar.
 *
 * Kalau `Code.gs` belum diperbarui (belum meneruskan aksi `obrolan`), chat
 * hanya akan bilang "belum siap" dan permainan tetap jalan seperti biasa.
 */

var TAB_OBROLAN = 'Obrolan';
var BARIS_OBROLAN = 30;            // maksimal 30 baris per kelas
var PANJANG_PESAN = 160;           // sama dengan MAX_LEN di src/ui/chat-ui.js
var JEDA_PESAN_MS = 1200;          // satu murid tidak bisa membanjiri ruang
var BATAS_TAHAN_MS = 9000;         // lama `obrolanAmbil` menunggu pesan baru
var JEDA_PANTAU_MS = 200;          // jarak antar-pemeriksaan saat menunggu

// Kolom `Ms` adalah waktu epoch (Date.now()) dan HANYA dipakai untuk pembatas
// jeda. Jam yang bisa dibaca manusia ada di `Waktu`, tetapi membandingkannya
// dengan Date.now() tidak bisa dipercaya: `Waktu` ditulis dalam zona waktu
// skrip (Asia/Jakarta), sedangkan Date.now() tidak mengenal zona — selisihnya
// bisa berjam-jam, sehingga pembatas jeda menolak pesan yang sebenarnya wajar
// atau justru meloloskan banjir pesan. Epoch tidak punya masalah itu.
var KOLOM_OBROLAN = ['Kelas', 'Waktu', 'Nama', 'Avatar', 'Pesan', 'Nomor', 'Ms'];

/**
 * Kata yang disensor. Dijaga pendek dan jelas — ini penyaring kasar, bukan
 * pengganti guru. Yang penting: pesan tidak pernah tersimpan dalam bentuk asli.
 */
var KATA_TERLARANG = ['anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'bajingan', 'kampret'];

/* ------------------------------------------------------------------ baca */

/**
 * Ambil pesan baru untuk kelas si pemanggil.
 *
 * `sejak` adalah nomor urut pesan terakhir yang sudah dilihat peramban. Balasan
 * selalu memuat nomor terakhir ruangan itu, sehingga peramban yang baru dibuka
 * (sejak = 0) langsung mendapat 30 baris terakhir — itulah "riwayat" yang
 * dimaksud, dan tidak ada lagi yang lebih tua dari itu karena sudah dihapus.
 */
function obrolanAmbil(isi) {
  var akun = cekPin(String(isi.nama || '').trim(), String(isi.pin || '').trim());
  if (!akun.ok) return akun;

  var kelas = kelasRuang(akun.kelas);
  if (!kelas) return { ok: false, error: 'Kelas belum tercatat. Chat hanya untuk murid yang kelasnya jelas.' };

  var sejak = Number(isi.sejak) || 0;
  // Lama menunggu boleh dipendekkan pemanggil (dipakai uji, dan berguna kalau
  // suatu saat layar ingin menjawab cepat), tetapi tidak boleh MELEBIHI batas.
  var tahan = isi.tunggu == null ? BATAS_TAHAN_MS
    : Math.max(0, Math.min(BATAS_TAHAN_MS, Number(isi.tunggu) || 0));
  var s = lembar(TAB_OBROLAN, KOLOM_OBROLAN);

  // Tunggu sebentar kalau belum ada yang baru. Ini yang membuat pesan terasa
  // "masuk sendiri" tanpa peramban bertanya tiap detik.
  var mulai = Date.now();
  var baris = bacaObrolan(s, kelas);
  while (tahan > 0 && !baris.some(function (b) { return b.no > sejak; }) && Date.now() - mulai < tahan) {
    Utilities.sleep(JEDA_PANTAU_MS);
    baris = bacaObrolan(s, kelas);
  }

  var pesan = baris
    .filter(function (b) { return b.no > sejak; })
    .map(function (b) {
      return { id: b.no, no: b.no, name: b.nama, avatar: b.avatar, text: b.pesan, jam: b.jam };
    });

  return { ok: true, kelas: kelas, pesan: pesan, terakhir: nomorTerakhir(baris), jumlah: baris.length };
}

/** Nomor pesan terakhir di satu ruang (0 kalau belum ada). */
function nomorTerakhir(baris) {
  var n = 0;
  for (var i = 0; i < baris.length; i++) if (baris[i].no > n) n = baris[i].no;
  return n;
}

/** Semua baris milik satu kelas, sudah diurutkan dari yang paling lama. */
function bacaObrolan(s, kelas) {
  var akhir = s.getLastRow();
  if (akhir < 2) return [];
  var isi = s.getRange(2, 1, akhir - 1, KOLOM_OBROLAN.length).getValues();
  var keluar = [];
  for (var i = 0; i < isi.length; i++) {
    var r = isi[i];
    if (!samaPersis(r[0], kelas)) continue;
    keluar.push({
      no: Number(r[5]) || 0,
      jam: String(r[1] || ''),
      nama: String(r[2] || ''),
      avatar: String(r[3] || ''),
      pesan: String(r[4] || ''),
      ms: Number(r[6]) || 0,
    });
  }
  keluar.sort(function (a, b) { return a.no - b.no; });
  return keluar;
}

/* ------------------------------------------------------------------ tulis */

/**
 * Kirim satu pesan.
 *
 * Urutannya sengaja begini: periksa PIN, tentukan kelas dari tab `Akun`, baru
 * menulis. Tidak ada satu pun nilai dari peramban yang dipakai untuk memutuskan
 * SIAPA penulisnya atau DI RUANG MANA ia menulis.
 */
function obrolanTulis(isi) {
  var akun = cekPin(String(isi.nama || '').trim(), String(isi.pin || '').trim());
  if (!akun.ok) return akun;

  var kelas = kelasRuang(akun.kelas);
  if (!kelas) return { ok: false, error: 'Kelas belum tercatat. Chat hanya untuk murid yang kelasnya jelas.' };

  var pesan = rapikanPesan(isi.pesan);
  if (!pesan) return { ok: false, error: 'Pesan kosong.' };
  if (pesan.length > PANJANG_PESAN) return { ok: false, error: 'Pesan maksimal ' + PANJANG_PESAN + ' karakter.' };

  var s = lembar(TAB_OBROLAN, KOLOM_OBROLAN);

  // Satu murid, satu pesan per JEDA_PESAN_MS. Tanpa ini, menekan Enter
  // berulang-ulang bisa menghapus seluruh obrolan kelas dalam hitungan detik.
  var baris = bacaObrolan(s, kelas);
  var terakhir = baris.length ? baris[baris.length - 1] : null;
  // `ms` nol berarti baris lama yang belum punya kolom ini: jangan dihukum.
  if (terakhir && terakhir.nama === akun.nama && terakhir.ms
      && Date.now() - terakhir.ms < JEDA_PESAN_MS) {
    return { ok: false, lambat: true, error: 'Pelan sedikit — tunggu sebentar sebelum menulis lagi.' };
  }

  var no = nomorTerakhir(baris) + 1;
  var avatar = String(isi.avatar || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24);
  s.appendRow([kelas, now(), akun.nama, avatar, pesan, no, Date.now()]);

  pangkasObrolan(s, kelas);
  return { ok: true, id: no, no: no, kelas: kelas, terakhir: no };
}

/**
 * Sisakan BARIS_OBROLAN baris terakhir untuk satu kelas.
 *
 * Dihapus dari ATAS (yang paling lama) satu per satu, bukan dengan menulis
 * ulang seluruh lembar: baris kelas lain tidak boleh terusik, dan urutan nomor
 * pesan tetap naik sehingga peramban tidak mengira ada pesan yang hilang.
 */
function pangkasObrolan(s, kelas) {
  var akhir = s.getLastRow();
  if (akhir < 2) return 0;
  var isi = s.getRange(2, 1, akhir - 1, KOLOM_OBROLAN.length).getValues();

  // Baris milik kelas ini, beserta nomor barisnya di lembar (1-based).
  var milik = [];
  for (var i = 0; i < isi.length; i++) {
    if (samaPersis(isi[i][0], kelas)) milik.push(i + 2);
  }
  var lebih = milik.length - BARIS_OBROLAN;
  if (lebih <= 0) return 0;

  // Dari yang PALING ATAS (paling lama). deleteRows menggeser baris di
  // bawahnya, jadi dihitung mundur supaya nomor baris yang belum dihapus tidak
  // bergeser di tengah jalan.
  for (var k = lebih - 1; k >= 0; k--) s.deleteRow(milik[k]);
  return lebih;
}

/* -------------------------------------------------------------- perkakas */

/**
 * "X-M / X-13" -> "X". Kelas disimpan di tab `Akun` dalam bentuk panjang
 * supaya guru bisa membedakan rombel; obrolan cukup tingkatannya, dan murid
 * satu tingkat boleh saling menyapa.
 */
function kelasRuang(kelas) {
  var teks = String(kelas || '').trim().toUpperCase();
  if (!teks) return '';
  var cocok = teks.match(/^(XII|XI|X)\b/);
  return cocok ? cocok[1] : teks.split(/[^A-Z0-9]+/)[0];
}

/** Spasi dirapikan, karakter kendali dibuang, kata terlarang disensor. */
function rapikanPesan(teks) {
  var t = String(teks == null ? '' : teks);
  t = t.replace(/[\u0000-\u001f\u007f]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  for (var i = 0; i < KATA_TERLARANG.length; i++) {
    var kata = KATA_TERLARANG[i];
    // Huruf pertama dibiarkan supaya bentuk kalimatnya masih terbaca, sisanya
    // diganti bintang SEBANYAK panjang kata dikurangi satu — bukan
    // `new Array(len).join('*')`, yang menghasilkan satu bintang terlalu
    // sedikit sehingga huruf terakhir ikut terbuang.
    var sensor = kata.charAt(0) + bintang(kata.length - 1);
    t = t.replace(new RegExp(kata, 'gi'), sensor);
  }
  return t;
}

function bintang(n) {
  var out = '';
  for (var i = 0; i < n; i++) out += '*';
  return out;
}

/**
 * Jalan pintas untuk guru: buka /exec?aksi=obrolan&kelas=X di peramban untuk
 * membaca obrolan satu kelas tanpa membuka spreadsheet. Tidak menulis apa pun.
 */
function obrolanGuru(kelas) {
  var k = kelasRuang(kelas);
  if (!k) return { ok: false, error: 'Kelas kosong.' };
  var baris = bacaObrolan(lembar(TAB_OBROLAN, KOLOM_OBROLAN), k);
  return { ok: true, kelas: k, jumlah: baris.length, batas: BARIS_OBROLAN, pesan: baris };
}
