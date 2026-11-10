// Tombol layar sentuh untuk ponsel dan tablet.
//
// Kenapa: seluruh game ini dirancang untuk papan ketik (WASD, E, I, Esc). Di
// ponsel tidak ada satu pun tombol itu, jadi tanpa lapisan ini game terbuka
// tetapi tidak bisa dimainkan. Lapisan ini sengaja TIPIS: ia hanya menerjemahkan
// sentuhan menjadi aksi yang sudah ada (`pressAction`), lalu permainan berjalan
// seperti biasa. Tidak ada aturan main yang diduplikasi di sini.
//
// Tiga keputusan yang penting:
//
// 1. Hanya muncul di layar sentuh. Di komputer, tombol ini tidak digambar sama
//    sekali — bukan disembunyikan dengan opacity — supaya tidak ada tombol
//    tak terlihat yang bisa tersentuh tanpa sengaja.
// 2. Digambar dengan elemen HTML, bukan di kanvas. Kanvas diperbesar 2-4x
//    (piksel besar), jadi teks tombol di kanvas akan ikut kabur; elemen HTML
//    tetap tajam di layar mana pun, dan ukurannya bisa diatur dalam piksel
//    perangkat sehingga cukup besar untuk jari.
// 3. `touch-action: none` + preventDefault: tanpa itu, menyeret jempol di atas
//    tombol akan menggulir halaman, dan tekan-lama memunculkan menu salin.

import { pressAction, pressActionKode, mouse } from '../core/input.js';

const GAYA = `
.lk-touch { position: fixed; inset: 0; pointer-events: none; z-index: 40;
  /* Tinggi HUD yang terlihat (logis x skala pandangan), diisi ukuranHud().
     Dipakai supaya D-pad dan tombol aksi tidak pernah menimpa hotbar: hotbar
     setinggi 40 px + 12 px jarak bawah, dan tombol butuh ruang di atasnya. */
  --lk-hud-b: 88px; --lk-hud-r: 12px;
  font-family: "VT323", monospace; -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent; }
.lk-touch[hidden] { display: none; }
.lk-touch .kelompok { position: fixed; display: grid; gap: 6px; pointer-events: none; }
/* D-pad di kiri bawah — tempat jempol kiri beristirahat, di ATAS hotbar kanvas
   (hotbar itu bisa diketuk, jadi tidak boleh tertutup). */
.lk-touch .kiri { left: 10px; bottom: 52px;
  grid-template-columns: repeat(3, 48px); grid-template-rows: repeat(3, 48px); }
/* Tombol aksi di atas D-pad, bukan di kanan bawah: sudut kanan bawah kanvas
   dipakai hotbar (9 slot alat), dan menaruh tombol di sana membuat alat tidak
   bisa dilihat sama sekali. */
.lk-touch .kanan { right: 10px; bottom: var(--lk-hud-b);
  grid-template-columns: repeat(2, 54px); grid-auto-rows: 44px; }
.lk-touch .tombol { pointer-events: auto; touch-action: none; border: 2px solid #7a4a22;
  background: rgba(245, 230, 200, .86); color: #3a2a2a; border-radius: 10px;
  font: 20px/1 "VT323", monospace; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 0 rgba(58, 42, 42, .35); }
.lk-touch .tombol:active, .lk-touch .tombol.aktif { background: rgba(255, 243, 214, .98); transform: translateY(1px); }
.lk-touch .tombol.besar { font-size: 17px; }
.lk-touch .tombol.e { background: rgba(255, 226, 168, .96); font-size: 24px; }
.lk-touch .tombol.pilih { font-size: 15px; }
.lk-touch .tombol.kosong { visibility: hidden; }
.lk-touch .tombol.tersembunyi { display: none; }
/* Hotbar kanvas sendiri bisa diketuk (lihat pilihAlatDariKetuk di main.js),
   jadi tidak ada baris tombol angka tiruan di sini — baris tiruan hanya
   menutupi ikon alat yang sedang dipegang. */
.lk-touch .petunjuk { position: fixed; left: 50%; top: 4px; transform: translateX(-50%);
  pointer-events: none; color: #f5e6c8; background: rgba(26, 20, 16, .6);
  padding: 1px 8px; border-radius: 8px; font-size: 14px; opacity: .9; }
/* Layar pendek (ponsel mendatar): tombol lebih kecil dan lebih rapat. Ambang
   tinggi memakai piksel LAYAR (bukan logis), jadi tetap benar walau skala
   pandangan berubah. */
@media (max-height: 560px) {
  .lk-touch .kiri { grid-template-columns: repeat(3, 42px); grid-template-rows: repeat(3, 42px); }
  .lk-touch .kanan { grid-template-columns: repeat(2, 46px); grid-auto-rows: 36px; }
  .lk-touch .tombol { font-size: 18px; }
}
`;

/** Tombol: [label, aksi, kelas tambahan]. Urutan kiri = D-pad standar. */
const KIRI = [
  ['', '', 'kosong'],
  ['▲', 'up', ''],
  ['', '', 'kosong'],
  ['◀', 'left', ''],
  ['', '', 'kosong'],
  ['▶', 'right', ''],
  ['', '', 'kosong'],
  ['▼', 'down', ''],
  ['', '', 'kosong'],
];
const KANAN = [
  ['E', 'interact', 'e besar'],
  ['I', 'inventory', 'besar'],
  ['Lari', 'run', 'besar'],
  ['Esc', 'menu', 'besar'],
  ['◀ alat', 'prevTool', 'pilih'],
  ['alat ▶', 'nextTool', 'pilih'],
  // Dua tombol ini hanya ada di papan ketik (V = Nilai & Pengiriman, T = mulai
  // ujian dari layar hasil latihan). Tanpa tombolnya, guru yang membuka game dari
  // ponsel tidak bisa melihat nilai yang terkirim sama sekali.
  ['Nilai', 'KeyV', 'besar'],
  ['Ujian', 'KeyT', 'besar'],
];


/**
 * Pasang lapisan sentuh. Mengembalikan { tampil, sembunyikan } supaya
 * pengaturan bisa mematikan tombolnya kalau mengganggu layar.
 */
/** Aksi yang tidak berguna selagi layar modal terbuka (ujian, rak, menu). */
const SAAT_MODAL_DISEMBUNYIKAN = new Set([
  'inventory', 'run', 'prevTool', 'nextTool', 'KeyV', 'KeyT',
]);

export function pasangSentuh({ onPetunjuk } = {}) {
  const media = window.matchMedia?.('(pointer: coarse)');
  const sentuh = media ? media.matches : ('ontouchstart' in window);
  const gaya = document.createElement('style');
  gaya.textContent = GAYA;
  document.head.append(gaya);

  const akar = document.createElement('div');
  akar.className = 'lk-touch';
  akar.hidden = !sentuh;

  const buat = ([label, aksi, kelas], kelompok) => {
    const b = document.createElement('div');
    b.className = 'tombol ' + (kelas ?? '');
    if (SAAT_MODAL_DISEMBUNYIKAN.has(aksi)) b.dataset.modal = '1';
    b.textContent = label;
    if (!aksi) { kelompok.append(b); return; }
    // Tekan -> aksi mulai, lepas -> aksi berhenti. `pointerdown` dipakai, bukan
    // `touchstart`, karena ia juga menangani pena dan mouse di perangkat hibrida.
    const mulai = (e) => {
      e.preventDefault();
      b.classList.add('aktif');
      // Penahan pointer supaya jari yang bergeser sedikit tetap dihitung sebagai
      // tombol ini, bukan tombol sebelah. Dibungkus try: di sebagian peramban
      // (dan pada kejadian pointer sintetis di pengujian) panggilan ini melempar,
      // dan kalau tidak ditangkap seluruh penanganan tombol ikut batal.
      try { b.setPointerCapture?.(e.pointerId); } catch { /* abaikan */ }
      if (aksi.startsWith('Key')) pressActionKode(aksi);
      else pressAction(aksi, true);
    };
    const lepas = (e) => {
      e?.preventDefault?.();
      b.classList.remove('aktif');
      if (!aksi.startsWith('Key')) pressAction(aksi, false);
    };
    b.addEventListener('pointerdown', mulai);
    b.addEventListener('pointerup', lepas);
    b.addEventListener('pointercancel', lepas);
    b.addEventListener('pointerleave', (e) => { if (e.buttons === 0) lepas(e); });
    // Menu konteks tekan-lama (Simpan gambar/Cari) mengganggu saat bermain.
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    kelompok.append(b);
  };

  const kiri = document.createElement('div');
  kiri.className = 'kelompok kiri';
  KIRI.forEach((t) => buat(t, kiri));
  const kanan = document.createElement('div');
  kanan.className = 'kelompok kanan';
  KANAN.forEach((t) => buat(t, kanan));
  akar.append(kiri, kanan);
  document.body.append(akar);

  // Petunjuk TIDAK digambar sebagai elemen di sini: di layar 390 px ia menimpa
  // panel jam. Pemanggil menampilkannya lewat toast kanvas (`onPetunjuk`).
  if (sentuh) setTimeout(() => onPetunjuk?.(), 1200);

  // Layar berpindah ke latar (panggilan masuk, aplikasi lain): lepaskan semua
  // tombol, kalau tidak pemain terus berjalan sendiri saat kembali.
  window.addEventListener('blur', () => akar.querySelectorAll('.tombol.aktif').forEach((b) => b.classList.remove('aktif')));

  let ringkasSekarang = null;

  return {
    get tampil() { return !akar.hidden; },

    /**
     * Sembunyikan tombol yang tidak berguna saat layar modal terbuka (ujian,
     * rak perpustakaan, papan usaha, inventori). Yang tetap ada hanya tombol
     * arah dan E — dan itu memang satu-satunya yang dibutuhkan layar-layar itu.
     * Tanpa ini, di layar 390 px tombol "Nilai" dan "Ujian" menimpa pilihan
     * jawaban A/B/C.
     */
    /**
     * Terima ukuran HUD yang terlihat (piksel layar) dan geser tombol ke atas
     * hotbar. Tanpa ini, memperlebar pandangan bisa membuat hotbar bertabrakan
     * dengan tombol aksi — persis hal yang mau dihindari.
     */
    ukuranHud({ w, h } = {}) {
      if (h) akar.style.setProperty('--lk-hud-b', `${Math.round(h * 0.22 + 68)}px`);
      if (w) akar.style.setProperty('--lk-hud-r', `${Math.round(w * 0.02)}px`);
    },

    ringkas(on) {
      if (ringkasSekarang === on) return;
      ringkasSekarang = on;
      akar.querySelectorAll('[data-modal]').forEach((b) => b.classList.toggle('tersembunyi', on));
    },
    tampil_(v) { akar.hidden = !v; },
    sembunyikan() { akar.hidden = true; },
    munculkan() { akar.hidden = false; },
  };
}
