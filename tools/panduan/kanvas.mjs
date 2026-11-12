// Kanvas tiruan untuk mengambil tangkapan layar panduan TANPA peramban.
//
// Kenapa ada: panduan siswa butuh gambar layar yang benar-benar berasal dari
// kode permainan, bukan gambar tangan yang bisa "berbohong" tentang tata
// letaknya. Di sandbox ini tidak ada peramban dan Chromium tidak bisa diunduh,
// jadi Canvas 2D ditirukan di atas PNG sungguhan — memakai rumus `fit`/`panel`
// dari src/ui/draw.js apa adanya.
//
// Batasnya, dan ini disengaja:
//   - `drawImage` memotong bingkai sprite sesuai assets/manifest.json, jadi
//     ukuran dan posisi setiap sprite nyata.
//   - Teks digambar sebagai pita abu-abu selebar `measureText` (perkiraan lebar
//     VT323), LALU ditimpa label `[...]` supaya pembaca tidak menyangka
//     hurufnya sungguhan. Font VT323/Press Start 2P tidak ada di luar peramban.
//   - Gradien/tint tidak ditirukan; permainan tidak memakainya untuk panel.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from './png.mjs';

/** Lebar rata-rata satu huruf pada font VT323 ukuran 16 px. */
const LEBAR_HURUF = 0.44;
/** Press Start 2P jauh lebih lebar per huruf pada ukuran yang sama. */
const LEBAR_HURUF_TITLE = 0.95;

export class Kanvas {
  constructor(lebar, tinggi) {
    this.width = Math.round(lebar);
    this.height = Math.round(tinggi);
    this.png = new PNG(this.width, this.height);
    this.font = '16px "VT323", monospace';
    this.textAlign = 'left';
    this.textBaseline = 'top';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.globalAlpha = 1;
    this._tumpuk = [];        // state save/restore
    this._geser = { x: 0, y: 0 };
    this._skala = 1;
    this._gambar = new Map();  // nama sprite -> PNG
    this.catatanTeks = [];     // dipakai uji: teks apa saja yang digambar
  }

  get _s() { return this._skala; }

  save() {
    this._tumpuk.push({ font: this.font, textAlign: this.textAlign, fillStyle: this.fillStyle, globalAlpha: this.globalAlpha, geser: { ...this._geser }, skala: this._skala });
  }

  restore() {
    const s = this._tumpuk.pop();
    if (!s) return;
    Object.assign(this, { font: s.font, textAlign: s.textAlign, fillStyle: s.fillStyle, globalAlpha: s.globalAlpha });
    this._geser = s.geser;
    this._skala = s.skala;
  }

  translate(x, y) { this._geser.x += x * this._s; this._geser.y += y * this._s; }
  scale(x, y = x) { this._skala *= x; void y; }

  /* ---------------------------------------------------------- bentuk */

  clearRect(x, y, w, h) { this.fillRect(x, y, w, h, '#000000'); }

  fillRect(x, y, w, h, warna = this.fillStyle) {
    const warna1 = this.#warna(warna);
    const sx = this._s;
    const x0 = Math.round((x * sx) + this._geser.x);
    const y0 = Math.round((y * sx) + this._geser.y);
    const w0 = Math.round(w * sx);
    const h0 = Math.round(h * sx);
    this.png.isi(x0, y0, w0, h0, warna1, this.globalAlpha);
  }

  beginPath() { this._jalur = []; }
  ellipse(x, y, rx, ry) { this._jalur = [{ x, y, rx, ry }]; }
  fill() {
    const sx = this._s;
    for (const e of this._jalur ?? []) {
      this.png.isiElips(Math.round(e.x * sx + this._geser.x), Math.round(e.y * sx + this._geser.y),
        Math.max(1, Math.round(e.rx * sx)), Math.max(1, Math.round(e.ry * sx)), this.#warna(this.fillStyle), this.globalAlpha);
    }
  }

  /* ------------------------------------------------------------ teks */

  measureText(teks) {
    const ukuran = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
    const judul = /Press Start 2P/.test(this.font);
    const perHuruf = judul ? LEBAR_HURUF_TITLE : LEBAR_HURUF;
    return { width: String(teks).length * ukuran * perHuruf };
  }

  fillText(teks, x, y) {
    const str = String(teks);
    const ukuran = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
    const judul = /Press Start 2P/.test(this.font);
    // Judul memakai huruf lebar dengan jarak tambahan; tanpa ini teks tiruan di
    // panel dan teks sungguhan di PDF akan berbeda panjang.
    const lebarHuruf = ukuran * (judul ? LEBAR_HURUF_TITLE : LEBAR_HURUF) * (judul ? 1.35 : 1);
    const lebar = this.measureText(str).width;
    const sx = this._s;
    let x0 = x * sx + this._geser.x;
    if (this.textAlign === 'center') x0 -= (lebar * sx) / 2;
    if (this.textAlign === 'right') x0 -= lebar * sx;
    const y0 = y * sx + this._geser.y;
    const tinggi = Math.max(2, Math.round(ukuran * 0.7 * sx));
    const tinta = this.#pitaTeks();

    // Huruf demi huruf: satu blok kecil per karakter, dengan tinggi yang berbeda
    // menurut bentuk hurufnya (kapital/huruf naik, x-height, turun). Hasilnya
    // terbaca sebagai TULISAN, bukan balok penutup — dan lebarnya tetap persis
    // hasil `measureText`, jadi tata letaknya nyata.
    // Batas pita dicatat PERSIS: skrip PDF menghapus pita ini lalu menulis
    // huruf sungguhan di tempat yang sama. Tanpa batas yang tepat, sisa pita
    // tetap terlihat dan teksnya seperti tercetak dua kali.
    const pita = {
      x: Math.round(x0), y: Math.round(y0 + tinggi * 0.1),
      w: Math.max(1, Math.round(lebar * sx)), h: Math.max(2, Math.round(ukuran * 0.75 * sx)),
    };

    let cx = x0;
    for (const ch of str) {
      const lebarCh = lebarHuruf * sx;
      if (ch !== ' ') {
        const kode = ch.codePointAt(0);
        const naik = /[A-Z0-9]/.test(ch) || judul;
        const turun = /[gjpqy,;]/.test(ch);
        const atas = Math.round(tinggi * (naik ? 0.1 : turun ? 0.25 : 0.2));
        const bawah = Math.round(tinggi * (turun ? 1.0 : 0.85));
        const w = Math.max(1, Math.round(lebarCh * 0.62));
        // Sedikit variasi panjang per huruf supaya tidak terlihat seperti garis.
        const potong = (kode % 3) * Math.max(1, Math.round(tinggi * 0.12));
        this.png.isi(Math.round(cx), Math.round(y0 + atas), w,
          Math.max(1, bawah - atas - (kode % 2 === 0 ? 0 : potong)), tinta, this.globalAlpha);
      }
      cx += lebarCh;
    }
    // Dicatat supaya skrip Python bisa MENIMPA pita ini dengan huruf sungguhan
    // (font VT323 tidak tersedia di sini, tetapi DejaVu bisa dipasang pada
    // posisi dan lebar yang sama persis).
    this.catatanTeks.push({
      teks: str, x: Math.round(x0), y: Math.round(y0),
      lebar: Math.round(lebar * sx), ukuran: Math.round(ukuran * sx),
      warna: String(this.fillStyle), pita,
      // `tengah` dipakai penyusun PDF supaya teks rata tengah tetap di tengah
      // walau lebar huruf pengganti (DejaVu) berbeda dari VT323.
      tengah: Math.round(x * sx + this._geser.x),
      align: this.textAlign,
      // Tepi kanan baris (untuk teks rata kanan). Pada `align: 'right'`, `x`
      // ITU SENDIRI adalah tepi kanan — menambahkan `lebar` di sini membuat
      // label kolom kanan (nama guru, harga, "Esc tutup") keluar dari panelnya.
      kanan: Math.round((this.textAlign === 'right' ? x : x + lebar) * sx + this._geser.x),
    });
  }

  /* ---------------------------------------------------------- sprite */

  /** Daftarkan PNG sprite; `drawImage` mencari berkas lewat nama di sini. */
  daftarSprite(nama, jalur) {
    this._gambar.set(nama, PNG.baca(readFileSync(jalur)));
  }

  /**
   * Tiga bentuk pemakaian di repo ini:
   *   drawImage(img, dx, dy)
   *   drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
   *   drawImage(img, dx, dy) dengan `img` berupa objek { width, height, nama }
   */
  drawImage(gambar, ...a) {
    const nama = typeof gambar === 'string' ? gambar : gambar?.nama;
    const png = nama ? this._gambar.get(nama) : null;
    if (!png) return;
    const s = this._s;
    if (a.length >= 8) {
      const [sx0, sy0, sw0, sh0, dx, dy, dw, dh] = a;
      this.png.tempel(png, sx0, sy0, Math.round(sw0), Math.round(sh0),
        Math.round(dx * s + this._geser.x), Math.round(dy * s + this._geser.y),
        Math.round(dw * s), Math.round(dh * s), this.globalAlpha);
    } else {
      const [dx, dy, dw = png.w, dh = png.h] = a;
      this.png.tempel(png, 0, 0, png.w, png.h,
        Math.round(dx * s + this._geser.x), Math.round(dy * s + this._geser.y),
        Math.round(dw * s), Math.round(dh * s), this.globalAlpha);
    }
  }

  /* ---------------------------------------------------------- simpan */

  tulis(jalur) { writeFileSync(jalur, this.png.kePNG()); }

  /**
   * Warna pita teks: warna asli dinaikkan kecerlangannya supaya teks gelap di
   * atas panel kayu tidak menjadi balok hitam. Yang penting keterbacaan
   * gambar untuk siswa, bukan kesetiaan warna huruf yang toh tidak digambar.
   */
  #pitaTeks() {
    const c = this.#warna(this.fillStyle);
    const terang = (c.r + c.g + c.b) / 3 > 150;
    return terang ? c : { r: 70, g: 44, b: 28, a: 1 };
  }

  #warna(css) {
    const c = String(css ?? '#000');
    if (c.startsWith('rgba')) {
      const [r, g, b, a] = c.slice(5, -1).split(',').map((v) => Number(v.trim()));
      return { r, g, b, a: Number.isFinite(a) ? a : 1 };
    }
    if (c.startsWith('rgb')) {
      const [r, g, b] = c.slice(4, -1).split(',').map((v) => Number(v.trim()));
      return { r, g, b, a: 1 };
    }
    let h = c.replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = Number.parseInt(h.slice(0, 6), 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
}

/** Muat semua sprite yang dipakai repo, supaya drawImage tidak pernah kosong. */
export function siapkanSprite(kanvas, akar, manifest) {
  for (const [nama, def] of Object.entries(manifest.sprites)) {
    const jalur = join(akar, 'assets', def.file);
    try { kanvas.daftarSprite(nama, jalur); } catch { /* sprite hilang: dibiarkan kosong */ }
  }
  for (const [nama, def] of Object.entries(manifest.sprites)) {
    // Objek tiruan yang dipakai kode permainan sebagai `img` (lihat assets.js).
    kanvas._gambar.set(nama, kanvas._gambar.get(nama) ?? new PNG(def.frame[0] * (def.cols ?? 1), def.frame[1] * (def.rows ?? 1)));
  }
}
