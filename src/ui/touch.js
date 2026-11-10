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
// 4. Bisa dimatikan dari Pengaturan, dan pilihannya diingat. Ada dua alasan
//    nyata: sebagian ponsel salah melaporkan dirinya sebagai layar sentuh
//    (tombol muncul di laptop dan menutupi layar), dan sebagian murid memakai
//    papan ketik Bluetooth di tablet sehingga tombolnya hanya menghalangi.

import { pressAction, pressActionKode, mouse } from '../core/input.js';

const GAYA = `
.lk-touch { position: fixed; inset: 0; pointer-events: none; z-index: 40;
  /* Tinggi HUD yang terlihat (logis x skala pandangan), diisi ukuranHud().
     Dipakai supaya D-pad dan tombol aksi tidak pernah menimpa hotbar: hotbar
     setinggi 40 px + 12 px jarak bawah, dan tombol butuh ruang di atasnya. */
  --lk-hud-b: 88px; --lk-hud-r: 12px;
  /* Jarak dari dasar layar untuk kluster kanan dan D-pad, diisi ukuranHud().
     Kluster kanan hanya turun ke 10 px kalau tidak menimpa hotbar; kalau
     menimpa, ia tetap 4 px di atas panel hotbar (lewat --lk-hud-b). */
  --lk-kanan-b: 10px; --lk-kiri-b: 8px;
  /* Diisi ukuranHud(): TITIK TENGAH panel gold dari atas layar (bukan tepi
     bawahnya) — tombol digeser setengah tingginya sendiri supaya benar-benar
     sebaris dengan panel. */
  --lk-gold-b: 28px; --lk-gold-kiri: 100px;
  font-family: "VT323", monospace; -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent; }
.lk-touch[hidden] { display: none; }
.lk-touch .kelompok { position: fixed; display: grid; gap: 6px; pointer-events: none; }
/* D-pad di kiri bawah — tempat jempol kiri beristirahat, di ATAS hotbar kanvas
   (hotbar itu bisa diketuk, jadi tidak boleh tertutup). */
/* Jarak 2 px (bukan 6 px seperti kluster kanan): empat tombol arah dibaca mata
   sebagai SATU pad, dan jempol tidak perlu menggeser jauh antar tombol. */
.lk-touch .kiri { left: 10px; bottom: var(--lk-kiri-b); gap: 2px;
  grid-template-columns: repeat(3, clamp(38px, 11vw, 52px));
  grid-template-rows: repeat(3, clamp(38px, 11vw, 52px)); }

/* ---------------------------------------------------------------- kiri atas
   Duduk di sebelah KIRI tombol power (yang berupa elemen HTML tersendiri,
   lihat ui/tombolKeluar.js). Jaraknya menyisakan tempat 40 px untuk power +
   8 px celah, jadi keduanya berjajar rapi tanpa saling menempel.
   Koordinatnya dikirim ukuranHud() lewat --lk-gold-b dan --lk-gold-kiri. */
.lk-touch .matikan { right: calc(var(--lk-gold-kiri) + 48px); top: var(--lk-gold-b);
  transform: translateY(-50%);
  grid-auto-flow: column; grid-auto-columns: 36px; grid-auto-rows: 36px; }
.lk-touch .matikan .tombol { border-radius: 8px; }

/* --------------------------------------------------------------- kanan bawah
   E besar di pojok, dikelilingi tombol kecil. Bentuknya grid 3x3 dengan E di
   tengah-bawah (kolom 3, baris 2-3) supaya sudut kanan bawah tetap milik E.
   Lari di atas E, Esc di kirinya, Nilai di pojok kiri-atas, Ujian di atas
   Lari, dan alat maju/mundur di baris paling bawah. */
.lk-touch .kanan {
  right: 10px; bottom: var(--lk-kanan-b);
  grid-template-columns: repeat(3, clamp(42px, 12vw, 56px));
  grid-template-rows: repeat(3, clamp(42px, 12vw, 56px));
}
.lk-touch .kanan .tombol.e { grid-column: 3; grid-row: 2 / span 2;
  font-size: clamp(22px, 7vw, 30px); }
/* Baris paling ATAS: tombol alat (◀ ▶) lalu Lari. Alat ditaruh di atas karena
   itu yang paling sering dipakai; E besar di bawahnya, di pojok. */
.lk-touch .kanan .tombol.alat-mundur { grid-column: 1; grid-row: 1; }
.lk-touch .kanan .tombol.alat-maju { grid-column: 2; grid-row: 1; }
.lk-touch .kanan .tombol.lari { grid-column: 3; grid-row: 1; }
/* Baris tengah: Nilai dan Ujian (jarang dipakai, jadi paling jauh dari jempol). */
.lk-touch .kanan .tombol.nilai { grid-column: 1; grid-row: 2; }
.lk-touch .kanan .tombol.ujian { grid-column: 2; grid-row: 2; }
/* Baris bawah: Esc melebar dua kolom — tombol yang perlu dicari cepat tapi
   tidak boleh sebesar E. Inventori tidak ada di sini: ia sudah pindah ke
   sebelah tombol power di kiri atas. */
.lk-touch .kanan .tombol.esc { grid-column: 1 / span 2; grid-row: 3; }
.lk-touch .tombol { pointer-events: auto; touch-action: none; border: 2px solid rgba(122, 74, 34, .62);
  background: rgba(245, 230, 200, .58); color: rgba(58, 42, 42, .92); border-radius: 10px;
  font: 20px/1 "VT323", monospace; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 0 rgba(58, 42, 42, .18); }
.lk-touch .tombol:active, .lk-touch .tombol.aktif { background: rgba(255, 243, 214, .86); }
.lk-touch .tombol.besar { font-size: clamp(13px, 3.6vw, 17px); }
.lk-touch .tombol.e { background: rgba(255, 226, 168, .68); }
.lk-touch .tombol.e:active, .lk-touch .tombol.e.aktif { background: rgba(255, 236, 190, .9); }
.lk-touch .tombol.pilih { font-size: clamp(11px, 3vw, 15px); }
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
@media (max-height: 470px) {
  /* Ponsel mendatar tipis (390 px): E tetap paling besar, sisanya mengecil
     supaya kluster kanan tidak menutupi hotbar maupun dunia. */
  .lk-touch .kanan { grid-template-columns: repeat(3, 44px); grid-template-rows: repeat(3, 44px); gap: 4px; }
  .lk-touch .matikan { grid-auto-columns: 30px; grid-auto-rows: 30px;
    right: calc(var(--lk-gold-kiri) + 42px); }
  .lk-touch .tombol { font-size: 17px; }
  .lk-touch .tombol.besar, .lk-touch .tombol.pilih { font-size: 12px; }
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
/**
 * Kluster kanan bawah: E besar di pojok, tombol kecil mengelilinginya.
 *
 * Kelas CSS `e`, `lari`, `esc`, `inv`, `nilai`, `ujian`, `alat-maju`,
 * `alat-mundur` menentukan POSISI di grid 3x3 (lihat GAYA). Urutan array tidak
 * menentukan tempat, hanya rumah bagi nama — jadi menambah tombol baru tidak
 * akan menggeser E.
 *
 * Catatan: "Nilai" (V) dan "Ujian" (T) hanya ada di papan ketik. Tanpa
 * tombolnya, guru yang membuka game dari ponsel tidak bisa melihat nilai yang
 * terkirim sama sekali.
 */
const KANAN = [
  ['E', 'interact', 'e'],
  ['Lari', 'run', 'besar lari'],
  ['Esc', 'menu', 'besar esc'],
  ['Nilai', 'KeyV', 'pilih nilai'],
  ['Ujian', 'KeyT', 'pilih ujian'],
  ['◀', 'prevTool', 'pilih alat-mundur'],
  ['▶', 'nextTool', 'pilih alat-maju'],
];

/**
 * Kluster kiri atas: inventori saja, di kiri panel gold.
 *
 * Tombol power DULU di sini, tetapi ia dipindah ke ui/tombolKeluar.js karena
 * harus muncul juga di komputer — sedangkan lapisan ini disembunyikan di
 * komputer. Satu tombol keluar untuk semua perangkat.
 */
const MATIKAN = [
  ['I', 'inventory', 'besar'],
];


/**
 * Pasang lapisan sentuh. Mengembalikan { tampil, sembunyikan } supaya
 * pengaturan bisa mematikan tombolnya kalau mengganggu layar.
 */
/** Aksi yang tidak berguna selagi layar modal terbuka (ujian, rak, menu). */
const SAAT_MODAL_DISEMBUNYIKAN = new Set([
  'inventory', 'run', 'prevTool', 'nextTool', 'KeyV', 'KeyT',
]);

/**
 * Preferensi pemain soal tombol sentuh. `null` berarti "ikuti perangkat".
 *
 * Disimpan di localStorage dan BUKAN di berkas simpanan permainan: pilihan ini
 * milik perangkat (ponsel ini punya tombol, komputer itu tidak), sedangkan
 * berkas simpanan berpindah bersama pemain.
 */
const KUNCI = 'lk_sentuh';

export function bacaPreferensiSentuh() {
  try {
    const v = localStorage.getItem(KUNCI);
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

function tulisPreferensiSentuh(v) {
  try { localStorage.setItem(KUNCI, v ? '1' : '0'); } catch { /* mode privat */ }
}

export function pasangSentuh({ onPetunjuk } = {}) {
  const media = window.matchMedia?.('(pointer: coarse)');
  // Deteksi perangkat hanya dipakai kalau pemain belum pernah memilih. Deteksi
  // ini tidak selalu benar (lihat keputusan 4 di kepala berkas), jadi hasilnya
  // harus bisa ditimpa — bukan dipaksakan.
  const terdeteksi = media ? media.matches : ('ontouchstart' in window);
  const pilihan = bacaPreferensiSentuh();
  let aktif = pilihan === null ? terdeteksi : pilihan;
  const gaya = document.createElement('style');
  gaya.id = 'lk-gaya-sentuh';   // dicari uji tata letak (tools/uji-sentuh.mjs)
  gaya.textContent = GAYA;
  document.head.append(gaya);

  const akar = document.createElement('div');
  akar.className = 'lk-touch';
  akar.hidden = !aktif;

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
  const matikan = document.createElement('div');
  matikan.className = 'kelompok matikan';
  MATIKAN.forEach((t) => buat(t, matikan));
  akar.append(kiri, kanan, matikan);
  document.body.append(akar);

  // Petunjuk TIDAK digambar sebagai elemen di sini: di layar 390 px ia menimpa
  // panel jam. Pemanggil menampilkannya lewat toast kanvas (`onPetunjuk`).
  if (aktif) setTimeout(() => onPetunjuk?.(), 1200);

  // Layar berpindah ke latar (panggilan masuk, aplikasi lain): lepaskan semua
  // tombol, kalau tidak pemain terus berjalan sendiri saat kembali.
  window.addEventListener('blur', () => akar.querySelectorAll('.tombol.aktif').forEach((b) => b.classList.remove('aktif')));

  let ringkasSekarang = null;

  return {
    /** Apakah tombolnya sedang tampil di layar. */
    get tampil() { return !akar.hidden; },

    /** Apakah perangkat ini memang punya layar sentuh (deteksi, bukan pilihan). */
    get perangkatSentuh() { return terdeteksi; },

    /**
     * Nama lama `tampil_(v)` diganti `aturTampil(v)`: nama berakhiran garis
     * bawah hanya dipakai untuk menandai variabel yang bertabrakan, bukan
     * untuk mengatur keadaan, dan mudah salah dibaca sebagai field `tampil`.
     *
     * Menyalakan/mematikan dari Pengaturan juga MENGINGAT pilihannya — kalau
     * tidak, tombol yang baru dimatikan muncul lagi setiap halaman dimuat
     * ulang dan pemain harus mematikannya terus-menerus.
     */
    aturTampil(v) {
      aktif = Boolean(v);
      akar.hidden = !aktif;
      tulisPreferensiSentuh(aktif);
      return aktif;
    },

    /**
     * Balikkan keadaan tombol. Inilah yang dipanggil baris Pengaturan.
     * Mengembalikan keadaan yang baru.
     */
    alihkan() {
      // Ukuran HUD tidak perlu dihitung ulang: variabel CSS-nya tetap terpasang
      // walau lapisan ini disembunyikan, dan main.js memperbaruinya setiap kali
      // ukuran layar berubah.
      return this.aturTampil(!this.tampil);
    },

    /** Hapus pilihan pemain; tombol kembali mengikuti deteksi perangkat. */
    ikutiPerangkat() {
      aktif = terdeteksi;
      akar.hidden = !aktif;
      try { localStorage.removeItem(KUNCI); } catch { /* mode privat */ }
      return aktif;
    },

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
    /**
     * Terima ukuran HUD yang terlihat (piksel layar) dan geser tombol.
     *
     * `hudBawah` = jarak dari bawah layar ke tepi ATAS panel hotbar.
     * `goldBawah` = jarak dari atas layar ke tepi BAWAH panel gold.
     * `goldKiri` = jarak dari tepi KANAN layar ke tepi KIRI panel gold.
     *
     * Panel gold digambar di kanvas, sedangkan tombol ini elemen HTML — jadi
     * posisinya harus dikirim dari main.js. Kalau tidak, tombol "sebelah kiri
     * panel gold" akan menebak-nebak dan meleset di layar yang berbeda.
     */
    ukuranHud({ w, h, hudBawah, goldBawah: gb, goldKiri: gk, kananBawah, kiriBawah } = {}) {
      if (h && hudBawah) akar.style.setProperty('--lk-hud-b', `${Math.round(hudBawah)}px`);
      else if (h && !hudBawah) akar.style.setProperty('--lk-hud-b', `${Math.round(h * 0.22 + 68)}px`);
      if (w) {
        akar.style.setProperty('--lk-hud-r', `${Math.round(w * 0.02)}px`);
        // Cadangan kalau pemanggil belum mengirim ukuran panel gold: 8 px tepi
        // + 150 px panel + 8 px jarak, seperti HUD di layar sempit.
        akar.style.setProperty('--lk-gold-kiri', `${Math.round(gk ?? (w - 158) + 8)}px`);
      }
      if (gb !== undefined) akar.style.setProperty('--lk-gold-b', `${Math.round(gb)}px`);
      if (kananBawah !== undefined) akar.style.setProperty('--lk-kanan-b', `${Math.round(kananBawah)}px`);
      if (kiriBawah !== undefined) akar.style.setProperty('--lk-kiri-b', `${Math.round(kiriBawah)}px`);
    },

    ringkas(on) {
      if (ringkasSekarang === on) return;
      ringkasSekarang = on;
      akar.querySelectorAll('[data-modal]').forEach((b) => b.classList.toggle('tersembunyi', on));
    },
    // Dipakai layar modal yang ingin menyembunyikan/menampilkan tanpa mengubah
    // pilihan pemain (mis. saat papan nilai dibuka).
    sembunyikan() { akar.hidden = true; },
    munculkan() { if (aktif) akar.hidden = false; },
  };
}
