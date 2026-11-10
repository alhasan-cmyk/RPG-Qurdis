// Layar "Bengkel & Ragam Usaha" — DUA jenis barang di satu papan.
//
//   1. Peningkatan bangunan (7 baris): rumah, lemari, peti, dapur, pasar,
//      kandang, bibit. Dibeli dengan uang + bahan, dikunci satu bab. Ini bagian
//      inti permainan — energi harian, slot tas, kapasitas peti, ternak — jadi
//      ia TIDAK boleh hilang.
//   2. Kendaraan (3 baris): sepeda, sepeda motor, truk. Dibeli dengan DIAMOND
//      hasil ujian, tanpa syarat bab dan tanpa bahan.
//
// Bentuk layarnya tetap DAFTAR + RINCIAN dari versi lama: sudah terbukti muat di
// kanvas 640x360 dan sudah diuji di lima ukuran layar. Yang membedakan keduanya
// hanya kolom kanan (bab & guru untuk bangunan, harga diamond untuk kendaraan)
// dan isi kotak rincian.
//
// Daftarnya digulir: 10 baris tidak muat bersama rincian.

import { view } from '../render/renderer.js';
import { panel, text, wrap, fit, icon, UI } from './draw.js';
import { NAMA_BAHAN } from '../systems/upgrade.js';

export class UpgradeUI {
  /**
   * Ukuran tata letak, satu tempat.
   *
   * Diekspor supaya alat uji (tools/uji-tata-letak.mjs) memakai angka yang SAMA
   * dengan yang digambar — bukan salinan yang cepat atau lambat jadi berbeda
   * dan membuat uji "lulus" padahal layarnya sudah berubah.
   */
  static TATA = {
    PAD: 18,          // tepi kiri/kanan isi panel
    LEBAR_MAKS: 600,  // panel tidak pernah lebih lebar dari ini
    HUD: 34,          // tinggi hotbar di atas; panel tidak boleh menimpanya
    ROW: 34,          // tinggi satu baris daftar: judul + dua baris kolom kanan
                      // (nama guru 8 px di atas, nomor bab 6 px di bawah judul).
                      // 32 px membuat nomor bab baris ini menyentuh nama guru
                      // baris berikutnya — terlihat di pratinjau, tidak terlihat
                      // di uji yang hanya memeriksa batas panel.
    RINCI: 92,        // kotak rincian: bahan, guna, dan sampai tiga baris alasan
    KEPALA: 46,       // judul panel + ruang untuk baris pertama. 40 px membuat
                      // nama guru baris pertama (cy - 6) menempel ke judul:
                      // judul 10 px berakhir di y+34, sedangkan guru di y+40.
    BARIS_MAKS: 4,    // baris yang digambar sekaligus
  };

  constructor(upgrade, audio = null) {
    this.up = upgrade;
    this.audio = audio;
    this.open = false;
    this.cursor = 0;
    this.scroll = 0;      // baris pertama yang digambar
    this.ctx = null;      // { ilmu, inv, uang(), tingkatKelas, bayar() }
    this.pesan = '';
    this.onBeli = null;   // dipanggil setelah pembelian berhasil
  }

  buka(ctx) {
    this.ctx = ctx;
    this.open = true;
    this.pesan = '';
    this.cursor = 0;
    this.scroll = 0;
  }

  tutup() { this.open = false; }

  /** Baris papan: peningkatan bangunan dulu, kendaraan di bawahnya. */
  get baris() { return this.up.papan(); }

  status(i = this.cursor) { return this.up.status(this.baris[i].id, this.ctx); }

  /**
   * Saldo diamond, dari objek atau fungsi. Satu tempat: `beli()` butuh
   * OBJEK-nya (untuk memotong saldo), sedangkan layar hanya butuh angkanya.
   */
  saldo() {
    const d = this.ctx?.diamond;
    const n = typeof d === 'function' ? d() : (d && typeof d === 'object' ? d.jumlah : d);
    return Math.max(0, Math.floor(Number(n) || 0));
  }

  /** Status bahan untuk baris pertama rincian: "Bahan 2/3" atau "Bahan lengkap". */
  ringkasBahan(st) {
    const semua = Object.keys(st.perlu ?? {}).length;
    if (!semua) return 'Tanpa bahan';
    const cukup = semua - (st.bahanKurang?.length ?? 0);
    return cukup === semua ? 'Bahan lengkap' : `Bahan ${cukup}/${semua}`;
  }

  key(action) {
    if (!this.open) return false;
    if (action === 'up' || action === 'down') {
      const n = this.baris.length;
      this.cursor = (this.cursor + (action === 'down' ? 1 : n - 1)) % n;
      // Jendela gulir: tujuh peningkatan tidak muat sekaligus di kanvas 360 px,
      // jadi yang digambar hanya beberapa baris dan `scroll` mengikuti kursor.
      // Jumlah baris yang benar-benar terlihat. Dihitung dengan rumus yang sama
      // seperti draw(), bukan dari `barisTerlihat` yang baru terisi SESUDAH
      // layar digambar sekali: kalau tombol panah ditekan sebelum frame pertama,
      // nilai itu belum ada dan jendela gulir tidak mengikuti kursor.
      const lihat = Math.max(3, Math.min(UpgradeUI.TATA.BARIS_MAKS, n));
      if (this.cursor < this.scroll) this.scroll = this.cursor;
      if (this.cursor >= this.scroll + lihat) this.scroll = this.cursor - lihat + 1;
      this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, n - lihat)));
      this.pesan = '';
      this.audio?.ui?.();
      return true;
    }
    if (action === 'interact') {
      const st = this.status();
      // Kendaraan yang SUDAH dimiliki: E dipakai untuk memakainya (atau turun,
      // kalau sedang dipakai). Tanpa ini, pemain yang punya motor dan truk
      // tidak punya cara berpindah selain menjual — dan tidak ada penjualan.
      if (st.punya) {
        if (st.dipakai) {
          this.ctx.kendaraan.pakai(null);
          this.pesan = `${st.def.nama} ditinggal — jalan kaki lagi.`;
        } else {
          this.ctx.kendaraan.pakai(st.id);
          this.pesan = `Sekarang memakai ${st.def.nama}.`;
        }
        this.audio?.ui?.();
        this.onBeli?.(st);       // efek (slot tas) diterapkan pemanggil
        return true;
      }
      if (!st.boleh) {
        this.audio?.denied?.();
        // Alasan disusun di sistem (Upgrade.alasanTidakBoleh), satu sumber yang
        // sama dengan baris status di layar — supaya tombol E dan tulisan di
        // panel tidak pernah berkata berbeda.
        this.pesan = this.up.alasanTidakBoleh(st, { namaBahan: NAMA_BAHAN });
        return true;
      }
      // Satu pemanggilan untuk dua jenis barang: sistem yang memilih jalur
      // bangunan (bahan + uang) atau kendaraan (diamond).
      const r = this.up.beli(st.id, {
        inv: this.ctx.inv,
        uang: this.ctx.uang,
        diamond: this.ctx.diamond,
        kendaraan: this.ctx.kendaraan,
      });
      if (r) {
        if (r.jenis === 'kendaraan') {
          this.pesan = `${st.def.nama} dibeli — ${st.def.guna}.`;
        } else {
          // Uang dipotong PEMANGGIL lewat `bayar()`, bahan sudah diambil sistem.
          // Dipisah begitu supaya sistem tidak perlu tahu cara menyimpan uang.
          this.ctx.bayar?.(r.biaya);
          this.pesan = `${st.def.judul} selesai — ${st.def.efek(r.level)}.`;
        }
        this.audio?.coin?.();
        this.onBeli?.(r);
      } else {
        this.audio?.denied?.();
        this.pesan = this.up.pesanGagal || 'Belum bisa dibeli.';
      }
      return true;
    }
    if (action === 'menu') { this.tutup(); return true; }
    return true;
  }

  draw(ctx) {
    if (!this.open) return;
    // Bentuk layarnya: DAFTAR + RINCIAN, bukan tabel tujuh baris dua tingkat.
    //
    // Kanvas digambar pada 640x360 dengan font 16/20 px (lihat renderer: view =
    // window / zoom), jadi tinggi yang tersedia benar-benar 360 px. Daftar
    // memakai jendela gulir — pola yang sama dengan rak perpustakaan — dan
    // baris yang ditunjuk dirinci di kotak bawah. Sekarang isinya tiga
    // kendaraan, jadi semuanya muat sekaligus; jendela gulir tetap dipertahankan
    // supaya menambah kendaraan keempat tidak perlu mengubah tata letaknya.
    const { PAD, LEBAR_MAKS, HUD, ROW, RINCI, KEPALA } = UpgradeUI.TATA;
    const W = Math.min(LEBAR_MAKS, view.w - 24);
    // Baris yang digambar dibatasi empat (BARIS_MAKS): empat baris + rincian
    // terbaca utuh tanpa menutupi hotbar.
    const semua = this.baris;
    const lihat = Math.max(3, Math.min(UpgradeUI.TATA.BARIS_MAKS, semua.length));
    const H = Math.min(view.h - HUD - 8, KEPALA + lihat * ROW + RINCI + 8);
    this.barisTerlihat = lihat;
    const x = Math.round((view.w - W) / 2);
    const y = Math.max(4, Math.min(Math.round((view.h - H) / 2), view.h - H - HUD));
    panel(ctx, x, y, W, H);
    const innerW = W - PAD * 2;

    text(ctx, 'RAGAM USAHA', x + W / 2, y + 24, { font: UI.fontTitle, align: 'center', color: UI.red });

    let cy = y + KEPALA;
    const akhir = Math.min(semua.length, this.scroll + lihat);
    for (let i = this.scroll; i < akhir; i++) {
      const u = semua[i];
      const st = this.up.status(u.id, this.ctx);
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 8, cy - 14, W - 16, ROW - 2); }
      // Judul baris. Untuk bangunan, tingkatnya ikut ditulis ("· 2/4"): tanpa
      // angka itu pemain tidak tahu apakah membeli menaikkan tingkat atau
      // mengulang tingkat yang sama. Kendaraan tidak punya tingkat.
      const tingkat = st.jenis === 'bangunan'
        ? (st.penuh ? ` · ${st.level}/${st.maks} penuh` : ` · ${st.level}/${st.maks}`)
        : '';
      const judul = fit(ctx, `${on ? '▸ ' : '  '}${u.judul}${tingkat}`, innerW - 168, UI.font);
      text(ctx, judul, x + PAD, cy, { font: UI.font, color: st.penuh && st.jenis === 'bangunan' ? '#7a6647' : UI.outline });
      // Kolom kanan berbeda menurut jenis barisnya:
      //   bangunan  -> nomor bab syarat (atau nama guru kalau belum lulus)
      //   kendaraan -> harga diamond (atau tanda sudah dimiliki/dipakai)
      if (st.jenis === 'kendaraan') {
        const status = st.dipakai ? '✓ dipakai' : st.punya ? '✓ punya' : String(st.harga);
        const warna = st.punya ? '#4f7a2f' : st.boleh ? '#2f6a8c' : '#b8432e';
        // Ikon digambar sebagai SPRITE, bukan karakter "💎": font VT323 tidak
        // punya glif itu, jadi yang muncul kotak kosong — dan lebar emoji
        // berbeda di tiap perangkat sehingga angkanya bisa keluar kolom.
        if (!st.punya) {
          ctx.font = UI.font;
          const lebarAngka = ctx.measureText(status).width;
          icon(ctx, 'ui_diamond', 0, x + W - PAD - lebarAngka - 20, cy - 4);
        }
        text(ctx, status, x + W - PAD, cy, { font: UI.font, align: 'right', color: warna });
      } else {
        // Syarat bab: hijau kalau sudah lulus, merah kalau belum — warna yang
        // sama dengan layar ujian, jadi murid tidak perlu belajar arti warna
        // baru. Nama guru ditulis di BARIS KEDUA, bukan disambung ke
        // "Bab V ✗ · …": digabung, `fit` memotong ekornya, dan ekor itulah nama
        // gurunya — satu-satunya petunjuk ke siapa murid harus datang.
        const warnaBab = st.lulus ? '#4f7a2f' : '#b8432e';
        if (st.penuh) {
          // Sudah maksimum: tidak ada bab yang bisa dikejar lagi untuk baris
          // ini, jadi kolom kanan berhenti menulis syarat.
          text(ctx, 'penuh', x + W - PAD, cy, { font: UI.font, align: 'right', color: '#8a7550' });
        } else if (!st.kitab) {
          text(ctx, '—', x + W - PAD, cy, { font: UI.font, align: 'right', color: warnaBab });
        } else if (st.lulus) {
          text(ctx, `${st.labelBab} ✓`, x + W - PAD, cy, { font: UI.font, align: 'right', color: warnaBab });
        } else {
          // Nama guru di BARIS ATAS sel, nomor bab di baris bawahnya — dua
          // baris teks 16 px dalam sel 32 px, jadi keduanya masih terpisah 8 px
          // dan tidak menyentuh judul baris berikutnya.
          if (st.guru) {
            text(ctx, st.guru.nama, x + W - PAD, cy - 8, { font: UI.font, align: 'right', color: warnaBab });
          }
          text(ctx, `${st.labelBab} ✗`, x + W - PAD, cy + 6, { font: UI.font, align: 'right', color: warnaBab });
        }
      }
      cy += ROW;
    }
    // Penanda halaman hanya muncul kalau daftarnya memang terpotong. Ditaruh di
    // baris JUDUL (kanan), bukan di bawah daftar: di bawah, ia menimpa kolom
    // kanan baris terakhir — nama guru dan nomor bab baris itu jadi tertutup.
    if (lihat < semua.length) {
      text(ctx, `baris ${this.scroll + 1}–${akhir}/${semua.length}`,
        x + W - PAD, y + 16, { font: UI.font, align: 'right', color: '#8a7550' });
    }

    // ---- rincian baris yang ditunjuk
    const st = this.status();
    const ry = y + H - RINCI - 2;
    ctx.fillStyle = '#f3e3c2';
    ctx.fillRect(x + 10, ry, W - 20, RINCI);
    const kendaraan = st.jenis === 'kendaraan';
    const saldo = this.saldo();

    // Baris 1: syarat pembelian.
    //   bangunan  -> bahan yang dibutuhkan + harga uang (angka dari sistem, satu
    //                sumber dengan yang ditagih saat membeli)
    //   kendaraan -> harga diamond + saldo
    if (kendaraan) {
      const hargaTeks = st.punya
        ? (st.dipakai ? 'Sedang dipakai' : 'Sudah dimiliki — E untuk memakai')
        : `Harga ${st.harga} diamond · kau punya ${saldo}`;
      icon(ctx, 'ui_diamond', 0, x + PAD, ry + 10);
      text(ctx, fit(ctx, hargaTeks, innerW - 24, UI.font), x + PAD + 26, ry + 14,
        { font: UI.font, color: st.punya ? '#4f7a2f' : st.boleh ? '#2f6a8c' : '#b8432e' });
    } else {
      // Harga uang ditaruh paling KANAN dan digambar sendiri, bukan disambung di
      // ekor kalimat bahan. Disambung, `fit` memotong ekornya — dan ekornya
      // itulah harganya: di layar 390 px baris "batu 0/25 · kayu 0/30 · G1.200"
      // kelebihan lebar, jadi yang hilang justru angka yang dicari pemain.
      const harga = `G${st.biaya.toLocaleString('id-ID')}`;
      ctx.font = UI.font;
      const lebarHarga = ctx.measureText(harga).width;
      text(ctx, harga, x + W - PAD, ry + 14,
        { font: UI.font, align: 'right', color: st.uangKurang ? '#b8432e' : '#4f7a2f' });
      // Bahan diringkas jadi "Bahan 2/3" — berapa JENIS yang sudah cukup.
      //
      // Daftar lengkapnya ("batu 0/25 · kayu 0/15 · tanah 0/30") sudah dicoba
      // dan tidak muat: di layar 390 px tiga bahan butuh 317 px, sedangkan
      // ruangnya 256 px, jadi `fit` memotong ekornya — dan yang terpotong justru
      // bahan ketiga, bahan yang paling mungkin belum dimiliki pemain. Rincian
      // angkanya tidak hilang: baris alasan di bawah menulis "Kurang 20 batu,
      // 15 kayu, 30 tanah" karena itu satu-satunya bagian yang harus dibaca
      // pemain untuk tahu apa yang harus dicari.
      text(ctx, this.ringkasBahan(st), x + PAD, ry + 14,
        { font: UI.font, color: st.bahanKurang.length ? '#b8432e' : '#4f7a2f' });
    }

    // Baris 2: gunanya. Ditulis apa adanya pada semua keadaan — pemain harus
    // tahu apa yang ia beli sebelum mengumpulkan 25 batu atau 50 diamond.
    // `efek` (bangunan) menerima tingkat; kendaraan memakai `guna` dari data.
    const guna = kendaraan
      ? st.def.guna
      : (st.def.efek(st.penuh ? st.level : st.level + 1) || '—');
    // Guna boleh memakai SELURUH lebar kotak: ia satu-satunya penjelasan apa yang
    // dibeli, dan tidak ada apa pun di kanannya.
    text(ctx, fit(ctx, `Guna: ${guna}`, innerW - 4, UI.font), x + PAD, ry + 34,
      { font: UI.font, color: '#5a4230' });

    // Baris 3: alasan / petunjuk. Kalimatnya dari sistem, sumber yang sama
    // dengan yang muncul saat E ditekan.
    ctx.font = UI.font;
    const lebarTombol = ctx.measureText('E pakai · Esc tutup').width;
    const ruangAlasan = Math.max(80, innerW - lebarTombol - 12);
    const muat = (t) => {
      const b = wrap(ctx, t, ruangAlasan, UI.font);
      return b.length <= 2;
    };
    // Kalimat RINGKAS didahulukan ("Kurang 38 diamond." / "Ujian Bab V ke Bang
    // Jaka."). Kalimat panjangnya menjelaskan lebih banyak, tetapi di layar
    // 390 px ia membungkus dua baris dan baris terakhirnya menempel ke tombol
    // di kanan — itu pernah terjadi dan terlihat saat pratinjau digambar.
    const panjang = this.up.alasanTidakBoleh(st, { namaBahan: NAMA_BAHAN });
    const pendek = this.up.alasanTidakBoleh(st, { namaBahan: NAMA_BAHAN, ringkas: true });
    const alasan = !kendaraan && st.punya ? ''
      : (this.pesan || (muat(pendek) ? pendek : (muat(panjang) ? panjang : pendek)));
    if (!alasan && st.boleh) {
      text(ctx, 'Boleh dibeli.', x + PAD, ry + 52, { font: UI.font, color: '#4f7a2f' });
    } else if (alasan) {
      const baruSaja = /dibeli|memakai|ditinggal|selesai/.test(this.pesan);
      const warna = baruSaja ? '#4f7a2f' : (st.penuh ? '#8a7550' : UI.red);
      wrap(ctx, alasan, ruangAlasan, UI.font).slice(0, 3).forEach((t, i) => {
        text(ctx, t, x + PAD, ry + 52 + i * 14, { font: UI.font, color: warna });
      });
    }
    text(ctx, st.punya ? 'E pakai · Esc tutup' : 'E beli · Esc tutup', x + W - PAD, ry + 52,
      { font: UI.font, align: 'right', color: '#7a6647' });
  }
}
