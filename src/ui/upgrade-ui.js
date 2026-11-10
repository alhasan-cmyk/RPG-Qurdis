// Layar "Ragam Usaha Desa" — peningkatan rumah, dapur, peti, dan seterusnya.
//
// Satu layar, tujuh baris, satu tombol. Tiap baris menjawab tiga pertanyaan
// sekaligus, karena itulah yang ditanyakan murid: apa syaratnya (bab mana),
// apa bahannya, dan apa gunanya. Yang belum bisa dibeli tetap ditampilkan
// dengan kekurangan yang jelas — bukan disembunyikan, supaya pemain tahu apa
// yang harus dikumpulkan.
import { view } from '../render/renderer.js';
import { panel, text, wrap, fit, UI } from './draw.js';
import { UPGRADE, NAMA_BAHAN } from '../systems/upgrade.js';

export class UpgradeUI {
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
      if (!st.boleh) {
        this.audio?.denied?.();
        // Satu pesan per kegagalan, berurutan dari yang paling menentukan:
        // tingkat penuh -> bab -> bahan -> uang. Bahan disebut lebih dulu
        // daripada uang karena bahan harus dicari di ladang, sedangkan uang
        // datang sendiri dari hasil panen.
        if (st.penuh) this.pesan = 'Sudah pada tingkat tertinggi.';
        else if (!st.lulus) this.pesan = `Lulus dulu ${st.labelBab}${st.judulBab ? ': ' + (st.judulBab.split(' — ')[1] ?? st.judulBab) : ''}.`;
        else if (st.bahanKurang.length) this.pesan = `Bahan kurang: ${st.bahanKurang.map((b) => `${b.kurang} ${NAMA_BAHAN[b.bahan] ?? b.bahan}`).join(', ')}.`;
        else this.pesan = `Uangnya kurang G${st.uangKurang.toLocaleString('id-ID')}.`;
        return true;
      }
      const r = this.up.beli(st.id, { inv: this.ctx.inv, uang: this.ctx.uang() });
      if (r) {
        this.ctx.bayar(r.biaya);
        this.audio?.coin?.();
        this.pesan = `${st.def.judul} selesai — ${st.def.efek(r.level)}.`;
        this.onBeli?.(r);
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
    // window / zoom), jadi tinggi yang tersedia benar-benar 360 px. Tujuh
    // peningkatan tidak muat di situ bersama rinciannya; karena itu daftarnya
    // memakai jendela gulir — pola yang sama dengan rak perpustakaan — dan baris
    // yang ditunjuk dirinci di kotak bawah.
    const PAD = 18;
    const W = Math.min(600, view.w - 24);
    const HUD = 34;                     // hotbar: digambar paling atas, jangan ditimpa
    const ROW = 26;
    const RINCI = 70;                   // kotak rincian (3 baris teks + tepi)
    const KEPALA = 40;
    // Baris yang digambar dibatasi empat: dengan tujuh baris panelnya setinggi
    // layar dan kotak rincian tertutup hotbar. Empat baris + rincian terbaca
    // utuh, sisanya digapai dengan W/S (penanda "baris 1–4 dari 7" di kanan).
    const lihat = Math.max(3, Math.min(4, UPGRADE.length));
    const H = Math.min(view.h - HUD - 8, KEPALA + lihat * ROW + RINCI + 8);
    this.barisTerlihat = lihat;
    const x = Math.round((view.w - W) / 2);
    const y = Math.max(4, Math.min(Math.round((view.h - H) / 2), view.h - H - HUD));
    panel(ctx, x, y, W, H);
    const innerW = W - PAD * 2;

    text(ctx, 'RAGAM USAHA DESA', x + W / 2, y + 24, { font: UI.fontTitle, align: 'center', color: UI.red });

    let cy = y + KEPALA;
    const akhir = Math.min(UPGRADE.length, this.scroll + lihat);
    for (let i = this.scroll; i < akhir; i++) {
      const u = UPGRADE[i];
      const st = this.up.status(u.id, this.ctx);
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 8, cy - 13, W - 16, ROW - 2); }
      const tingkat = st.penuh ? `${st.level}/${st.maks} penuh` : `${st.level}/${st.maks}`;
      const judul = fit(ctx, `${on ? '▸ ' : '  '}${u.judul} (${u.alat}) · ${tingkat}`, innerW - 96, UI.font);
      text(ctx, judul, x + PAD, cy, { font: UI.font, color: st.penuh ? '#7a6647' : UI.outline });
      // Syarat bab: hijau kalau sudah lulus, merah kalau belum — warna yang sama
      // dengan layar ujian, jadi murid tidak perlu belajar arti warna baru.
      const babTeks = st.kitab ? `${st.labelBab} ${st.lulus ? '✓' : '✗'}` : '—';
      text(ctx, babTeks, x + W - PAD, cy, { font: UI.font, align: 'right', color: st.lulus ? '#4f7a2f' : '#b8432e' });
      cy += ROW;
    }
    // Penanda halaman hanya muncul kalau daftarnya memang terpotong.
    if (lihat < UPGRADE.length) {
      text(ctx, `baris ${this.scroll + 1}–${akhir} dari ${UPGRADE.length}`,
        x + W - PAD, cy - 8, { font: UI.font, align: 'right', color: '#8a7550' });
    }

    // ---- rincian peningkatan yang ditunjuk
    const st = this.status();
    const ry = y + H - RINCI - 2;
    ctx.fillStyle = '#f3e3c2';
    ctx.fillRect(x + 10, ry, W - 20, RINCI);
    const bahan = Object.entries(st.def.bahan).map(([b, n]) => {
      const perlu = n * (st.level + 1);
      const punya = this.ctx.inv.count(b);
      return `${NAMA_BAHAN[b] ?? b} ${Math.min(punya, perlu)}/${perlu}`;
    }).join(' · ');
    const harga = `G${st.biaya.toLocaleString('id-ID')}`;
    text(ctx, fit(ctx, `${bahan} · ${harga}`, innerW - 8, UI.font), x + PAD, ry + 16,
      { font: UI.font, color: st.uangKurang || st.bahanKurang.length ? '#b8432e' : '#4f7a2f' });
    // Guna peningkatan ditulis apa adanya, termasuk pada tingkat 0: pemain harus
    // tahu apa yang ia beli sebelum mengumpulkan 25 batu.
    text(ctx, `Guna: ${st.def.efek(st.penuh ? st.level : st.level + 1) || '—'}`, x + PAD, ry + 34,
      { font: UI.font, color: '#5a4230' });
    // Baris terakhir: status di kiri, tombol di kanan. Petunjuk tombol sengaja di
    // sini, bukan di kaki panel — kaki panel berimpit dengan hotbar.
    if (this.pesan) {
      text(ctx, fit(ctx, this.pesan, innerW - 132, UI.font), x + PAD, ry + 52, { font: UI.font, color: UI.red });
    } else if (!st.lulus) {
      text(ctx, fit(ctx, `${st.labelBab} belum lulus — itu syaratnya.`, innerW - 132, UI.font),
        x + PAD, ry + 52, { font: UI.font, color: '#b8432e' });
    } else {
      text(ctx, st.boleh ? 'Boleh dibeli.' : (st.bahanKurang.length ? 'Bahan belum cukup.' : 'Uang belum cukup.'),
        x + PAD, ry + 52, { font: UI.font, color: st.boleh ? '#4f7a2f' : '#8a7550' });
    }
    text(ctx, 'E beli · Esc tutup', x + W - PAD, ry + 52,
      { font: UI.font, align: 'right', color: '#7a6647' });
  }
}
