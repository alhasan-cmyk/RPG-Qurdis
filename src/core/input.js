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

export const mouse = { x: 0, y: 0, clicked: false, wheel: 0 };

export function bindMouse(canvas, view) {
  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  };
  canvas.addEventListener('mousemove', toLogical);
  canvas.addEventListener('mousedown', (e) => { toLogical(e); mouse.clicked = true; });
  canvas.addEventListener('wheel', (e) => { mouse.wheel = Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
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
