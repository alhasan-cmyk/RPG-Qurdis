// Canvas 2D renderer. Integer pixel zoom, but the logical viewport follows the
// window so there is no letterboxing: view = floor(window / zoom).
import { emit } from '../core/events.js';

export const MIN_VIEW = { w: 640, h: 360 }; // never show less than this at any zoom
export const MAX_ZOOM = 4;

/**
 * Skala pandangan: berapa piksel layar yang dipakai satu piksel dunia.
 *
 * 1    = Normal: piksel dunia 1:1 dengan layar, tajam sempurna.
 * 0,7  = Luas (bawaan ponsel): pandangan ±43% lebih lebar, jadi hotbar, panel,
 *        dan tombol sentuh pasti masuk layar.
 * 0,5  = Sangat luas: pandangan 2x dan tetap tajam sempurna (1 piksel dunia =
 *        tepat 0,5 piksel layar).
 *
 * HANYA DUNIA yang diperkecil. HUD, panel, dan tombol digambar sesudahnya tanpa
 * skala, jadi tulisannya tidak ikut mengecil dan tidak ada yang terpotong.
 * 0,7 bukan pembagi bulat: sebagian piksel dunia jatuh di antara piksel layar
 * dan digambar peramban dengan sedikit pelembutan. Itu pertukaran yang
 * disengaja, dan "Normal"/"Sangat luas" tersedia di Pengaturan.
 */
const SKALA_KEY = 'lk_skala_pandangan';

/**
 * Pilihan skala yang boleh dipakai pemain. Nilainya kecil = pandangan luas.
 * 0,5 sengaja disediakan: satu piksel dunia = tepat separuh piksel layar,
 * jadi tetap tajam sempurna kalau ada yang menginginkan pandangan 2×.
 */
export const SKALA = {
  normal: { nilai: 1, label: 'Normal' },
  luas: { nilai: 0.7, label: 'Luas' },
  'sangat-luas': { nilai: 0.5, label: 'Sangat luas' },
};
/** Urutan tombol ← / → di Pengaturan. */
export const URUTAN_SKALA = ['normal', 'luas', 'sangat-luas'];
export const SKALA_BAWAAN = 'luas';

function skalaDariNama(nama) {
  return (SKALA[nama] ?? SKALA[SKALA_BAWAAN]).nilai;
}

/**
 * Pilih bawaan menurut perangkat: layar sentuh selalu mulai dari "Luas" (di
 * sinilah ruang layar paling sempit), desktop dari "Normal". Bisa diubah di
 * Pengaturan dan pilihannya diingat.
 */
function skalaBawaan() {
  try {
    const disimpan = localStorage.getItem(SKALA_KEY);
    if (disimpan && SKALA[disimpan]) return skalaDariNama(disimpan);
  } catch { /* mode privat: pakai bawaan */ }
  const sentuh = (navigator.maxTouchPoints || 0) > 0
    || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  return (sentuh ? SKALA.luas : SKALA.normal).nilai;
}

/**
 * Ukuran viewport yang sedang dipakai. JANGAN di-cache — selalu baca ulang.
 *
 *   w, h      ukuran kanvas dalam piksel gambar = ukuran yang dipakai SEMUA UI
 *             (HUD, panel, hotbar, menu). Tidak terpengaruh skala pandangan.
 *   dunW/dunH ukuran DUNIA yang terlihat, dalam piksel dunia. Inilah yang
 *             dipakai kamera. Dengan skala 0,7 dunia yang terlihat 1/0,7 ≈ 43%
 *             lebih luas, sementara UI tetap sebesar sebelumnya.
 *   skala     skala dunia terhadap kanvas (1 = normal).
 *   zoom      pembesaran piksel (1..4), dipakai untuk ketajaman pixel-art.
 */
export const view = { w: 960, h: 540, zoom: 1, skala: 1, dunW: 960, dunH: 540 };

/**
 * Ukuran layar yang dipakai game — BUKAN selalu window.innerWidth/Height.
 *
 * Di ponsel tegak, kanvas diputar 90° dengan CSS (lihat ui/landscape.js), jadi
 * permainan harus digambar dengan ukuran layar yang sudah DITUKAR: lebar = tinggi
 * layar. Tanpa penukaran ini ukuran logisnya kembali 390×844, dan panel yang
 * tadi terpotong terpotong lagi — persis masalah yang mau diperbaiki.
 *
 * Penukaran hanya berlaku saat rotasi CSS benar-benar aktif. Jendela desktop
 * yang sempit dan tinggi tidak diputar (mouse dan papan ketik akan kacau), jadi
 * di sana ukurannya tetap apa adanya dan pengguna diminta memperlebarkan jendela.
 */
function ukuranLayar() {
  const w = window.innerWidth, h = window.innerHeight;
  const diputar = document.documentElement.classList.contains('lk-landscape-putar');
  return diputar ? { w: h, h: w } : { w, h };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.zoomOverride = loadZoom(); // 0 = auto, otherwise a fixed integer zoom
    /** Skala dunia (1 / 0,7 / 0,5) — lihat SKALA. */
    this.skala = skalaBawaan();
    /** Nama skala yang dipilih ('normal' | 'luas'), untuk ditampilkan di menu. */
    this.skalaNama = Object.keys(SKALA).find((k) => SKALA[k].nilai === this.skala) ?? 'normal';
    /** Dimensi layar yang benar-benar tersedia untuk game (lihat ukuranLayar). */
    this.ukuran = ukuranLayar();
    this.fit();
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('orientationchange', () => setTimeout(() => this.fit(), 80));
  }

  fit() {
    this.ukuran = ukuranLayar();
    const { w: ww, h: wh } = this.ukuran;
    let zoom = this.zoomOverride || Math.floor(Math.min(ww / MIN_VIEW.w, wh / MIN_VIEW.h));
    this.applyZoom(Math.max(1, Math.min(MAX_ZOOM, zoom)));
  }

  applyZoom(zoom) {
    const { w: ww, h: wh } = this.ukuran;
    view.zoom = zoom;
    view.skala = this.skala;
    // Kanvas = ukuran UI. Dunia yang muat di kanvas itu lebih luas saat skala
    // < 1, karena gambar dunia diperkecil oleh ctx.scale() di render().
    view.w = Math.floor(ww / zoom);
    view.h = Math.floor(wh / zoom);
    view.dunW = Math.round(view.w / this.skala);
    view.dunH = Math.round(view.h / this.skala);
    this.canvas.width = view.w;
    this.canvas.height = view.h;
    this.canvas.style.width = `${view.w * zoom}px`;
    this.canvas.style.height = `${view.h * zoom}px`;
    // Di layar tegak, kanvas sudah diputar 90° oleh CSS (ui/landscape.js).
    // Ukuran piksel di ATAS adalah ukuran dunia mendatar, sedangkan layarnya
    // tegak — jadi selama rotasi itu aktif, ukuran inline harus dikosongkan dan
    // biarkan kelas CSS yang menukar lebar/tinggi. Tanpa ini, kanvas mendatar
    // selebar 780 px tergambar menimpa layar tegak 390 px dan separuhnya hilang.
    if (document.documentElement.classList.contains('lk-landscape-putar')) {
      this.canvas.style.width = '';
      this.canvas.style.height = '';
    }
    this.ctx.imageSmoothingEnabled = false;
    emit('view:resize', view);
  }

  /**
   * Ubah skala pandangan ('normal' | 'luas' | 'sangat-luas') lalu hitung ulang.
   * `fit()` dipanggil karena view.dunW/dunH berubah, dan event 'view:resize'
   * yang dipancarkannya membuat kamera ikut menyesuaikan diri.
   */
  setSkala(nama) {
    if (!SKALA[nama]) return this.skalaNama;
    this.skala = SKALA[nama].nilai;
    this.skalaNama = nama;
    try { localStorage.setItem(SKALA_KEY, nama); } catch { /* mode privat */ }
    this.fit();
    return this.skalaNama;
  }

  /** Geser pilihan skala maju/mundur (dipakai ← / → di Pengaturan). */
  stepSkala(dir) {
    const i = Math.max(0, URUTAN_SKALA.indexOf(this.skalaNama));
    const next = Math.min(URUTAN_SKALA.length - 1, Math.max(0, i + dir));
    return this.setSkala(URUTAN_SKALA[next]);
  }

  /** Cycle zoom: auto -> 1 -> 2 -> 3 -> 4 -> auto. */
  cycleZoom() {
    this.zoomOverride = (this.zoomOverride + 1) % (MAX_ZOOM + 1);
    this.fit();
    saveZoom(this.zoomOverride);
    return this.zoomOverride;
  }

  /** Move one step along auto -> x1 -> ... -> x4, used by the settings menu. */
  stepZoom(dir) {
    const next = this.zoomOverride + dir;
    this.zoomOverride = Math.max(0, Math.min(MAX_ZOOM, next));
    this.fit();
    saveZoom(this.zoomOverride);
    return this.zoomOverride;
  }

  clear(color = '#000') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, view.w, view.h);
  }
}

const ZOOM_KEY = 'lk_zoom';
function loadZoom() {
  try { return Math.max(0, Math.min(MAX_ZOOM, Number(localStorage.getItem(ZOOM_KEY)) || 0)); } catch { return 0; }
}
function saveZoom(z) {
  try { localStorage.setItem(ZOOM_KEY, String(z)); } catch { /* private mode */ }
}

/** Draw one frame of a grid sprite sheet at (x, y) = pivot bottom-center in screen px. */
export function drawFrame(ctx, img, fw, fh, col, row, x, y) {
  ctx.drawImage(img, col * fw, row * fh, fw, fh, Math.round(x - fw / 2), Math.round(y - fh), fw, fh);
}
