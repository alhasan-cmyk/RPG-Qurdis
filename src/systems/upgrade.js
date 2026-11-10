// Papan "Ragam Usaha Desa" — sekarang menjual KENDARAAN dengan diamond.
//
// Kenapa berubah: dulu papan ini berisi tujuh peningkatan bangunan (rumah,
// lemari, peti, dapur, pasar, kandang, bibit) yang dibeli dengan uang dan bahan
// serta dikunci oleh bab. Pemain memutuskan lain: yang dijual sekarang sepeda,
// sepeda motor, dan truk pengangkut barang, dibayar dengan DIAMOND hasil ujian,
// tanpa syarat bab maupun bahan.
//
// Modul ini sengaja tetap ada dan tetap bernama `upgrade`:
//   - layar, tombol, dan jalur simpanan sudah terpasang di sana;
//   - mengganti nama berkas berarti menyentuh main.js, ui/, dan alat uji
//     sekaligus, padahal perilakunya sama: "beli sesuatu, pakai selamanya".
//
// Yang disimpan di sini hanya DAFTAR BARANG; seluruh efeknya (kecepatan, slot
// tas) hidup di systems/kendaraan.js — satu tempat, supaya angka di layar dan
// angka di dalam permainan tidak pernah berbeda.

import { KENDARAAN } from './kendaraan.js';

/**
 * Daftar barang yang dijual papan, diturunkan dari daftar kendaraan.
 *
 * Diturunkan, bukan ditulis ulang: kalau harga atau efek di kendaraan.js
 * berubah, papan ikut berubah tanpa ada angka kedua yang bisa tertinggal.
 */
export const UPGRADE = KENDARAAN.map((k) => ({
  id: k.id,
  nama: k.nama,
  judul: k.judul,
  ikon: `kendaraan_${k.id}`,
  harga: k.harga,
  // `guna` dipakai layar sebagai baris "Guna:" — kalimatnya datang dari data
  // kendaraan, jadi tidak ada dua tempat yang bisa berbeda.
  guna: k.guna,
  cepat: k.cepat,
  slotTas: k.slotTas,
}));

/** Benih yang dibagikan kebun bibit tiap pagi. */
export const BENIH_HARIAN = 'seed_turnip';
export const BENIH_PER_TINGKAT = 5;

export const NAMA_BAHAN = {
  stone: 'batu', wood: 'kayu', fiber: 'serat', egg: 'telur',
  turnip: 'lobak', potato: 'kentang', tomato: 'tomat', milk: 'susu',
};

export class Upgrade {
  /**
   * `kendaraan` = objek systems/kendaraan.js. Papan ini tidak menyimpan
   * kepemilikan sendiri: satu sumber kebenaran, supaya layar dan dunia tidak
   * bisa berbeda pendapat soal apa yang sudah dibeli.
   */
  constructor(kendaraan = null) {
    this.kendaraan = kendaraan;
    /** Pesan gagal terakhir dari beli(), untuk layar. */
    this.pesanGagal = '';
  }

  /** Peningkatan dengan id ini, atau null. */
  def(id) { return UPGRADE.find((u) => u.id === id) ?? null; }

  /** Sudah dimiliki? */
  punya(id) { return Boolean(this.kendaraan?.punya?.(id)); }

  /**
   * Status satu baris papan.
   *
   * Bentuknya sudah berubah: papan ini sekarang menjual KENDARAAN dengan
   * DIAMOND, bukan peningkatan rumah dengan uang dan bahan. `ilmu`, `inv`, dan
   * `uang` masih diterima supaya pemanggil lama (rekap, uji tata letak) tidak
   * langsung rusak, tetapi tidak lagi dipakai untuk memutuskan apa pun.
   */
  status(id, { diamond = 0, kendaraan = null } = {}) {
    const k = this.def(id);
    if (!k) return null;
    // `diamond` boleh berupa objek systems/diamond.js (bentuk yang dipakai
    // layar), fungsi (bentuk lama), atau angka (pengujian). Dibaca di satu
    // tempat ini supaya angka di layar dan angka yang ditagih saat membeli
    // tidak bisa berbeda — dan pernah berbeda: `beli()` menerima OBJEK,
    // sedangkan `status()` dulu menerima fungsi, sehingga pembelian selalu
    // ditolak "Kurang 10 diamond" walau saldonya cukup.
    const saldo = Math.max(0, Math.floor(Number(
      typeof diamond === 'function' ? diamond()
        : (diamond && typeof diamond === 'object' ? diamond.jumlah : diamond),
    ) || 0));
    const punya = Boolean(kendaraan?.punya?.(id));
    const dipakai = kendaraan?.dipakai === id;
    const kurang = Math.max(0, k.harga - saldo);
    return {
      id,
      def: k,
      level: punya ? 1 : 0,      // dipakai layar lama: 1 = sudah dimiliki
      maks: 1,
      penuh: punya,
      punya,
      dipakai,
      harga: k.harga,
      saldo,
      kurang,
      // Boleh dibeli kalau belum punya dan diamond-nya cukup. Tidak ada syarat
      // lain: pemain memilih "diamond saja", jadi tidak ada bab maupun bahan.
      boleh: !punya && kurang === 0,
    };
  }

  /**
   * Kenapa satu baris belum bisa dibeli. Satu sumber: tombol E dan tulisan di
   * layar memakai kalimat yang sama persis.
   */
  alasanTidakBoleh(st, { ringkas = false } = {}) {
    if (!st) return '';
    if (st.punya) return 'Sudah kau miliki.';
    if (st.kurang > 0) {
      return ringkas
        ? `Kurang ${st.kurang} diamond.`
        : `Kurang ${st.kurang} diamond — satu bab lulus = 1 diamond.`;
    }
    return `Tekan E untuk membeli dengan ${st.harga} diamond.`;
  }

  /**
   * Beli kendaraan. Pemanggil hanya boleh memanggil ini kalau statusnya
   * `boleh`; pemeriksaan tetap diulang di sini supaya tidak ada jalan membeli
   * tanpa diamond yang cukup.
   */
  beli(id, { diamond, kendaraan }) {
    const r = kendaraan?.beli?.(id, { diamond }) ?? { gagal: 'Kendaraan tidak siap.' };
    if (r.gagal) { this.pesanGagal = r.gagal; return null; }
    this.pesanGagal = '';
    return { id, harga: r.harga };
  }

  /* ------------------------------------------------------------- efek */

  /**
   * Efek peningkatan lama (energi, slot tas, pengali jual, benih pagi) SUDAH
   * TIDAK ADA: barang yang dijual papan ini sekarang kendaraan, bukan
   * bangunan. Seluruh efeknya hidup di systems/kendaraan.js, satu tempat,
   * supaya angka di layar dan angka di permainan tidak pernah berbeda.
   */

  /** Baris ringkas untuk rapor/rekap: hanya yang sudah dimiliki. */
  ringkasan() {
    return UPGRADE.filter((u) => this.kendaraan?.punya?.(u.id))
      .map((u) => `${u.nama} — ${u.guna}`);
  }

  /**
   * Simpanan papan. Isinya HANYA daftar kendaraan yang dimiliki; kalau objek
   * kendaraan tidak dipasang (mis. di alat uji), hasilnya kosong dan tidak
   * pernah menulis "level" lama yang sudah tidak dipakai.
   */
  toJSON() { return this.kendaraan ? { kendaraan: this.kendaraan.toJSON() } : { kendaraan: {} }; }

  load(d) {
    if (!d?.kendaraan) return;
    this.kendaraan?.load?.(d.kendaraan);
  }
}
