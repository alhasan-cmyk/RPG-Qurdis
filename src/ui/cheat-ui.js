// Panel daftar perintah debug (F1). Hanya tergambar di mode debug.
//
// Daftarnya dibaca dari PERINTAH_DEBUG — sumber yang SAMA dengan baris perintah
// dan alias Ctrl. Kalau daftar ini ditulis ulang di sini, cepat atau lambat ada
// perintah yang jalan tetapi tidak terdokumentasi (atau sebaliknya).
import { panel, text, fit, UI } from './draw.js';
import { PERINTAH_DEBUG } from '../core/cheat.js';

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
   * Tinggi mengikuti jumlah perintah, jadi menambah satu perintah tidak boleh
   * membuat baris terakhir keluar panel. Kalau layarnya terlalu pendek (ponsel
   * tegak), tingginya dipotong dan kepala panel didahulukan — daftar yang
   * terpotong masih terbaca, judul yang hilang tidak.
   */
  draw(ctx, w, h) {
    if (!this.terbuka) return;
    const T = CheatUI.TATA;
    const lebar = Math.min(T.LEBAR, w - T.PAD * 2);
    const isi = PERINTAH_DEBUG.length * T.BARIS + 26;
    const tinggi = Math.min(T.KEPALA + isi, h - T.PAD * 2);
    const x = Math.round((w - lebar) / 2);
    const y = Math.round(Math.max(T.PAD, (h - tinggi) / 2));

    panel(ctx, x, y, lebar, tinggi);
    text(ctx, 'KODE DEBUG', x + T.PAD, y + 16, { font: UI.fontTitle, color: UI.cream });
    text(ctx, 'F2 atau / untuk mengetik · F1 tutup', x + T.PAD, y + 32, { font: UI.font, color: UI.creamDark });

    let ry = y + T.KEPALA + 6;
    const bawah = y + tinggi - 6;
    for (const p of PERINTAH_DEBUG) {
      if (ry + T.BARIS > bawah) break;        // tidak ada tempat: sisanya tidak digambar
      const angka = p.angka === 'tidak' ? '' : (p.angka === 'wajib' ? ' n' : ' [n]');
      text(ctx, `/${p.nama}${angka}`, x + T.PAD, ry, { font: UI.font, color: UI.cream });
      // Dipangkas, bukan dibiarkan: di ponsel tegak panelnya hanya ~350 px.
      text(ctx, fit(ctx, p.judul, lebar - T.PAD * 2 - 120), x + T.PAD + 120, ry,
        { font: UI.font, color: UI.creamDark });
      ry += T.BARIS;
    }
  }
}
