// Ragam usaha desa — "jalan kedua" bagi bab yang tidak terhubung ke alat.
//
// Kenapa ada: game ini hanya punya enam alat (cangkul, penyiram, kapak,
// beliung, sabit, pancing), sedangkan tiap kelas punya 8-12 bab. Enam alat tidak
// bisa menampung semuanya. Alih-alih mengarang alat yang tidak dipakai apa-apa,
// sisa bab itu dipakai untuk MENAIKKAN sesuatu yang sudah pemain punya —
// pola yang sama dengan Stardew Valley (rumah dan dapur dinaikkan lewat uang
// dan bahan) dan Harvest Moon (rumah, dapur, kandang).
//
// Aturannya sederhana dan sengaja tidak berlapis:
//   - satu peningkatan = satu bab yang harus LULUS dulu,
//   - ditambah uang dan bahan yang memang dihasilkan ladang sendiri,
//   - efeknya nyata dan langsung terasa (energi, tas, peti, bayaran, ternak).
//
// Yang TIDAK dilakukan di sini: menambah alat baru. Alat baru berarti animasi,
// tombol, dan aturan main baru; peningkatan hanya mengubah angka yang sudah ada.
//
// Karena itu `alat` di setiap baris BUKAN alat yang dipakai pemain — game ini
// hanya punya enam (cangkul, penyiram, kapak, beliung, sabit, pancing). Dulu di
// sini tertulis "Pena", "Kunci", "Lesung", "Sekop", "Bakul & Keranjang", dan
// "Benih"; label itu terbaca di papan sebagai "(Pena)" di samping nama alat yang
// benar-benar bisa dipakai, dan membuat murid mengira ada alat yang hilang.
// Sekarang yang ditulis hanya alat yang memang ada di hotbar (`alat`), dan
// peningkatan tanpa alat tidak menampilkan tanda kurung sama sekali.
import { nomorRomawi } from './ilmu.js';

/**
 * Daftar peningkatan, satu per "pekerjaan desa".
 *
 * `bab.kelas` hanya dipakai sebagai pilihan otomatis kalau pemain belum memilih
 * kelas. `naik` tidak dipakai untuk menghitung apa pun — seluruh efeknya
 * diturunkan dari `level` oleh fungsi di bawah, supaya angka di layar dan angka
 * di dalam permainan tidak pernah berbeda.
 */
export const UPGRADE = [
  {
    id: 'rumah',
    nama: 'Rumah',
    judul: 'Memperluas rumah',
    alat: 'beliung',
    ikon: 'house_lv1',
    bahan: { stone: 25, wood: 30 },
    biaya: 1200,
    bab: { X: 'x-mukjizat', XI: 'xi-orangtua', XII: 'dakwah' },
    // Energi harian: tiap tingkat menambah 20. Ini peningkatan yang paling
    // terasa karena seluruh pekerjaan ladang dibatasi energi.
    efek: (lv) => (lv ? `Energi maksimum +${lv * 20}` : ''),
  },
  {
    id: 'lemari',
    nama: 'Lemari',
    judul: 'Membuat lemari pakaian',
    ikon: 'furniture',
    bahan: { wood: 20, fiber: 10 },
    biaya: 400,
    perTingkat: 4,
    bab: { X: 'x-fungsi-hadis', XI: 'xi-toleransi', XII: 'musyawarah' },
    // 24 -> 32 -> 36 -> 40 -> 44 slot tas.
    efek: (lv) => (lv ? `Tas ${24 + lv * 4} slot` : ''),
  },
  {
    id: 'peti',
    nama: 'Peti',
    judul: 'Memperbesar peti penyimpanan',
    ikon: 'furniture',
    bahan: { wood: 25, stone: 10 },
    biaya: 600,
    perTingkat: 3,
    bab: { X: 'x-berlaku', XI: 'xi-kompetisi', XII: 'lingkungan' },
    efek: (lv) => (lv ? `Peti ${24 + lv * 8} slot` : ''),
  },
  {
    id: 'dapur',
    nama: 'Dapur',
    judul: 'Membangun dapur',
    ikon: 'furniture',
    bahan: { stone: 20, wood: 15, egg: 4 },
    biaya: 900,
    bab: { X: 'x-hadis-sunnah', XI: 'xi-etos-kerja', XII: 'iptek' },
    // Tanpa dapur, memasak belum mungkin; dengan dapur, setiap makanan
    // memulihkan 25% lebih banyak energi.
    efek: (lv) => (lv ? 'Makanan memulihkan +25% energi' : ''),
  },
  {
    id: 'pasar',
    nama: 'Pasar',
    judul: 'Ikut koperasi pasar desa',
    ikon: 'shipping_bin',
    bahan: { turnip: 10, potato: 8, tomato: 8 },
    biaya: 800,
    perTingkat: 3,
    bab: { X: 'x-hadis-sumber', XI: 'xi-halal', XII: 'sabar' },
    // Harga jual naik 10% per tingkat. Uangnya kembali pelan-pelan, bukan
    // sekali jadi — peningkatan yang langsung untung besar membuat ladang
    // berhenti menarik setelah dibeli.
    efek: (lv) => (lv ? `Harga jual +${lv * 10}%` : ''),
  },
  {
    id: 'kandang',
    nama: 'Kandang',
    judul: 'Memperluas kandang ternak',
    ikon: 'barn',
    bahan: { wood: 40, stone: 10, fiber: 10 },
    biaya: 1400,
    // Dulu XI memakai xi-orangtua — sama dengan syarat "Memperluas rumah",
    // sehingga satu bab menutup dua peningkatan sekaligus. Diganti bab XI lain
    // yang belum dipakai papan ini.
    bab: { X: 'x-tokoh', XI: 'xi-syukur', XII: 'amar-makruf' },
    // Satu ternak baru tiap tingkat (maksimum tiga, karena kandangnya juga
    // dibatasi pagar).
    efek: (lv) => (lv ? `Ternak +${Math.min(lv, 3)} ekor` : ''),
  },
  {
    id: 'bibit',
    nama: 'Kebun Bibit',
    judul: 'Menyemai kebun bibit',
    ikon: 'furniture',
    bahan: { wood: 12, fiber: 20 },
    biaya: 500,
    perTingkat: 3,
    // Dulu di sini tertulis x-otentik / xi-pergaulan / sederhana — dan di kelas X
    // maupun XI bab itu JUGA bab pembuka alat penyiram (Dokter Ratna). Akibatnya
    // "benih gratis tiap pagi" — hadiah untuk petani pemula — baru terbuka setelah
    // alat penyiram sendiri terbuka, dan bab yang sama ditagih dua kali.
    // Sekarang memakai bab lain di kelas yang sama: X Bab II, XI Bab I,
    // XII Bab I — semuanya bab awal, sesuai hadiahnya yang memang untuk
    // petani pemula.
    bab: { X: 'x-nuzul', XI: 'xi-penciptaan', XII: 'sederhana' },
    // Bahan tidak perlu dibeli tiap hari; benih gratis mengubah awal hari tanpa
    // mengubah aturan menanam.
    efek: (lv) => (lv ? `Benih gratis ${lv * 5} tiap pagi` : ''),
  },
];

/** Benih yang dibagikan kebun bibit tiap pagi. */
export const BENIH_HARIAN = 'seed_turnip';
export const BENIH_PER_TINGKAT = 5;

export const NAMA_BAHAN = {
  stone: 'batu', wood: 'kayu', fiber: 'serat', egg: 'telur',
  turnip: 'lobak', potato: 'kentang', tomato: 'tomat', milk: 'susu',
};

export class Upgrade {
  constructor() {
    this.level = {};          // id -> tingkat yang sudah dibeli
    for (const u of UPGRADE) this.level[u.id] = 0;
  }

  /** Peningkatan dengan id ini, atau null. */
  def(id) { return UPGRADE.find((u) => u.id === id) ?? null; }

  tingkat(id) { return this.level[id] ?? 0; }

  /** Berapa kali sebuah peningkatan boleh dibeli. */
  maks(id) { return this.def(id)?.perTingkat ?? 1; }

  /** Bab yang menjadi syarat, untuk kelas pemain. */
  babUntuk(id, tingkatKelas) {
    const u = this.def(id);
    if (!u) return null;
    return u.bab?.[tingkatKelas] ?? u.bab?.X ?? null;
  }

  /**
   * Boleh dibeli sekarang? Semua syarat dikembalikan sekaligus, bukan satu
   * pesan yang berubah-ubah — supaya layar bisa menampilkan daftar periksa:
   * "bahan ✓ · uang ✓ · bab IX ✗".
   */
  status(id, { ilmu, inv, uang, tingkatKelas }) {
    const u = this.def(id);
    if (!u) return null;
    // `uang` boleh berupa angka atau fungsi. Layar upgrade mengirim fungsi supaya
    // selalu membaca uang pemain yang terbaru; pemanggil lain (mis. rekap) cukup
    // mengirim angka.
    const duit = typeof uang === 'function' ? uang() : (uang ?? 0);
    const lv = this.tingkat(id);
    const penuh = lv >= this.maks(id);
    const kitab = this.babUntuk(id, tingkatKelas);
    const lulus = !kitab || ilmu?.lulus?.has(kitab);
    const bab = kitab ? (ilmu?.nomorBab(kitab) ?? 0) : 0;
    const judul = kitab ? (ilmu?.kitab(kitab)?.judul ?? '') : '';
    const biaya = u.biaya * (lv + 1);
    // Kebutuhan bahan per tingkat. `perlu` dipakai layar untuk menulis
    // "batu 0/25" sekaligus untuk menghitung kekurangannya — satu sumber,
    // supaya angka di layar tidak pernah berbeda dengan yang ditagih saat beli.
    const perlu = Object.fromEntries(
      Object.entries(u.bahan).map(([b, n]) => [b, n * (lv + 1)]),
    );
    const bahanKurang = Object.entries(perlu)
      .map(([b, n]) => ({ bahan: b, kurang: Math.max(0, n - (inv?.count(b) ?? 0)) }))
      .filter((x) => x.kurang > 0);
    // Guru bab syarat di kelas pemain. Diminta layar supaya murid tahu HARUS
    // ke siapa; nomor bab saja tidak cukup untuk menemukan orangnya.
    const guru = kitab ? (ilmu?.guruBab?.(kitab) ?? null) : null;
    const judulBabInti = judul ? (judul.split(' — ')[1] ?? judul) : '';
    // Alat seperti cangkul diberi bab pertama guru pemiliknya (lihat
    // keahlian.syarat). Papan kadang harus memarkir syaratnya di bab yang sama,
    // karena di kelas XII hanya ada 8 bab untuk 6 alat + 7 papan. Nomor bab yang
    // sama berarti "keduanya terbuka setelah lulus bab itu" — bukan salah ketik.
    // Penjelasan ini disusun di sini, bukan di layar, supaya tombol E dan layar
    // tidak pernah berbeda pendapat.
    const alatBerbagi = kitab ? (ilmu?.alatUntukBab?.(kitab) ?? null) : null;
    return {
      id,
      def: u,
      level: lv,
      maks: this.maks(id),
      penuh,
      kitab,
      bab,
      labelBab: bab ? `Bab ${nomorRomawi(bab)}` : '',
      judulBab: judul,
      judulBabInti,
      guru,
      alatBerbagi,
      lulus,
      biaya,
      perlu,
      bahanKurang,
      uangKurang: Math.max(0, biaya - duit),
      boleh: !penuh && lulus && !bahanKurang.length && biaya <= duit,
    };
  }

  /**
   * Satu kalimat siap tampil yang menjelaskan MENGAPA peningkatan ini belum
   * bisa dibeli — berurutan dari yang paling menentukan.
   *
   * Dipakai tombol E, dan dipakai juga oleh layar sebagai baris status bawah,
   * jadi pemain tidak pernah membaca dua alasan berbeda di tempat berbeda.
   *
   * Nama bahan bawaannya NAMA_BAHAN, bukan id mentah: kalau pemanggil lupa
   * mengirimkannya, kalimatnya masih "Kurang 25 batu", bukan "Kurang 25 stone".
   */
  alasanTidakBoleh(st, { namaBahan = NAMA_BAHAN, ringkas = false } = {}) {
    if (!st) return '';
    if (st.penuh) return ringkas ? 'Sudah tertinggi.' : 'Sudah pada tingkat tertinggi.';
    if (!st.lulus) {
      const guru = st.guru ? (ringkas ? `ke ${st.guru.nama}` : ` — ujian ke ${st.guru.nama}`) : '';
      if (ringkas) {
        // Versi pendek dipakai layar sempit: tetap menyebut nomor bab dan nama
        // guru (dua hal yang dicari murid), membuang judul bab dan keterangan
        // alat. Judul bab tetap terbaca di kolom kanan daftar.
        // "Ujian Bab V ke Bang Jaka." — 26 huruf, paling pendek yang masih
        // menyebut kedua hal yang dicari murid: bab mana, dan ke siapa.
        return `Ujian ${st.labelBab} ${guru}.`;
      }
      const judul = st.judulBabInti ? `: ${st.judulBabInti}` : '';
      // Kalau bab ini juga bab pembuka sebuah alat, sebutkan — supaya murid yang
      // sudah mengincar cangkul tahu bahwa satu ujian membuka dua hal.
      const juga = st.alatBerbagi ? ` Sekaligus membuka ${st.alatBerbagi}.` : '';
      return `Lulus dulu ${st.labelBab}${judul}${guru}. Itu syaratnya.${juga}`;
    }
    if (st.bahanKurang.length) {
      return `Kurang ${st.bahanKurang
        .map((b) => `${b.kurang} ${namaBahan[b.bahan] ?? b.bahan}`).join(', ')}.`;
    }
    return `Uangnya kurang G${st.uangKurang.toLocaleString('id-ID')}.`;
  }

  /** Kurangi bahan dan uang, naikkan tingkat. Pemanggil yang memastikan boleh. */
  beli(id, { inv, uang }) {
    const u = this.def(id);
    const lv = this.tingkat(id);
    if (!u || lv >= this.maks(id)) return null;
    const bahan = {};
    for (const [b, n] of Object.entries(u.bahan)) bahan[b] = n * (lv + 1);
    for (const [b, n] of Object.entries(bahan)) if (inv.count(b) < n) return null;
    for (const [b, n] of Object.entries(bahan)) inv.take(b, n);
    const biaya = u.biaya * (lv + 1);
    this.pakaiUang = biaya;            // dibaca pemanggil untuk mengurangi uang
    this.level[id] = lv + 1;
    return { id, level: lv + 1, biaya };
  }

  /* ------------------------------------------------------------- efek */

  /** Tambahan energi maksimum dari rumah. */
  energiTambahan() { return this.tingkat('rumah') * 20; }
  /** Slot tas. */
  slotTas() { return 24 + this.tingkat('lemari') * 4; }
  /** Slot peti. */
  slotPeti() { return 24 + this.tingkat('peti') * 8; }
  /** Pengali pemulihan energi makanan (dapur). */
  pengaliMakan() { return 1 + (this.tingkat('dapur') ? 0.25 : 0); }
  /** Pengali harga jual (pasar). */
  pengaliJual() { return 1 + this.tingkat('pasar') * 0.1; }
  /** Benih gratis tiap pagi dari kebun bibit. */
  benihPagi() { return this.tingkat('bibit') * BENIH_PER_TINGKAT; }
  /** Tambahan ternak (kandang). */
  ternakTambahan() { return Math.min(this.tingkat('kandang'), 3); }

  /** Baris ringkas untuk rapor/rekap: hanya yang sudah dibeli. */
  ringkasan() {
    return UPGRADE.filter((u) => this.tingkat(u.id) > 0)
      .map((u) => `${u.nama} tingkat ${this.tingkat(u.id)} — ${u.efek(this.tingkat(u.id))}`);
  }

  toJSON() { return { level: this.level }; }

  load(d) {
    if (!d?.level) return;
    for (const u of UPGRADE) this.level[u.id] = Math.max(0, Math.min(this.maks(u.id), d.level[u.id] ?? 0));
  }
}
