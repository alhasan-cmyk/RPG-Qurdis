// PNG baca/tulis kecil tanpa pustaka — cukup untuk RGBA 8-bit.
//
// Dipakai tools/panduan/ untuk merakit tangkapan layar panduan dari sprite yang
// sudah ada di repo. Tanpa dependensi supaya `node tools/panduan/...` jalan di
// komputer guru tanpa `npm i` apa pun, sama seperti alat lain di repo ini.
import { deflateSync, inflateSync } from 'node:zlib';

export class PNG {
  constructor(w, h) {
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.data = new Uint8Array(this.w * this.h * 4);   // RGBA, transparan
  }

  static baca(buf) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('bukan PNG');
    let i = 8;
    let w = 0, h = 0, bitDepth = 8, colorType = 6;
    const idat = [];
    let palette = null, trns = null;
    while (i < buf.length) {
      const len = buf.readUInt32BE(i);
      const tipe = buf.toString('latin1', i + 4, i + 8);
      const isi = buf.subarray(i + 8, i + 8 + len);
      if (tipe === 'IHDR') {
        w = isi.readUInt32BE(0); h = isi.readUInt32BE(4);
        bitDepth = isi[8]; colorType = isi[9];
        if (isi[12]) throw new Error('PNG interlace belum didukung');
      } else if (tipe === 'PLTE') palette = Buffer.from(isi);
      else if (tipe === 'tRNS') trns = Buffer.from(isi);
      else if (tipe === 'IDAT') idat.push(Buffer.from(isi));
      else if (tipe === 'IEND') break;
      i += 12 + len;
    }
    if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} belum didukung`);
    const kanal = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    if (!kanal) throw new Error(`color type ${colorType} belum didukung`);
    const mentah = inflateSync(Buffer.concat(idat));
    const bpp = kanal;
    const langkah = w * bpp;
    const hasil = new Uint8Array(w * h * 4);
    let prev = new Uint8Array(langkah);
    for (let y = 0; y < h; y++) {
      const filter = mentah[y * (langkah + 1)];
      const baris = Uint8Array.from(mentah.subarray(y * (langkah + 1) + 1, (y + 1) * (langkah + 1)));
      for (let x = 0; x < langkah; x++) {
        const a = x >= bpp ? baris[x - bpp] : 0;
        const b = prev[x];
        const c = x >= bpp ? prev[x - bpp] : 0;
        if (filter === 1) baris[x] = (baris[x] + a) & 255;
        else if (filter === 2) baris[x] = (baris[x] + b) & 255;
        else if (filter === 3) baris[x] = (baris[x] + ((a + b) >> 1)) & 255;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          baris[x] = (baris[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
        }
      }
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const s = x * bpp;
        if (colorType === 6) { hasil[o] = baris[s]; hasil[o + 1] = baris[s + 1]; hasil[o + 2] = baris[s + 2]; hasil[o + 3] = baris[s + 3]; }
        else if (colorType === 2) { hasil[o] = baris[s]; hasil[o + 1] = baris[s + 1]; hasil[o + 2] = baris[s + 2]; hasil[o + 3] = 255; }
        else if (colorType === 0) { hasil[o] = hasil[o + 1] = hasil[o + 2] = baris[s]; hasil[o + 3] = 255; }
        else if (colorType === 4) { hasil[o] = hasil[o + 1] = hasil[o + 2] = baris[s]; hasil[o + 3] = baris[s + 1]; }
        else if (colorType === 3) {
          const idx = baris[s];
          hasil[o] = palette[idx * 3]; hasil[o + 1] = palette[idx * 3 + 1]; hasil[o + 2] = palette[idx * 3 + 2];
          hasil[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
        }
      }
      prev = baris;
    }
    const p = new PNG(w, h);
    p.data = hasil;
    return p;
  }

  #idx(x, y) { return (y * this.w + x) * 4; }

  /** Isi kotak dengan warna (dan alpha gabungan). */
  isi(x, y, w, h, warna, alpha = 1) {
    const a = Math.max(0, Math.min(1, (warna.a ?? 1) * alpha));
    if (a <= 0) return;
    const x1 = Math.max(0, Math.min(this.w, x));
    const y1 = Math.max(0, Math.min(this.h, y));
    const x2 = Math.max(0, Math.min(this.w, x + w));
    const y2 = Math.max(0, Math.min(this.h, y + h));
    for (let yy = y1; yy < y2; yy++) {
      for (let xx = x1; xx < x2; xx++) {
        const o = this.#idx(xx, yy);
        const sa = a;
        const da = this.data[o + 3] / 255;
        const oa = sa + da * (1 - sa);
        if (oa <= 0) continue;
        this.data[o] = Math.round((warna.r * sa + this.data[o] * da * (1 - sa)) / oa);
        this.data[o + 1] = Math.round((warna.g * sa + this.data[o + 1] * da * (1 - sa)) / oa);
        this.data[o + 2] = Math.round((warna.b * sa + this.data[o + 2] * da * (1 - sa)) / oa);
        this.data[o + 3] = Math.round(oa * 255);
      }
    }
  }

  isiElips(cx, cy, rx, ry, warna, alpha = 1) {
    const a = Math.max(0, Math.min(1, (warna.a ?? 1) * alpha));
    for (let yy = Math.max(0, cy - ry); yy < Math.min(this.h, cy + ry); yy++) {
      for (let xx = Math.max(0, cx - rx); xx < Math.min(this.w, cx + rx); xx++) {
        const dx = (xx - cx) / (rx || 1), dy = (yy - cy) / (ry || 1);
        if (dx * dx + dy * dy > 1) continue;
        const o = this.#idx(xx, yy);
        const da = this.data[o + 3] / 255;
        const oa = a + da * (1 - a);
        this.data[o] = Math.round((warna.r * a + this.data[o] * da * (1 - a)) / oa);
        this.data[o + 1] = Math.round((warna.g * a + this.data[o + 1] * da * (1 - a)) / oa);
        this.data[o + 2] = Math.round((warna.b * a + this.data[o + 2] * da * (1 - a)) / oa);
        this.data[o + 3] = Math.round(oa * 255);
      }
    }
  }

  /** Tempel potongan PNG lain (untuk sprite atlas). */
  tempel(src, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh, alpha = 1) {
    if (dw <= 0 || dh <= 0) return;
    for (let y = 0; y < dh; y++) {
      const yy = dy + y;
      if (yy < 0 || yy >= this.h) continue;
      const syy = sy + Math.floor((y * sh) / dh);
      if (syy < 0 || syy >= src.h) continue;
      for (let x = 0; x < dw; x++) {
        const xx = dx + x;
        if (xx < 0 || xx >= this.w) continue;
        const sxx = sx + Math.floor((x * sw) / dw);
        if (sxx < 0 || sxx >= src.w) continue;
        const so = (syy * src.w + sxx) * 4;
        const sa = (src.data[so + 3] / 255) * alpha;
        if (sa <= 0) continue;
        const o = this.#idx(xx, yy);
        const da = this.data[o + 3] / 255;
        const oa = sa + da * (1 - sa);
        this.data[o] = Math.round((src.data[so] * sa + this.data[o] * da * (1 - sa)) / oa);
        this.data[o + 1] = Math.round((src.data[so + 1] * sa + this.data[o + 1] * da * (1 - sa)) / oa);
        this.data[o + 2] = Math.round((src.data[so + 2] * sa + this.data[o + 2] * da * (1 - sa)) / oa);
        this.data[o + 3] = Math.round(oa * 255);
      }
    }
  }

  /** Perbesar dengan pembesaran tetangga terdekat (piksel tetap tajam). */
  perbesar(faktor) {
    const hasil = new PNG(this.w * faktor, this.h * faktor);
    for (let y = 0; y < hasil.h; y++) {
      for (let x = 0; x < hasil.w; x++) {
        const so = (Math.floor(y / faktor) * this.w + Math.floor(x / faktor)) * 4;
        const o = hasil.#idx(x, y);
        hasil.data[o] = this.data[so]; hasil.data[o + 1] = this.data[so + 1];
        hasil.data[o + 2] = this.data[so + 2]; hasil.data[o + 3] = this.data[so + 3];
      }
    }
    return hasil;
  }

  kePNG() {
    const crcTable = (() => {
      const t = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
      }
      return t;
    })();
    const crc = (buf) => {
      let c = -1;
      for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
      return (c ^ -1) >>> 0;
    };
    const potong = (tipe, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(tipe, 'latin1'), data]);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
      return Buffer.concat([len, td, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const baris = this.h * (this.w * 4 + 1);
    const mentah = Buffer.alloc(baris);
    for (let y = 0; y < this.h; y++) {
      mentah[y * (this.w * 4 + 1)] = 0;
      Buffer.from(this.data.buffer, this.data.byteOffset + y * this.w * 4, this.w * 4)
        .copy(mentah, y * (this.w * 4 + 1) + 1);
    }
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      potong('IHDR', ihdr),
      potong('IDAT', deflateSync(mentah, { level: 9 })),
      potong('IEND', Buffer.alloc(0)),
    ]);
  }
}

/** Warna dari CSS ringkas, dipakai skrip panduan. */
export function warna(css) {
  let h = String(css).replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = Number.parseInt(h.slice(0, 6), 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}
