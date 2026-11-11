// Penanda mode debug.
//
// Dipisah jadi modul kecil dan bukan ditulis langsung di main.js karena satu
// hal yang mudah salah tanpa ketahuan: halaman depan (`index.html`) pindah ke
// `game.html` dengan `location.href`, jadi `?debug=1` yang diketik di halaman
// depan HILANG begitu pemain menekan "Main" — seluruh cheat mati tanpa
// penjelasan, dan yang tampak adalah "cheatnya tidak jalan".
//
// Karena itu penandanya disimpan di sessionStorage: bertahan selama TAB ini
// hidup, termasuk saat pindah halaman, dan hilang saat tab ditutup. Sengaja
// BUKAN localStorage: peramban sekolah dipakai bergantian, dan murid berikutnya
// tidak boleh mewarisi mode debug dari guru yang mengujinya kemarin.
export const KUNCI_DEBUG = 'lk_debug';

/**
 * Apakah mode debug hidup untuk halaman ini?
 *
 * @param {{search?: string}} lokasi  biasanya `location`
 * @param {Storage} sesi              biasanya `sessionStorage`
 *
 * `?debug=1` di alamat selalu menang dan sekaligus MENULIS penandanya, supaya
 * halaman berikutnya (game.html) tetap tahu. Alamat yang tidak menyebut debug
 * tetap bisa hidup kalau penandanya sudah ada dari halaman sebelumnya.
 *
 * Penyimpanan bisa dilarang (mode privat, kebijakan sekolah). Kalau begitu,
 * fungsi ini tidak boleh melempar: alamat tetap berlaku untuk halaman ini saja.
 */
export function modeDebug(lokasi = globalThis.location, sesi = globalThis.sessionStorage) {
  let dariAlamat = false;
  try { dariAlamat = String(lokasi?.search ?? '').includes('debug'); } catch (e) { dariAlamat = false; }
  try {
    if (dariAlamat) sesi?.setItem(KUNCI_DEBUG, '1');
    return dariAlamat || sesi?.getItem(KUNCI_DEBUG) === '1';
  } catch (e) {
    return dariAlamat;
  }
}
