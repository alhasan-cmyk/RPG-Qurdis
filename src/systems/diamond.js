// Diamond: hadiah untuk setiap ujian bab yang LULUS.
//
// Aturannya sengaja sesederhana mungkin, karena inilah yang diminta:
//   - lulus ujian satu bab        -> +1 diamond
//   - mengulang bab yang sama dan lulus lagi -> +1 diamond lagi
//   - tidak lulus                 -> +0
//
// Jadi hadiahnya per UJIAN yang lulus, bukan per jawaban benar. Satu bab yang
// banknya 30 soal pun tetap memberi 1, sama seperti bab yang hanya 12 soal —
// yang dihargai adalah menuntaskan babnya, bukan panjang ujiannya.
//
// Dua hal yang TIDAK dilakukan di sini, dan itu memang disengaja:
//
//   1. Tidak ada batas harian atau batas "sekali per bab". Mengulang adalah
//      kebiasaan belajar yang justru mau didorong; mengunci hadiahnya akan
//      membuat murid berhenti mengulang begitu diamond-nya sudah didapat.
//   2. Tidak ada pemeriksaan "apakah sudah pernah lulus". Bab yang diulang
//      memberi diamond lagi, persis seperti permintaan pemain. Kalau nanti
//      sekolah ingin membatasi, tempatnya di sini — satu fungsi, satu tempat.
//
// Yang disimpan hanya satu angka. Tidak ada daftar riwayat, tidak ada tanggal:
// semuanya bisa diturunkan dari nilai ujian kalau suatu saat dibutuhkan, dan
// menyimpan riwayat berarti menyimpan data pribadi murid yang tidak perlu.

/** Besaran hadiah. Satu konstanta supaya mudah diubah dan mudah diuji. */
export const DIAMOND_PER_LULUS = 1;

export class Diamond {
  constructor(jumlah = 0) {
    // Selalu bilangan bulat >= 0. Simpanan lama tidak punya field ini sama
    // sekali, jadi bawaannya 0 — pemain lama tidak kehilangan apa pun dan tidak
    // melihat "NaN" di HUD.
    this.jumlah = Math.max(0, Math.floor(Number(jumlah) || 0));
    /** Hadiah terakhir, untuk ditampilkan layar hasil ("+1 diamond"). */
    this.terakhir = 0;
  }

  /**
   * Beri hadiah karena satu ujian bab LULUS.
   * Mengembalikan jumlah diamond yang diberikan (0 kalau tidak lulus).
   */
  hadiahLulus(lulus) {
    if (!lulus) {
      // Gagal tidak menghapus apa pun dan tidak memberi apa pun. `terakhir`
      // dikosongkan supaya layar hasil tidak menampilkan "+1" yang tidak
      // pernah terjadi.
      this.terakhir = 0;
      return 0;
    }
    const n = DIAMOND_PER_LULUS;
    this.jumlah += n;
    this.terakhir = n;
    return n;
  }

  /** Tambah/kurangi manual (dipakai pengujian dan, nanti, toko diamond). */
  tambah(n = 1) {
    const d = Math.trunc(Number(n) || 0);
    this.jumlah = Math.max(0, this.jumlah + d);
    return this.jumlah;
  }

  toJSON() { return { jumlah: this.jumlah }; }

  load(data) {
    this.jumlah = Math.max(0, Math.floor(Number(data?.jumlah) || 0));
    this.terakhir = 0;
  }
}
