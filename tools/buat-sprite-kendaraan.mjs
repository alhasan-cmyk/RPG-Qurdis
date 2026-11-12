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
// BINGKAI PER KENDARAAN: sepeda & motor 48x64, truk 64x64. Bingkai karakter
// tetap 32x48; yang membesar hanya kendaraannya.
//
// Kenapa tidak lagi 32x48 untuk semuanya: kepala pemain sudah memakai 30 dari
// 48 px, dan topinya selebar 25 px dari bingkai 32 — jadi kabin truk MUSTAHIL
// lebih lebar dari topi pengemudinya, dan roda sepeda tidak dapat lebih dari
// 7 px. Itu geometri, bukan selera.
//
// Kenapa bingkai lebih tinggi TIDAK lagi membuat kepala "melonjak" seperti
// percobaan bingkai 56 dulu: dulu penunggangnya ikut digeser. Sekarang karakter
// ditempel UTUH pada offset yang membuat kepalanya mendarat di ketinggian yang
// sama seperti saat berjalan kaki (lihat TEMPEL/POTONG), dan karena pivot sprite
// `bottom-center` bingkai yang lebih tinggi tumbuh ke ATAS — jadi tidak ada
// lompatan saat naik/turun kendaraan. Truk sengaja menurunkan pengemudinya
// sedikit (duduk di kabin), tidak pernah menaikkannya.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Akar boleh diberikan sebagai argumen pertama: dipakai alat uji untuk
// membuktikan bahwa yang di-commit memang hasil skrip ini, bukan versi lama.
const AKAR = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const AVATAR = ['player_m', 'player_f', 'player_m2', 'player_f2'];
const KENDARAAN = ['sepeda', 'motor', 'truk'];

const SW = 32, SH = 48;          // bingkai lembar karakter asli
// Bingkai per kendaraan. Tinggi 64 = 48 (karakter) + 16 px ruang kendaraan;
// lebar 64 hanya untuk truk, yang memang kendaraan paling besar.
const UKURAN = { sepeda: [48, 64], motor: [48, 64], truk: [64, 64] };
// Offset tempel karakter (dx, dy) dan baris terakhir yang dipakai (potong).
// - sepeda & motor: dy = FH - SH = 16, jadi kepala persis di ketinggian jalan kaki.
// - truk dari samping: dy = 16 juga (kabinnya dinaikkan sampai atap y 12 supaya
//   topi 17 px + wajah muat di jendela).
// - truk dari depan: dy = 20, pengemudi duduk 4 px lebih rendah di kabin.
// Tidak ada satu pun yang MENAIKKAN kepala di atas posisi jalan kaki.
const TEMPEL = {
  sepeda: { down: [8, 16], up: [8, 16], right: [8, 16], left: [8, 16] },
  motor: { down: [8, 16], up: [8, 16], right: [8, 16], left: [8, 16] },
  truk: { down: [16, 20], up: [16, 20], right: [23, 16], left: [23, 16] },
};
const POTONG = {
  sepeda: { down: 42, up: 42, right: 40, left: 40 },
  motor: { down: 42, up: 42, right: 40, left: 40 },
  truk: { down: 36, up: 36, right: 32, left: 32 },
};

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
// Semua koordinat DI BAWAH INI dalam bingkai masing-masing (lihat UKURAN) dan
// sudah final: dasar roda selalu di y 63 (motor/sepeda) atau y 63 (truk), jadi
// tidak ada kendaraan yang "tenggelam" atau "melayang" di atas bayangan kontak.
//
// Pembagian lapis: `bodi` digambar SEBELUM karakter, `atas` SESUDAH karakter.
// Itu yang membuat pemain terlihat duduk DI DALAM kendaraan: setang, lampu, dan
// pintu kabin ada di depannya. Tanpa lapis `atas`, pemain tampak mengambang di
// depan kendaraannya (bug yang terlihat di lembar 32x48 lama).
function roda(g, cx, cy, r) {
  g.lingkaran(cx, cy, r, C.banT);
  g.lingkaran(cx, cy, r - 1, C.ban);
  const j = r - 2;
  g.set(cx, cy - j, C.logamT); g.set(cx, cy + j, C.logamT);
  g.set(cx - j, cy, C.logamT); g.set(cx + j, cy, C.logamT);
  g.lingkaran(cx, cy, 1, C.logam);
}

/* ================================================================ SEPEDA */
// Roda 13 px (r=6) — dua kali diameter roda lama. Rangka berlian penuh
// menghubungkan sadel, bottom bracket, dan kepala garpu supaya terbaca sebagai
// sepeda yang dinaiki, bukan roda yang mengapung.
function sepedaSamping(g) {
  roda(g, 10, 57, 6); roda(g, 38, 57, 6);
  g.garis(23, 60, 16, 57, C.rangka, 2);       // tabung sadel
  g.garis(16, 56, 35, 55, C.rangka, 2);       // tabung atas
  g.garis(23, 60, 35, 55, C.rangka, 2);       // tabung bawah
  g.garis(10, 57, 23, 60, C.rangkaT, 1);      // rantai bawah
  g.garis(10, 57, 16, 57, C.rangkaT, 1);      // penopang sadel
  g.garis(38, 57, 35, 55, C.rangkaT, 2);      // garpu depan
  g.rect(13, 56, 24, 57, C.sadel);            // sadel: tepat di bawah pinggang
  g.rect(13, 58, 24, 58, C.rangkaT);
  g.garis(35, 54, 36, 53, C.logamT, 1);       // batang setang
  g.rect(32, 52, 41, 53, C.logam);            // setang
  g.rect(39, 53, 41, 55, C.logamT);
  g.lingkaran(23, 60, 2, C.logamT); g.set(23, 60, C.logam);   // engkol
  g.rect(25, 61, 28, 61, C.logam);            // pedal
  g.rect(2, 47, 8, 52, C.keranjang);          // keranjang belakang, di atas roda
  g.rect(2, 47, 8, 47, C.logamT);
  g.rect(2, 49, 8, 49, C.kayuT);
  g.garis(8, 52, 12, 56, C.logamT, 1);        // penopang keranjang ke sadel
}
// Tampak DEPAN. Batas penting: badan pemain selebar 25 px (x 11..36), jadi
// kendaraan depan-belakang hanya terbaca kalau bodinya MELEBAR melewati batas
// itu, dan bagian yang paling khas (lampu / keranjang) ditaruh DI BAWAH badan
// (y >= 58) — di situlah bingkai benar-benar kosong.
// Tampak DEPAN / BELAKANG (sepeda & motor).
//
// Aturan yang ditentukan oleh ukuran sprite: pada arah ini badan pemain menutupi
// x 11..36, y 47..58. Jadi semua bagian kendaraan yang khas (setang, keranjang,
// lampu, apron) digambar di lapis `bodi`?? TIDAK — lapis `bodi` ada di BELAKANG
// pemain dan akan tertutup badannya. Karena itu pada arah ini hampir semuanya
// masuk lapis `atas`, dan lapis `bodi` hanya menyisakan roda di bawah badan.
function sepedaDepan(g) {
  roda(g, 24, 62, 4);
  g.rect(23, 57, 25, 61, C.rangkaT);          // garpu di bawah badan
}
function sepedaBelakang(g) {
  roda(g, 24, 62, 4);
  g.rect(22, 59, 26, 61, C.rangkaT);
}

function motorSamping(g) {
  // Urutan: bodi dulu, RODA di atasnya. Roda skuter harus terlihat bulat penuh;
  // kalau roda digambar lebih dulu, panel bodi yang lebar menutupinya dan motor
  // terbaca seperti kereta salju.
  g.rect(9, 57, 24, 61, C.bodi);              // bodi belakang
  g.rect(9, 57, 24, 57, C.bodiT);
  g.rect(19, 61, 36, 62, C.bodiT);            // dek pijak rata
  g.rect(19, 61, 36, 61, C.bodi);
  g.rect(23, 58, 31, 60, C.bodiT);            // sambungan bodi ke dek
  g.rect(31, 46, 38, 62, C.bodi);             // apron / perisai kaki
  g.rect(31, 46, 31, 62, C.bodiT);
  g.rect(30, 44, 39, 49, C.bodi);             // cowl setang
  g.rect(30, 44, 39, 44, C.bodiT);
  g.rect(34, 50, 37, 54, C.lampu);            // lampu depan
  g.garis(31, 44, 33, 41, C.logamT, 1); g.rect(31, 40, 35, 41, C.kaca);  // spion
  g.rect(32, 41, 36, 44, C.kaca);             // kaca depan kecil
  g.rect(32, 41, 36, 41, C.bodiT);
  g.rect(5, 60, 12, 61, C.logamT);            // knalpot
  g.rect(5, 60, 7, 61, C.logam);
  // roda + spakbor
  roda(g, 12, 57, 5); roda(g, 39, 57, 5);
  g.rect(7, 53, 17, 53, C.bodiT);             // spakbor belakang
  g.rect(34, 53, 44, 53, C.bodiT);            // spakbor depan
  g.rect(9, 52, 15, 52, C.bodi);
  g.rect(36, 52, 42, 52, C.bodi);
}
function motorDepan(g) {
  roda(g, 24, 62, 3);
  g.rect(6, 48, 42, 62, C.bodi);              // perisai depan lebar
  g.rect(6, 48, 7, 62, C.bodiT); g.rect(41, 48, 42, 62, C.bodiT);
  g.rect(6, 48, 42, 49, C.bodiT);
  g.rect(14, 58, 34, 61, C.lampu);            // lampu depan besar, di bawah badan
  g.rect(14, 58, 34, 58, C.bodiT);
  g.rect(20, 55, 28, 56, C.bodiT);            // bibir apron
  g.rect(10, 54, 38, 55, C.logam);            // setang lebar
}
function motorBelakang(g) {
  roda(g, 24, 62, 3);
  g.rect(8, 49, 40, 62, C.bodi);              // bodi belakang lebar
  g.rect(8, 49, 9, 62, C.bodiT); g.rect(39, 49, 40, 62, C.bodiT);
  g.rect(12, 57, 36, 61, C.rangka);           // lampu belakang
  g.rect(12, 57, 36, 57, C.rangkaT);
  g.rect(10, 54, 38, 55, C.logam);            // setang
}

/* ------------------------------------------- lapis depan (di atas pemain) */
// Depan/belakang: setang, lampu, bibir keranjang, dan tepi sadel berada DI DEPAN
// badan pemain. Digambar sesudah karakter supaya pemain terbaca "duduk di".
function sepedaDepanAtas(g) {
  g.rect(9, 50, 13, 52, C.logamT); g.rect(35, 50, 39, 52, C.logamT);   // grip
  g.rect(13, 51, 35, 52, C.logam);                                     // setang
  g.rect(12, 51, 16, 52, C.kulit); g.rect(32, 51, 36, 52, C.kulit);    // tangan di grip
  g.rect(23, 52, 25, 54, C.logamT);                                    // batang setang
  g.rect(12, 54, 36, 59, C.keranjang);                                 // keranjang depan
  g.rect(12, 54, 36, 54, C.logamT);
  g.rect(12, 56, 36, 56, C.kayuT);
  g.rect(12, 58, 36, 58, C.kayuT);
  g.rect(12, 54, 12, 59, C.kayuT); g.rect(36, 54, 36, 59, C.kayuT);
  g.rect(20, 60, 28, 61, C.lampu);                                     // lampu
  g.rect(20, 60, 28, 60, C.logamT);
}
function sepedaBelakangAtas(g) {
  g.rect(9, 50, 13, 52, C.logamT); g.rect(35, 50, 39, 52, C.logamT);
  g.rect(13, 51, 35, 52, C.logam);
  g.rect(12, 51, 16, 52, C.kulit); g.rect(32, 51, 36, 52, C.kulit);
  g.rect(15, 54, 33, 56, C.sadel);                                     // sadel belakang
  g.rect(15, 57, 33, 58, C.logamT);                                    // rak
  g.rect(20, 60, 28, 61, C.rangka);                                    // lampu belakang
}
function motorDepanAtas(g) {
  g.rect(8, 50, 12, 52, C.logamT); g.rect(36, 50, 40, 52, C.logamT);   // grip
  g.rect(12, 51, 36, 52, C.logam);                                     // setang
  g.rect(11, 51, 15, 52, C.kulit); g.rect(33, 51, 37, 52, C.kulit);    // tangan
  g.rect(13, 53, 35, 61, C.bodi);                                      // apron skuter
  g.rect(13, 53, 35, 53, C.bodiT);
  g.rect(13, 53, 14, 61, C.bodiT); g.rect(34, 53, 35, 61, C.bodiT);
  g.rect(18, 55, 30, 59, C.lampu);                                     // lampu depan besar
  g.rect(18, 55, 30, 55, C.bodiT);
  g.rect(20, 60, 28, 61, C.bodiT);                                     // bibir bawah
}
function motorBelakangAtas(g) {
  g.rect(8, 50, 12, 52, C.logamT); g.rect(36, 50, 40, 52, C.logamT);
  g.rect(12, 51, 36, 52, C.logam);
  g.rect(11, 51, 15, 52, C.kulit); g.rect(33, 51, 37, 52, C.kulit);
  g.rect(11, 54, 37, 61, C.bodi);                                      // ekor bodi lebar
  g.rect(11, 54, 37, 54, C.bodiT);
  g.rect(14, 55, 34, 58, C.rangka);                                    // lampu belakang
  g.rect(17, 59, 31, 61, C.banT);                                      // plat
}

/* ============================================================ TRUK (64x64) */
// Samping: bak kayu (x1..20) + kabin besar berjendela (x20..62). Pengendara
// duduk DI BALIK kaca samping; lapis `atas` menutup badan & kakinya dengan
// panel pintu, jadi yang terlihat hanya kepala + bahu — seperti naik truk.
function trukSamping(g) {
  roda(g, 14, 56, 7); roda(g, 46, 56, 7);
  g.rect(1, 57, 62, 60, C.kabinT);            // sasis
  g.rect(1, 30, 21, 56, C.kayu);              // bak di belakang
  for (const y of [34, 38, 42, 46, 50, 54]) g.rect(1, y, 21, y, C.kayuT);
  g.rect(1, 30, 21, 30, C.kayuT); g.rect(1, 30, 1, 56, C.kayuT);
  g.rect(22, 12, 62, 56, C.kabin);            // kabin tinggi (atap y12)
  g.rect(22, 12, 62, 15, C.kabinT);           // atap
  g.rect(24, 16, 56, 46, C.kaca);             // kaca samping: 1 px lebih tinggi dari topi
  g.rect(57, 16, 62, 46, C.kabin);            // moncong depan
  g.rect(22, 47, 62, 56, C.kabin);            // panel pintu
  g.rect(22, 47, 62, 47, C.kabinT);
  g.rect(57, 22, 62, 28, C.lampu);            // lampu depan
  g.rect(54, 53, 62, 55, C.logamT);           // bemper
}
function trukSampingAtas(g) {
  g.rect(22, 12, 62, 16, C.kabinT);           // atap + bibir kaca
  g.rect(22, 16, 24, 46, C.kabinT);           // pilar belakang
  g.rect(56, 16, 57, 46, C.kabinT);           // pilar depan
  g.rect(24, 46, 56, 47, C.kabinT);           // ambang kaca
  g.rect(22, 48, 62, 56, C.kabin);            // pintu menutup badan
  g.rect(22, 48, 62, 48, C.kabinT);
  g.rect(26, 50, 52, 53, C.kabinT);           // cekung pintu
  g.rect(26, 54, 52, 56, C.kabin);
  g.rect(52, 50, 54, 51, C.logamT);           // gagang pintu
  g.rect(24, 57, 40, 58, C.kabinT);           // spakbor
}

// Depan: kabin + kaca depan besar. Kepala pengemudi terlihat lewat kaca, badan
// dan tangannya ditutup dasbor + setir.
function trukDepan(g) {
  roda(g, 14, 58, 6); roda(g, 50, 58, 6);
  g.rect(7, 16, 57, 57, C.kabin);
  g.rect(7, 16, 57, 19, C.kabinT);            // atap
  g.rect(11, 21, 53, 47, C.kaca);             // kaca depan
}
function trukDepanAtas(g) {
  g.rect(7, 16, 57, 21, C.kabinT);            // atap
  g.rect(7, 21, 11, 47, C.kabinT); g.rect(53, 21, 57, 47, C.kabinT); // pilar A
  g.rect(11, 21, 53, 22, C.kabinT);
  g.rect(11, 46, 53, 47, C.kabinT);
  g.rect(7, 48, 57, 50, C.kabin);             // dasbor
  g.rect(7, 48, 57, 48, C.kabinT);
  g.lingkaran(32, 50, 4, C.banT); g.lingkaran(32, 50, 3, C.ban);       // setir
  g.rect(31, 49, 33, 49, C.logamT);
  g.rect(7, 51, 57, 57, C.kabin);             // kap mesin
  g.rect(7, 51, 57, 51, C.kabinT);
  g.rect(13, 52, 51, 56, C.kabinT);           // kisi udara
  for (const x of [17, 22, 27, 32, 37, 42, 47]) g.rect(x, 53, x, 56, C.kabin);
  g.rect(8, 52, 12, 57, C.lampu); g.rect(52, 52, 56, 57, C.lampu);
  g.rect(9, 59, 55, 60, C.logamT);            // bemper
}
// Belakang: HANYA truk. Pengendara tidak pernah ditempel di baris ini, jadi yang
// terlihat dari belakang cuma pintu bak + atap kabin yang mengintip di atasnya.
function trukBelakang(g) {
  roda(g, 14, 56, 7); roda(g, 50, 56, 7);
  g.rect(16, 13, 48, 17, C.kabinT);           // atap kabin mengintip
  g.rect(7, 18, 57, 54, C.kayu);              // pintu bak
  for (let y = 22; y < 54; y += 5) g.rect(7, y, 57, y, C.kayuT);
  g.rect(7, 18, 57, 19, C.kayuT);
  g.rect(31, 20, 33, 53, C.kayuT);            // daun pintu
  g.rect(9, 22, 12, 33, C.kayuT); g.rect(52, 22, 55, 33, C.kayuT);   // engsel
  g.rect(8, 42, 14, 48, C.lampu); g.rect(50, 42, 56, 48, C.rangka);
  g.rect(7, 55, 57, 58, C.logamT);            // bemper belakang
  g.rect(7, 55, 57, 55, C.kabinT);
  g.rect(28, 56, 36, 57, C.kabinT);           // plat nomor
  g.rect(47, 30, 51, 32, C.logamT);           // gagang pintu
}

function kendaraanJenis(jenis, arah, lapis = 'bodi') {
  const [fw, fh] = UKURAN[jenis];
  const g = new Gambar(fw, fh);
  const samping = arah === 'right' || arah === 'left';
  const atas = lapis === 'atas';
  if (jenis === 'sepeda') {
    if (samping) sepedaSamping(g);
    else if (arah === 'down') (atas ? sepedaDepanAtas : sepedaDepan)(g);
    else (atas ? sepedaBelakangAtas : sepedaBelakang)(g);
  } else if (jenis === 'motor') {
    if (samping) motorSamping(g);
    else if (arah === 'down') (atas ? motorDepanAtas : motorDepan)(g);
    else (atas ? motorBelakangAtas : motorBelakang)(g);
  } else if (samping) {
    (atas ? trukSampingAtas : trukSamping)(g);
  } else if (arah === 'down') {
    (atas ? trukDepanAtas : trukDepan)(g);
  } else {
    trukBelakang(g);   // dari belakang: tidak ada lapis `atas` yang menutupi apa pun
  }
  return arah === 'left' ? g.cermin() : g;
}

/* ------------------------------------------------------- pengendara */
// Ayunan kaki per frame (0 = diam, ±2 = kayuh).
const AYUN = [0, 2, 0, -2];

/**
 * Satu bingkai "pemain menaiki kendaraan".
 *
 * Urutannya penting dan ini inti perbaikannya:
 *   1. bodi kendaraan (di BELAKANG pemain)
 *   2. potongan karakter dari lembar aslinya, ditempel utuh pada offset TEMPEL
 *   3. kaki duduk untuk kendaraan beroda dua (mengayuh / menapak dek)
 *   4. lapis depan kendaraan (setang, pintu kabin, dasbor) DI ATAS pemain
 *
 * Baris `up` untuk truk TIDAK memakai pengendara sama sekali: dari belakang
 * yang terlihat hanya bak truk. Itu diminta pemain dan juga benar secara visual.
 */
function pengendara(tiles, arah, frame, jenis) {
  const [fw, fh] = UKURAN[jenis];
  const g = new Gambar(fw, fh);
  const tanpaPengendara = jenis === 'truk' && arah === 'up';

  g.tempel(kendaraanJenis(jenis, arah, 'bodi'), 0, 0);
  if (tanpaPengendara) return g;

  const [dx, dy] = TEMPEL[jenis][arah];
  const potong = POTONG[jenis][arah];
  const src = tiles[arah][frame];
  for (let y = 0; y < potong; y++) {
    for (let x = 0; x < SW; x++) {
      const c = src.get(x, y);
      if (c[3] > 0) g.set(x + dx, y + dy, c);
    }
  }

  // Kaki + tangan versi duduk. Tanpa ini pemain terlihat BERDIRI di atas
  // kendaraannya: sprite aslinya berdiri dengan tangan menggantung di sisi.
  const samping = arah === 'right' || arah === 'left';
  if (samping && jenis !== 'truk') {
    const ayun = AYUN[frame % AYUN.length];
    const x = (v) => (arah === 'right' ? v : fw - 1 - v);   // dicerminkan untuk 'left'
    const lutut = 27 + ayun;
    const tapak = jenis === 'sepeda' ? 61 : 57;
    // kaki: paha -> betis -> sepatu di pedal/dek
    g.rect(x(17), 54, x(26), 56, C.biruT);                  // paha
    g.rect(x(lutut - 1), 57, x(lutut + 1), tapak - 1, C.biruT);   // betis
    g.rect(x(lutut - 2), tapak, x(lutut + 3), tapak, C.sepatu);   // sepatu
    g.set(x(17), 55, C.biruM); g.set(x(26), 55, C.biruT);
    // tangan memegang setang/grip: lengan dari bahu ke pegangan
    const genggam = jenis === 'sepeda' ? [33, 53] : [32, 53];
    let lx = 25, ly = 49;
    while (lx !== genggam[0] || ly !== genggam[1]) {
      g.set(x(lx), ly, C.biruM);
      g.set(x(lx), ly + 1, C.biruT);
      if (lx < genggam[0]) lx++;
      if (ly < genggam[1]) ly++;
    }
    g.rect(x(genggam[0] - 1), genggam[1], x(genggam[0] + 1), genggam[1], C.kulit);
    g.set(x(genggam[0]), genggam[1] + 1, C.kulitG);
  }

  g.tempel(kendaraanJenis(jenis, arah, 'atas'), 0, 0);
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
    const [fw, fh] = UKURAN[jenis];
    const out = new Gambar(fw * 4, fh * 4);
    ARAH.forEach((arah, r) => {
      for (let c = 0; c < 4; c++) {
        const f = pengendara(tiles, arah, c, jenis);
        out.tempel(f, c * fw, r * fh);
      }
    });
    tulisPNG(join(AKAR, `assets/sprites/characters/${avatar}/${avatar}_${jenis}.png`), out);
    jumlah++;
  }
}

const ukuran = KENDARAAN.map((k) => `${k} ${UKURAN[k].join('x')}`).join(', ');
console.log(`${jumlah} lembar sprite kendaraan dibuat (${AVATAR.length} avatar x ${KENDARAAN.length} kendaraan; bingkai ${ukuran}).`);
