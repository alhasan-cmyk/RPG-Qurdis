// Layar penuh (fullscreen) dan ajakan "Tambahkan ke Layar Utama".
//
// Kenapa dipisah dari ui/landscape.js: mengunci orientasi dan meminta layar
// penuh adalah dua hal berbeda. Orientasi selalu bisa dipaksa (kanvas diputar
// CSS), sedangkan layar penuh HANYA bisa diminta dari gestur pengguna — peramban
// menolak `requestFullscreen()` yang dipanggil sendiri saat halaman dimuat.
// Karena itu bentuknya tombol, bukan sesuatu yang "otomatis".
//
// Hasilnya di ponsel: bilah alamat dan tombol peramban hilang, layar bertambah
// tinggi beberapa puluh piksel, dan kunci orientasi jadi lebih andal di Android.
//
// Di iPhone, `requestFullscreen` TIDAK ADA di Safari. Satu-satunya cara layar
// penuh di sana adalah memasang game ke Layar Utama lewat Share -> "Tambahkan ke
// Layar Utama"; sesudah dipasang, halaman terbuka tanpa bilah alamat. Itulah
// sebabnya ada `pasangAjakanPasang()`.

const KUNCI_PILIHAN = 'lk_layar_penuh';
const KUNCI_AJAKAN = 'lk_ajakan_pasang';
const KELAS = {
  tombol: 'lk-layar-penuh',
  ajakan: 'lk-pasang-layar-utama',
};

/** Apakah peramban ini bisa masuk layar penuh sama sekali. */
export function bisaLayarPenuh() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
}

/** Apakah perangkat ini iOS/iPadOS (Safari di sana tidak punya fullscreen). */
export function iOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ menyamar sebagai macOS, jadi sentuhan ikut diperiksa.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

/** Apakah halaman sedang berjalan sebagai aplikasi terpasang (Layar Utama). */
export function terpasang() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || navigator.standalone === true;
}

/** Sedang layar penuh? */
export function sedangPenuh() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/**
 * Pilihan pemain diingat supaya pada kunjungan berikutnya game bisa menawarkan
 * satu ketukan "Lanjutkan layar penuh" — bukan memaksa, karena peramban tetap
 * menuntut gestur.
 */
export function ingatPilihan(aktif) {
  try { localStorage.setItem(KUNCI_PILIHAN, aktif ? '1' : '0'); } catch { /* mode privat */ }
}

export function pernahPenuh() {
  try { return localStorage.getItem(KUNCI_PILIHAN) === '1'; } catch { return false; }
}

/**
 * Minta layar penuh. HARUS dipanggil dari gestur pengguna (klik/sentuh).
 * Mengembalikan true kalau permintaannya diterima peramban.
 */
export async function masukPenuh() {
  const el = document.documentElement;
  if (!bisaLayarPenuh()) return false;
  try {
    if (el.requestFullscreen) {
      // `navigationUI: 'hide'` menyembunyikan bilah navigasi di Android; peramban
      // lama tidak mengenal opsi ini, jadi tanpa opsi dicoba ulang.
      await el.requestFullscreen({ navigationUI: 'hide' }).catch(() => el.requestFullscreen());
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    } else {
      await el.msRequestFullscreen();
    }
    ingatPilihan(true);
    return true;
  } catch {
    return false;
  }
}

/** Keluar dari layar penuh (juga saat pemain menekan Esc di peramban). */
export async function keluarPenuh() {
  if (!sedangPenuh()) return true;
  const keluar = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  try {
    await keluar?.call(document);
    return true;
  } catch {
    return false;
  }
}

/** Dipakai tombol ⛶ dan baris "Layar penuh" di Pengaturan. */
export async function alihkanPenuh() {
  if (sedangPenuh()) {
    await keluarPenuh();
    ingatPilihan(false);
    return false;
  }
  return masukPenuh();
}

/**
 * Tombol ⛶ di layar permainan.
 *
 * Ditampilkan hanya kalau memang berguna: peramban mendukung layar penuh dan
 * halaman belum berjalan sebagai aplikasi terpasang. Di desktop pun berguna
 * untuk jendela laptop yang pendek — bilah alamat yang hilang menambah ruang.
 */
export function pasangTombolLayarPenuh({ onUbah } = {}) {
  const sudah = document.getElementById('lk-tombol-penuh');
  if (sudah) return sudah.__lkTombol;
  if (!bisaLayarPenuh() || terpasang()) return null;

  if (!document.getElementById('lk-gaya-penuh')) {
    const s = document.createElement('style');
    s.id = 'lk-gaya-penuh';
    s.textContent = `
.${KELAS.tombol} {
  position: fixed; z-index: 70; right: 8px; top: 56px;
  width: 40px; height: 34px; padding: 0; cursor: pointer;
  font: 16px/1 "VT323", monospace; color: #3a2a2a;
  background: rgba(245, 230, 200, .9); border: 2px solid #7a4a22; border-radius: 8px;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent;
}
.${KELAS.tombol}:active { background: rgba(255, 243, 214, 1); }
/* Di layar tegak, kanvas diputar 90 derajat: pojok kanan-atas LAYAR adalah
   pojok kiri-atas gambar, tempat panel jam digambar. Tombol dipindah ke kiri
   bawah supaya tidak menutupi jam dan tidak bertabrakan dengan D-pad. */
html.lk-landscape-putar .${KELAS.tombol} { right: auto; left: 8px; top: auto; bottom: 8px; }
`;
    document.head.append(s);
  }

  const b = document.createElement('button');
  b.id = 'lk-tombol-penuh';
  b.type = 'button';
  b.className = KELAS.tombol;
  b.textContent = '⛶';
  b.title = 'Layar penuh';
  b.setAttribute('aria-label', 'Layar penuh');
  document.body.append(b);

  const segarkan = () => {
    const penuh = sedangPenuh();
    b.textContent = penuh ? '⤡' : '⛶';
    b.title = penuh ? 'Keluar layar penuh' : 'Layar penuh';
    b.setAttribute('aria-label', b.title);
  };

  b.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();   // jangan diteruskan sebagai klik kanvas
    await alihkanPenuh();
    segarkan();
    // Ukuran layar berubah saat bilah alamat hilang, tetapi event 'resize' tidak
    // selalu datang sesudah animasinya selesai — jadi dihitung ulang di sini.
    setTimeout(() => onUbah?.(), 300);
  });

  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(ev, () => { segarkan(); onUbah?.(); });
  }
  segarkan();

  const api = {
    tombol: b,
    segarkan,
    get tampil() { return b.style.display !== 'none'; },
    tampilkan(ya) { b.style.display = ya ? '' : 'none'; },
  };
  b.__lkTombol = api;
  return api;
}

/**
 * Ajakan memasang game ke Layar Utama — hanya iPhone/iPad yang belum terpasang,
 * karena di sana itulah satu-satunya cara mendapat layar penuh.
 *
 * Muncul paling banyak sekali per 24 jam, bisa ditutup, dan menghilang sendiri
 * setelah 15 detik supaya tidak menghalangi permainan.
 */
export function pasangAjakanPasang({ onTutup } = {}) {
  if (!iOS() || terpasang()) return null;
  try {
    const terakhir = Number(localStorage.getItem(KUNCI_AJAKAN) || 0);
    if (Date.now() - terakhir < 24 * 60 * 60 * 1000) return null;
    localStorage.setItem(KUNCI_AJAKAN, String(Date.now()));
  } catch { /* mode privat: tampil sekali per muat halaman */ }

  if (!document.getElementById('lk-gaya-ajakan')) {
    const s = document.createElement('style');
    s.id = 'lk-gaya-ajakan';
    s.textContent = `
.${KELAS.ajakan} {
  position: fixed; z-index: 95; left: 10px; right: 10px; bottom: 10px;
  padding: 12px 14px; border-radius: 12px; font-family: "VT323", monospace;
  font-size: 16px; line-height: 1.3; color: #f5e6c8;
  background: rgba(16, 12, 9, .96); border: 2px solid #7a4a22;
  display: flex; gap: 10px; align-items: flex-start;
}
.${KELAS.ajakan} button {
  margin-left: auto; flex: 0 0 auto; font: inherit; cursor: pointer;
  background: #f5e6c8; color: #3a2a2a; border: 2px solid #7a4a22; border-radius: 8px;
  padding: 4px 10px;
}
`;
    document.head.append(s);
  }

  const kartu = document.createElement('div');
  kartu.className = KELAS.ajakan;
  kartu.innerHTML = `
    <div>Ingin layar lebih lega? Ketuk <b>Bagikan</b> di Safari, lalu
      <b>Tambahkan ke Layar Utama</b> — game terbuka tanpa bilah alamat.</div>
    <button type="button" aria-label="Tutup">✕</button>`;
  document.body.append(kartu);

  const tutup = () => { kartu.remove(); onTutup?.(); };
  kartu.querySelector('button').addEventListener('click', tutup);
  setTimeout(tutup, 15000);

  return { kartu, tutup };
}
