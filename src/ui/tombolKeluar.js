// Tombol power: satu-satunya jalan keluar yang terlihat, untuk SEMUA perangkat.
//
// Kenapa berkas sendiri, bukan bagian dari lapisan tombol sentuh (ui/touch.js):
// lapisan itu disembunyikan di komputer, jadi tombol di dalamnya tidak akan
// pernah terlihat oleh pemain yang memakai mouse. Tombol ini harus ada di
// ponsel, tablet, dan laptop — satu bentuk, satu tempat, satu perilaku.
//
// Kenapa elemen HTML, bukan digambar di kanvas seperti HUD lain: tombol ini
// harus bisa diketuk walau kanvas sedang diputar 90° (ponsel tegak), dan ia
// harus tetap tajam di layar ber-piksel rapat. Sebagai elemen HTML ia tidak ikut
// diperbesar bersama kanvas dan tetap seukuran jari.
//
// Perilakunya SENGAJA hanya "tekan Esc": tidak ada logika keluar sendiri di
// sini. Semua yang terjadi sesudahnya — menu jeda terbuka, simpanan ditulis,
// pertanyaan konfirmasi — adalah jalur yang sama dengan tombol Esc di papan
// ketik. Kalau nanti aturan keluar berubah, ia berubah untuk keduanya sekaligus.
import { pressAction } from '../core/input.js';

const ID = 'lk-tombol-daya';

const GAYA = `
#${ID} {
  position: fixed; z-index: 70;
  width: 40px; height: 40px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; border: 2px solid #8a2c1d;
  background: rgba(248, 214, 206, .94); color: #8a2c1d;
  cursor: pointer; touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  /* "top" yang dikirim aturPosisi() adalah GARIS TENGAH panel gold, bukan
     tepi atas tombol — jadi tombolnya harus digeser setengah tingginya sendiri.
     Tanpa baris ini tombol 40 px menggantung 20 px di bawah angka gold, dan
     pemain melihatnya SEBAGAI "belum dinaikkan" berapa kali pun angka top
     diperkecil. Tombol inventori di ui/touch.js memakai aturan yang sama. */
  transform: translateY(-50%);
  box-shadow: 0 2px 0 rgba(58, 42, 42, .35);
}
/* Saat ditekan: isi tombol memekat, posisinya TIDAK bergeser — geseran 1 px
   akan menimpa translateY(-50%) di atas dan tombolnya melompat 20 px. */
#${ID}:active { background: rgba(255, 232, 224, 1); }
#${ID}[hidden] { display: none; }
/* Pertanyaan "Keluar?" sedang tampil: tombol power disembunyikan supaya tidak
   ada dua jalan keluar yang bisa ditekan bersamaan. Layar itu sendiri yang
   mengurus E/Esc. */
#${ID}.saat-tanya { display: none; }
@media (max-height: 470px) {
  #${ID} { width: 34px; height: 34px; }
}
`;

/** Ikon power digambar sebagai SVG: lingkaran terbuka + garis tegak. */
const IKON = `
<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
  <path d="M12 3.5v8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M7.2 6.6a7 7 0 1 0 9.6 0" fill="none" stroke="currentColor"
        stroke-width="2.6" stroke-linecap="round"/>
</svg>`;

/**
 * Pasang tombol power. Mengembalikan `{ aturPosisi, aturTampil, saatTanya, tampil }`.
 *
 * Posisi HARUS dikirim pemanggil lewat `aturPosisi`, karena tombol ini duduk di
 * sebelah panel gold yang digambar di kanvas — dan posisi panel itu berbeda di
 * tiap ukuran layar.
 *
 * SATU HAL YANG MUDAH SALAH: di ponsel tegak, kanvas diputar 90° oleh CSS
 * (ui/landscape.js). Tombol ini elemen HTML biasa — ia TIDAK ikut berputar.
 * Layar tegak 390x844 terlihat pemain sebagai 844x390 mendatar, dan pojok kiri
 * atas di layar itu adalah (0,0) layar tegak juga (titik (0,0) tetap di (0,0)
 * setelah diputar +90° — lihat TRANSFORM_PUTAR). Jadi koordinat mendatar boleh
 * dipakai apa adanya; yang berubah hanya sisi mana yang disebut "bawah".
 */
export function pasangTombolKeluar() {
  const sudah = document.getElementById(ID);
  if (sudah) return sudah.__lk;

  if (!document.getElementById('lk-gaya-daya')) {
    const s = document.createElement('style');
    s.id = 'lk-gaya-daya';
    s.textContent = GAYA;
    document.head.append(s);
  }

  const b = document.createElement('button');
  b.id = ID;
  b.type = 'button';
  b.title = 'Keluar / menu jeda';
  b.setAttribute('aria-label', 'Keluar ke menu jeda');
  b.innerHTML = IKON;

  let aktif = true;
  let saatTanya = false;
  const segarkan = () => { b.hidden = !aktif; b.classList.toggle('saat-tanya', saatTanya); };

  const tekan = (e) => {
    e.preventDefault();
    e.stopPropagation();            // jangan diteruskan sebagai klik kanvas
    if (!aktif || saatTanya) return;
    // Persis seperti menekan Esc: mulai lalu lepas, dalam satu ketukan.
    pressAction('menu', true);
    pressAction('menu', false);
  };
  b.addEventListener('click', tekan);
  // Tekan-lama di Android memunculkan menu konteks (Simpan gambar / Cari).
  b.addEventListener('contextmenu', (e) => e.preventDefault());

  document.body.append(b);

  const api = {
    get tampil() { return aktif; },
    /** Tampilkan/sembunyikan tombol (mis. dari Pengaturan). */
    aturTampil(v) { aktif = Boolean(v); segarkan(); return aktif; },
    /** Dipakai layar saat pertanyaan "Keluar?" muncul. */
    saatTanya(v) { saatTanya = Boolean(v); segarkan(); },
    /**
     * Tempelkan tombol di sebelah KIRI panel gold, sebaris tepi bawahnya.
     * Angka dalam piksel layar (bukan piksel kanvas).
     */
    /**
     * `goldBawah` = TITIK TENGAH vertikal panel gold diukur dari atas layar.
     * Nama lama dipertahankan supaya pemanggil tidak perlu diubah, tetapi
     * artinya sudah bergeser: dulu tepi bawah, sekarang garis tengah.
     */
    aturPosisi({ goldBawah = 24, goldKiri = 166 } = {}) {
      b.style.top = `${Math.round(goldBawah)}px`;
      b.style.right = `${Math.round(goldKiri)}px`;
    },
    elemen: b,
  };
  b.__lk = api;
  return api;
}
