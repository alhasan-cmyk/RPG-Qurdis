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
        // Alasan disusun di sistem (Upgrade.alasanTidakBoleh), satu sumber yang
        // sama dengan baris status di layar — supaya tombol E dan tulisan di
        // panel tidak pernah berkata berbeda.
        this.pesan = this.up.alasanTidakBoleh(st, { namaBahan: NAMA_BAHAN });
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
    const ROW = 30;                     // 26 terlalu rapat untuk dua baris kanan
    const RINCI = 84;                   // kotak rincian (3 baris + 2 baris alasan)
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
      // Nama alat hanya ditulis kalau alatnya memang ada di hotbar (`u.alat`).
      // Dulu semua baris punya "(Pena)", "(Lesung)", dst. — alat yang tidak ada
      // di permainan, dan membuat murid mengira ada yang hilang.
      const alat = u.alat ? ` (${u.alat})` : '';
      // Kolom kanan selebar 148 px; judul harus berhenti sebelum kolom itu,
      // bukan sebelum `innerW - 150`, kalau tidak tulisan panjang menabrak
      // keterangan bab di layar sempit.
      const judul = fit(ctx, `${on ? '▸ ' : '  '}${u.judul}${alat} · ${tingkat}`, innerW - 168, UI.font);
      text(ctx, judul, x + PAD, cy, { font: UI.font, color: st.penuh ? '#7a6647' : UI.outline });
      // Syarat bab: hijau kalau sudah lulus, merah kalau belum — warna yang sama
      // dengan layar ujian, jadi murid tidak perlu belajar arti warna baru.
      // Nama guru ikut ditulis karena "Bab IV" saja tidak memberi tahu harus
      // menemui siapa; dengan 6 warga, menebaknya hampir selalu salah.
      // Nama guru ditulis di BARIS KEDUA, bukan disambung ke "Bab V ✗ · …".
      // Digabung, `fit` memotong ekornya — dan ekornya itulah nama gurunya,
      // satu-satunya petunjuk ke siapa murid harus datang. Diukur dengan VT323
      // 16 px: "Bab 17 ✗ · Kang Dadang" butuh 176 px, sedangkan kolom kanan
      // hanya 148 px. Dua baris selebar 148 px selalu cukup.
      const warnaBab = st.lulus ? '#4f7a2f' : '#b8432e';
      if (!st.kitab) {
        text(ctx, '—', x + W - PAD, cy, { font: UI.font, align: 'right', color: warnaBab });
      } else if (st.lulus) {
        text(ctx, `${st.labelBab} ✓`, x + W - PAD, cy, { font: UI.font, align: 'right', color: warnaBab });
      } else {
        // Nama guru ditaruh di atas nomor bab: yang dicari murid lebih dulu
        // adalah orangnya, nomor bab menyusul.
        if (st.guru) {
          text(ctx, st.guru.nama, x + W - PAD, cy - 5, { font: UI.font, align: 'right', color: warnaBab });
        }
        text(ctx, `${st.labelBab} ✗`, x + W - PAD, cy + 7, { font: UI.font, align: 'right', color: warnaBab });
      }
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
    // `st.perlu` dihitung sistem (satu sumber dengan yang ditagih saat membeli),
    // jadi angka di layar tidak mungkin berbeda dengan yang dipotong dari tas.
    const bahan = Object.entries(st.perlu).map(([b, perlu]) => {
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
    //
    // Kalimatnya diambil dari Upgrade.alasanTidakBoleh, sumber yang SAMA dengan
    // yang muncul saat E ditekan. Dulu ada dua perumus pesan di dua tempat, dan
    // yang di layar hanya berkata "Bahan belum cukup" tanpa menyebut apa yang
    // kurang.
    //
    // Lebar yang tersedia untuk alasan berhenti SEBELUM tombol "E beli · Esc
    // tutup" di kanan, dengan jarak 12 px. Sebelumnya yang dipakai `innerW - 132`
    // tanpa memperhitungkan lebar tombol itu — di layar 640 px kalimatnya
    // menabrak tombol, dan di ponsel tegak nama gurunya terpotong tepat di
    // bagian yang paling penting.
    ctx.font = UI.font;
    const lebarTombol = ctx.measureText('E beli · Esc tutup').width;
    const ruangAlasan = Math.max(80, innerW - lebarTombol - 12);
    // Kalimat lengkap didahulukan; hanya kalau ia tidak muat, dipakai versi
    // ringkas yang tetap menyebut nomor bab + nama guru. Dengan begitu layar
    // lebar mendapat penjelasan utuh (termasuk "sekaligus membuka kapak"),
    // sedangkan layar sempit tidak pernah menampilkan kalimat terpotong "…".
    const panjang = this.up.alasanTidakBoleh(st, { namaBahan: NAMA_BAHAN });
    const pendek = this.up.alasanTidakBoleh(st, { namaBahan: NAMA_BAHAN, ringkas: true });
    // Kotak rincian 84 px: baris bahan (+16), guna (+34), lalu alasan sampai
    // tiga baris (+52, +64, +76). Tiga baris masih di dalam kotak. `wrap`
    // mengembalikan potongan kata terakhir yang masih panjang, jadi jumlah
    // baris dihitung longgar: kalau hasil bungkusnya pas tiga baris tetapi
    // baris terakhirnya nyaris selebar penuh, kata berikutnya hampir pasti
    // turun ke baris keempat yang tidak terlihat.
    const muat = (t) => {
      const b = wrap(ctx, t, ruangAlasan, UI.font);
      if (b.length < 3) return true;
      if (b.length > 3) return false;
      return ctx.measureText(b[2]).width < ruangAlasan * 0.85;
    };
    const alasan = st.boleh ? '' : (this.pesan || (muat(panjang) ? panjang : (muat(pendek) ? pendek : panjang)));
    if (st.boleh) {
      text(ctx, 'Boleh dibeli.', x + PAD, ry + 52, { font: UI.font, color: '#4f7a2f' });
    } else {
      // Alasan bisa memuat dua baris (bab + "juga membuka cangkul"). Dipotong
      // `fit` ia akan berakhir "…", dan justru bagian akhirnya yang menjelaskan
      // kenapa bab papan sama dengan bab alat. Jadi dipotong PER KATA: baris
      // pertama selebar ruang, sisanya dirapatkan ke bawah.
      const baris = wrap(ctx, alasan, ruangAlasan, UI.font).slice(0, 3);
      // Sesudah berhasil membeli, pesannya kabar baik ("selesai"), bukan
      // peringatan — jangan dicetak merah.
      const baruSaja = /selesai/.test(this.pesan);
      const warna = st.penuh ? '#8a7550' : (baruSaja ? '#4f7a2f' : UI.red);
      baris.forEach((t, i) => {
        // Baris kedua naik 12 px saja: kotak rincian hanya 70 px, dan tombol
        // "Boleh dibeli" di y yang sama harus tetap terpisah jelas.
        text(ctx, t, x + PAD, ry + 52 + (i ? 12 : 0), { font: UI.font, color: warna });
      });
    }
    text(ctx, 'E beli · Esc tutup', x + W - PAD, ry + 52,
      { font: UI.font, align: 'right', color: '#7a6647' });
  }
}
