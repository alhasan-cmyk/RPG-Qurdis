// Fixed-step update (60 Hz) with render every animation frame.
const STEP = 1 / 60;
const MAX_FRAME = 0.25; // clamp after tab switch so we don't spiral

/**
 * `akhirFrame` dipanggil setiap frame SETELAH update dan render, dan selalu
 * dipanggil — termasuk saat update() keluar lebih awal karena panel modal
 * terbuka. Di sinilah masukan yang bersifat "sekali pakai" dibersihkan.
 * Dulu pembersihan itu menumpang di `input.endFrame()` di dalam update(), dan
 * setiap `return` lebih awal melewatinya: ketukan yang tidak terpakai menumpuk
 * dan mengetuk ulang hotbar beberapa kali di frame berikutnya.
 */
export function startLoop({ update, render, akhirFrame }) {
  let last = performance.now();
  let acc = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    acc += Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render(acc / STEP);
    akhirFrame?.();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { stop() { running = false; } };
}
