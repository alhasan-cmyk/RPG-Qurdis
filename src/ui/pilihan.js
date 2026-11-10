// Kotak pilihan percakapan — "Halo anak muda" → daftar jawaban yang bisa dipilih.
//
// Kenapa kotak terpisah, bukan dialog biasa: dialog hanya bisa "lanjut" (E),
// tidak bisa memilih. Pertanyaan latihan lalu menumpang di lapisan yang sama
// dan hasilnya dua percakapan bercampur — murid melihat kalimat warga, lalu
// tiba-tiba soal, tanpa tahu keduanya sedang berbicara tentang apa.
//
// Di sini urutannya jelas dan terlihat:
//   1. warga menyapa (dialog biasa, potret + hati),
//   2. kotak pilihan muncul: "Halo, Kang." · "Aku ingin belajar mencangkul."
//   3. yang dipilih benar-benar terjadi: mengobrol, atau masuk ujian bab.
//
// Kotak ini sengaja tidak menyebut "ujian". Dari sisi murid ia sedang minta
// diajari; dari sisi guru ia sedang menempuh ujian bab. Layar ujiannya sendiri
// yang menuliskan bab dan nilainya.
import { view } from '../render/renderer.js';
import { panel, text, wrap, UI } from './draw.js';

export class PilihanUI {
  constructor(audio = null) {
    this.audio = audio;
    this.open = false;
    this.judul = '';
    this.kata = '';
    this.cursor = 0;
    this.opsi = [];      // [{ label, nilai, mati?, catatan? }]
    this.pilih = null;   // dipanggil dengan `nilai` saat dipilih
    this.batal = null;   // dipanggil saat Esc
  }

  /**
   * `opsi`: [{ label, nilai, mati, catatan }] — `mati` berarti barisnya tampil
   * tetapi tidak bisa dipilih, dan `catatan` menjelaskan mengapa. Baris mati
   * tetap ditampilkan dengan sengaja: murid perlu tahu bahwa "belajar
   * mencangkul" memang ada dan apa syaratnya, bukan mengira tidak ada apa-apa.
   */
  buka({ judul = '', kata = '', opsi = [], pilih = null, batal = null }) {
    this.judul = judul;
    this.kata = kata;
    this.opsi = opsi;
    this.pilih = pilih;
    this.batal = batal;
    // Kursor mendarat di baris pertama yang bisa dipilih, supaya E langsung
    // berguna.
    const i = opsi.findIndex((o) => !o.mati);
    this.cursor = i < 0 ? 0 : i;
    this.open = true;
    this.audio?.ui?.();
  }

  tutup() {
    this.open = false;
    this.opsi = [];
  }

  key(action) {
    if (!this.open) return false;
    const n = this.opsi.length;
    if (action === 'up' || action === 'down') {
      // Cari baris berikutnya yang bisa dipilih, satu langkah per putaran.
      //
      // Versi sebelumnya memakai `(cursor + arah*k) % n` dengan `k` ikut
      // bergerak — hasilnya `(cursor + 1 - k) % n`, jadi kursor MUNDUR dari
      // baris 1 ke baris 0 dan tombol S terasa mentok di dua baris teratas.
      // Sekarang langkahnya satu tile, dan baris mati dilewati satu per satu
      // supaya pembungkusannya tetap bisa diramalkan.
      const arah = action === 'down' ? 1 : -1;
      let i = this.cursor;
      for (let langkah = 0; langkah < n; langkah++) {
        i = (i + arah + n) % n;
        if (!this.opsi[i].mati) { this.cursor = i; this.audio?.ui?.(); break; }
      }
      return true;
    }
    if (action === 'interact') {
      const o = this.opsi[this.cursor];
      if (!o || o.mati) { this.audio?.denied?.(); return true; }
      this.audio?.ui?.();
      const nilai = o.nilai;
      this.tutup();
      this.pilih?.(nilai);
      return true;
    }
    if (action === 'menu') {
      this.tutup();
      this.batal?.();
      return true;
    }
    return true;
  }

  draw(ctx) {
    if (!this.open) return;
    const W = Math.min(520, view.w - 48);
    const baris = this.opsi.map((o) => wrap(ctx, o.label, W - 72, UI.fontBig).length + (o.catatan ? 1 : 0));
    const tinggiIsi = baris.reduce((a, b) => a + b * 22 + 12, 0);
    const H = 64 + tinggiIsi + 44;
    const x = (view.w - W) / 2;
    const y = Math.max(24, view.h - H - 96);
    panel(ctx, x, y, W, H);

    if (this.judul) {
      text(ctx, this.judul, x + W / 2, y + 14, { font: UI.fontTitle, align: 'center', color: UI.red });
    }
    if (this.kata) {
      text(ctx, this.kata, x + W / 2, y + 32, { font: UI.font, align: 'center', color: '#7a6647' });
    }

    let cy = y + 56;
    this.opsi.forEach((o, i) => {
      const on = i === this.cursor;
      // `baris[i]` sudah mencakup baris label + satu baris catatan (lihat buka()).
      const barisLabel = o.catatan ? baris[i] - 1 : baris[i];
      const tinggi = baris[i] * 22 + 12;
      if (on) {
        ctx.fillStyle = o.mati ? '#e3d7bd' : '#fff3d6';
        ctx.fillRect(x + 16, cy - 6, W - 32, tinggi - 2);
      }
      const warna = o.mati ? '#a08a6a' : UI.outline;
      const tanda = o.mati ? '×' : (on ? '▸' : ' ');
      wrap(ctx, `${tanda} ${o.label}`, W - 72, UI.fontBig)
        .forEach((l, j) => text(ctx, l, x + 28, cy + j * 22, { font: UI.fontBig, color: warna }));
      // Catatan menempel pada barisnya sendiri, bukan melayang di bawah seluruh
      // kotak: versi pertama menggambar semua catatan di satu tempat dan
      // "sudah kutanyai hari ini" terlihat seperti keterangan baris terakhir.
      if (o.catatan) {
        text(ctx, o.catatan, x + 46, cy + barisLabel * 22, { font: UI.font, color: '#8a7455' });
      }
      cy += tinggi;
    });

    text(ctx, 'W/S pilih · E tentukan · Esc batal', x + W / 2, y + H - 26,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }
}
