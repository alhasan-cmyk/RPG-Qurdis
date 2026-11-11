// Baris perintah debug di bawah layar. Hanya digambar/dipasang di mode debug.
//
// Kenapa perintah ketik, bukan Ctrl+<tombol>: Ctrl+D (tandai halaman) dan Ctrl+G
// (cari berikutnya) adalah pintasan peramban, dan Chrome boleh memprosesnya
// sebelum halaman sempat mencegah — jadi cheat yang bergantung pada keduanya
// bisa "tidak jalan" tanpa ada yang salah di kode permainan. Baris perintah
// tidak bergantung pada peramban, terbaca (pemain melihat apa yang ia ketik),
// dan bisa diberi angka: `/gold 250`.
//
// Tombolnya F2 atau `/`. Keduanya tidak dipakai permainan maupun peramban —
// `/` sengaja dipilih karena terasa seperti mengetik perintah, dan ia TIDAK
// mengganggu hotbar (hotbar memakai angka 1–9, bukan garis miring).
//
// GARIS MIRINGNYA OTOMATIS. Baris ini memang baris perintah, jadi mengetik
// "gold 1000" sudah cukup; yang disimpan di `baris` adalah perintahnya saja, dan
// `/` hanya ditampilkan di depan. Alasannya bukan kerapian: versi pertama
// menyimpan garis miring di dalam `baris`, sehingga F2 + "gold 1000" gagal
// ("awali dengan /"), dan perintah yang diputar ulang dari riwayat kehilangan
// garis miringnya. Sekarang mustahil terjadi — tidak ada baris tanpa `/`.
import { panel, text, fit, UI } from './draw.js';
import { PERINTAH_DEBUG } from '../core/cheat.js';

export class CheatConsole {
  /** Tata letak, dipakai uji supaya tidak menebak ukuran. */
  static TATA = { PAD: 10, TINGGI: 34 };

  /**
   * @param {(baris: string) => string|null} onKetik  dijalankan saat Enter
   * @param {() => void} onTutup
   */
  constructor({ onKetik = () => null, onTutup = () => {}, padaBuka = () => {} } = {}) {
    this.terbuka = false;
    this.baris = '';
    this.pesan = '';          // hasil/kesalahan perintah terakhir
    this.onKetik = onKetik;
    this.onTutup = onTutup;
    this.padaBuka = padaBuka;
    /** Riwayat perintah, untuk panah atas/bawah. */
    this.riwayat = [];
    this.posisiRiwayat = -1;
  }

  buka(awalan = '') {
    this.terbuka = true;
    // `awalan` boleh datang dengan atau tanpa garis miring (F2 -> '', '/' -> '/').
    this.baris = String(awalan).replace(/^\/+/, '');
    this.pesan = '';
    this.posisiRiwayat = -1;
    this.padaBuka?.();
  }

  tutup() {
    this.terbuka = false;
    this.baris = '';
    this.onTutup?.();
  }

  toggle() { return this.terbuka ? (this.tutup(), false) : (this.buka(), true); }

  /**
   * Terima satu kejadian papan ketik. Mengembalikan true kalau kejadian itu
   * milik baris perintah dan harus berhenti di sini (tidak diteruskan ke
   * permainan) — kalau tidak, huruf yang diketik akan ikut menggerakkan pemain
   * atau membuka menu.
   */
  key(e) {
    if (!this.terbuka) return false;
    const k = e.key;
    if (k === 'Escape') { this.tutup(); return true; }
    if (k === 'Enter') {
      const isi = this.baris.trim();
      this.baris = '';
      if (!isi) { this.tutup(); return true; }
      // Garis miring ditambahkan DI SINI, satu tempat, supaya penangan perintah
      // selalu menerima bentuk yang sama.
      const baris = `/${isi}`;
      if (this.riwayat.at(-1) !== isi) this.riwayat.push(isi);
      this.posisiRiwayat = -1;
      const hasil = this.onKetik(baris);
      // Perintah yang tidak dikenal TIDAK menutup baris: pemain bisa langsung
      // memperbaiki salah ketiknya, dan pesan galatnya tetap terbaca.
      this.pesan = typeof hasil === 'string' ? hasil : '';
      return true;
    }
    if (k === 'Backspace') { this.baris = this.baris.slice(0, -1); return true; }
    // Garis miring di awal diabaikan: sudah otomatis, dan "//gold" tidak
    // dikenali sebagai perintah.
    if (k === '/' && this.baris === '') return true;
    if (k === 'ArrowUp') {
      const r = this.riwayat;
      if (r.length) {
        this.posisiRiwayat = this.posisiRiwayat < 0 ? r.length - 1 : Math.max(0, this.posisiRiwayat - 1);
        this.baris = r[this.posisiRiwayat];
      }
      return true;
    }
    if (k === 'ArrowDown') {
      if (this.posisiRiwayat >= 0) {
        this.posisiRiwayat += 1;
        if (this.posisiRiwayat >= this.riwayat.length) { this.posisiRiwayat = -1; this.baris = ''; }
        else this.baris = this.riwayat[this.posisiRiwayat];
      }
      return true;
    }
    // Satu huruf/angka/tanda: tambahkan ke baris. Panjang dibatasi supaya
    // baris panjang tidak menutupi layar; pesan galat sudah menyebut batasnya.
    if (k?.length === 1 && this.baris.length < 60) { this.baris += k; return true; }
    return true;   // Tab, F1, panah lain: tetap ditahan selama baris terbuka
  }

  /** Gambar baris perintah di bawah layar. `w`/`h` = ukuran kanvas logis. */
  draw(ctx, w, h) {
    if (!this.terbuka) return;
    const T = CheatConsole.TATA;
    const lebar = w - T.PAD * 2;
    const tinggi = Math.min(T.TINGGI, h - T.PAD * 2);
    const y = h - tinggi - T.PAD;
    panel(ctx, T.PAD, y, lebar, tinggi);

    const tampil = fit(ctx, `> /${this.baris}`, lebar - T.PAD * 4);
    text(ctx, tampil, T.PAD * 2, y + 9, { font: UI.font, color: UI.cream });
    const petunjuk = this.pesan
      ? fit(ctx, this.pesan, lebar - T.PAD * 4)
      : fit(ctx, `Enter jalankan · Esc tutup · contoh: ${PERINTAH_DEBUG.slice(0, 2).map((p) => `/${p.nama} 1000`).join(' · ')}`, lebar - T.PAD * 4);
    text(ctx, petunjuk, T.PAD * 2, y + 9 + 15, {
      font: UI.font,
      color: this.pesan ? '#8a2c1d' : UI.creamDark,
    });
  }
}
