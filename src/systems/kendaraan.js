// Kendaraan: sepeda, sepeda motor, dan truk pengangkut barang.
//
// Kenapa ada: diamond hanya berguna kalau ada yang bisa dibeli dengannya. Tiga
// kendaraan ini adalah barang paling mahal di desa, dan harganya sengaja "tidak
// masuk" untuk murid yang hanya mengerjakan satu-dua bab: truk baru tercapai
// setelah puluhan ujian lulus. Jadi bukan hukuman, tetapi tarikan supaya
// mengulang bab terasa ada gunanya.
//
// Tiap kendaraan punya FUNGSI BERBEDA, bukan sekadar "lebih cepat":
//
//   sepeda        2× lebih cepat daripada berjalan kaki
//   sepeda motor  3,5× lebih cepat — perjalanan jauh jadi sebentar
//   truk          1,8× lebih cepat DAN tas +12 slot untuk hasil panen
//
// Catatan penting soal "hemat tenaga": berjalan di lembah ini TIDAK memakan
// tenaga — itu keputusan lama dan disengaja (lihat main.js: lembahnya 48 petak,
// dan menghukum perjalanan membuat pemain berhenti menjelajah). Jadi sepeda
// tidak boleh menjanjikan "hemat tenaga": janji itu tidak akan terasa, dan
// angka yang tidak terasa lebih buruk daripada tidak ada angka. Yang dipakai
// adalah KECEPATAN, yang langsung terasa dalam hitungan detik pertama.

// Semua efeknya dihitung dari `kendaraan` yang sedang dipakai, dan semuanya
// punya nilai 1/0 saat tidak punya kendaraan — jadi ladang, tas, dan kecepatan
// tetap berjalan seperti biasa bagi pemain yang belum membeli apa pun.
//
// TENTANG WUJUD DI DUNIA: pemain yang sedang memakai kendaraan benar-benar
// berubah sprite — ia duduk di atas sepeda/motor/truk. Lembar sprite-nya dibuat
// oleh tools/buat-sprite-kendaraan.mjs (bukan aset mati): 4 avatar x 3
// kendaraan, bingkai 32x56 supaya ada ruang roda di bawah kaki tanpa memotong
// kepala. Nama sprite-nya diturunkan di sini (`spriteId`), supaya Character
// tidak perlu tahu apa pun tentang kendaraan, dan layar/tas/kecepatan tetap
// membaca angka dari berkas ini juga.

/**
 * Daftar kendaraan, dari yang paling murah.
 *
 * `harga` dalam DIAMOND (bukan gold): inilah yang memaksa murid mengerjakan
 * soal. `slotTas` boleh nol; `cepat` 1 berarti sama dengan berjalan kaki.
 */
export const KENDARAAN = [
  {
    id: 'sepeda',
    nama: 'Sepeda',
    judul: 'Sepeda onthel',
    harga: 10,
    cepat: 2,             // 2x kecepatan berjalan kaki
    slotTas: 0,
    guna: 'Jalan 2x lebih cepat dari jalan kaki',
  },
  {
    id: 'motor',
    nama: 'Sepeda motor',
    judul: 'Sepeda motor butut',
    harga: 25,
    cepat: 3.5,           // 3,5x kecepatan — paling gesit
    slotTas: 0,
    guna: 'Jalan 3,5x lebih cepat, paling gesit',
  },
  {
    id: 'truk',
    nama: 'Truk',
    judul: 'Truk pengangkut barang',
    harga: 50,
    cepat: 1.8,           // lebih cepat dari sepeda, lebih lambat dari motor
    slotTas: 12,          // +12 slot tas: satu truk penuh hasil panen
    guna: 'Tas +12 slot, jalan 1,8x lebih cepat',
  },
];

const PETA = new Map(KENDARAAN.map((k) => [k.id, k]));

/**
 * Batas diamond yang bisa dimiliki. Bukan pembatasan permainan — hanya jaring
 * pengaman supaya angka di HUD tidak pernah menjadi "Infinity" kalau simpanan
 * rusak atau ada yang mengubahnya dari konsol peramban.
 */
export const DIAMOND_MAKS = 9999;

export class Kendaraan {
  constructor() {
    /** id kendaraan yang dimiliki, urut sesuai pembelian. */
    this.dimiliki = [];
    /** id kendaraan yang sedang dipakai, atau null. */
    this.dipakai = null;
  }

  /** Definisi satu kendaraan, atau null. */
  def(id) { return PETA.get(id) ?? null; }

  punya(id) { return this.dimiliki.includes(id); }

  /** Kendaraan yang sedang dipakai (objek definisi), atau null. */
  get aktif() { return this.dipakai ? this.def(this.dipakai) : null; }

  /**
   * Beli kendaraan dengan diamond.
   *
   * `diamond` adalah objek systems/diamond.js — dipakai langsung supaya
   * pemotongan saldo dan pencatatan kepemilikan terjadi di satu tempat, bukan
   * di dua yang bisa berbeda hasilnya.
   *
   * Mengembalikan `{ id, harga }` kalau berhasil, atau `{ gagal: alasan }`.
   */
  beli(id, { diamond }) {
    const k = this.def(id);
    if (!k) return { gagal: 'Kendaraan itu tidak ada.' };
    if (this.punya(id)) return { gagal: `Kau sudah punya ${k.nama}.` };
    const saldo = diamond?.jumlah ?? 0;
    if (saldo < k.harga) return { gagal: `Kurang ${k.harga - saldo} diamond.` };
    diamond.tambah(-k.harga);
    this.dimiliki.push(id);
    // Yang baru dibeli langsung dipakai: kalau tidak, pemain bingung karena
    // uangnya habis tetapi tidak ada yang berubah.
    this.dipakai = id;
    return { id, harga: k.harga };
  }

  /** Pakai kendaraan yang sudah dimiliki. `null` = jalan kaki. */
  pakai(id) {
    if (id === null) { this.dipakai = null; return true; }
    if (!this.punya(id)) return false;
    this.dipakai = id;
    return true;
  }

  /* ---------------------------------------------------------------- efek */

  /** Pengali kecepatan berjalan. 1 = jalan kaki biasa. */
  pengaliCepat() { return this.aktif?.cepat ?? 1; }

  /** Tambahan slot tas dari kendaraan. 0 kalau jalan kaki. */
  slotTas() { return this.aktif?.slotTas ?? 0; }

  /**
   * Nama sprite untuk avatar yang sedang memakai kendaraan, atau null kalau
   * jalan kaki.
   *
   * Null (bukan nama cadangan) kalau lembar sprite-nya tidak ada: pemain yang
   * memakai avatar baru tanpa lembar kendaraan tetap bisa bermain sebagai
   * pejalan kaki, bukan crash karena `sprite()` melempar galat. Pemanggil
   * (Character) yang memutuskan memakai lembar mana.
   */
  spriteId(avatar, ada = () => false) {
    if (!this.dipakai || !avatar) return null;
    const nama = `${avatar}_${this.dipakai}`;
    return ada(nama) ? nama : null;
  }

  /** Baris ringkas untuk rekap/rapor. */
  ringkasan() {
    const k = this.aktif;
    return k ? [`${k.nama} — ${k.guna}`] : [];
  }

  toJSON() { return { dimiliki: [...this.dimiliki], dipakai: this.dipakai }; }

  /**
   * Muat dari simpanan. Simpanan lama tidak punya field ini sama sekali, dan
   * isi simpanan tidak dipercaya: id yang tidak dikenal dibuang, kendaraan yang
   * tidak dimiliki tidak bisa "dipakai", dan urutan dikembalikan ke urutan
   * daftar supaya layar selalu menampilkan urutan yang sama.
   */
  load(d) {
    const ids = Array.isArray(d?.dimiliki) ? d.dimiliki.filter((id) => PETA.has(id)) : [];
    this.dimiliki = KENDARAAN.map((k) => k.id).filter((id) => ids.includes(id));
    const pakai = d?.dipakai ?? null;
    this.dipakai = pakai && this.dimiliki.includes(pakai) ? pakai : null;
  }
}
