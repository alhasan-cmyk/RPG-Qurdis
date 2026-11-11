// Keyboard + mouse + touch state with "pressed this frame" edge detection.
//
// Layar sentuh tidak punya tombol W/A/S/D, jadi sentuhan masuk ke himpunan yang
// SAMA dengan tombol papan ketik: `down` (sedang ditekan) dan `pressed` (baru
// ditekan frame ini). Dengan begitu seluruh permainan — berjalan, membuka menu,
// memilih di kotak dialog, menggulir rak — jalan tanpa satu pun perubahan di
// kode permainan; keyboard tetap bisa dipakai bersamaan (mis. di laptop layar
// sentuh).
const down = new Set();
const pressed = new Set();

/** Tekan satu kode tombol papan ketik secara sintetis ('Digit3', 'KeyE', ...). */
export function pressActionKode(code) {
  if (!down.has(code)) pressed.add(code);
  down.add(code);
  // Lepas pada frame berikutnya: tombol angka dan Esc tidak perlu ditahan.
  setTimeout(() => { down.delete(code); }, 60);
}

/**
 * Tekan satu aksi secara sintetis (dipakai tombol sentuh). `code`-nya sengaja
 * memakai kode papan ketik yang sudah dipetakan: 'KeyW', 'KeyE', dst.
 */
export function pressAction(action, held = true) {
  const code = (BINDINGS[action] ?? [])[0];
  if (!code) return;
  if (!held) { down.delete(code); return; }
  if (!down.has(code)) pressed.add(code);
  down.add(code);
}

const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE', 'Space', 'Enter'],
  run: ['ShiftLeft', 'ShiftRight'],
  drop: ['Backspace', 'Delete'],
  gift: ['KeyG'],
  menu: ['Escape'],
  inventory: ['KeyI', 'Tab'],
  eat: ['KeyC'],
  nextTool: ['KeyX'],
  prevTool: ['KeyZ'],
  zoom: ['KeyF'],
  debugSeason: ['KeyN'],
  debugTime: ['KeyT'],
  ujian: ['KeyT'],          // sama-sama T; hanya hidup di layar hasil latihan
  nilai: ['KeyV'],          // V: buka Nilai & Pengiriman dari Rekap Belajar
};

// Backspace ikut dicegah: di sebagian peramban ia masih memicu 'kembali'.
const PREVENT = ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'];

window.addEventListener('keydown', (e) => {
  if (PREVENT.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  down.add(e.code);
  pressed.add(e.code);
});
window.addEventListener('keyup', (e) => down.delete(e.code));
window.addEventListener('blur', () => { down.clear(); pressed.clear(); });

/**
 * Pintasan Ctrl+<tombol> — dipakai kode debug (core/cheat.js).
 *
 * Didaftarkan di sini, bukan di modul pemakainya, karena dua hal:
 *  1. `preventDefault` harus dipasang SEBELUM peramban memproses tombolnya.
 *     Ctrl+D di Chrome adalah "tandai halaman"; listener yang dipasang belakangan
 *     masih bisa mencegahnya, tetapi urutan modul jadi taruhan.
 *  2. Tombol yang memang milik peramban TIDAK boleh dirampas: menutup tab
 *     (Ctrl+W), memuat ulang (Ctrl+R), buka tab (Ctrl+T), jendela baru (Ctrl+N),
 *     dan keluar (Ctrl+Q). Kalau permainan mencegatnya, pemain yang ingin
 *     menutup tab malah mendapat 1.000 gold.
 *
 * Tombol yang sudah dipakai permainan (lihat BINDINGS) juga dibiarkan: Ctrl+G
 * sebenarnya aksi 'gift' (KeyG), Ctrl+D aksi 'right' (KeyD). Keduanya di sini
 * hanya bereaksi bila Ctrl/Command ikut ditahan, jadi bermain biasa tidak
 * berubah — dan saat Ctrl ditahan, tombolnya tetap dicatat di `down`/`pressed`
 * seperti sebelumnya.
 */
const TERLARANG = ['KeyR', 'KeyW', 'KeyT', 'KeyN', 'KeyQ'];
const pendengarPintas = new Set();

/** Daftarkan `fn(kodeTombol)` untuk pintasan Ctrl. Mengembalikan fungsi lepas. */
export function onPintas(fn) {
  if (typeof fn !== 'function') return () => {};
  pendengarPintas.add(fn);
  return () => pendengarPintas.delete(fn);
}

window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (TERLARANG.includes(e.code)) return;     // milik peramban
  if (e.repeat) return;                       // tahan tombol = satu kali
  if (!pendengarPintas.size) return;
  e.preventDefault();
  for (const fn of pendengarPintas) {
    try { fn(e.code); } catch (err) { console.error('[pintas]', err); }
  }
}, { capture: true });

export const mouse = { x: 0, y: 0, clicked: false, wheel: 0 };

/**
 * Kejadian sentuhan yang belum diterjemahkan ke koordinat kanvas.
 *
 * `mouse.x/y` hanya bisa berisi SATU titik; di ponsel, tombol D-pad dan hotbar
 * bisa disentuh hampir bersamaan, dan sentuhan pada elemen HTML (tombol) tidak
 * pernah sampai ke kanvas. Karena itu sentuhan dikumpulkan di sini dalam
 * koordinat klien dan baru diubah saat dibaca — setelah kanvas, zoom, dan
 * rotasinya diketahui.
 */
export const sentuhan = {
  daftar: [],       // { x, y, kanvas } — koordinat klien, kanvas asalnya
  kosongkan() { this.daftar.length = 0; },
};

/**
 * Terjemahkan titik layar (clientX/clientY) menjadi piksel di dalam kanvas.
 *
 * Rumus naif `(clientX - rect.left) * (canvas.width / rect.width)` hanya benar
 * selama kanvas tidak diputar. Di ponsel tegak, kanvas diputar 90° dengan CSS
 * (lihat ui/landscape.js), sehingga `getBoundingClientRect()` mengembalikan
 * kotak yang SUDAH diputar: lebar dan tingginya tertukar, dan rumus naif
 * menghasilkan posisi meleset — mengetuk hotbar memilih slot yang salah atau
 * tidak memilih apa pun. Rotasinya dibaca dari kelas di <html>, sumber
 * kebenaran yang sama dengan yang dipakai CSS-nya.
 */
export function keKanvas(el, clientX, clientY) {
  const r = el.getBoundingClientRect();
  const w = r.width || 1, h = r.height || 1;
  let fx = (clientX - r.left) / w;          // 0..1 di dalam kotak terlihat
  let fy = (clientY - r.top) / h;
  if (document.documentElement.classList.contains('lk-landscape-putar')) {
    // Kanvas berputar +90°: sisi atas kotak terlihat adalah sisi KIRI kanvas.
    const fx2 = fy, fy2 = 1 - fx;
    fx = fx2; fy = fy2;
  }
  return { x: fx * el.width, y: fy * el.height };
}

/**
 * Pasang penanganan mouse pada kanvas.
 *
 * `preventDefault()` saat mousedown mencegah fokus keyboard berpindah keluar
 * dari kanvas; tanpa itu, memakai mouse bisa membuat tombol papan ketik
 * berhenti bekerja sampai pemain mengklik kanvas lagi.
 */
export function bindMouse(canvas, view) {
  const toLogical = (e) => {
    const k = keKanvas(canvas, e.clientX, e.clientY);
    mouse.x = k.x;
    mouse.y = k.y;
  };
  canvas.addEventListener('mousemove', toLogical);
  canvas.addEventListener('mousedown', (e) => {
    toLogical(e);
    mouse.clicked = true;
    // Jangan biarkan klik memindahkan fokus keluar dari kanvas: papan ketik
    // berhenti bekerja kalau fokus hilang, dan di ponsel itu terasa seperti
    // game "macet".
    e.preventDefault();
    canvas.focus();
  });
  canvas.addEventListener('wheel', (e) => { mouse.wheel = Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

  // Sentuhan: satu ketukan = satu klik di titik itu. Disimpan dulu (lihat
  // `sentuhan`) karena kanvas mungkin sedang diputar 90°.
  //
  // SENGAJA TIDAK memanggil preventDefault(): peramban masih perlu mengirim
  // `mousedown`/`mouseup` tiruan sesudah sentuhan, karena semua panel (tas,
  // peti, toko, menu) dibaca dari `mouse.clicked`. Mematikannya membuat seluruh
  // panel itu berhenti bisa diketuk di ponsel. Supaya layar tidak ikut tergulir
  // atau ter-zoom saat disentuh, kanvas diberi `touch-action: none` di game.html.
  const catat = (e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    sentuhan.daftar.push({ x: t.clientX, y: t.clientY, kanvas: canvas });
  };
  canvas.addEventListener('touchstart', catat, { passive: true });
  canvas.addEventListener('touchend', catat, { passive: true });
}

export const input = {
  held(action) { return BINDINGS[action].some((c) => down.has(c)); },
  pressed(action) { return BINDINGS[action].some((c) => pressed.has(c)); },

  /** 1..9 if a number key was pressed this frame, else 0. */
  digit() {
    for (let i = 1; i <= 9; i++) if (pressed.has(`Digit${i}`)) return i;
    return 0;
  },

  /** Movement axis as {x, y} in [-1, 1]; diagonals normalized. */
  axis() {
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let y = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  },

  /** Lepas semua tombol sentuh (dipanggil saat layar kehilangan fokus). */
  releaseAll() { down.clear(); pressed.clear(); },

  /** Call once at the end of every update tick. */
  endFrame() { pressed.clear(); mouse.clicked = false; mouse.wheel = 0; },
};
