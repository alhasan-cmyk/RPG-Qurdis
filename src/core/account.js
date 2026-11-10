// Akun pemain: satu username + PIN, dicatat di spreadsheet guru.
//
// PENTING — berkas ini TIDAK LAGI dipakai untuk mendaftar atau masuk.
//
// Versi sebelumnya mengirim permintaan ke `api/player/check`, `api/player/
// register`, dan `api/player/save`. Alamat itu hanya ada kalau game dijalankan
// dengan server Python bawaan proyek (`tools/serve.py`); di GitHub Pages ia
// selalu 404, dan karena `register()` gagal, pendaftaran berhenti sebelum
// Apps Script sempat dipanggil. Akibatnya murid melihat "Server tidak
// terhubung" dan tidak bisa membuat akun sama sekali.
//
// Sekarang pendaftaran, masuk, dan pengiriman nilai semuanya lewat satu pintu:
// Web App Apps Script di `nilai-api.js`. Berkas ini tinggal menyimpan dua hal
// yang masih dipakai permainan:
//   - `validate()`   aturan bentuk username (dipakai halaman depan dan di sini)
//   - `currentUsername()` nama terakhir di peramban ini, untuk mengisi kolom
//                     LANJUTKAN.
//
// `check`/`register`/`resume`/`push` sengaja DIBIARKAN sebagai no-op yang
// jujur: kalau ada kode lama yang masih memanggilnya, ia gagal dengan pesan
// jelas alih-alih menembak alamat yang tidak ada.

const KEY = 'lk_username';

export const RULE = 'Huruf dan angka saja, 3–16 karakter, tanpa spasi.';

/** Pesan kesalahan, atau null kalau bentuknya sah. Cerminan aturan di server. */
export function validate(name) {
  const u = (name ?? '').trim();
  if (!u) return 'Username belum diisi.';
  if (u.length < 3) return 'Username minimal 3 karakter.';
  if (u.length > 16) return 'Username maksimal 16 karakter.';
  if (!/^[A-Za-z0-9]+$/.test(u)) return 'Username hanya boleh huruf dan angka, tanpa spasi.';
  return null;
}

export function currentUsername() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function setUsername(u) {
  try { if (u) localStorage.setItem(KEY, u); else localStorage.removeItem(KEY); } catch {}
}

/**
 * Sisa dari versi yang memakai server. Selalu null sekarang: tidak ada server
 * yang menerbitkan kunci, dan simpanan tidak dikirim ke mana pun.
 */
export function sessionKey() {
  // Dulu diterbitkan server; sekarang tidak ada server yang menerbitkannya.
  return null;
}

/**
 * Tidak dipakai lagi. Keunikan nama diperiksa Apps Script saat MULAI ditekan
 * (jawaban `sudahAda`), bukan sambil mengetik.
 */
export async function check(username) {
  const err = validate(username);
  if (err) return { available: false, reason: err };
  return { available: true, reason: '', tidakDiperiksa: true };
}

/**
 * Tidak dipakai lagi — lihat catatan di atas. Pendaftaran lewat
 * `daftarMurid()` di nilai-api.js (tab `Akun`), bukan lewat server statis.
 */
export async function register(username) {
  setUsername(username);
  return { ok: false, tanpaServer: true, error: 'Pendaftaran dipindahkan ke spreadsheet guru (lihat daftarMurid).' };
}

/**
 * Tidak dipakai lagi. Masuk sekarang = PIN diperiksa `masukMurid()`; simpanan
 * permainan tinggal di peramban, tidak ada salinan di server untuk diambil.
 */
export async function resume(username) {
  return { ok: false, tanpaServer: true, error: 'Simpanan server tidak tersedia di GitHub Pages.' };
}

/**
 * Titipkan simpanan ke server. Sengaja tidak menunggu dan tidak melempar: game
 * sudah menulis ke localStorage lebih dulu, jadi kegagalan di sini berarti
 * "belum tersinkron", bukan "progres hilang".
 */
export function push() {
  // Tidak ada tujuan: `player/save` tidak dipasang di GitHub Pages. Simpanan
  // yang sebenarnya ada di localStorage (lihat save.js).
  return Promise.resolve({ ok: false, tanpaServer: true });
}
