// Layar "Nilai & Pengiriman": satu tempat untuk melihat capaian per bab dan
// memastikan nilainya benar-benar sampai ke spreadsheet guru.
//
// Dipisah dari menu Rekap Belajar karena pertanyaannya berbeda: Rekap Belajar
// menjawab "sudah sampai mana belajarku", layar ini menjawab "nilai bab mana
// yang sudah tercatat, bab mana yang masih terkunci, dan adakah nilai yang
// tertahan karena jaringan putus".
//
// Dua jalur masuk:
//   - dari dalam game: Rekap Belajar → tekan V
//   - dari halaman awal: tombol "NILAI SAYA" (anak yang ingin memeriksa
//     nilainya tidak perlu masuk ke ladang dulu)

import { text, panel, fit, UI } from './draw.js';
import { view } from '../render/renderer.js';
import { muridAktif, kirimAntre, jumlahAntre, tersambung, labelKelasMurid } from '../core/nilai-api.js';

export class NilaiUI {
  constructor(ilmu) {
    this.ilmu = ilmu;
    this.open = false;
    this.cursor = 0;
    this.pesan = '';
    this.sibuk = false;
  }

  buka() {
    this.open = true;
    this.cursor = 0;
    this.pesan = '';
  }

  tutup() { this.open = false; }

  /**
   * Tombol yang bisa ditekan. Dibaca main.js sebelum input lain, supaya W/S
   * tidak sekaligus menggerakkan pemain di belakang panel.
   */
  onKey(action) {
    if (!this.open) return false;
    const n = this.ilmu ? this.ilmu.urutanBab().length : 0;
    if (action === 'up') { this.cursor = (this.cursor + n - 1) % Math.max(1, n); return true; }
    if (action === 'down') { this.cursor = (this.cursor + 1) % Math.max(1, n); return true; }
    if (action === 'interact' || action === 'kirim') { this.kirimUlang(); return true; }
    if (action === 'menu') { this.tutup(); return true; }
    return true;
  }

  async kirimUlang() {
    if (this.sibuk) return;
    if (!tersambung()) { this.pesan = 'Spreadsheet belum disambungkan — lihat JALANKAN.md.'; return; }
    if (!jumlahAntre()) { this.pesan = 'Tidak ada nilai yang tertahan. Semua sudah terkirim.'; return; }
    this.sibuk = true;
    this.pesan = 'Mengirim...';
    const r = await kirimAntre();
    this.sibuk = false;
    this.pesan = r.terkirim
      ? `${r.terkirim} nilai terkirim${r.sisa ? `, ${r.sisa} masih tertahan` : '. Selesai.'}`
      : `Belum berhasil — ${r.sisa} nilai masih tertahan. Coba lagi nanti.`;
  }

  draw(ctx) {
    if (!this.open) return;
    const W = Math.min(640, view.w - 40);
    const H = Math.min(500, view.h - 60);
    const x = Math.round((view.w - W) / 2);
    const y = Math.round((view.h - H) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, view.w, view.h);
    panel(ctx, x, y, W, H);

    const murid = muridAktif();
    const daftar = this.ilmu ? this.ilmu.daftarNilai() : [];
    const lulus = daftar.filter((b) => b.lulus).length;

    text(ctx, 'NILAI & PENGIRIMAN', x + W / 2, y + 18,
      { font: UI.fontTitle, align: 'center', color: UI.red });

    // Siapa yang nilainya dikirim. Kalau kosong, murid perlu tahu bahwa
    // nilainya BELUM masuk ke spreadsheet, bukan sekadar "belum dinilai".
    const kelas = murid?.kelas || labelKelasMurid(this.ilmu?.tingkat, this.ilmu?.rombel);
    text(ctx, murid
      ? `${murid.nama}${kelas ? ' · ' + kelas : ''} · ${lulus}/${daftar.length} bab lulus`
      : 'Belum terdaftar di peramban ini — nilai hanya tersimpan di sini',
      x + W / 2, y + 38, { font: UI.font, align: 'center', color: '#7a6647' });

    const atas = y + 62;
    const ROW = 24;
    const bawah = y + H - 74;
    const muat = Math.max(4, Math.floor((bawah - atas) / ROW));
    const awal = Math.max(0, Math.min(this.cursor - Math.floor(muat / 2), daftar.length - muat));

    daftar.slice(awal, awal + muat).forEach((b, j) => {
      const i = awal + j;
      const ry = atas + j * ROW;
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 16, ry - 3, W - 32, ROW - 2); }
      const nomor = String(b.nomor).padStart(2, '0');
      // Yang ditampilkan judul babnya, bukan kode "Bab I" saja: murid mencari
      // materinya ("Kebenaran Penurunan Al-Qur'an"), bukan nomor urutnya.
      const nama = (b.judul || '').includes(' — ') ? b.judul.split(' — ')[1] : b.bab;
      text(ctx, fit(ctx, `${nomor}. ${nama}`, W - 210, UI.fontBig), x + 28, ry, { font: UI.fontBig });
      const kanan = b.nilai !== null
        ? `LULUS ${b.nilai}%`
        : (b.bank ? 'siap diujikan' : 'soal belum ada');
      const warna = b.nilai !== null ? '#4f7a2f' : (b.bank ? '#7a6647' : '#b8432e');
      text(ctx, kanan, x + W - 28, ry, { font: UI.font, align: 'right', color: warna });
    });

    if (daftar.length > muat) {
      text(ctx, `▲▼  ${awal + 1}–${Math.min(awal + muat, daftar.length)} dari ${daftar.length}`,
        x + W - 28, y + 38, { font: UI.font, align: 'right', color: '#7a6647' });
    }

    // Kaki panel: keadaan pengiriman. Ini bagian yang membuat murid dan guru
    // bisa memastikan angkanya benar-benar sampai, bukan hanya tampil di layar.
    const antre = jumlahAntre();
    const kaki1 = !tersambung()
      ? 'Spreadsheet belum disambungkan (lihat JALANKAN.md)'
      : antre ? `${antre} nilai tertahan di peramban — tekan E untuk kirim ulang`
        : 'Semua nilai yang lulus sudah terkirim ke spreadsheet guru';
    text(ctx, this.pesan || kaki1, x + W / 2, y + H - 46,
      { font: UI.font, align: 'center', color: antre ? '#b8432e' : '#7a6647' });
    text(ctx, 'W/S pilih · E kirim ulang nilai tertahan · Esc tutup', x + W / 2, y + H - 24,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }
}
