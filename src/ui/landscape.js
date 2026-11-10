// Tampilan dipaksa mendatar (landscape) untuk semua permainan.
//
// Kenapa: game ini menggambar HUD, panel, dan hotbar dengan ukuran piksel yang
// tetap (hotbar selebar 9×34 px, panel 320-520 px, dst). Di layar tegak
// (portrait) lebar logisnya cuma ~390 px, jadi separuh panel keluar layar dan
// tombol hotbar bertumpuk. Menata ulang semua panel untuk portrait berarti
// menyentuh hampir setiap layar; memaksa mendatar cukup satu berkas.
//
// Caranya ada dua, dari yang paling andal:
//
// 1. `screen.orientation.lock('landscape')`. Andal dan tidak ada rotasi visual:
//    tata letak, sentuhan, dan ukuran kanvas semuanya tetap seperti biasa.
//    Hanya berjalan di peramban yang mengizinkannya, dan biasanya HANYA saat
//    sudah layar penuh (Android Chrome). Dipanggil dari gestur pengguna —
//    itu syarat peramban, bukan pilihan kita.
//
// 2. Kalau kunci orientasi tidak tersedia/ditolak (iOS Safari, dsb.), kanvas
//    diputar 90° dengan CSS lalu ukurannya ditukar. Ini menyelesaikan masalah
//    "banyak yang tidak kelihatan": pemain memutar ponselnya dan melihat
//    seluruh layar, bukan potongan.
//
// Nomor 2 dipakai sebagai jalan terakhir karena ia MENGUBAH arah masukan:
// sentuhan dan klik datang dalam koordinat layar tegak, sedangkan game berpikir
// dalam koordinat mendatar. Penerjemahannya ada di core/input.js (`keKanvas`),
// dan modul ini hanya menandai rotasinya lewat kelas `lk-landscape-putar`.

/**
 * Transformasi CSS untuk memutar kanvas 90° searah jarum jam (ponsel dimiringkan
 * ke kiri / landscape-primary). Urutannya berarti: putar dulu, lalu geser.
 * Pasangannya ada di core/input.js `keKanvas()`.
 */
export const TRANSFORM_PUTAR = 'translateX(100vw) rotate(90deg)';

const KELAS = {
  akar: 'lk-landscape',
  diputar: 'lk-landscape-putar',
  siap: 'lk-game-siap',
  petunjuk: 'lk-putar-ponsel',
};

/** Apakah perangkat ini punya layar sentuh (bukan desktop jendela sempit). */
function layarSentuh() {
  return (navigator.maxTouchPoints || 0) > 0
    || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

/** Apakah jendela sedang tegak (portrait). */
export function tegak() {
  return window.innerHeight > window.innerWidth;
}

/**
 * Coba kunci orientasi mendatar. Harus dipanggil dari gestur pengguna
 * (klik/sentuh) — peramban menolak kalau tidak. Mengembalikan true kalau
 * berhasil, dan tidak melempar kalau gagal.
 */
export async function kunciOrientasi() {
  try {
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') return false;
    // `fullscreen` membuat kunci orientasi berlaku di Android; kalau ditolak,
    // kunci orientasi tetap dicoba (sebagian peramban mengizinkannya tanpa).
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch { /* layar penuh ditolak: lanjut mencoba kunci orientasi */ }
    await screen.orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

/**
 * Pasang tampilan paksa mendatar.
 *
 * `onUbah` dipanggil setiap kali tata letak berubah (diputar/dipulihkan) supaya
 * pemanggil bisa menghitung ulang ukuran kanvas.
 */
export function pasangLandscape({ onUbah } = {}) {
  // Dipasang sekali saja per halaman. main.js memanggil ini dari level modul
  // (supaya petunjuk muncul sebelum aset diunduh), dan memanggil dua kali akan
  // membuat dua lapisan petunjuk yang saling menimpa.
  const sudah = document.getElementById('lk-gaya-landscape');
  if (sudah) return sudah.__lkLandscape;

  const gaya = document.createElement('style');
  gaya.id = 'lk-gaya-landscape';
  gaya.textContent = `
html.${KELAS.akar}, html.${KELAS.akar} body { overflow: hidden; }
html.${KELAS.akar} body { display: block; }

/* Kanvas diputar 90° dan dibentangkan PAS menutupi layar tegak.
   Lebar kanvas = tinggi layar (100vh), tingginya = lebar layar (100vw); lalu
   diputar dengan titik asal kiri-atas dan digeser selebar layar. Hasilnya
   kotak 100vw x 100vh yang tepat mengisi layar — bukan kotak yang meluber
   keluar dan terpotong separuh.

   Sengaja memakai satuan CSS, bukan piksel inline: di ponsel tinggi layar
   berubah saat bilah alamat muncul/hilang, dan 100vh selalu mengikuti.
   TRANFORM_PUTAR adalah sisi JavaScript dari aturan yang sama; kalau salah
   satunya diubah, pemetaan sentuhan di core/input.js ikut salah — uji
   "landscape.test.mjs" membandingkan keduanya. */
html.${KELAS.diputar} canvas#game {
  position: fixed; left: 0; top: 0;
  width: 100vh; height: 100vw;
  transform-origin: 0 0;
  transform: ${TRANSFORM_PUTAR};
  max-width: none; max-height: none;
}

/* Petunjuk "putar ponsel".
   VARIAN LAYAR PENUH dipakai selama game belum terlihat (masih memuat): seluruh
   layar ditutup petunjuk supaya murid tidak melihat potongan game yang belum
   siap. VARIAN KARTU dipakai setelah game jalan: kartunya kecil di tengah atas,
   sehingga pemain masih bisa mengetuk game untuk memulai — dan tombol "Putar
   otomatis" di kartu itu yang dibutuhkan peramban (butuh gestur pengguna). */
.${KELAS.petunjuk} {
  position: fixed; inset: 0; z-index: 90;
  display: none; place-items: center; text-align: center; padding: 24px;
  background: #100c09; color: #f5e6c8;
  font-family: "VT323", monospace; font-size: 20px; line-height: 1.25;
}
.${KELAS.petunjuk}[data-tampil="1"] { display: grid; }
.${KELAS.petunjuk}[data-mode="kartu"] { background: transparent; pointer-events: none; }
.${KELAS.petunjuk}[data-mode="kartu"] > div {
  pointer-events: auto; max-width: 300px; padding: 14px 16px;
  background: rgba(16, 12, 9, .94); border: 2px solid #7a4a22; border-radius: 12px;
  font-size: 17px;
}
.${KELAS.petunjuk}[data-mode="kartu"] .ikon { font-size: 34px; margin-bottom: 4px; }
/* Saat rotasi CSS aktif, pemain tinggal memiringkan ponsel. Cukup satu baris
   pengingat di bagian atas layar — kartu besar menutupi permainan. */
.${KELAS.diputar} .${KELAS.petunjuk}[data-mode="kartu"] > div { max-width: none; padding: 6px 12px; font-size: 15px; }
.${KELAS.diputar} .${KELAS.petunjuk}[data-mode="kartu"] .ikon,
.${KELAS.diputar} .${KELAS.petunjuk}[data-mode="kartu"] small,
.${KELAS.diputar} .${KELAS.petunjuk}[data-mode="kartu"] button { display: none; }
.${KELAS.petunjuk} .ikon { font-size: 56px; line-height: 1; margin-bottom: 10px; }
.${KELAS.petunjuk} small { display: block; margin-top: 10px; opacity: .65; font-size: 15px; }
.${KELAS.petunjuk} button {
  margin-top: 16px; padding: 10px 16px; font: inherit; cursor: pointer;
  background: #f5e6c8; color: #3a2a2a; border: 2px solid #7a4a22; border-radius: 10px;
}
`;
  document.head.append(gaya);

  const lapisan = document.createElement('div');
  lapisan.className = KELAS.petunjuk;
  lapisan.dataset.tampil = '0';
  lapisan.innerHTML = `
    <div>
      <div class="ikon">📱↻</div>
      <div data-teks>Putar ponselmu <b>mendatar</b> supaya seluruh layar terlihat.</div>
      <small data-kecil>Game ini butuh layar lebar: hotbar, panel, dan petunjuk tidak muat di layar tegak.</small>
      <button type="button" data-aksi="putar">Putar sekarang</button>
    </div>`;
  document.body.append(lapisan);

  let state = 'normal';   // 'normal' | 'diputar'

  // Apakah peramban bisa dipaksa memutar (Screen Orientation API)? Kalau tidak
  // — iOS Safari, misalnya — tombolnya disembunyikan: menawarkan tombol yang
  // pasti gagal lebih buruk daripada tidak ada tombol.
  const tombolBisa = !!(screen.orientation && typeof screen.orientation.lock === 'function');

  // Pesan disesuaikan: ponsel disuruh memutar, jendela desktop disuruh melebarkan.
  const sayaLapisan = () => {
    const teks = lapisan.querySelector('[data-teks]');
    const kecil = lapisan.querySelector('[data-kecil]');
    if (!teks || !kecil) return;
    const tombol = lapisan.querySelector('[data-aksi="putar"]');
    if (tombol) {
      tombol.style.display = tombolBisa ? '' : 'none';
      tombol.textContent = 'Putar otomatis';
    }
    if (tombolBisa) {
      teks.innerHTML = 'Putar ponselmu <b>mendatar</b> supaya seluruh layar terlihat.';
      kecil.innerHTML = 'Game ini butuh layar lebar: hotbar, panel, dan petunjuk tidak muat di layar tegak.';
    } else if (layarSentuh()) {
      teks.innerHTML = 'Putar ponselmu <b>mendatar</b>. Layarnya sudah disiapkan mendatar.';
      kecil.innerHTML = 'Kalau tampilan masih terpotong, muat ulang halaman ini.';
    } else {
      teks.innerHTML = 'Perlebarkan jendela ini supaya seluruh layar terlihat.';
      kecil.innerHTML = 'Game ini butuh layar lebar (paling tidak selebar tinggi). Perkecil ukuran huruf peramban (Ctrl + −) kalau layarnya tidak bisa dilebarkan.';
    }
  };

  const terapkan = (alasan) => {
    const akar = document.documentElement;
    akar.classList.remove(KELAS.diputar);
    akar.classList.remove(KELAS.akar);
    lapisan.dataset.tampil = '0';

    if (!tegak()) {
      // Sudah mendatar: tidak ada yang perlu diputar.
      state = 'normal';
      onUbah?.(state);
      return;
    }

    // Tegak. Di perangkat sentuh, kanvas diputar 90° supaya SELURUH layar
    // mendatar terpakai — bukan versi tegak yang terpotong. Di desktop jendela
    // sempit, memutar gambar justru membingungkan (mouse dan papan ketik tetap
    // mendatar), jadi yang ditampilkan hanya petunjuk memperlebarkan jendela.
    akar.classList.add(KELAS.akar);
    const sentuh = layarSentuh();
    state = sentuh ? 'diputar' : 'normal';
    if (sentuh) akar.classList.add(KELAS.diputar);
    sayaLapisan();
    // Sebelum game siap, tutupi seluruh layar; sesudahnya cukup kartu kecil.
    lapisan.dataset.mode = document.documentElement.classList.contains(KELAS.siap) ? 'kartu' : 'penuh';
    lapisan.dataset.tampil = '1';
    onUbah?.(state);
    void alasan;
  };

  // Tombol "Putar sekarang": minta kunci orientasi (butuh gestur pengguna) lalu
  // sembunyikan petunjuk. Kalau peramban menolak, kanvas tetap diputar CSS dan
  // pemain cukup memutar ponselnya sendiri.
  lapisan.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-aksi="putar"]')) return;
    const ok = await kunciOrientasi();
    if (ok) {
      lapisan.dataset.tampil = '0';
      setTimeout(() => terapkan('kunci-berhasil'), 250);
    } else {
      const kecil = lapisan.querySelector('[data-kecil]');
      if (kecil) kecil.textContent = 'Peramban ini tidak mengizinkan putar otomatis. Miringkan sendiri ponselnya — layarnya sudah disiapkan mendatar.';
      lapisan.dataset.tampil = '0';
    }
  });

  window.addEventListener('orientationchange', () => setTimeout(() => terapkan('orientationchange'), 60));
  window.addEventListener('resize', () => terapkan('resize'));

  terapkan('awal');

  const api = {
    get keadaan() { return state; },
    /** Paksa periksa ulang (dipakai setelah masuk layar penuh). */
    segarkan: () => terapkan('manual'),
    /** Game sudah bisa dimainkan: petunjuk berubah dari layar penuh jadi kartu. */
    siap() {
      document.documentElement.classList.add(KELAS.siap);
      terapkan('siap');
    },
    /** Coba kunci orientasi dari gestur pengguna. */
    kunci: kunciOrientasi,
    lepaskan() {
      document.documentElement.classList.remove(KELAS.diputar, KELAS.akar);
      lapisan.dataset.tampil = '0';
      state = 'normal';
      onUbah?.(state);
    },
  };
  gaya.__lkLandscape = api;
  return api;
}
