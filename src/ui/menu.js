// Pause menu: Lanjut / Petunjuk / Pengaturan / Keluar.
//
// Three pages share one panel. Arrow keys move, E confirms, Esc goes back one
// level (and closes from the root), so a player never gets stuck in a submenu.
import { view } from '../render/renderer.js';
import { panel, text, fit, UI } from './draw.js';
import { labelKelasPanjang } from '../core/save.js';
import { muridAktif, jumlahAntre } from '../core/nilai-api.js';

const ROOT = [
  { id: 'resume', label: 'Lanjut', hint: 'Tutup menu dan lanjutkan permainan' },
  { id: 'help', label: 'Petunjuk', hint: 'Kontrol dan cara bermain' },
  { id: 'settings', label: 'Pengaturan', hint: 'Volume musik dan zoom tampilan' },
  { id: 'ilmu', label: 'Rekap Belajar', hint: 'Kitab yang dibaca dan ketepatan jawaban' },
  { id: 'quit', label: 'Keluar', hint: 'Kembali ke menu utama' },
];

const HELP = [
  ['WASD / panah', 'Berjalan'],
  ['Shift (tahan)', 'Berlari'],
  ['E di tepi air', 'Memancing (pegang pancing)'],
  ['E / Spasi', 'Pakai barang, makan, bicara, panen, tidur'],
  ['1 – 9', 'Pilih alat di hotbar'],
  ['X / Z / roda', 'Alat berikutnya / sebelumnya'],
  ['I atau Tab', 'Buka inventori'],
  ['Backspace', 'Buang barang (di inventori)'],
  ['G', 'Beri hadiah ke warga'],
  ['E di rak balai', 'Baca kitab di Perpustakaan'],
  ['V', 'Nilai ujian per bab (di Rekap Belajar)'],
  ['Esc', 'Buka menu ini'],
];

// Lines stay short: the panel must fit a 640x360 viewport without clipping.
// Tetap empat baris: panelnya tumbuh mengikuti daftar ini, dan di jendela kecil
// ia sudah mepet. Jam buka sengaja tidak ditulis di sini — daftar seperti itu
// pernah ditulis dan langsung basi begitu warung dan klinik dibuka. Papan
// pengumuman di plaza membacanya langsung dari data, jadi ia yang ditunjuk.
const HELP_TEXT = [
  'Cangkul, tanam, siram, panen — di petak kebun.',
  'Isi penyiram di sumur; jual lewat kotak jual.',
  'Tekan E di depan pintu: tidur, belanja, berobat.',
  'Jam buka & titipan warga: baca papan di plaza.',
];

export class Menu {
  constructor({ audio, renderer, onQuit, ilmu = null }) {
    this.audio = audio;
    this.renderer = renderer;
    this.onQuit = onQuit;
    this.ilmu = ilmu;
    this.onNilai = null;   // dipasang main.js: membuka layar Nilai & Pengiriman
    this.open = false;
    this.page = 'root';
    this.cursor = 0;
  }

  toggle() {
    this.open = !this.open;
    this.page = 'root';
    this.cursor = 0;
  }

  close() { this.open = false; this.page = 'root'; this.cursor = 0; }

  /** Settings rows are built fresh so they always show current values. */
  settingsRows() {
    const z = this.renderer.zoomOverride;
    return [
      { id: 'volume', label: 'Volume musik', value: `${Math.round(this.audio.settings.musicVolume * 100)}%`, bar: this.audio.settings.musicVolume },
      { id: 'sfx', label: 'Volume efek', value: `${Math.round(this.audio.settings.sfxVolume * 100)}%`, bar: this.audio.settings.sfxVolume },
      { id: 'mute', label: 'Bisukan semua', value: this.audio.settings.muted ? 'Ya' : 'Tidak' },
      { id: 'zoom', label: 'Zoom tampilan', value: z === 0 ? 'Otomatis' : `×${z}` },
      { id: 'back', label: 'Kembali', value: '' },
    ];
  }

  rowCount() {
    if (this.page === 'root') return ROOT.length;
    if (this.page === 'settings') return this.settingsRows().length;
    if (this.page === 'ilmu') return Math.max(1, this.ilmu ? this.ilmu.semua().length : 1);
    return 1;                                   // help page: only "Kembali"
  }

  key(action) {
    const n = this.rowCount();
    if (action === 'up') { this.cursor = (this.cursor + n - 1) % n; this.audio.ui(); return; }
    if (action === 'down') { this.cursor = (this.cursor + 1) % n; this.audio.ui(); return; }

    if (this.page === 'settings') {
      const row = this.settingsRows()[this.cursor];
      if (action === 'left' || action === 'right') {
        const dir = action === 'right' ? 1 : -1;
        if (row.id === 'volume') this.audio.setVolume(this.audio.settings.musicVolume + dir * 0.05);
        if (row.id === 'sfx') this.audio.setSfxVolume(this.audio.settings.sfxVolume + dir * 0.05);
        if (row.id === 'mute') this.audio.toggleMute();
        if (row.id === 'zoom') this.renderer.stepZoom(dir);
        return;
      }
      if (action === 'interact') {
        if (row.id === 'back') { this.page = 'root'; this.cursor = 2; }
        if (row.id === 'mute') this.audio.toggleMute();
        else this.audio.ui();
      }
      return;
    }

    if (this.page === 'help') {
      if (action === 'interact') { this.page = 'root'; this.cursor = 1; }
      return;
    }

    if (this.page === 'ilmu') {
      if (action === 'interact') { this.page = 'root'; this.cursor = 3; }
      // V membuka rincian nilai per bab. Dipisah dari daftar kitab karena
      // yang dicari murid di sana bukan judul bab, melainkan "lulus berapa
      // persen, bab mana yang masih terkunci".
      if (action === 'nilai') { this.onNilai?.(); }
      return;
    }

    if (action !== 'interact') return;
    const item = ROOT[this.cursor];
    if (item.id === 'resume') this.close();
    if (item.id === 'help') { this.page = 'help'; this.cursor = 0; }
    if (item.id === 'settings') { this.page = 'settings'; this.cursor = 0; }
    if (item.id === 'ilmu') { this.page = 'ilmu'; this.cursor = 0; }
    if (item.id === 'quit') this.onQuit();
  }

  /** Esc: back one level, or close from the root. */
  back() {
    if (this.page === 'root') this.close();
    else {
      this.cursor = this.page === 'help' ? 1 : this.page === 'ilmu' ? 3 : 2;
      this.page = 'root';
    }
  }

  draw(ctx) {
    if (!this.open) return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, view.w, view.h);
    if (this.page === 'root') this.drawRoot(ctx);
    else if (this.page === 'settings') this.drawSettings(ctx);
    else if (this.page === 'ilmu') this.drawIlmu(ctx);
    else this.drawHelp(ctx);
  }

  drawRoot(ctx) {
    const w = Math.min(320, view.w - 32), h = 76 + ROOT.length * 40 + 34;
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'JEDA', x + w / 2, y + 20, { font: UI.fontTitle, align: 'center', color: UI.red });

    ROOT.forEach((item, i) => {
      const ry = y + 58 + i * 40;
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 16, ry - 4, w - 32, 34); }
      text(ctx, `${on ? '▶' : ' '} ${item.label}`, x + 34, ry, { font: UI.fontBig, color: UI.outline });
    });

    text(ctx, ROOT[this.cursor].hint, x + w / 2, y + h - 30, { font: UI.font, align: 'center', color: '#7a6647' });
  }

  drawSettings(ctx) {
    const rows = this.settingsRows();
    const w = Math.min(420, view.w - 32), h = 76 + rows.length * 40 + 34;
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'PENGATURAN', x + w / 2, y + 20, { font: UI.fontTitle, align: 'center', color: UI.red });

    rows.forEach((row, i) => {
      const ry = y + 58 + i * 40;
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 16, ry - 4, w - 32, 34); }
      text(ctx, `${on ? '▶' : ' '} ${row.label}`, x + 30, ry, { font: UI.fontBig });
      if (row.bar !== undefined) {
        const bx = x + w - 190, bw = 120, bh = 12, by = ry + 6;
        ctx.fillStyle = UI.outline;
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = '#6b5a3a';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#6abe30';
        ctx.fillRect(bx, by, Math.round(bw * row.bar), bh);
      }
      if (row.value) text(ctx, row.value, x + w - 30, ry, { font: UI.fontBig, align: 'right' });
    });

    text(ctx, '←/→ ubah  ·  E pilih  ·  Esc kembali', x + w / 2, y + h - 30,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }

  /** Rekap belajar: apa yang sudah dibaca dan seberapa tepat jawabannya. */
  drawIlmu(ctx) {
    const ilmu = this.ilmu;
    const kitab = ilmu ? ilmu.semua() : [];
    const w = Math.min(520, view.w - 32);
    // Tinggi diturunkan dari jumlah baris yang ingin dilihat, bukan ditebak:
    // 88 px untuk judul+ringkasan, 7 baris daftar, 112 px untuk batang
    // ketepatan dan baris petunjuk. Versi sebelumnya menaruh teks ketepatan
    // menimpa baris terakhir daftar.
    const BARIS = 7;
    // Kepala panel sekarang tiga baris (kelas, jumlah kitab, ringkasan per
    // jenjang). Tinggi panel diturunkan dari jumlah baris itu, bukan ditebak —
    // versi sebelumnya membuat baris ketiga menimpa baris kedua.
    const h = Math.min(112 + BARIS * 22 + 112, view.h - 16);
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'REKAP BELAJAR', x + w / 2, y + 18, { font: UI.fontTitle, align: 'center', color: UI.red });

    let ly = y + 40;
    const ROW = 22;
    const listTop = y + 112;
    const listBottom = y + h - 112;
    const terlihat = Math.max(3, Math.floor((listBottom - listTop) / ROW));

    if (!ilmu) {
      text(ctx, 'Belum ada data.', x + 26, ly, { font: UI.fontBig, color: '#7a6647' });
    } else {
      const total = ilmu.benar + ilmu.salah;
      const nilai = total ? Math.round((ilmu.benar / total) * 100) : 0;

      // Ringkasan per jenjang — inilah yang dicari guru lebih dulu: sejauh mana
      // satu kelas tertuntaskan, bukan judul bab satu per satu.
      // Satu kelas saja yang tampil, jadi ringkasan per jenjang tidak perlu.
      // Yang dicari guru: seberapa jauh materi kelas ini tertuntaskan.
      const sudah = kitab.filter((k) => ilmu.sudahDibaca(k.id)).length;
      // Kelas pemain ditampilkan lebih dulu: guru yang membuka layar ini ingin
      // tahu ini murid kelas apa sebelum melihat angkanya.
      const kelasLabel = ilmu.tingkat
        ? `Kelas ${labelKelasPanjang(ilmu.tingkat, ilmu.rombel)}`
        : 'Kelas belum dipilih';
      const keahlian = ['hoe', 'water', 'axe', 'pickaxe', 'scythe', 'fish']
        .filter((a) => ilmu.bolehPakai(a)).length;
      text(ctx, `${kelasLabel}  ·  keahlian ${keahlian}/6  ·  Tepat ${ilmu.benar}  ·  Salah ${ilmu.salah}`,
        x + 26, ly, { font: UI.font, color: '#7a6647' });
      ly += 18;
      text(ctx, `Kitab dibaca ${ilmu.dibaca.size}/${kitab.length}`, x + 26, ly,
        { font: UI.font, color: '#7a6647' });
      ly += 18;
      const babLulus = kitab.filter((k) => ilmu.lulus.has(k.id)).length;
      const nilaiBab = kitab.map((k) => ilmu.nilai[k.id]?.nilai).filter((n) => typeof n === 'number');
      const rerata = nilaiBab.length ? Math.round(nilaiBab.reduce((a, b) => a + b, 0) / nilaiBab.length) : null;
      text(ctx, `Bab lulus ${babLulus}/${kitab.length}   ·   `
        + (rerata === null ? 'belum ada nilai ujian' : `rata-rata nilai ${rerata}%`),
        x + 26, ly, { font: UI.font, color: '#8a2c1d' });
      ly += 18;
      // Siapa yang nilainya dikirim: nama murid dan apakah masih ada nilai
      // yang tertahan di peramban karena jaringan putus.
      const m = muridAktif();
      const antre = jumlahAntre();
      text(ctx, m
        ? `${m.nama} · ${m.kelas || 'kelas belum diisi'} · ${antre ? `${antre} nilai menunggu terkirim` : 'nilai terkirim ke spreadsheet guru'}`
        : 'Belum terdaftar — nilai hanya tersimpan di peramban ini',
        x + 26, ly, { font: UI.font, color: antre ? '#b8432e' : '#7a6647' });

      // Jendela daftar mengikuti kursor, seperti rak perpustakaan.
      const cur = Math.min(this.cursor, kitab.length - 1);
      let top = Math.max(0, Math.min(cur - Math.floor(terlihat / 2), kitab.length - terlihat));
      kitab.slice(top, top + terlihat).forEach((k, j) => {
        const i = top + j;
        const ry = listTop + j * ROW;
        const on = i === cur;
        if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 16, ry - 3, w - 32, ROW - 2); }
        const sudah = ilmu.sudahDibaca(k.id);
        text(ctx, fit(ctx, `${sudah ? '✓' : '·'} ${k.judul}`, w - 150, UI.fontBig), x + 30, ry,
          { font: UI.fontBig, color: sudah ? UI.outline : '#9a8a70' });
        // Tidak ada penanda "kelas lain": daftar ini sudah kelas pemain.
        // Kolom kanan menjawab pertanyaan yang sebenarnya ditanyakan murid:
        // "bab ini sudah lulus belum, dan berapa nilainya?". Bab yang masih
        // terkunci disebut terkunci, bukan dibiarkan tampak bisa dikerjakan.
        const n = ilmu.nilai[k.id]?.nilai;
        const izin = ilmu.bolehUjian(k.id);
        const kanan = n !== undefined ? `LULUS ${n}%` : (izin.boleh ? 'siap diujikan' : 'terkunci');
        const warnaL = n !== undefined ? '#4f7a2f' : (izin.boleh ? '#7a6647' : '#b8432e');
        text(ctx, kanan, x + w - 30, ry, { font: UI.font, align: 'right', color: warnaL });
      });
      if (kitab.length > terlihat) {
        text(ctx, `▲▼  ${top + 1}–${Math.min(top + terlihat, kitab.length)} dari ${kitab.length}`,
          x + w - 30, y + 58, { font: UI.font, align: 'right', color: '#7a6647' });
      }

      // Batang ketepatan hanya bermakna kalau sudah ada jawaban.
      const bx = x + 30, bw = w - 60, bh = 10, by = y + h - 62;
      ctx.fillStyle = UI.outline; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#6b5a3a'; ctx.fillRect(bx, by, bw, bh);
      if (total > 0) {
        ctx.fillStyle = nilai >= 70 ? '#6abe30' : '#d9a12a';
        ctx.fillRect(bx, by, Math.round(bw * (nilai / 100)), bh);
        text(ctx, `Ketepatan ${nilai}%`, x + w - 30, by + 14, { font: UI.font, align: 'right', color: '#7a6647' });
      } else {
        text(ctx, 'Belum ada jawaban — temui warga yang bertanya.', x + 30, by + 14,
          { font: UI.font, color: '#7a6647' });
      }
    }

    text(ctx, 'W/S telusuri  ·  E atau Esc  ·  kembali', x + w / 2, y + h - 26,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }

  drawHelp(ctx) {
    const w = Math.min(540, view.w - 32);
    const h = Math.min(96 + HELP.length * 22 + HELP_TEXT.length * 20 + 44, view.h - 16);
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'PETUNJUK', x + w / 2, y + 20, { font: UI.fontTitle, align: 'center', color: UI.red });

    let ly = y + 44;
    text(ctx, 'KONTROL', x + 26, ly, { font: UI.font, color: '#8a2c1d' });
    ly += 20;
    for (const [keys, what] of HELP) {
      text(ctx, keys, x + 30, ly, { font: UI.fontBig, color: '#5a4a30' });
      text(ctx, what, x + 172, ly, { font: UI.fontBig });
      ly += 22;
    }

    ly += 8;
    text(ctx, 'CARA MAIN', x + 26, ly, { font: UI.font, color: '#8a2c1d' });
    ly += 20;
    for (const line of HELP_TEXT) {
      text(ctx, line, x + 30, ly, { font: UI.fontBig });
      ly += 20;
    }

    text(ctx, 'E atau Esc  ·  kembali', x + w / 2, y + h - 30,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }
}
