// Jembatan antara game dan spreadsheet guru.
//
// Game tidak pernah berbicara langsung ke Google Sheets — tidak ada kredensial
// di peramban, dan tidak perlu. Semua permintaan lewat satu Web App Apps Script
// (`apps-script/Code.gs`) yang menulis ke tab `Akun` dan `Nilai`.
//
// Empat hal yang dijaga di sini:
//   1. Daftar/masuk hanya sekali per murid; identitas disimpan di peramban
//      supaya murid yang kembali tidak mengetik ulang nama, kelas, dan PIN.
//   2. Nilai ujian bab dikirim HANYA untuk bab yang lulus (aturan sekolah).
//   3. Kalau jaringan sekolah putus, nilai tidak hilang: ia masuk antrean di
//      peramban dan dikirim ulang saat game dibuka lagi.
//   4. Hasil remedial & pengayaan Ustadz Tasoro DIKIRIM, tetapi dengan penanda
//      `jalur` supaya Apps Script menuliskannya di tab `Remedial`, terpisah
//      dari `Nilai`. Hasil gagal pun ikut terkirim — justru itu gunanya
//      remedial bagi guru — sedangkan ujian bab tetap hanya yang lulus.

/**
 * URL Web App Apps Script (berakhiran /exec).
 *
 * Cara mengisinya ada di `apps-script/Code.gs` bagian atas dan di JALANKAN.md.
 * Selama masih kosong, game tetap bisa dimainkan: pendaftaran dan nilai
 * disimpan di peramban saja, dan nilai masuk antrean sampai URL ini diisi.
 */
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby_ZLO-5u7SdL6H6S_y3Zt3BYMFE3UtZe-TWvwAy2ivo9_ZUxo_Sdf7w-AePT_rHGfhmQ/exec';

/**
 * Alamat pengganti saat menguji, supaya berkas ini tidak perlu disunting lalu
 * dikembalikan. Kosong di permainan; hanya dipakai skrip uji dan halaman
 * percobaan guru yang ingin mencoba Web App sebelum mengisi URL tetap.
 */
let urlUji = '';
export function pasangUrlUji(url) { urlUji = String(url || ''); }
function urlAktif() { return urlUji || APPS_SCRIPT_URL; }

const KEY_MURID = 'lk_murid';
const KEY_ANTRE = 'lk_nilai_antre';
const PIN_MIN = 4;
const PIN_MAKS = 8;
const BATAS_LULUS = 80;

/* ------------------------------------------------------------------ keadaan */

/** Apakah spreadsheet sudah disambungkan. */
export function tersambung() {
  return !!urlAktif();
}

/** Identitas murid yang tersimpan di peramban ini, atau null. */
export function muridAktif() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY_MURID) || 'null');
    return d && d.nama ? d : null;
  } catch { return null; }
}

function simpanMurid(d) {
  try { localStorage.setItem(KEY_MURID, JSON.stringify(d)); } catch {}
}

export function lupakanMurid() {
  try { localStorage.removeItem(KEY_MURID); } catch {}
}

/**
 * Label kelas untuk spreadsheet: "X-G / X-7".
 *
 * Ditulis di sini, bukan diimpor dari save.js, supaya berkas ini tetap bisa
 * dipakai halaman pendaftaran (index.html) tanpa menarik seluruh modul game.
 */
const HURUF = 'ABCDEFGHIJKLMNO';
export function labelKelasMurid(tingkat, rombel) {
  if (!tingkat) return '';
  const huruf = HURUF[(rombel ?? 1) - 1] ?? 'A';
  return `${tingkat}-${huruf} / ${tingkat}-${rombel ?? 1}`;
}

/* ------------------------------------------------------------ pendaftaran */

/** Pesan kesalahan PIN, atau null kalau sah. */
export function periksaPin(pin) {
  const p = String(pin ?? '').trim();
  if (!p) return 'PIN belum diisi.';
  if (!/^[0-9]+$/.test(p)) return 'PIN hanya angka.';
  if (p.length < PIN_MIN) return `PIN minimal ${PIN_MIN} angka.`;
  if (p.length > PIN_MAKS) return `PIN maksimal ${PIN_MAKS} angka.`;
  return null;
}

/**
 * Kirim satu permintaan ke Web App.
 *
 * `Content-Type: text/plain` dipakai dengan sengaja: aplikasi Apps Script tidak
 * menjawab preflight OPTIONS, jadi `application/json` akan gagal di peramban
 * sebelum permintaan pertama pun terkirim. Isinya tetap JSON.
 */
async function panggil(payload) {
  if (!tersambung()) return { ok: false, offline: true, error: 'Spreadsheet belum disambungkan.' };
  try {
    const res = await fetch(urlAktif(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const teks = await res.text();
    try { return JSON.parse(teks); }
    catch { return { ok: false, error: 'Jawaban server tidak terbaca.' }; }
  } catch {
    return { ok: false, offline: true, error: 'Spreadsheet belum terjangkau dari perangkat ini. Periksa jaringan, lalu coba lagi.' };
  }
}

/**
 * Pintu yang sama, dibuka untuk modul lain.
 *
 * Obrolan (`src/systems/chat.js`) memakai Web App yang sama dengan nilai. Ia
 * tidak boleh menyalin sendiri cara memanggilnya: `Content-Type: text/plain`
 * di atas bukan pilihan gaya, melainkan syarat supaya permintaannya tidak
 * gugur di preflight OPTIONS yang tidak dijawab Apps Script. Kalau disalin,
 * salinan itu akan lupa alasannya dan suatu hari "dirapikan" jadi JSON.
 */
export { panggil as panggilServer };

/**
 * Daftarkan murid ke tab `Akun`.
 *
 * Kalau nama ternyata sudah terdaftar (mis. murid pindah peramban), permintaan
 * dilanjutkan sebagai "masuk" dengan PIN yang sama — murid tidak disuruh
 * mengarang nama lain hanya karena ia pernah mendaftar dari HP teman.
 */
export async function daftarMurid(nama, kelas, pin) {
  const salahPin = periksaPin(pin);
  if (salahPin) return { ok: false, error: salahPin };

  const murid = { nama: String(nama).trim(), kelas: String(kelas ?? '').trim(), pin: String(pin).trim() };

  if (!tersambung()) {
    // Tanpa sambungan: tetap boleh main, identitas disimpan supaya nanti
    // bisa didaftarkan otomatis saat nilai pertama dikirim.
    simpanMurid({ ...murid, terdaftar: false });
    return { ok: true, lokal: true, pesan: 'Belum tersambung ke spreadsheet — data disimpan di peramban.' };
  }

  let r = await panggil({ aksi: 'daftar', ...murid });
  if (!r.ok && r.sudahAda) {
    const m = await panggil({ aksi: 'masuk', nama: murid.nama, pin: murid.pin });
    if (m.ok) { simpanMurid({ ...murid, kelas: m.kelas || murid.kelas, terdaftar: true }); return { ok: true, masuk: true }; }
    return { ok: false, error: m.error ?? 'Nama sudah terdaftar dan PIN tidak cocok.' };
  }

  if (r.ok) simpanMurid({ ...murid, terdaftar: true });
  else if (r.offline) simpanMurid({ ...murid, terdaftar: false });
  return r;
}

/** Masuk dengan nama + PIN yang sudah pernah didaftarkan. */
export async function masukMurid(nama, pin) {
  const salahPin = periksaPin(pin);
  if (salahPin) return { ok: false, error: salahPin };
  const r = await panggil({ aksi: 'masuk', nama: String(nama).trim(), pin: String(pin).trim() });
  if (r.ok) simpanMurid({ nama: String(nama).trim(), kelas: r.kelas ?? '', pin: String(pin).trim(), terdaftar: true });
  return r;
}

/* ------------------------------------------------------------------- nilai */

function antre() {
  try { return JSON.parse(localStorage.getItem(KEY_ANTRE) || '[]'); } catch { return []; }
}

function tulisAntre(a) {
  try { localStorage.setItem(KEY_ANTRE, JSON.stringify(a.slice(-50))); } catch {}
}

/** Berapa nilai yang masih menunggu terkirim. */
export function jumlahAntre() { return antre().length; }

/**
 * Kirim hasil ujian ke tab `Nilai`.
 *
 * Nilai di bawah 80% TIDAK dikirim — bukan karena game malas, tetapi karena
 * sekolah hanya mencatat bab yang benar-benar tuntas. Hasil gagal tetap tampil
 * di layar murid dan boleh diulang kapan saja.
 */
export async function kirimNilai({ kitab, judul, benar, jumlah, nilai, kelas }) {
  const murid = muridAktif();
  if (!murid) return { ok: false, error: 'Murid belum terdaftar di peramban ini.' };
  if (!(Number(nilai) >= BATAS_LULUS)) {
    return { ok: false, ditolak: true, error: `Nilai ${nilai}% belum mencapai ${BATAS_LULUS}%.` };
  }

  const isi = {
    aksi: 'nilai',
    nama: murid.nama,
    pin: murid.pin,
    kelas: kelas ?? murid.kelas,
    bab: kitab,
    judul,
    nilai: Number(nilai),
    benar: Number(benar),
    jumlah: Number(jumlah),
  };

  if (!tersambung()) { tulisAntre([...antre(), isi]); return { ok: false, offline: true, antre: true }; }

  // Pendaftaran yang tertunda (mis. saat mendaftar jaringan mati) dikirim dulu;
  // tanpa baris di tab Akun, server akan menolak nilainya.
  if (murid.terdaftar === false) {
    const d = await panggil({ aksi: 'daftar', nama: murid.nama, kelas: murid.kelas, pin: murid.pin });
    if (d.ok || d.sudahAda) {
      const m = d.ok ? d : await panggil({ aksi: 'masuk', nama: murid.nama, pin: murid.pin });
      if (!m.ok) return { ok: false, error: m.error ?? 'Pendaftaran tertunda gagal.' };
      simpanMurid({ ...murid, terdaftar: true });
    }
  }

  const r = await panggil(isi);
  if (!r.ok && r.offline) { tulisAntre([...antre(), isi]); return { ...r, antre: true }; }
  // Nilai yang lebih rendah dari yang sudah tercatat bukan kegagalan: server
  // mempertahankan yang terbaik.
  return r;
}

/**
 * Kirim hasil ujian REMEDIAL atau PENGAYAAN ke tab `Remedial`.
 *
 * Sengaja dipisah dari `kirimNilai`, bukan ditambah satu parameter di sana.
 * `kirimNilai` punya aturan mati: yang di bawah 80% tidak dikirim. Aturan itu
 * milik ujian bab dan tidak boleh ikut longgar hanya karena ada fitur baru.
 * Di sini aturannya justru sebaliknya — SEMUA hasil dikirim, lulus maupun
 * tidak, karena guru perlu tahu bab mana yang belum dikuasai murid sebelum
 * remedial. Yang membedakan keduanya adalah medan `jalur`: server menulisnya
 * ke tab lain, jadi baris remedial tidak pernah tercampur nilai sekolah.
 *
 * `perBab` ikut dikirim (bukan hanya nilai akhir) supaya guru bisa melihat
 * bab mana yang merah tanpa harus membuka layar permainan murid.
 */
export async function kirimJalur({ jalur, judul, benar, jumlah, nilai, kelas, hari, perBab }) {
  const murid = muridAktif();
  if (!murid) return { ok: false, error: 'Murid belum terdaftar di peramban ini.' };

  // Rincian per bab dirampingkan ke bentuk pendek: { 'x-wahyu': [9, 10] }.
  // Tanpa ini isi permintaan membengkak oleh nama bab yang panjang dan tidak
  // ada gunanya bagi server.
  const rincian = {};
  for (const [id, v] of Object.entries(perBab ?? {})) {
    if (!v) continue;
    rincian[id] = [Number(v.benar) || 0, Number(v.jumlah) || 0];
  }

  const isi = {
    aksi: 'jalur',
    jalur,
    nama: murid.nama,
    pin: murid.pin,
    kelas: kelas ?? murid.kelas,
    bab: jalur,
    judul,
    nilai: Number(nilai),
    benar: Number(benar),
    jumlah: Number(jumlah),
    hari: hari ?? null,
    perBab: rincian,
  };

  if (!tersambung()) { tulisAntre([...antre(), isi]); return { ok: false, offline: true, antre: true }; }

  // Sama seperti kirimNilai: pendaftaran yang tertunda dikirim lebih dulu,
  // karena tanpa baris di tab Akun server akan menolak hasilnya.
  if (murid.terdaftar === false) {
    const d = await panggil({ aksi: 'daftar', nama: murid.nama, kelas: murid.kelas, pin: murid.pin });
    if (d.ok || d.sudahAda) {
      const m = d.ok ? d : await panggil({ aksi: 'masuk', nama: murid.nama, pin: murid.pin });
      if (!m.ok) return { ok: false, error: m.error ?? 'Pendaftaran tertunda gagal.' };
      simpanMurid({ ...murid, terdaftar: true });
    }
  }

  const r = await panggil(isi);
  // Untuk jalur ini TIDAK ADA penolakan yang sah: semua hasil boleh dicatat,
  // termasuk yang di bawah 80%. Jadi setiap kegagalan — jaringan putus MAUPUN
  // server yang belum mengenal aksi `jalur` (Apps Script belum diperbarui) —
  // disimpan ke antrean dan dicoba lagi nanti. Tanpa ini, hasil remedial murid
  // hilang begitu saja saat gurunya belum sempat deploy ulang.
  if (!r.ok) { tulisAntre([...antre(), isi]); return { ...r, antre: true }; }
  return r;
}

/**
 * Kirim ulang nilai yang tertinggal di antrean. Dipanggil saat game dibuka dan
 * saat murid membuka Rekap Belajar — tidak ada tombol khusus yang harus dicari.
 */
export async function kirimAntre() {
  const a = antre();
  if (!a.length || !tersambung() || !muridAktif()) return { terkirim: 0, sisa: a.length };
  const sisa = [];
  let terkirim = 0;
  for (const isi of a) {
    const r = await panggil(isi);
    if (r.ok) terkirim++;
    else if (r.offline) sisa.push(isi);
    // Ditolak karena di bawah batas/duplikat: dibuang, tidak perlu diulang.
  }
  tulisAntre(sisa);
  return { terkirim, sisa: sisa.length };
}
