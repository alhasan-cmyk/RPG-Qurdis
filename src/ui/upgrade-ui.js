// Layar "Ragam Usaha Desa" — sekarang BENGKEL KENDARAAN.
//
// Tiga baris: sepeda, sepeda motor, truk pengangkut barang. Dibayar dengan
// DIAMOND hasil ujian, tanpa syarat bab dan tanpa bahan. Yang belum mampu tetap
// ditampilkan lengkap dengan kekurangannya ("Kurang 13 diamond") — menyembunyikan
// barang mahal membuat pemain tidak tahu apa yang sedang ia kumpulkan.
//
// Bentuk layarnya tidak berubah dari versi lama (DAFTAR + RINCIAN), karena
// bentuk itu yang sudah terbukti muat di kanvas 640x360 dan sudah diuji di lima
// ukuran layar. Yang berubah isinya: kolom kanan tidak lagi menyebut bab dan
// guru, melainkan harga diamond.

import { view } from '../render/renderer.js';
import { panel, text, wrap, fit, icon, UI } from './draw.js';
import { UPGRADE } from '../systems/upgrade.js';

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
    ROW: 32,          // tinggi satu baris daftar (dua baris teks di kolom kanan)
    RINCI: 92,        // kotak rincian: bahan, guna, dan sampai tiga baris alasan
    KEPALA: 40,       // judul "RAGAM USAHA DESA"
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

  status(i = this.cursor) { return this.up.status(UPGRADE[i].id, this.ctx); }

  /**
   * Saldo diamond, dari objek atau fungsi. Satu tempat: `beli()` butuh
   * OBJEK-nya (untuk memotong saldo), sedangkan layar hanya butuh angkanya.
   */
  saldo() {
    const d = this.ctx?.diamond;
    const n = typeof d === 'function' ? d() : (d && typeof d === 'object' ? d.jumlah : d);
    return Math.max(0, Math.floor(Number(n) || 0));
  }

  key(action) {
    if (!this.open) return false;
    if (action === 'up' || action === 'down') {
      const n = UPGRADE.length;
      this.cursor = (this.cursor + (action === 'down' ? 1 : n - 1)) % n;
      // Jendela gulir: tujuh peningkatan tidak muat sekaligus di kanvas 360 px,
      // jadi yang digambar hanya beberapa baris dan `scroll` mengikuti kursor.
      const lihat = this.barisTerlihat ?? UPGRADE.length;
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
        this.pesan = this.up.alasanTidakBoleh(st);
        return true;
      }
      const r = this.up.beli(st.id, { diamond: this.ctx.diamond, kendaraan: this.ctx.kendaraan });
      if (r) {
        this.audio?.coin?.();
        this.pesan = `${st.def.nama} dibeli — ${st.def.guna}.`;
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
    const lihat = Math.max(3, Math.min(UpgradeUI.TATA.BARIS_MAKS, UPGRADE.length));
    const H = Math.min(view.h - HUD - 8, KEPALA + lihat * ROW + RINCI + 8);
    this.barisTerlihat = lihat;
    const x = Math.round((view.w - W) / 2);
    const y = Math.max(4, Math.min(Math.round((view.h - H) / 2), view.h - H - HUD));
    panel(ctx, x, y, W, H);
    const innerW = W - PAD * 2;

    text(ctx, 'BENGKEL KENDARAAN', x + W / 2, y + 24, { font: UI.fontTitle, align: 'center', color: UI.red });

    let cy = y + KEPALA;
    const akhir = Math.min(UPGRADE.length, this.scroll + lihat);
    for (let i = this.scroll; i < akhir; i++) {
      const u = UPGRADE[i];
      const st = this.up.status(u.id, this.ctx);
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 8, cy - 14, W - 16, ROW - 2); }
      // Kolom kanan sekarang HARGA, bukan nomor bab. Kendaraan yang sudah
      // dimiliki ditandai "✓ dipakai" / "✓" supaya jelas mana yang sedang aktif.
      const status = st.dipakai ? '✓ dipakai' : st.punya ? '✓ punya' : String(st.harga);
      // Kolom kanan selebar ±100 px (ikon diamond + "50"): judul harus
      // berhenti sebelum kolom itu, kalau tidak tulisan panjang menabrak harga
      // di layar sempit.
      const judul = fit(ctx, `${on ? '▸ ' : '  '}${u.judul}`, innerW - 130, UI.font);
      text(ctx, judul, x + PAD, cy, { font: UI.font, color: st.punya && !st.dipakai ? '#7a6647' : UI.outline });
      // Syarat bab: hijau kalau sudah lulus, merah kalau belum — warna yang sama
      // dengan layar ujian, jadi murid tidak perlu belajar arti warna baru.
      // Nama guru ikut ditulis karena "Bab IV" saja tidak memberi tahu harus
      // menemui siapa; dengan 6 warga, menebaknya hampir selalu salah.
      // Nama guru ditulis di BARIS KEDUA, bukan disambung ke "Bab V ✗ · …".
      // Digabung, `fit` memotong ekornya — dan ekornya itulah nama gurunya,
      // satu-satunya petunjuk ke siapa murid harus datang. Diukur dengan VT323
      // 16 px: "Bab 17 ✗ · Kang Dadang" butuh 176 px, sedangkan kolom kanan
      // hanya 148 px. Dua baris selebar 148 px selalu cukup.
      // Warna: hijau untuk yang sudah dimiliki, abu untuk yang mahal, merah
      // untuk yang belum mampu — pola warna yang sama dengan layar ujian.
      const warna = st.punya ? '#4f7a2f' : st.boleh ? '#2f6a8c' : '#b8432e';
      // Ikon digambar sebagai SPRITE, bukan karakter "💎": font VT323 tidak
      // punya glif itu, jadi yang muncul kotak kosong — dan lebar emoji berbeda
      // di tiap perangkat sehingga angkanya bisa keluar kolom.
      if (!st.punya) {
        ctx.font = UI.font;
        const lebarAngka = ctx.measureText(status).width;
        icon(ctx, 'ui_diamond', 0, x + W - PAD - lebarAngka - 20, cy - 4);
      }
      text(ctx, status, x + W - PAD, cy, { font: UI.font, align: 'right', color: warna });
      cy += ROW;
    }
    // Penanda halaman hanya muncul kalau daftarnya memang terpotong.
    if (lihat < UPGRADE.length) {
      text(ctx, `baris ${this.scroll + 1}–${akhir} dari ${UPGRADE.length}`,
        x + W - PAD, cy - 8, { font: UI.font, align: 'right', color: '#8a7550' });
    }

    // ---- rincian kendaraan yang ditunjuk
    const st = this.status();
    const ry = y + H - RINCI - 2;
    ctx.fillStyle = '#f3e3c2';
    ctx.fillRect(x + 10, ry, W - 20, RINCI);
    // Baris 1: harga dan saldo diamond. Inilah satu-satunya syarat pembelian,
    // jadi ia yang ditaruh paling atas.
    const saldo = this.saldo();
    const hargaTeks = st.punya
      ? (st.dipakai ? 'Sedang dipakai' : 'Sudah dimiliki — E untuk memakai')
      : `Harga ${st.harga} diamond · kau punya ${saldo}`;
    icon(ctx, 'ui_diamond', 0, x + PAD, ry + 10);
    text(ctx, fit(ctx, hargaTeks, innerW - 24, UI.font), x + PAD + 26, ry + 14,
      { font: UI.font, color: st.punya ? '#4f7a2f' : st.boleh ? '#2f6a8c' : '#b8432e' });
    // Baris 2: gunanya. Ditulis apa adanya pada semua keadaan — pemain harus
    // tahu apa yang ia beli sebelum mengumpulkan 50 diamond.
    text(ctx, fit(ctx, `Guna: ${st.def.guna}`, innerW - 8, UI.font), x + PAD, ry + 34,
      { font: UI.font, color: '#5a4230' });
    // Baris 3: alasan / petunjuk. Kalimatnya dari sistem, sumber yang sama
    // dengan yang muncul saat E ditekan.
    ctx.font = UI.font;
    const lebarTombol = ctx.measureText('E pakai · Esc tutup').width;
    const ruangAlasan = Math.max(80, innerW - lebarTombol - 12);
    // Kalimat RINGKAS didahulukan di baris ini ("Kurang 38 diamond."). Kalimat
    // panjangnya menjelaskan dari mana diamond didapat, tetapi di layar 390 px
    // ia membungkus dua baris dan baris terakhirnya menempel ke tombol di kanan.
    // Penjelasan itu tetap ada di tempat yang lapang: baris harga di atas sudah
    // menulis "Harga 50 diamond · kau punya 12".
    const pendek = this.up.alasanTidakBoleh(st, { ringkas: true });
    const muat = (t) => {
      const b = wrap(ctx, t, ruangAlasan, UI.font);
      return b.length <= 2;
    };
    const alasan = st.punya && !st.dipakai ? '' : (this.pesan || (muat(pendek) ? pendek : ''));
    if (!alasan && st.boleh) {
      text(ctx, 'Boleh dibeli.', x + PAD, ry + 52, { font: UI.font, color: '#4f7a2f' });
    } else if (alasan) {
      const baruSaja = /dibeli|memakai|ditinggal/.test(this.pesan);
      const warna = baruSaja ? '#4f7a2f' : (st.punya ? '#8a7550' : UI.red);
      wrap(ctx, alasan, ruangAlasan, UI.font).slice(0, 3).forEach((t, i) => {
        text(ctx, t, x + PAD, ry + 52 + i * 14, { font: UI.font, color: warna });
      });
    }
    text(ctx, st.punya ? 'E pakai · Esc tutup' : 'E beli · Esc tutup', x + W - PAD, ry + 52,
      { font: UI.font, align: 'right', color: '#7a6647' });
  }
}
