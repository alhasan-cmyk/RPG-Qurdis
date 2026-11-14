// Penghasil sprite Ustadz Tasoro — warga baru yang berkeliling naik sepeda motor.
//
// Kenapa dibuat skrip, bukan aset jadi: sprite ini disusun dari potongan dua
// warga yang sudah ada (peci & wajah Kang Dadang, badan Pak Lurah) lalu
// diwarnai ulang. Kalau salah satu lembar sumber itu digambar ulang, sprite
// Tasoro harus ikut dibuat ulang — dan tanpa skrip, tidak ada yang ingat
// hubungan itu.
//
// Tanpa dependensi: PNG dibaca/ditulis sendiri dengan node:zlib.
//
//   node tools/buat-sprite-tasoro.mjs            (menulis ke repo ini)
//   node tools/buat-sprite-tasoro.mjs <folder>   (dipakai tests/uji.mjs)
//
// Keluaran:
//   assets/sprites/characters/npc_tasoro/npc_tasoro_sheet.png   (128x192)
//   assets/sprites/characters/npc_tasoro/npc_tasoro_motor.png   (192x256)
//   assets/sprites/portraits/npc_tasoro.png                     (96x96)
//
// Bingkai TETAP 32x48 untuk lembar jalan kaki, sama seperti warga lain: ia
// kadang turun dari motor dan berdiri, dan tinggi badannya tidak boleh berubah
// saat itu. Lembar motor memakai bingkai 48x64 — sama dengan lembar kendaraan
// pemain — karena roda & dek skuter tidak muat di 48 px (lihat
// tools/buat-sprite-kendaraan.mjs).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');

const FW = 32, FH = 48;          // bingkai lembar jalan kaki (sama dengan warga lain)
const MFW = 48, MFH = 64;        // bingkai lembar motor (sama dengan kendaraan pemain)
const ARAH = ['down', 'left', 'right', 'up'];

/* --------------------------------------------------------------- warna */
// Satu palet kecil, semuanya diambil dari sprite warga yang sudah ada supaya
// Tasoro tidak terlihat berasal dari "generasi" gambar yang lain.
const C = {
  peci: [31, 28, 35],            // peci hitam (sama dengan peci Kang Dadang)
  peciT: [22, 20, 26],
  kulit: [209, 127, 81],
  kulitG: [169, 81, 52],
  garis: [43, 30, 24],
  kemeja: [233, 228, 212],       // kemeja putih gading (tidak menyilaukan)
  kemejaT: [186, 181, 166],
  rompi: [72, 106, 78],          // rompi/sarung hijau tua
  rompiT: [48, 74, 54],
  celana: [58, 54, 70],
  sepatu: [52, 40, 34],
  // kendaraan
  ban: [48, 42, 46], banT: [30, 26, 30],
  logam: [206, 206, 214], logamT: [146, 148, 158],
  bodi: [52, 74, 104], bodiT: [34, 50, 74],
  lampu: [245, 226, 140], kaca: [150, 190, 210],
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
  /** Pecahkan warna: setiap piksel diganti menurut fungsi pemetaan. */
  recolor(fn) {
    const o = new Gambar(this.w, this.h, Uint8Array.from(this.px));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c[3] === 0) continue;
        const d = fn(c, x, y);
        if (d) o.set(x, y, d);
      }
    }
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

/* ---------------------------------------------------------- bahan sumber */
const W = (n) => join(AKAR, `assets/sprites/characters/${n}/${n}_sheet.png`);
const dadang = bacaPNG(W('npc_dadang'));   // peci + kepala
const harun = bacaPNG(W('npc_harun'));     // badan berkemeja panjang

/** Satu bingkai dari lembar 4x4 milik warga lain. */
function bingkai(lembar, arah, kolom) {
  const baris = ARAH.indexOf(arah);
  return lembar.potong(kolom * 32, baris * 48, 32, 48);
}

/**
 * Apakah warna ini milik peci hitam?
 *
 * Peci Kang Dadang memakai tiga nada gelap (31,28,35) / (25,22,31) / (22,20,26).
 * Ambangnya sengaja ketat: rambut Pak Lurah juga gelap, dan menangkapnya akan
 * menghitamkan rambut Tasoro.
 */
const gelap = (c) => c[0] < 60 && c[1] < 60 && c[2] < 70;
const kulitGelap = (c) => c[0] > 120 && c[0] < 200 && c[1] > 60 && c[1] < 130 && c[2] < 100;
const terang = (c) => c[0] > 150 && c[1] > 150 && c[2] > 140;

/**
 * Badan Tasoro, digambar sendiri — BUKAN hasil mewarnai ulang badan warga lain.
 *
 * Percobaan pertama menyalin badan Pak Lurah lalu memetakan warnanya. Hasilnya
 * berbintik seperti kamuflase: kemeja beliau adalah batik dengan belasan nada,
 * dan ambang warna apa pun akan memetakannya secara tidak konsisten. Badan yang
 * digambar langsung juga lebih mudah disesuaikan (kemeja putih + rompi hijau,
 * celana abu tua) tanpa menyentuh warga lain.
 *
 * Koordinat: bingkai 32x48, kaki di y 45. `ayun` menggeser kaki depan/belakang
 * sehingga keempat bingkai membentuk langkah, bukan empat gambar yang sama.
 */
function badan(g, arah, ayun) {
  const samping = arah === 'left' || arah === 'right';
  if (samping) {
    // ---- tampak samping: satu lengan di depan, dua kaki bergantian
    g.rect(14, 24, 17, 27, C.kulit);             // leher
    g.rect(14, 25, 17, 25, C.kulitG);            // bayangan dagu di leher
    g.rect(10, 27, 21, 39, C.kemeja);            // kemeja
    g.rect(10, 27, 12, 39, C.kemejaT);           // punggung (bayangan)
    g.rect(10, 27, 21, 27, C.kemejaT);           // garis bahu
    g.rect(10, 31, 21, 39, C.rompi);             // rompi dari dada ke pinggang
    g.rect(10, 31, 12, 39, C.rompiT);
    g.rect(18, 27, 21, 30, C.kemeja);            // dada masih kemeja
    g.rect(16, 27, 21, 28, C.kemejaT);
    g.rect(16, 29, 21, 36, C.kemeja);            // lengan depan menjulur
    g.rect(17, 36, 21, 38, C.kulit);             // tangan
    g.set(19, 37, C.kulitG);
    const kakiDepan = 14 + Math.max(0, ayun);
    const kakiBelakang = 11 - Math.min(0, ayun);
    g.rect(kakiBelakang, 40, kakiBelakang + 2, 44, C.celana);
    g.rect(kakiDepan, 40, kakiDepan + 2, 44, C.celana);
    g.rect(kakiDepan - 1, 45, kakiDepan + 3, 45, C.sepatu);
    g.rect(kakiBelakang - 1, 44, kakiBelakang + 2, 44, C.sepatu);
    return;
  }
  // ---- tampak depan & belakang: dua lengan, dua kaki sejajar
  g.rect(14, 24, 17, 27, C.kulit);
  g.rect(14, 25, 17, 25, C.kulitG);
  g.rect(7, 27, 24, 39, C.kemeja);               // kemeja lebar
  g.rect(7, 27, 24, 27, C.kemejaT);              // garis bahu
  if (arah === 'down') {
    g.rect(7, 28, 12, 39, C.rompi);              // panel rompi kiri
    g.rect(19, 28, 24, 39, C.rompi);             // panel rompi kanan
    g.rect(12, 28, 12, 39, C.rompiT);
    g.rect(19, 28, 19, 39, C.rompiT);
    g.rect(13, 28, 18, 39, C.kemeja);            // dada kemeja di tengah
    g.rect(15, 29, 16, 30, C.kemejaT);           // kancing
    g.set(15, 33, C.kemejaT); g.set(15, 36, C.kemejaT);
    g.rect(13, 27, 18, 27, C.kemejaT);           // kerah
  } else {
    g.rect(7, 28, 24, 35, C.rompi);              // punggung: rompi
    g.rect(7, 28, 24, 28, C.rompiT);
    g.rect(15, 29, 16, 35, C.rompiT);
    g.rect(7, 36, 24, 39, C.kemeja);             // ujung kemeja di bawah rompi
    g.rect(7, 36, 24, 36, C.kemejaT);
  }
  g.rect(4, 28, 7, 36, C.kemeja);                // lengan kiri + kanan
  g.rect(24, 28, 27, 36, C.kemeja);
  g.rect(4, 28, 7, 28, C.kemejaT);
  g.rect(24, 28, 27, 28, C.kemejaT);
  g.rect(4, 36, 7, 38, C.kulit);                 // tangan
  g.rect(24, 36, 27, 38, C.kulit);
  g.set(5, 37, C.kulitG); g.set(26, 37, C.kulitG);
  const kiri = 9 + Math.max(0, ayun);
  const kanan = 18 - Math.min(0, ayun);
  g.rect(kiri, 40, kiri + 3, 44, C.celana);
  g.rect(kanan, 40, kanan + 3, 44, C.celana);
  g.rect(kiri - 1, 45, kiri + 4, 45, C.sepatu);
  g.rect(kanan - 1, 45, kanan + 4, 45, C.sepatu);
}

/** Ayunan kaki per bingkai — sama polanya dengan langkah warga lain. */
const AYUN = [0, 1, 0, -1];

/**
 * Satu bingkai Tasoro BERDIRI: kepala + peci dari Kang Dadang (baris 0..25),
 * badan sendiri. Warna kulit disamakan pada sambungan leher supaya jahitannya
 * tidak terlihat.
 */
function tokoh(arah, kolom, { tanpaBadan = false } = {}) {
  const g = new Gambar(FW, FH);
  const kepala = bingkai(dadang, arah, kolom);
  for (let y = 0; y <= 27; y++) {
    for (let x = 0; x < FW; x++) {
      const c = kepala.get(x, y);
      if (c[3] > 0) g.set(x, y, c);
    }
  }
  if (!tanpaBadan) badan(g, arah, AYUN[kolom % AYUN.length]);
  return g;
}

/* ------------------------------------------------- kendaraan: skuter */
function roda(g, cx, cy, r) {
  g.lingkaran(cx, cy, r, C.banT);
  g.lingkaran(cx, cy, r - 1, C.ban);
  const j = r - 2;
  g.set(cx, cy - j, C.logamT); g.set(cx, cy + j, C.logamT);
  g.set(cx - j, cy, C.logamT); g.set(cx + j, cy, C.logamT);
  g.lingkaran(cx, cy, 1, C.logam);
}

/** Skuter dari samping — bentuk yang sama dengan motor pemain, bodi hijau tua. */
function skuterSamping(g) {
  g.rect(9, 57, 24, 61, C.bodi);
  g.rect(9, 57, 24, 57, C.bodiT);
  g.rect(19, 61, 36, 62, C.bodiT);
  g.rect(19, 61, 36, 61, C.bodi);
  g.rect(23, 58, 31, 60, C.bodiT);
  g.rect(31, 46, 38, 62, C.bodi);
  g.rect(31, 46, 31, 62, C.bodiT);
  g.rect(30, 44, 39, 49, C.bodi);
  g.rect(30, 44, 39, 44, C.bodiT);
  g.rect(34, 50, 37, 54, C.lampu);
  g.garis(31, 44, 33, 41, C.logamT, 1); g.rect(31, 40, 35, 41, C.kaca);
  g.rect(32, 41, 36, 44, C.kaca);
  g.rect(32, 41, 36, 41, C.bodiT);
  g.rect(5, 60, 12, 61, C.logamT);
  g.rect(5, 60, 7, 61, C.logam);
  roda(g, 12, 57, 5); roda(g, 39, 57, 5);
  g.rect(7, 53, 17, 53, C.bodiT);
  g.rect(34, 53, 44, 53, C.bodiT);
  g.rect(9, 52, 15, 52, C.bodi);
  g.rect(36, 52, 42, 52, C.bodi);
}

/** Skuter dari depan / belakang. */
function skuterDepan(g) {
  roda(g, 24, 61, 3);
  g.rect(14, 47, 34, 60, C.bodi);
  g.rect(14, 47, 15, 60, C.bodiT); g.rect(33, 47, 34, 60, C.bodiT);
  g.rect(19, 51, 29, 56, C.lampu);
  g.rect(20, 58, 28, 60, C.bodiT);
  g.rect(18, 53, 30, 54, C.logam);
  g.rect(11, 52, 15, 56, C.logamT); g.rect(33, 52, 37, 56, C.logamT);
  g.garis(13, 52, 11, 45, C.logamT, 1); g.rect(9, 43, 13, 45, C.kaca);
  g.garis(35, 52, 37, 45, C.logamT, 1); g.rect(35, 43, 39, 45, C.kaca);
}
function skuterBelakang(g) {
  roda(g, 24, 61, 3);
  g.rect(13, 49, 35, 60, C.bodi);
  g.rect(13, 49, 14, 60, C.bodiT); g.rect(34, 49, 35, 60, C.bodiT);
  g.rect(16, 50, 32, 53, C.bodiT);
  g.rect(20, 58, 28, 60, C.sadel ?? C.bodiT);
  g.rect(18, 53, 30, 54, C.logam);
  g.rect(11, 52, 15, 56, C.logamT); g.rect(33, 52, 37, 56, C.logamT);
  g.garis(13, 52, 11, 45, C.logamT, 1); g.rect(9, 43, 13, 45, C.kaca);
  g.garis(35, 52, 37, 45, C.logamT, 1); g.rect(35, 43, 39, 45, C.kaca);
}

/**
 * Satu bingkai Tasoro di atas skuter (bingkai 48x64).
 *
 * Urutannya menentukan apakah ia terlihat DUDUK DI ATAS motor atau berdiri di
 * belakangnya — pelajaran yang sama dengan lembar kendaraan pemain:
 *   1. roda, dek, dan bodi belakang (di belakang orang)
 *   2. badan + kepala Tasoro
 *   3. apron, cowl, lampu, setang, spakbor (di DEPAN orang)
 *   4. kaki menapak dek
 * Tanpa langkah 3, semua ciri skuter tertutup badannya dan yang tersisa cuma
 * roda yang menempel di bawah kemeja.
 */
function naikMotor(arah, kolom) {
  const g = new Gambar(MFW, MFH);
  const samping = arah === 'right' || arah === 'left';
  const balik = () => (arah === 'left' ? g.cermin() : g);
  const warnaBodi = C.rompi, warnaBodiT = C.rompiT;

  if (samping) {
    // ---- 1. di belakang orang: roda, dek, bodi belakang
    roda(g, 12, 57, 5); roda(g, 39, 57, 5);
    g.rect(9, 57, 24, 61, warnaBodi);            // bodi belakang + jok
    g.rect(9, 57, 24, 57, warnaBodiT);
    g.rect(19, 60, 36, 61, warnaBodiT);          // dek pijak
    g.rect(19, 60, 36, 60, warnaBodi);
    g.rect(5, 60, 12, 61, C.logamT);             // knalpot
    g.rect(5, 60, 7, 61, C.logam);
    // ---- 2. orangnya
    g.tempel(tokoh('right', kolom), 8, 16);
    // ---- 3. di depan orang: apron, cowl, lampu, setang, spakbor
    g.rect(30, 50, 36, 61, warnaBodi);           // apron / perisai kaki
    g.rect(30, 50, 30, 61, warnaBodiT);
    g.rect(29, 44, 37, 50, warnaBodi);           // cowl setang
    g.rect(29, 44, 37, 44, warnaBodiT);
    g.rect(32, 45, 35, 48, C.lampu);             // lampu depan
    g.rect(28, 49, 38, 50, C.logam);             // setang
    g.garis(35, 43, 36, 41, C.logamT, 1);        // tangkai spion
    g.rect(34, 39, 38, 41, C.kaca);              // spion
    g.rect(31, 41, 34, 44, C.kaca);              // kaca depan
    g.rect(31, 41, 34, 41, warnaBodiT);
    g.rect(8, 53, 16, 53, warnaBodiT);           // spakbor belakang
    g.rect(35, 53, 43, 53, warnaBodiT);          // spakbor depan
    // ---- 4. kaki menapak dek + tangan menggenggam setang
    g.rect(24, 55, 31, 57, C.celana);            // paha
    g.rect(30, 57, 32, 59, C.celana);            // betis
    g.rect(29, 60, 34, 60, C.sepatu);            // sepatu di dek
    let lx = 26, ly = 50;
    while (lx !== 33 || ly !== 55) {
      g.set(lx, ly, C.kemeja);
      g.set(lx, ly + 1, C.kemejaT);
      if (lx < 33) lx++;
      if (ly < 55) ly++;
    }
    g.rect(32, 55, 35, 55, C.kulit);             // tangan di grip
    return balik();
  }

  // ---- tampak depan / belakang
  roda(g, 24, 61, 3);
  g.rect(14, 47, 34, 60, warnaBodi);             // bodi
  g.rect(14, 47, 15, 60, warnaBodiT); g.rect(33, 47, 34, 60, warnaBodiT);
  g.rect(20, 58, 28, 60, warnaBodiT);
  g.tempel(tokoh(arah, kolom), 8, 16);
  // lapis depan: setang, grip, lampu (depan) atau lampu belakang (belakang)
  g.rect(10, 51, 15, 53, C.logamT); g.rect(33, 51, 38, 53, C.logamT);
  g.rect(15, 52, 33, 53, C.logam);
  g.rect(13, 52, 17, 53, C.kulit); g.rect(31, 52, 35, 53, C.kulit);
  if (arah === 'down') {
    g.rect(19, 54, 29, 57, C.lampu);             // lampu depan
    g.rect(19, 54, 29, 54, warnaBodiT);
  } else {
    g.rect(19, 54, 29, 57, warnaBodiT);          // lampu belakang
    g.rect(17, 55, 31, 56, C.rompi);
  }
  return g;
}

/* ------------------------------------------------------------- potret */
/**
 * Potret 96x96, digambar dari nol pada skala 3x (32x32 piksel logis).
 *
 * Dua percobaan sebelumnya gagal dan sengaja dicatat di sini supaya tidak
 * diulang: (1) memperbesar kepala sprite 3x -> blok 3x3 yang kasar; (2) mewarnai
 * ulang potret Pak Lurah -> kumis putih tetap tertinggal, batik jadi bercak, dan
 * kacamatanya mengambang. Menggambar sendiri memberi kendali penuh, dan hasilnya
 * pasti sama dengan kepala di sprite karena keduanya memakai palet yang sama.
 */
function potret() {
  // Digambar 1:1 pada 96x96 — bukan diperbesar dari grid kecil.
  //
  // Empat percobaan sebelumnya dicatat supaya tidak diulang: (1) memperbesar
  // kepala sprite 3x; (2) mewarnai ulang potret Pak Lurah (kumis putih
  // tertinggal); (3) grid 32px; (4) grid 24px, yang mata 12x8 px-nya terbaca
  // seperti kacamata hitam. Potret warga lain (Harun, Dadang) digambar tangan
  // pada resolusi penuh dengan detail 1 px, jadi hanya cara itu yang hasilnya
  // setara. Tata letaknya sengaja mengikuti potret Harun supaya dua kepala di
  // kotak dialog punya ukuran dan posisi yang sama.
  const g = new Gambar(96, 96);
  const px = (x, y, c) => g.set(x, y, c);
  const baris = (x0, x1, y, c) => { for (let x = x0; x <= x1; x++) px(x, y, c); };
  const kotak = (x0, y0, x1, y1, c) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c);
  };

  const kulit = C.kulit, kulitG = C.kulitG, kulitT = [124, 66, 44], kulitC = [231, 162, 112];
  const peci = C.peci, peciG = [20, 18, 24], peciT = [52, 44, 50];
  const mataP = [246, 243, 232], iris = [80, 48, 34], mataB = [36, 20, 16];

  // ---------------- peci: puncak membulat, tepi bawah melebar
  baris(38, 57, 0, peciG);
  kotak(34, 1, 61, 3, peci);
  kotak(32, 4, 63, 6, peci);
  kotak(30, 7, 65, 20, peci);
  kotak(28, 21, 67, 25, peci);
  baris(34, 61, 2, [66, 56, 62]);          // kilau puncak
  baris(30, 65, 12, [40, 34, 40]);         // lipatan
  baris(28, 67, 24, [40, 34, 40]);
  baris(28, 67, 25, peciG);                // tepi bawah peci
  baris(28, 29, 21, peciG); baris(66, 67, 21, peciG);

  // ---------------- wajah
  baris(33, 62, 26, kulit);                // dahi
  baris(30, 65, 27, kulit);
  baris(29, 66, 28, kulit);
  kotak(28, 29, 67, 62, kulit);            // pipi & rahang
  baris(29, 66, 63, kulit);
  baris(31, 64, 64, kulit);
  baris(34, 61, 65, kulit);
  baris(37, 58, 66, kulit);                // dagu
  baris(40, 55, 67, kulit);
  // cahaya dari kiri: tepi kanan satu nada lebih gelap
  baris(66, 67, 30, kulitG);
  for (let y = 31; y <= 62; y++) px(67, y, kulitG);
  baris(64, 66, 62, kulitG);
  baris(64, 65, 63, kulitG);
  // kilau tulang pipi kiri
  baris(31, 36, 46, kulitC);
  baris(31, 34, 47, kulitC);
  // telinga
  kotak(24, 40, 26, 52, kulit);
  kotak(69, 40, 71, 52, kulit);
  px(25, 46, kulitG); px(26, 46, kulitG);
  px(69, 46, kulitG); px(70, 46, kulitG);
  px(25, 43, kulitC);

  // ---------------- alis & mata (3x4 px, pupil 2 px)
  kotak(33, 36, 40, 38, peci);             // alis kiri
  kotak(55, 36, 62, 38, peci);
  kotak(33, 40, 40, 44, mataP);            // bola mata
  kotak(55, 40, 62, 44, mataP);
  kotak(35, 41, 37, 43, iris);             // iris
  kotak(57, 41, 59, 43, iris);
  px(36, 41, mataB); px(58, 41, mataB);    // pupil
  px(35, 42, mataB); px(57, 42, mataB);
  baris(33, 40, 40, kulitG);               // kelopak atas
  baris(55, 62, 40, kulitG);
  baris(33, 40, 44, kulitG);               // kelopak bawah
  baris(55, 62, 44, kulitG);
  px(31, 41, kulitC); px(64, 41, kulitC);  // sudut mata

  // ---------------- hidung
  baris(46, 49, 46, kulitG);
  baris(46, 49, 47, kulitG);
  kotak(45, 48, 50, 54, kulitG);
  baris(45, 50, 55, kulitG);
  baris(46, 49, 55, kulitT);
  baris(44, 45, 56, kulitG); baris(50, 51, 56, kulitG);
  baris(45, 46, 48, kulitC);               // batang hidung kena cahaya

  // ---------------- kumis hitam tipis (pembeda dari Pak Lurah)
  baris(38, 57, 58, peci);
  baris(36, 59, 59, peci);
  baris(40, 55, 60, peciG);
  baris(36, 38, 60, peciG); baris(57, 59, 60, peciG);

  // ---------------- mulut & dagu
  baris(41, 54, 62, [124, 62, 52]);
  baris(42, 53, 63, kulitT);
  baris(38, 39, 61, kulitG); baris(56, 57, 61, kulitG);

  // ---------------- leher, kerah, kemeja putih, rompi hijau
  kotak(38, 67, 57, 74, kulitG);
  baris(40, 55, 68, kulitT);
  // bahu melebar di dasar bingkai, seperti potret warga lain
  for (let y = 75; y < 96; y++) {
    const kiri = 12 - Math.floor((y - 75) / 3);
    const kanan = 83 + Math.floor((y - 75) / 3);
    baris(Math.max(2, kiri), Math.min(93, kanan), y, C.kemeja);
  }
  // bukaan kerah (V) + bayangan leher
  baris(38, 57, 75, kulitG);
  baris(41, 54, 76, kulitG);
  baris(44, 51, 77, kulitG);
  px(47, 78, kulit) ; px(48, 78, kulitT);
  // rompi hijau: dua panel di sisi, dengan bayangan ke dalam
  for (let y = 76; y < 96; y++) {
    const lebar = 5 + Math.floor((y - 76) / 4);
    baris(Math.max(2, 12 - Math.floor((y - 75) / 3)), 12 - Math.floor((y - 75) / 3) + lebar, y, C.rompi);
    baris(83 + Math.floor((y - 75) / 3) - lebar, Math.min(93, 83 + Math.floor((y - 75) / 3)), y, C.rompi);
  }
  baris(17, 20, 76, C.rompiT); baris(75, 78, 76, C.rompiT);
  // kancing kemeja
  for (const y of [80, 84, 88, 92]) { px(46, y, C.kemejaT); px(49, y, C.kemejaT); }
  baris(24, 71, 78, C.kemejaT);            // garis lipatan bahu
  return g;
}

/* -------------------------------------------------------------- jalan */
const jumlah = { jalan: 0, motor: 0 };

// Lembar jalan kaki 128x192 (4 arah x 4 bingkai).
const lembarJalan = new Gambar(FW * 4, FH * 4);
ARAH.forEach((arah, r) => {
  for (let c = 0; c < 4; c++) {
    lembarJalan.tempel(tokoh(arah, c), c * FW, r * FH);
  }
});
tulisPNG(join(AKAR, 'assets/sprites/characters/npc_tasoro/npc_tasoro_sheet.png'), lembarJalan);
jumlah.jalan++;

// Lembar motor 192x256.
const lembarMotor = new Gambar(MFW * 4, MFH * 4);
ARAH.forEach((arah, r) => {
  for (let c = 0; c < 4; c++) {
    lembarMotor.tempel(naikMotor(arah, c), c * MFW, r * MFH);
  }
});
tulisPNG(join(AKAR, 'assets/sprites/characters/npc_tasoro/npc_tasoro_motor.png'), lembarMotor);
jumlah.motor++;

tulisPNG(join(AKAR, 'assets/sprites/portraits/npc_tasoro.png'), potret());

console.log(`${jumlah.jalan} lembar jalan kaki (${FW}x${FH}), ${jumlah.motor} lembar motor (${MFW}x${MFH}), 1 potret (96x96).`);
