// Penghasil lembar sprite "pemain menaiki kendaraan".
//
// Kenapa dibuat skrip, bukan aset jadi: lembar ini harus dibuat ulang kalau ada
// avatar baru (sekarang empat) atau kalau tinggi duduk perlu disetel. Tanpa
// skrip, aset seperti ini jadi benda mati yang tidak ada yang berani menyentuh.
//
// Tanpa dependensi: PNG dibaca/ditulis sendiri dengan node:zlib. Jalankan:
//
//   node tools/buat-sprite-kendaraan.mjs            (menulis ke repo ini)
//   node tools/buat-sprite-kendaraan.mjs <folder>   (dipakai tests/uji.mjs)
//
// Keluaran: assets/sprites/characters/<avatar>/<avatar>_<kendaraan>.png
//
// Bingkai 32x48 — SAMA dengan karakter biasa, dan itu keputusan yang diukur,
// bukan warisan. Percobaan dengan bingkai 56 (supaya roda dapat ruang di bawah
// kaki) membuat kepala pemain duduk 8 px lebih tinggi daripada saat berjalan,
// jadi pemain terlihat "melonjak" setiap kali menaiki sepeda. Karena kaki
// pengendara dibuang dan digambar ulang dalam posisi duduk, kepalanya tetap di
// y 1..30 seperti semula DAN roda tetap mendapat tempat: roda bawah di y 47,
// sepeda hanya setinggi y 30..47.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Akar boleh diberikan sebagai argumen pertama: dipakai alat uji untuk
// membuktikan bahwa yang di-commit memang hasil skrip ini, bukan versi lama.
const AKAR = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const AVATAR = ['player_m', 'player_f', 'player_m2', 'player_f2'];
const KENDARAAN = ['sepeda', 'motor', 'truk'];

const FW = 32, FH = 48;          // bingkai lembar kendaraan (sama dengan karakter)
const SW = 32, SH = 48;          // bingkai lembar karakter asli
const RODA_Y = 44;   // pusat roda: 41..47, dasar bingkai

/* --------------------------------------------------------------- warna */
const C = {
  garis: [43, 30, 24],
  kulit: [233, 178, 130], kulitG: [198, 138, 96],
  biru: [78, 96, 120], biruT: [52, 66, 88], biruM: [104, 122, 146],
  sepatu: [120, 62, 40],
  ban: [48, 42, 46], banT: [30, 26, 30],
  logam: [206, 206, 214], logamT: [146, 148, 158],
  rangka: [176, 72, 56], rangkaT: [128, 48, 38], sadel: [92, 54, 40],
  keranjang: [170, 132, 78],
  bodi: [52, 74, 104], bodiT: [34, 50, 74], tangki: [222, 176, 66],
  kaca: [150, 190, 210], lampu: [245, 226, 140],
  kabin: [92, 122, 96], kabinT: [64, 88, 68],
  kayu: [156, 106, 62], kayuT: [116, 76, 44],
};

/* ------------------------------------------------------------ kanvas */
class Gambar {
  constructor(w, h, data = null) {
    this.w = w; this.h = h;
    this.px = data ?? new Uint8Array(w * h * 4);
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2], this.px[i + 3]];
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
    this.px[i + 3] = c.length > 3 ? c[3] : 255;
  }
  rect(x0, y0, x1, y1, c) {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) this.set(x, y, c);
  }
  garis(x0, y0, x1, y1, c, tebal = 1) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      for (let oy = 0; oy < tebal; oy++) for (let ox = 0; ox < tebal; ox++) this.set(x0 + ox, y0 + oy, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
  lingkaran(cx, cy, r, c, isi = true) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        const cocok = isi ? d2 <= r * r + r * 0.6 : r * r - r * 1.6 <= d2 && d2 <= r * r + r * 0.6;
        if (cocok) this.set(x, y, c);
      }
    }
  }
  tempel(g, dx, dy) {
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const c = g.get(x, y);
        if (c[3] > 0) this.set(x + dx, y + dy, c);
      }
    }
  }
  potong(x0, y0, w, h) {
    const o = new Gambar(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.set(x, y, this.get(x0 + x, y0 + y));
    return o;
  }
  cermin() {
    const o = new Gambar(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c[3] > 0) o.set(this.w - 1 - x, y, c);
      }
    }
    return o;
  }
}

/* --------------------------------------------------------------- PNG */
function bacaPNG(path) {
  const b = readFileSync(path);
  if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`bukan PNG: ${path}`);
  let i = 8, idat = [], w = 0, h = 0, ct = 0;
  while (i < b.length) {
    const len = b.readUInt32BE(i), typ = b.subarray(i + 4, i + 8).toString('latin1');
    const data = b.subarray(i + 8, i + 8 + len);
    if (typ === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      const bd = data[8]; ct = data[9];
      if (bd !== 8 || (ct !== 2 && ct !== 6) || data[12] !== 0) throw new Error(`format PNG tidak didukung: ${path}`);
    } else if (typ === 'IDAT') idat.push(data);
    else if (typ === 'IEND') break;
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Uint8Array.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const up = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + up) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + up) >> 1)) & 255;
      else if (f === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
      out[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return new Gambar(w, h, out);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function tulisPNG(path, g) {
  const raw = new Uint8Array((g.w * 4 + 1) * g.h);
  for (let y = 0; y < g.h; y++) {
    raw[y * (g.w * 4 + 1)] = 0;
    raw.set(g.px.subarray(y * g.w * 4, (y + 1) * g.w * 4), y * (g.w * 4 + 1) + 1);
  }
  const chunk = (typ, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(typ, 4, 'latin1');
    Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(typ, 'latin1'), Buffer.from(data)])), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(g.w, 0); ihdr.writeUInt32BE(g.h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

/* -------------------------------------------------------- kendaraan */
// Semua koordinat y di bawah ini FINAL untuk bingkai 48 px: tanah di y 47,
// roda 6 px (y 41..47), tinggi kepala pemain tidak disentuh (y 1..30).
function roda(g, cx, cy, r = 3) {
  g.lingkaran(cx, cy, r, C.banT);
  g.lingkaran(cx, cy, r - 1, C.ban);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) g.set(cx + dx, cy + dy, C.logamT);
  g.set(cx, cy, C.logam);
}

const RY = 44;      // pusat roda kendaraan beroda dua

function kendaraanJenis(jenis, arah, lapis = 'bodi') {
  const g = new Gambar(FW, FH);
  const samping = arah === 'right' || arah === 'left';
  const balik = () => (arah === 'left' ? g.cermin() : g);

  if (jenis === 'sepeda') {
    if (samping) {
      roda(g, 6, RY); roda(g, 25, RY);
      g.garis(6, 44, 16, 43, C.rangka, 1);        // rantai bawah
      g.garis(16, 43, 14, 39, C.rangkaT, 2);      // tabung sadel
      g.garis(14, 38, 24, 38, C.rangka, 2);       // tabung atas
      g.garis(16, 43, 24, 38, C.rangka, 1);       // tabung bawah
      g.garis(25, 44, 24, 38, C.rangkaT, 2);      // garpu depan
      g.garis(24, 37, 25, 35, C.logamT, 1);       // batang setang
      g.rect(24, 34, 29, 35, C.logam);            // setang
      g.rect(9, 37, 15, 38, C.sadel);             // sadel
      g.rect(14, 42, 18, 43, C.logamT);           // engkol + pedal
      g.rect(1, 39, 4, 42, C.keranjang);          // keranjang belakang
      g.rect(1, 39, 4, 39, C.logamT);
      return balik();
    }
    // DEPAN / BELAKANG: roda di bawah, garpu, setang melebar sepanjang dada.
    roda(g, 16, 45);
    g.garis(16, 45, 16, 39, C.rangka, 2);
    g.rect(6, 37, 25, 38, C.logam);
    g.rect(4, 37, 6, 40, C.logamT); g.rect(25, 37, 27, 40, C.logamT);
    if (arah === 'up') {
      g.rect(11, 39, 20, 40, C.sadel);            // tampak belakang
      g.rect(2, 34, 8, 40, C.keranjang);
      g.rect(2, 34, 8, 34, C.logamT);
    } else {
      g.rect(14, 40, 18, 41, C.lampu);
    }
    return g;
  }

  if (jenis === 'motor') {
    if (samping) {
      roda(g, 6, RY); roda(g, 26, RY);
      g.rect(9, 39, 23, 42, C.bodi);
      g.rect(10, 37, 22, 38, C.tangki);
      g.rect(6, 37, 10, 39, C.ban);
      g.rect(12, 42, 18, 44, C.bodiT);
      g.garis(5, 42, 1, 41, C.logamT, 2);         // knalpot
      g.garis(26, 44, 25, 38, C.bodiT, 2);        // garpu depan
      g.garis(25, 37, 26, 34, C.logamT, 1);
      g.rect(22, 33, 29, 34, C.logam);            // setang
      g.rect(27, 31, 29, 32, C.kaca);             // spion
      g.rect(21, 36, 23, 37, C.lampu);
      return balik();
    }
    roda(g, 16, 45);
    g.garis(16, 45, 16, 40, C.bodiT, 2);
    g.rect(5, 38, 26, 39, C.logam);               // setang lebar
    g.rect(3, 38, 5, 41, C.logamT); g.rect(26, 38, 28, 41, C.logamT);
    g.rect(13, 40, 19, 42, C.lampu);              // lampu depan
    g.rect(10, 43, 21, 45, C.bodi);
    if (arah === 'up') g.rect(11, 40, 21, 41, C.tangki);
    return g;
  }

  // ---------------------------------------------------------------- truk
  // Pengendara duduk di belakang PANEL DEPAN: kepala & bahu terlihat, tangan di
  // setir. Atap tidak digambar — kepala harus tetap di y 1..30.
  if (samping) {
    if (lapis === 'bodi') {
      roda(g, 5, 44); roda(g, 24, 44);
      g.rect(1, 28, 15, 44, C.kayu);              // bak belakang
      for (const y of [31, 34, 37, 40, 43]) g.rect(1, y, 15, y, C.kayuT);
      g.rect(15, 28, 15, 44, C.kayuT);
      g.rect(16, 34, 30, 45, C.kabin);            // dinding kabin bawah
      g.rect(16, 34, 30, 34, C.kabinT);
      return balik();
    }
    g.rect(22, 32, 30, 45, C.kabin);              // panel depan
    g.rect(22, 32, 22, 45, C.kabinT);
    g.rect(23, 32, 29, 34, C.kabinT);             // bibir kaca depan
    g.rect(24, 38, 29, 40, C.kaca);               // kaca depan (rendah)
    g.rect(24, 41, 28, 42, C.logamT);             // setir
    g.rect(30, 38, 30, 40, C.lampu);
    return balik();
  }
  if (arah === 'down') {
    if (lapis === 'bodi') {
      roda(g, 6, 44); roda(g, 26, 44);
      g.rect(2, 34, 29, 45, C.kabin);
      g.rect(2, 34, 29, 34, C.kabinT);
      return g;
    }
    g.rect(2, 38, 29, 45, C.kabin);               // panel depan
    g.rect(6, 38, 25, 40, C.kaca);
    g.rect(11, 41, 20, 42, C.logamT);             // setir
    g.rect(3, 35, 4, 37, C.kabinT); g.rect(27, 35, 28, 37, C.kabinT);
    g.rect(3, 42, 6, 44, C.lampu); g.rect(25, 42, 28, 44, C.lampu);
    return g;
  }
  if (lapis === 'bodi') {                          // tampak belakang: bak kayu
    roda(g, 6, 44); roda(g, 26, 44);
    g.rect(1, 30, 30, 45, C.kayu);
    for (const y of [33, 36, 39, 42, 45]) g.rect(1, y, 30, y, C.kayuT);
    return g;
  }
  g.rect(1, 30, 30, 31, C.kayuT);
  return g;
}

/* ------------------------------------------------------- pengendara */
// Posisi duduk. `potong` = baris pertama kaki asli (di atasnya dipakai).
// Semuanya untuk bingkai 48: kepala tidak digeser sama sekali.
const GEO = {
  sepeda: {
    potong: { down: 42, up: 42, left: 39, right: 39 },
    sadel: { down: [16, 40], up: [16, 40], right: [17, 39], left: [14, 39] },
    pedal: { down: [13, 47], up: [13, 47], right: [19, 45], left: [12, 45] },
    bahu: { down: [[11, 32], [19, 32]], up: [[11, 32], [19, 32]],
            right: [[13, 32], [13, 33]], left: [[17, 32], [17, 33]] },
    tangan: { down: [[6, 38], [25, 38]], up: [[6, 38], [25, 38]],
              right: [[27, 35], [26, 36]], left: [[4, 35], [5, 36]] },
    kaki: { down: false, up: false },
  },
  motor: {
    potong: { down: 42, up: 42, left: 39, right: 39 },
    sadel: { down: [16, 40], up: [16, 40], right: [17, 39], left: [14, 39] },
    pedal: { down: [13, 47], up: [13, 47], right: [19, 45], left: [12, 45] },
    bahu: { down: [[11, 32], [19, 32]], up: [[11, 32], [19, 32]],
            right: [[13, 32], [13, 33]], left: [[17, 32], [17, 33]] },
    tangan: { down: [[4, 39], [27, 39]], up: [[4, 39], [27, 39]],
              right: [[28, 34], [27, 35]], left: [[3, 34], [4, 35]] },
    kaki: { down: false, up: false },
  },
  truk: {
    // Duduk di belakang panel depan: tangan di setir, kaki tidak terlihat.
    kaki: false,
    potong: { down: 40, up: 36, left: 41, right: 41 },
    sadel: { down: [16, 42], up: [16, 42], right: [16, 42], left: [15, 42] },
    pedal: { down: [14, 44], up: [14, 44], right: [19, 44], left: [12, 44] },
    bahu: { down: [[11, 34], [19, 34]], up: [[11, 34], [19, 34]],
            right: [[13, 34], [13, 35]], left: [[17, 34], [17, 35]] },
    tangan: { down: [[13, 41], [18, 41]], up: [[13, 41], [18, 41]],
              right: [[27, 41], [26, 42]], left: [[4, 41], [5, 42]] },
  },
};

// Ayunan kaki per frame (0 = diam, ±2 = kayuh).
const AYUN = [0, 2, 0, -2];

function pengendara(tiles, arah, frame, jenis) {
  const geo = GEO[jenis];
  const potong = geo.potong[arah];
  const src = tiles[arah][frame];
  const g = new Gambar(FW, FH);

  g.tempel(kendaraanJenis(jenis, arah, 'bodi'), 0, 0);

  for (let y = 0; y < potong; y++) {
    for (let x = 0; x < SW; x++) {
      const c = src.get(x, y);
      if (c[3] > 0) g.set(x, y, c);
    }
  }

  const [sx, sy] = geo.sadel[arah];
  const [px0, py0] = geo.pedal[arah];
  const ayun = AYUN[frame % AYUN.length];
  const py = py0 + (arah === 'down' || arah === 'up' ? 0 : ayun);

  const pakaiKaki = geo.kaki === false ? false : ((geo.kaki ?? {})[arah] ?? true);
  if (pakaiKaki) {
    if (arah === 'right' || arah === 'left') {
      const arahLangkah = arah === 'right' ? 1 : -1;
      const lutut = sx + 4 * arahLangkah;
      g.rect(sx - 2 * arahLangkah, sy, lutut, sy + 2, C.biruT);            // paha
      g.rect(lutut - 1, sy + 2, lutut + 1, py - 2, C.biruT);               // betis
      g.rect(lutut - 2 + arahLangkah * ayun, py - 1, lutut + 2 + arahLangkah * ayun, py, C.sepatu);
      g.set(sx - arahLangkah, sy + 1, C.biruM);
    } else {
      g.rect(sx - 5, sy, sx - 2, sy + 3, C.biruT);
      g.rect(sx + 2, sy, sx + 5, sy + 3, C.biruT);
      g.rect(sx - 5, sy + 3, sx - 2, py - 2, C.biruT);
      g.rect(sx + 2, sy + 3, sx + 5, py - 2, C.biruT);
      g.rect(sx - 6, py - 1, sx - 1, py, C.sepatu);
      g.rect(sx + 1, py - 1, sx + 6, py, C.sepatu);
    }
  }

  const [bahu, tangan] = [geo.bahu[arah], geo.tangan[arah]];
  for (let i = 0; i < bahu.length; i++) {
    const [bx, by] = bahu[i];
    const [hx, hy] = tangan[i];
    const n = Math.max(Math.abs(hx - bx), Math.abs(hy - by), 1);
    for (let s = 0; s <= n; s++) {
      const x = Math.round(bx + (hx - bx) * s / n);
      const y = Math.round(by + (hy - by) * s / n);
      g.set(x, y, s < n ? C.biruM : C.kulit);
      g.set(x, y + 1, s < n ? C.biruT : C.kulitG);
    }
  }

  if (jenis === 'truk') g.tempel(kendaraanJenis('truk', arah, 'atas'), 0, 0);
  return g;
}

/* -------------------------------------------------------------- jalan */
const ARAH = ['down', 'left', 'right', 'up'];
let jumlah = 0;

for (const avatar of AVATAR) {
  const lembar = bacaPNG(join(AKAR, `assets/sprites/characters/${avatar}/${avatar}_sheet.png`));
  const tiles = {};
  ARAH.forEach((arah, r) => {
    tiles[arah] = [0, 1, 2, 3].map((c) => lembar.potong(c * SW, r * SH, SW, SH));
  });
  for (const jenis of KENDARAAN) {
    const out = new Gambar(FW * 4, FH * 4);
    ARAH.forEach((arah, r) => {
      for (let c = 0; c < 4; c++) {
        const f = pengendara(tiles, arah, c, jenis);
        out.tempel(f, c * FW, r * FH);
      }
    });
    tulisPNG(join(AKAR, `assets/sprites/characters/${avatar}/${avatar}_${jenis}.png`), out);
    jumlah++;
  }
}

console.log(`${jumlah} lembar sprite kendaraan dibuat (${AVATAR.length} avatar x ${KENDARAAN.length} kendaraan, bingkai ${FW}x${FH}).`);
