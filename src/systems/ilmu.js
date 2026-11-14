// Ilmu: materi Al-Qur'an Hadis yang hidup di dalam Lembah Kenanga.
//
// Dua pintu masuk, sesuai dua cara pemain bergerak di dunia ini:
//   1. Perpustakaan Balai Desa — membaca kitab, ayat demi ayat.
//   2. Warga desa — sesekali menyapa dengan satu pertanyaan sebelum mengobrol biasa.
//
// Yang disimpan hanya yang perlu disimpan: kitab mana yang sudah dibaca, berapa
// jawaban benar, dan pertanyaan mana yang sudah dijawab per warga per hari.
// Teks materi tinggal di data/ilmu.json — menambah bab tidak menyentuh kode ini.

// Hadiah persahabatan untuk jawaban yang tepat: TEPAT SATU HATI.
//
// 100 poin = 1 hati, jadi angka ini sengaja pas — bukan 25 atau 40 yang di
// layar tidak menggerakkan satu hati pun dan terasa seperti tidak dihargai.
// Satu hati tidak berlebihan: pertanyaan hanya muncul sekali sehari per warga,
// hanya untuk kitab yang belum dibaca, jadi sepanjang permainan jumlahnya
// sedikit. Hadiah barang kesukaan (80 poin) tetap bisa diulang tiap hari.
export const POIN_JAWAB_TEPAT = 100;

// Berapa soal yang ditanyakan pada SATU ujian bab.
//
// Bank soal satu bab boleh berisi sampai 30 soal (guru mengisi di templat).
// Satu ujian menanyakan SELURUH soal yang ada di bank bab itu — 30 soal untuk
// bank yang penuh, 12 soal untuk bab contoh yang baru terisi 12 — dengan
// URUTAN DAN PILIHAN DIACAK tiap murid, supaya menyalin jawaban tetangga tidak
// berguna. Kalau bank masih kosong, ujiannya tidak dibuka sama sekali.
export const UJIAN_MAKS = 30;

// Batas lulus: 80% dari jumlah soal yang ditanyakan. Dibulatkan KE ATAS
// (ceil), supaya 25 soal pun tetap menuntut 20 benar, bukan 19,9 yang lalu
// dibulatkan ke bawah dan diam-diam melunakkan aturannya.
/**
 * Dua jalur ujian khusus yang diberikan Ustadz Tasoro — di luar ujian per bab.
 *
 *   remedial — mengulang lima bab PERTAMA kelasmu, 50 soal.
 *   pengayaan — soal analisis dari lima bab yang sama, 50 soal.
 *
 * Banknya SAMA SEKALI terpisah dari `ujian` per bab: 900 soal per bab tetap
 * utuh dan tidak satu pun dipakai ulang di sini. Yang dihitung per bab di dalam
 * bank ini adalah medan `bab` pada tiap butir soal, dipakai untuk merekap
 * "bab mana yang masih lemah" tanpa perlu menebak dari teks soal.
 */
export const JALUR_TASORO = {
  remedial: {
    id: 'remedial',
    judul: 'Ujian Remedial',
    per: 50,
    // Remedial TIDAK mengubah `lulus`, TIDAK menulis nilai sekolah, dan TIDAK
    // memberi diamond. Hasilnya TETAP dikirim ke spreadsheet guru, tetapi ke
    // tab `Remedial` (bukan `Nilai`) lewat nilai-api.js -> kirimJalur.
    // Tujuannya latihan ulang: mengulang pelajaran yang belum dikuasai sebelum
    // murid menempuh ujian bab yang sebenarnya.
    menulisLulus: false,
    // `tab` = tab spreadsheet tujuan. `nilaiSekolah: false` menegaskan bahwa
    // angka ini tidak boleh masuk tab `Nilai` dan tidak mengubah nilai bab.
    tab: 'Remedial',
    nilaiSekolah: false,
    kirim: 'selalu',          // kirim SEMUA hasil, lulus maupun belum
    diamond: false,
  },
  pengayaan: {
    id: 'pengayaan',
    judul: 'Ujian Pengayaan',
    per: 50,
    menulisLulus: false,
    tab: 'Remedial',
    nilaiSekolah: false,
    kirim: 'selalu',
    diamond: true,            // tetap dihargai, tapi TIDAK lewat hadiahLulus bab
  },
};

/**
 * Berapa soal yang ditanyakan pada satu ujian jalur khusus.
 *
 * Dasar hitungannya `JALUR_TASORO[jalur].per` (50 soal), BUKAN `UJIAN_MAKS`
 * (30 soal). Aturan 30 soal itu milik ujian per bab dan tidak boleh berubah;
 * jalur remedial/pengayaan justru sengaja lebih panjang. Kalau banknya belum
 * penuh, yang ada dipakai apa adanya dan layar menyebutkannya terus terang.
 */
export function maksJalur(bank, jalurId) {
  const j = JALUR_TASORO[jalurId];
  return Math.min(bank.length, j?.per ?? UJIAN_MAKS);
}

export const BATAS_LULUS = 0.8;
export function perluBenar(jumlahSoal) {
  return Math.max(1, Math.ceil(jumlahSoal * BATAS_LULUS));
}

// Pengacak kecil dan deterministik (mulberry32) — hanya dipakai kalau ujian
// dijalankan dengan benih tertentu saat pengujian. Di permainan biasa
// Math.random yang dipakai, jadi urutan soal tidak bisa ditebak murid.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Urutan keahlian yang bisa dipelajari, dari yang paling mendesak di hari
// pertama sampai yang paling akhir. Dipakai hanya sebagai cadangan kalau data
// warga belum menyebut siapa mengajar apa.
const URUTAN_ALAT = ['hoe', 'water', 'axe', 'pickaxe', 'scythe', 'fish'];

/** Angka 1..12 menjadi I..XII, untuk label "Bab IV" di kotak pilihan warga. */
const ROMAWI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export function nomorRomawi(n) { return ROMAWI[n] ?? String(n); }

/**
 * Nama Indonesia alat, untuk kalimat yang dibaca murid.
 *
 * Dipisah dari `KATA_ALAT` karena yang ini benda ("cangkul"), bukan kata kerja
 * ("mencangkul"). Tanpa peta ini, kalimat syarat menulis "Bab ini juga membuka
 * axe" — benar secara data, tetapi tidak berarti apa pun bagi murid.
 */
export const NAMA_ALAT = {
  hoe: 'cangkul', water: 'penyiram', axe: 'kapak', pickaxe: 'beliung',
  scythe: 'sabit', fish: 'pancing', seed: 'benih', shovel: 'sekop',
};

/** Kata kerja yang dipakai warga saat menawarkan: "belajar mencangkul". */
export const KATA_ALAT = {
  hoe: 'mencangkul', water: 'menyiram', axe: 'menebang', pickaxe: 'menambang',
  scythe: 'memanen', fish: 'memancing', seed: 'menanam', shovel: 'menggali',
  pestle: 'menumbuk', pen: 'menulis', key: 'mengunci', basket: 'memikul',
};

export class Ilmu {
  constructor(data) {
    this.data = data;
    this.dibaca = new Set();     // id kitab yang sudah dibuka
    this.benar = 0;
    this.salah = 0;
    this.tanyaHari = {};         // npcId -> nomor hari terakhir ia bertanya
    this.lulus = new Set();      // id kitab yang ujiannya sudah lulus
    this.tingkat = null;         // 'X' | 'XI' | 'XII' — kelas pemain
    this.rombel = null;          // 1-15, hanya identitas
    // Nilai ujian per bab: kitabId -> { benar, jumlah, nilai, hari }.
    // Hanya ujian yang LULUS yang dicatat di sini (dan dikirim ke spreadsheet).
    this.nilai = {};
    this.ujianSisipan = null;    // hanya untuk pengujian; null di permainan
    // Hasil dua jalur Ustadz Tasoro: { X: { benar, jumlah, nilai, hari, perBab }, ... }
    // Dipisah dari `nilai` dengan sengaja — `nilai` adalah daftar bab yang
    // dilaporkan ke sekolah, sedangkan dua jalur ini urusan murid dengan
    // dirinya sendiri. Kunci teratasnya 'remedial' | 'pengayaan', di bawahnya
    // nama kelas ('X' | 'XI' | 'XII').
    this.tasoro = { remedial: {}, pengayaan: {} };
  }

  /** Satu kitab menurut id — dari seluruh data, dipakai untuk cek internal. */
  kitab(id) { return this.data.kitab.find((k) => k.id === id) ?? null; }

  /**
   * Kitab untuk kelas pemain.
   *
   * Bedanya kelas hanya pada materinya: murid kelas X membaca dan ditanyai 12
   * bab kelas X saja, tidak pernah bab XI atau XII. Ladang, warga, dan cerita
   * desanya tetap sama — yang berbeda isi pelajarannya. Seluruh layar (rak,
   * rekap, ujian) membaca dari sini, bukan dari data mentah.
   */
  semua() {
    if (!this.tingkat) return this.data.kitab;    // belum pilih kelas: semua tampil
    return this.data.kitab.filter((k) => k.kelas === this.tingkat);
  }

  /** Pertanyaan untuk warga ini, atau null kalau ia bukan pengajar. */
  tanyaUntuk(npcId) { return this.data.npc?.[npcId] ?? null; }

  /**
   * Apakah warga ini boleh bertanya sekarang?
   *
   * Aturannya: hanya kalau pemain belum pernah membaca kitab yang pertanyaannya
   * berasal. Warga bertanya tentang sesuatu yang belum dipelajari memang wajar —
   * itu justru yang mengantar pemain ke perpustakaan. Sebaliknya, menanyai hal
   * yang sudah dibaca berulang kali terasa seperti ujian tanpa akhir.
   */
  bolehTanya(npcId, dayNumber) {
    const daftar = this.tanyaUntuk(npcId);
    if (!daftar || !daftar.length) return null;
    // Soal hanya dari kelas pemain. Warga tetap menyapa dan mengobrol seperti
    // biasa kalau bank soal kelasnya kosong — yang hilang hanya latihannya,
    // bukan orangnya.
    const sekelas = this.untukKelas(daftar);
    if (!sekelas.length) return null;
    if (this.tanyaHari[npcId] === dayNumber) return null;   // sekali sehari
    // Judul bab ikut dikirim supaya layar latihan bisa menyebut sedang menguji
    // pelajaran apa. Tanpa ini pemain hanya melihat soal melayang tanpa konteks.
    const judul = (q) => ({
      judul: this.kitab(q.kitab)?.judul ?? '',
      tutup: this.data.npcTutup?.[npcId] ?? null,
    });
    const belum = sekelas.find((q) => !this.dibaca.has(q.kitab));
    if (belum) return { ...belum, ...judul(belum), ulang: false };

    // Semua kitab sudah dibaca. Tanpa cabang ini, pemain yang sudah menuntaskan
    // rak tidak akan pernah ditanya lagi — dan latihannya mati justru pada
    // murid yang paling rajin. Jadi warga tetap boleh menanyakan hal yang sudah
    // dipelajari, sebagai ULANGAN: tanpa tambahan hati, karena ganjarannya sudah
    // diberikan saat pertama kali dijawab.
    const acak = sekelas[(dayNumber + sekelas.length) % sekelas.length];
    return { ...acak, ...judul(acak), ulang: true };
  }

  /** Saring daftar soal agar hanya memuat kitab materi kelas ini. */
  untukKelas(daftar) {
    if (!this.tingkat) return daftar;          // belum memilih: jangan kunci apa pun
    return daftar.filter((q) => this.kitab(q.kitab)?.kelas === this.tingkat);
  }

  /**
   * Warga yang mengajari sebuah keahlian, beserta bab syaratnya DI KELAS INI.
   *
   * Gurunya sama untuk semua tingkat (Kang Dadang mengajari cangkul di kelas X,
   * XI, maupun XII), tapi bab yang harus diluluskan berbeda — karena setiap
   * kelas punya dunia dan babnya sendiri.
   */
  guruAlat(alat) {
    const idGuru = this.data.keahlian?.guru?.[alat];
    const kitabId = this.data.keahlian?.syarat?.[this.tingkat ?? this.kelasBawaan()]?.[alat]
      ?? this.data.keahlian?.syarat?.X?.[alat];
    if (idGuru && kitabId) {
      return {
        npcId: idGuru,
        nama: (this.data.npcNama ?? {})[idGuru] ?? idGuru,
        oleh: { kitab: kitabId, mengajar: alat },
      };
    }
    // Cadangan: kalau data belum lengkap, jangan pernah mengunci pemain.
    return null;
  }

  /** Keahlian yang diajarkan warga ini (kalau ada), beserta bab syaratnya. */
  alatNpc(npcId) {
    const guru = this.data.keahlian?.guru ?? {};
    for (const [alat, id] of Object.entries(guru)) {
      if (id !== npcId) continue;
      const kitab = this.data.keahlian?.syarat?.[this.tingkat]?.[alat]
        ?? this.data.keahlian?.syarat?.X?.[alat];
      return kitab ? { alat, kitab } : null;
    }
    return null;
  }

  /**
   * Bab-bab yang diajarkan seorang warga DI KELAS PEMAIN, berurutan.
   *
   * Pembagiannya ada di data (`keahlian.ajar`), bukan dihitung di sini: guru
   * mengajar 2-3 bab per kelas, dan pembagian itu harus bisa dilihat serta
   * diubah tanpa menyentuh kode.
   *
   * Kalau data belum punya `ajar` (berkas lama), jatuh kembali ke satu bab
   * syarat seperti dulu — supaya simpanan dan data lama tidak langsung rusak.
   */
  babDiajar(npcId) {
    // Kelas belum dipilih (murid baru, sebelum layar kelas diisi): pakai kelas
    // pertama di data, sama seperti `urutanBab`. Tanpa ini daftar ajarnya kosong
    // dan warga tampak tidak mengajar apa pun.
    const kelas = this.tingkat ?? this.kelasBawaan();
    const daftar = this.data.keahlian?.ajar?.[kelas]?.[npcId];
    if (Array.isArray(daftar) && daftar.length) {
      return daftar.filter((id) => this.kitab(id));
    }
    const alat = Object.keys(this.data.keahlian?.guru ?? {})
      .find((a) => this.data.keahlian.guru[a] === npcId);
    const satu = this.data.keahlian?.syarat?.[kelas]?.[alat];
    return satu ? [satu] : [];
  }

  /**
   * Siapa yang mengajarkan sebuah bab DI KELAS PEMAIN.
   *
   * Dipakai layar-layar yang menyebut "lulus Bab IV dulu" — papan Ragam Usaha,
   * kotak pilihan warga, dan pesan alat terkunci. Tanpa nama gurunya, murid
   * hanya melihat nomor bab dan harus menebak ke warga mana ia harus datang;
   * dengan 6 warga dan 8–12 bab, tebakan itu jarang benar.
   *
   * Mengembalikan `{ npcId, nama, urutan }` (urutan = bab ke berapa bagi guru
   * itu), atau null kalau bab itu tidak diajarkan siapa pun di kelas ini.
   */
  guruBab(kitabId) {
    if (!kitabId) return null;
    for (const npcId of Object.keys(this.data.keahlian?.ajar?.[this.tingkat ?? this.kelasBawaan()] ?? {})) {
      const daftar = this.babDiajar(npcId);
      const i = daftar.indexOf(kitabId);
      if (i >= 0) {
        return {
          npcId,
          nama: (this.data.npcNama ?? {})[npcId] ?? npcId,
          urutan: i + 1,
        };
      }
    }
    return null;
  }

  /**
   * Nama alat yang bab pembukanya adalah bab ini, untuk kelas pemain.
   *
   * Dipakai kalimat syarat papan Ragam Usaha: "…Sekaligus membuka kapak."
   * Tanpa ini, papan yang memarkir syaratnya di bab pembuka alat tampak seperti
   * salah ketik — dua hal berbeda menunjuk bab yang sama, tanpa penjelasan.
   */
  alatUntukBab(kitabId, kelas = null) {
    if (!kitabId) return null;
    const k = kelas ?? this.tingkat ?? this.kelasBawaan();
    const peta = this.data.keahlian?.syarat?.[k] ?? {};
    const alat = Object.keys(peta).find((a) => peta[a] === kitabId);
    if (!alat) return null;
    // Urutan cadangan: nama dari data (kalau suatu saat ditambahkan), lalu tabel
    // NAMA_ALAT di berkas ini, terakhir id mentah — jangan sampai layar menulis
    // "axe" hanya karena data belum punya nama.
    return this.data.keahlian?.alatNama?.[alat] ?? NAMA_ALAT[alat] ?? alat;
  }

  /** Alat yang dipegang warga ini (kalau ada), dan bab pembukanya. */
  alatNpcLengkap(npcId) {
    const guru = this.data.keahlian?.guru ?? {};
    const alat = Object.keys(guru).find((a) => guru[a] === npcId);
    if (!alat) return null;
    const kitabId = this.data.keahlian?.syarat?.[this.tingkat ?? this.kelasBawaan()]?.[alat]
      ?? this.data.keahlian?.syarat?.X?.[alat];
    return { alat, kitab: kitabId ?? null, kata: KATA_ALAT[alat] ?? 'bekerja' };
  }

  /**
   * Semua tawaran seorang warga, satu baris per bab yang ia ajarkan.
   *
   * Tiap baris membawa sendiri statusnya (boleh/mati + alasannya), sehingga
   * kotak pilihan cukup menggambar apa adanya. Aturan urutan bab tetap di
   * `bolehUjian` — satu sumber, dipakai layar warga, layar rak, dan layar ujian.
   *
   * `bukaAlat` menandai bab PERTAMA warga itu di kelas ini: itulah yang membuat
   * alatnya berguna. Murid perlu tahu bedanya — "belajar mencangkul" pada
   * baris pertama, "belajar bab berikutnya" pada baris kedua.
   */
  tawaranWarga(npcId) {
    const alat = this.alatNpcLengkap(npcId);
    return this.babDiajar(npcId).map((kitabId, i) => {
      const kitab = this.kitab(kitabId);
      const nomor = this.nomorBab(kitabId);
      const lulus = this.lulus.has(kitabId);
      const baris = {
        kitab: kitabId,
        judul: kitab?.judul ?? kitabId,
        bab: nomor,
        labelBab: `Bab ${nomorRomawi(nomor)}`,
        lulus,
        bank: this.jumlahSoal(kitabId),
        bukaAlat: i === 0 && !!alat,
        alat: i === 0 ? alat?.alat : null,
        kata: i === 0 ? alat?.kata : null,
        boleh: false,
        alasan: '',
      };
      if (!baris.bank) { baris.alasan = 'Soalnya belum disiapkan guru.'; return baris; }
      if (lulus) {
        baris.boleh = true;
        baris.alasan = 'Sudah lulus — boleh diulang untuk memperbaiki nilai.';
        return baris;
      }
      const izin = this.bolehUjian(kitabId);
      baris.boleh = izin.boleh;
      baris.alasan = izin.boleh ? '' : izin.alasan;
      return baris;
    });
  }

  /**
   * Apa yang bisa ditawarkan warga ini di kotak pilihan, DALAM KELAS PEMAIN.
   *
   * Ringkasan dari `tawaranWarga` untuk satu bab (yang pertama belum lulus).
   * Dipakai layar ujian untuk menyebut bab mana yang sedang ditempuh.
   *
   * `boleh` menentukan apakah barisnya bisa dipilih; `alasan` mengapa tidak.
   * Semua pesannya sudah berupa kalimat siap tampil, supaya layar warga dan
   * layar ujian tidak pernah memberi keterangan yang berbeda.
   */
  tawaranAlat(npcId) {
    const semua = this.tawaranWarga(npcId);
    if (!semua.length) return null;
    const pilih = semua.find((b) => !b.lulus && b.boleh) ?? semua.find((b) => !b.lulus) ?? semua[semua.length - 1];
    const alat = this.alatNpcLengkap(npcId);
    return {
      ...pilih,
      kata: alat?.kata ?? 'bekerja',
      alatNama: alat?.alat ?? null,
      total: semua.length,
      sisa: semua.filter((b) => !b.lulus).length,
    };
  }

  /** Apakah pemain sudah lulus ujian bab yang menjadi syarat alat ini. */
  bolehPakai(alat) {
    const g = this.guruAlat(alat);
    if (!g) return true;                 // alat tanpa syarat: jangan pernah dikunci
    return this.lulus.has(g.oleh.kitab);
  }

  lulusUjian(kitabId) { this.lulus.add(kitabId); }

  /**
   * Bank soal satu bab. Sekolah boleh mengisi sampai 30 soal per bab; yang
   * dipakai saat ujian hanya sebagian (lihat `soalUjian`). Sumbernya satu
   * tempat saja — `data.ujian[kitabId]` — supaya soal tidak perlu dicari di
   * banyak berkas.
   *
   * `ujianSisipan` adalah bank yang dipasang saat menguji game tanpa
   * menyentuh data (lihat `ulasanUji`); di permainan ia kosong.
   */
  bankSoal(kitabId) {
    // Bab kelas lain bukan materi kelas ini, jadi tidak mungkin diujikan.
    if (this.tingkat && this.kitab(kitabId)?.kelas !== this.tingkat) return [];
    return this.ujianSisipan?.[kitabId] ?? this.data.ujian?.[kitabId] ?? [];
  }

  /**
   * Soal yang benar-benar ditanyakan pada satu ujian: diambil dari bank.
   *
   *  - Bank ≤ UJIAN_MAKS soal  → semua soal ditanyakan (bank kecil tetap utuh).
   *  - Bank lebih besar        → UJIAN_MAKS soal diundi. Dengan UJIAN_MAKS = 30
   *    dan aturan "paling banyak 30 soal per bab", bank penuh berarti SELURUH
   *    bab ditanyakan — hanya urutannya yang diacak per murid.
   *
   * Pilihan jawaban juga diacak per soal, sehingga dua murid yang duduk
   * berdampingan tidak bisa sekadar menyalin posisi jawaban.
   *
   * `benih` membuat undiannya bisa diulang saat menguji; di permainan biarkan
   * kosong supaya benar-benar acak.
   */
  soalUjian(kitabId, benih = null) {
    const bank = this.bankSoal(kitabId);
    const n = Math.min(bank.length, UJIAN_MAKS);
    if (!n) return [];
    const acak = benih === null ? Math.random : mulberry32(Number(benih) || 1);
    const kocok = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(acak() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    return this.kocokSoal(bank, n, benih);
  }

  /**
   * Kocok bank lalu acak pilihan tiap soal. Satu tempat untuk ujian bab dan
   * ujian jalur khusus: kalau aturan pengacakan hidup di dua salinan, cepat
   * atau lambat keduanya berbeda dan `kunci` bisa menunjuk pilihan yang salah.
   */
  kocokSoal(bank, n, benih = null) {
    if (!bank.length || !n) return [];
    const acak = benih === null ? Math.random : mulberry32(Number(benih) || 1);
    const kocok = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(acak() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    // Seluruh bank dikocok lalu dipakai n soal teratas; tiap soal juga
    // diacak pilihannya. `kunci` ikut digeser supaya tetap menunjuk jawaban
    // yang sama — tanpa itu, mengacak pilihan akan menilai jawaban benar
    // sebagai salah.
    return kocok(bank).slice(0, n).map((soal) => {
      const asli = soal.pilihan ?? [];
      const urut = kocok(asli.map((_, i) => i));
      const kunciAsli = soal.kunci ?? 0;
      return {
        ...soal,
        pilihan: urut.map((i) => asli[i]),
        kunci: urut.indexOf(kunciAsli),
      };
    });
  }

  /** Berapa soal yang tersedia untuk satu bab — dipakai layar ujian & rekap. */
  jumlahSoal(kitabId) { return this.bankSoal(kitabId).length; }

  /* ------------------------------------------- jalur khusus (Ustadz Tasoro) */

  /** Kelas yang sedang ditempuh; sebelum murid memilih, kelas bawaan data. */
  kelasAktif() { return this.tingkat ?? this.kelasBawaan(); }

  /**
   * Bank soal satu jalur khusus untuk kelas pemain.
   *
   * Membaca `remedial` / `pengayaan` di ilmu.json. Keduanya berbentuk
   * `{ X: [soal...], XI: [...], XII: [...] }` — 50 soal per kelas, 10 untuk
   * masing-masing lima bab pertama. Bank ini terpisah dari `ujian` per bab,
   * jadi menambah/mengubahnya tidak menyentuh 900 soal ujian bab.
   */
  bankJalur(jalurId) {
    const semua = this.data?.[jalurId] ?? {};
    const bank = semua[this.kelasAktif()] ?? [];
    return Array.isArray(bank) ? bank : [];
  }

  /** Berapa soal yang ditanyakan pada satu ujian jalur khusus. */
  jumlahJalur(jalurId) { return maksJalur(this.bankJalur(jalurId), jalurId); }

  /**
   * Soal satu ujian jalur khusus: SELURUH bank dikocok (50 soal), pilihan juga
   * diacak per soal, sama seperti `soalUjian`. Dipakai ulang untuk keduanya
   * supaya aturan pengacakan tidak bercabang dua.
   */
  soalJalur(jalurId, benih = null) {
    const soal = this.bankJalur(jalurId);
    if (!soal.length) return [];
    const n = maksJalur(soal, jalurId);
    return this.kocokSoal(soal, n, benih);
  }

  /** Lima bab pertama kelas ini (persis seperti urutan rak). */
  babPertama(jumlah = 5) { return this.urutanBab().slice(0, jumlah); }

  /**
   * Apakah satu jalur khusus boleh dibuka sekarang.
   *
   * Aturannya jauh lebih longgar daripada ujian bab, dan itu disengaja:
   * remedial justru untuk murid yang BELUM lulus, jadi mensyaratkan "lulus
   * dulu" akan mengunci satu-satunya pintu yang menolongnya. Pengayaan boleh
   * dibuka kapan saja karena ia menuntut pemahaman yang lebih tinggi, bukan
   * urutan bab. Yang diperiksa hanya dua: banknya ada, dan kelasnya cocok.
   */
  izinJalur(jalurId) {
    const j = JALUR_TASORO[jalurId];
    if (!j) return { boleh: false, alasan: 'Ujian itu tidak dikenal.' };
    const bank = this.jumlahJalur(jalurId);
    if (!bank) {
      return { boleh: false, alasan: `Soal ${j.judul.toLowerCase()} untuk kelas ${this.kelasAktif()} belum disiapkan.` };
    }
    return { boleh: true, alasan: '', jumlah: bank, kelas: this.kelasAktif() };
  }

  /**
   * Simpan hasil satu jalur khusus.
   *
   * Tiga hal yang SENGAJA tidak dilakukan di sini, dan itu janji yang sudah
   * disebut ke pemain:
   *   1. tidak menulis `lulus` — remedial bukan ujian bab, dan murid yang gagal
   *      di sini tidak boleh dianggap gagal menuntaskan bab;
   *   2. tidak menulis `nilai` — `nilai` itulah yang dikirim ke spreadsheet
   *      guru, dan hasil remedial/pengayaan bukan nilai sekolah;
   *   3. tidak menyentuh `benar`/`salah` harian — hitungan itu untuk latihan
   *      harian dengan warga, bukan ujian panjang.
   *
   * Yang disimpan: nilai TERBAIK per kelas per jalur, plus rincian per bab
   * (`jawaban` berisi satu butir `{ bab, tepat }` per soal) supaya layar rekap
   * bisa menyebut bab mana yang masih lemah — itulah gunanya remedial.
   */
  catatJalur(jalurId, benar, jumlah, hari = 0, jawaban = []) {
    const j = JALUR_TASORO[jalurId];
    if (!j) return { lulus: false, perlu: 1, nilai: 0 };
    const perlu = perluBenar(jumlah);
    const lulus = benar >= perlu;
    const kelas = this.kelasAktif();
    const perBab = {};
    for (const j of jawaban) {
      const bab = j?.bab;
      if (!bab) continue;
      perBab[bab] = perBab[bab] ?? { benar: 0, jumlah: 0 };
      perBab[bab].jumlah += 1;
      if (j.tepat) perBab[bab].benar += 1;
    }
    const lama = this.tasoro?.[jalurId]?.[kelas];
    const hasil = {
      benar, jumlah, perlu, lulus, hari,
      nilai: jumlah ? Math.round((benar / jumlah) * 100) : 0,
    };
    // Hanya hasil terbaik yang disimpan — mengulang untuk memperbaiki tidak
    // boleh menurunkan catatan yang sudah bagus.
    if (!lama || benar > lama.benar) {
      this.tasoro[jalurId] = this.tasoro[jalurId] ?? {};
      this.tasoro[jalurId][kelas] = { ...hasil, perBab };
    }
    return hasil;
  }

  /** Hasil terakhir/terbaik satu jalur untuk kelas pemain, atau null. */
  hasilJalur(jalurId) { return this.tasoro?.[jalurId]?.[this.kelasAktif()] ?? null; }

  /* ------------------------------------------------------- urutan bab & nilai */

  /**
   * Urutan bab satu kelas PERSIS seperti di rak perpustakaan.
   *
   * Dipakai untuk aturan "bab lanjutan baru terbuka setelah bab sebelumnya
   * lulus". Urutannya diambil dari data kitab apa adanya, bukan dari daftar
   * terpisah, supaya menambah/menukar bab tidak perlu menyentuh kode ini.
   */
  urutanBab() {
    const semua = this.semua();
    // Kelas belum dipilih: jangan mencampur dua belas bab kelas X dengan XI dan
    // XII menjadi tiga puluh enam baris. Yang ditampilkan hanya kelas pertama
    // di data (X), dan begitu kelas dipilih daftarnya berganti utuh. Urutan
    // bab antar-kelas memang sama panjangnya, jadi aturan "berurutan" tetap
    // berlaku sama di ketiga jenjang.
    if (this.tingkat || !semua.length) return semua.map((k) => k.id);
    const kelas = semua[0].kelas;
    return semua.filter((k) => k.kelas === kelas).map((k) => k.id);
  }

  /** Kelas pertama di data — dipakai selama murid belum memilih kelas. */
  kelasBawaan() { return this.data.kitab?.[0]?.kelas ?? 'X'; }

  /** Nomor urut bab dalam kelasnya, mulai 1. 0 kalau bab tidak dikenal. */
  nomorBab(kitabId) { return this.urutanBab().indexOf(kitabId) + 1; }

  /** Bab tepat sebelum bab ini, atau null kalau ini bab pertama. */
  babSebelumnya(kitabId) {
    const urut = this.urutanBab();
    const i = urut.indexOf(kitabId);
    return i > 0 ? urut[i - 1] : null;
  }

  /** Bab tepat sesudah bab ini, atau null kalau ini bab terakhir. */
  babSesudahnya(kitabId) {
    const urut = this.urutanBab();
    const i = urut.indexOf(kitabId);
    return i >= 0 && i < urut.length - 1 ? urut[i + 1] : null;
  }

  /** Bab pertama kelas ini yang belum lulus — itulah yang boleh diujikan. */
  babTerbuka() {
    const belum = this.urutanBab().find((id) => !this.lulus.has(id));
    return belum ?? null;
  }

  /**
   * Apakah ujian bab ini boleh dibuka sekarang.
   *
   * Aturannya sederhana dan sengaja keras: bab harus dibuka berurutan. Bab ke-n
   * baru boleh diujikan kalau semua bab sebelum dia sudah lulus. Bab yang sudah
   * lulus selalu boleh diulang (untuk memperbaiki nilai).
   *
   * Mengembalikan { boleh, alasan, perlu? } — `alasan` sudah berupa kalimat
   * Indonesia siap ditampilkan, supaya layar tidak perlu menyusun sendiri dan
   * pesannya sama di semua tempat.
   */
  bolehUjian(kitabId) {
    if (!this.kitab(kitabId)) return { boleh: false, alasan: 'Bab ini tidak dikenal.' };
    if (this.lulus.has(kitabId)) return { boleh: true, alasan: '' };
    // Urutan diperiksa LEBIH DULU daripada ketersediaan soal. Alasannya:
    //  - murid yang melompat harus diberi tahu ia melompat, bukan diberi tahu
    //    bahwa soalnya kosong (padahal soalnya ada, hanya belum boleh dibuka);
    //  - guru yang membaca pesan "belum boleh, lulus dulu bab N" langsung tahu
    //    urutannya bekerja.
    // Bab yang soalnya memang belum diisi guru sudah dicegat lebih awal oleh
    // IlmuUI.mulaiUjian (yang memeriksa soal dulu), jadi tidak ada jalan buntu.
    const perlu = this.babSebelumnya(kitabId);
    if (perlu && !this.lulus.has(perlu)) {
      const judul = (this.kitab(perlu)?.judul ?? perlu).split(' — ')[0];
      return {
        boleh: false,
        alasan: `Lulus dulu ${judul} — bab dibuka berurutan, tidak boleh melompat.`,
        perlu,
      };
    }
    return { boleh: true, alasan: '' };
  }

  /**
   * Apakah bab ini punya soal yang bisa diujikan sekarang.
   *
   * Dipakai layar warga: kalau soalnya belum diisi guru, mengunci bab itu
   * dengan alasan "lulus bab sebelumnya dulu" akan menyesatkan — yang kurang
   * bukan urutan, melainkan soalnya.
   */
  adaSoal(kitabId) { return this.jumlahSoal(kitabId) > 0; }

  /**
   * Simpan hasil ujian sebuah bab.
   *
   * Yang menambah `lulus` hanya hasil yang memenuhi 80%. Hasil yang gagal tetap
   * dicatat di layar murid, tetapi TIDAK ditulis ke `nilai` — karena `nilai`
   * inilah yang dikirim ke spreadsheet sekolah, dan sekolah hanya perlu melihat
   * bab yang benar-benar sudah dituntaskan.
   */
  catatNilai(kitabId, benar, jumlah, hari = 0) {
    const perlu = perluBenar(jumlah);
    const lulus = benar >= perlu;
    if (lulus) {
      const lama = this.nilai[kitabId];
      // Nilai terbaik yang disimpan: mengulang untuk memperbaiki nilai tidak
      // boleh membuat nilai yang lebih bagus turun.
      if (!lama || benar > lama.benar) {
        this.nilai[kitabId] = {
          benar, jumlah, nilai: Math.round((benar / jumlah) * 100), hari,
        };
      }
      this.lulusUjian(kitabId);
    }
    return { lulus, perlu, nilai: Math.round((benar / jumlah) * 100) };
  }

  /** Ringkasan nilai satu kelas, urut seperti rak. Untuk layar & spreadsheet. */
  daftarNilai() {
    return this.urutanBab().map((id) => {
      const k = this.kitab(id) ?? {};
      const n = this.nilai[id] ?? null;
      return {
        kitab: id,
        bab: k.bab ?? (k.judul ?? '').split(' — ')[0],
        judul: k.judul ?? id,
        nomor: this.nomorBab(id),
        lulus: this.lulus.has(id),
        nilai: n?.nilai ?? null,
        benar: n?.benar ?? null,
        jumlah: n?.jumlah ?? null,
        bank: this.jumlahSoal(id),
      };
    });
  }

  catat(npcId, hari) { this.tanyaHari[npcId] = hari; }

  tandaiDibaca(id) {
    const baru = !this.dibaca.has(id);
    this.dibaca.add(id);
    return baru;
  }

  sudahDibaca(id) { return this.dibaca.has(id); }

  /** Persentase kitab yang sudah dibaca, untuk ditampilkan di rak. */
  progres() {
    const total = this.semua().length || 1;
    return Math.round((this.dibaca.size / total) * 100);
  }

  toJSON() {
    return { dibaca: [...this.dibaca], benar: this.benar, salah: this.salah,
             tanyaHari: this.tanyaHari, lulus: [...this.lulus],
             tingkat: this.tingkat, rombel: this.rombel,
             nilai: this.nilai,
             // Hasil remedial & pengayaan. Simpanan lama tidak punya medan ini,
             // jadi `load` mengisinya dengan objek kosong — pemain lama tidak
             // kehilangan apa pun dan rekap tidak menampilkan "undefined".
             tasoro: this.tasoro };
  }

  load(data) {
    if (!data) return;
    this.dibaca = new Set(data.dibaca ?? []);
    this.benar = data.benar ?? 0;
    this.salah = data.salah ?? 0;
    this.tanyaHari = data.tanyaHari ?? {};
    this.lulus = new Set(data.lulus ?? []);
    this.tingkat = data.tingkat ?? null;
    this.rombel = data.rombel ?? null;
    this.nilai = data.nilai ?? {};
    const t = data.tasoro ?? {};
    this.tasoro = { remedial: t.remedial ?? {}, pengayaan: t.pengayaan ?? {} };
  }

  /** Baris rapor untuk pemain/guru: apa yang sudah disentuh dan seberapa tepat. */
  rapor() {
    const kitab = this.semua().map((k) => `- ${k.judul}: ${this.sudahDibaca(k.id) ? 'sudah dibaca' : 'belum dibaca'}`);
    const total = this.benar + this.salah;
    const nilai = total ? Math.round((this.benar / total) * 100) : 0;
    const ujian = this.daftarNilai()
      .map((b) => `- ${b.bab}: ${b.lulus ? `LULUS ${b.nilai}%` : (b.bank ? 'belum diujikan' : 'soal belum ada')}`);
    return [
      'RAPOR BELAJAR — Lembah Kenanga',
      ...kitab,
      `Jawaban benar: ${this.benar}, salah: ${this.salah} (ketepatan ${nilai}%)`,
      'UJIAN PER BAB (lulus = 80%)',
      ...ujian,
      'UJIAN USTADZ TASORO (tidak masuk nilai sekolah)',
      ...Object.keys(JALUR_TASORO).map((id) => {
        const h = this.hasilJalur(id);
        const nama = JALUR_TASORO[id].judul;
        return h ? `- ${nama}: ${h.benar}/${h.jumlah} (nilai ${h.nilai}%)`
          : `- ${nama}: belum ditempuh`;
      }),
    ].join('\n');
  }
}
