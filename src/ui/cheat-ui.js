// Panel daftar kode debug (F1). Hanya tergambar di mode `?debug=1`.
//
// Daftarnya dibaca dari KODE_DEBUG — sumber yang SAMA dengan yang memasang
// tombolnya di core/cheat.js. Kalau daftar ini ditulis ulang di sini, cepat atau
// lambat ada kode yang jalan tetapi tidak terdokumentasi (atau sebaliknya).
import { panel, text, fit, UI } from './draw.js';
import { KODE_DEBUG } from '../core/cheat.js';

export class CheatUI {
  /** Ukuran tata letak, dipakai uji tata letak supaya tidak menebak. */
  static TATA = { PAD: 18, LEBAR: 470, BARIS: 18, KEPALA: 44 };

  constructor() {
    this.terbuka = false;
  }

  toggle() { this.terbuka = !this.terbuka; return this.terbuka; }

  /**
   * Gambar panel bila terbuka. `w`/`h` = ukuran kanvas logis.
   *
   * Tinggi mengikuti jumlah kode, jadi menambah satu kode tidak boleh membuat
   * baris terakhir keluar panel. Kalau layarnya terlalu pendek (ponsel tegak),
   * panel digeser ke atas dan tingginya dipotong supaya kepala panel tetap
   * terlihat — daftar yang terpotong masih terbaca, judul yang hilang tidak.
   */
  draw(ctx, w, h) {
    if (!this.terbuka) return;
    const T = CheatUI.TATA;
    const baris = KODE_DEBUG.length;
    const lebar = Math.min(T.LEBAR, w - T.PAD * 2);
    const isi = baris * T.BARIS + 26;
    const tinggi = Math.min(T.KEPALA + isi, h - T.PAD * 2);
    const x = Math.round((w - lebar) / 2);
    const y = Math.round(Math.max(T.PAD, (h - tinggi) / 2));

    panel(ctx, x, y, lebar, tinggi);
    text(ctx, 'KODE DEBUG', x + T.PAD, y + 16, { font: UI.fontTitle, color: UI.cream });
    text(ctx, 'Ctrl + tombol · F1 tutup · hanya di ?debug=1', x + T.PAD, y + 32, { font: UI.font, color: UI.creamDark });

    let ry = y + T.KEPALA + 6;
    const bawah = y + tinggi - 6;
    for (const k of KODE_DEBUG) {
      if (ry + T.BARIS > bawah) break;        // tidak ada tempat: sisanya tidak digambar
      // "Ctrl+D" lebih mudah dicari mata daripada "KeyD".
      const label = `Ctrl+${k.tombol.replace(/^Key/, '')}`;
      text(ctx, label, x + T.PAD, ry, { font: UI.font, color: UI.cream });
      // Dipangkas, bukan dibiarkan: di ponsel tegak panelnya hanya ~350 px.
      const sisa = lebar - T.PAD * 2 - 92;
      text(ctx, fit(ctx, k.judul, sisa), x + T.PAD + 92, ry, { font: UI.font, color: UI.creamDark });
      ry += T.BARIS;
    }
  }
}
