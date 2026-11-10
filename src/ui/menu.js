// Pause menu: Lanjut / Petunjuk / Pengaturan / Keluar.
//
// Three pages share one panel. Arrow keys move, E confirms, Esc goes back one
// level (and closes from the root), so a player never gets stuck in a submenu.
import { view, SKALA } from '../render/renderer.js';
import { bisaLayarPenuh, sedangPenuh, alihkanPenuh } from './fullscreen.js';
import { panel, text, fit, UI } from './draw.js';
import { labelKelasPanjang } from '../core/save.js';
import { muridAktif, jumlahAntre } from '../core/nilai-api.js';

export // Keterangan baris dijaga PENDEK (<= 30 huruf). Panel jeda paling lebar 320 px,
// jadi kaki panel hanya memuat ~29 huruf: keterangan yang lebih panjang
// dipotong "…" dan justru kehilangan bagian yang menjelaskan. Ini bukan
// perkiraan — diukur oleh tools/uji-sentuh.mjs pada empat ukuran layar.
const ROOT = [
  { id: 'resume', label: 'Lanjut', hint: 'Tutup menu, lanjut bermain' },
  { id: 'help', label: 'Petunjuk', hint: 'Kontrol dan cara bermain' },
  { id: 'settings', label: 'Pengaturan', hint: 'Suara, tampilan, tombol' },
  { id: 'ilmu', label: 'Rekap Belajar', hint: 'Kitab dibaca & nilai' },
  // "Simpan sekarang" ada di sini karena pertanyaan yang paling sering muncul
  // dari guru dan murid adalah "apakah progres saya hilang kalau saya tutup?".
  // Simpanan memang otomatis, tetapi tombol ini membuat jawabannya terlihat,
  // bukan hanya dijanjikan.
  { id: 'simpan', label: 'Simpan sekarang', hint: 'Progres tersimpan otomatis' },
  // Keterangan "Keluar" menyebut tujuan dan akibatnya: bukan sekadar menutup
  // layar, tetapi kembali ke menu utama — dan progres sudah disimpan.
  { id: 'quit', label: 'Keluar ke menu utama', hint: 'Kembali ke halaman depan' },
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
  constructor({ audio, renderer, onQuit, onSimpan = null, ilmu = null, sentuh = null }) {
    this.audio = audio;
    this.renderer = renderer;
    this.onQuit = onQuit;
    /** Dipanggil baris "Simpan sekarang". Boleh mengembalikan teks konfirmasi. */
    this.onSimpan = onSimpan;
    /** Pesan singkat di kaki panel sesudah menyimpan, mis. "Tersimpan." */
    this.pesan = '';
    this.ilmu = ilmu;
    /** Lapisan tombol sentuh (ui/touch.js), atau null kalau tidak dipasang. */
    this.sentuh = sentuh;
    this.onNilai = null;   // dipasang main.js: membuka layar Nilai & Pengiriman
    this.open = false;
    this.page = 'root';
    this.cursor = 0;
  }

  toggle() {
    this.open = !this.open;
    this.page = 'root';
    this.cursor = 0;
    this.konfirmasiKeluar = false;
    this.pesan = '';
  }

  close() {
    this.open = false;
    this.page = 'root';
    this.cursor = 0;
    this.konfirmasiKeluar = false;
  }

  /** Settings rows are built fresh so they always show current values. */
  settingsRows() {
    const z = this.renderer.zoomOverride;
    const skala = SKALA[this.renderer.skalaNama]?.label ?? 'Normal';
    return [
      { id: 'volume', label: 'Volume musik', value: `${Math.round(this.audio.settings.musicVolume * 100)}%`, bar: this.audio.settings.musicVolume, hint: 'Musik latar' },
      { id: 'sfx', label: 'Volume efek', value: `${Math.round(this.audio.settings.sfxVolume * 100)}%`, bar: this.audio.settings.sfxVolume, hint: 'Bunyi cangkul, panen, langkah' },
      { id: 'mute', label: 'Bisukan semua', value: this.audio.settings.muted ? 'Ya' : 'Tidak', hint: 'Matikan seluruh suara' },
      // "Luas" memperkecil gambar dunia saja; HUD dan tombol tetap besar.
      // Inilah yang membuat semua tombol pasti kelihatan di ponsel.
      { id: 'pandangan', label: 'Luas pandangan', value: skala, hint: 'Perkecil gambar dunia, HUD tetap besar' },
      { id: 'zoom', label: 'Zoom tampilan', value: z === 0 ? 'Otomatis' : `×${z}`, hint: 'Perbesar seluruh tampilan' },
      // Tanpa baris ini, tombol sentuh yang muncul keliru di laptop (atau
      // menutupi layar di tablet berponsel-ketik) tidak bisa dimatikan sama
      // sekali. Pilihannya diingat di perangkat ini (ui/touch.js).
      ...(this.sentuh ? [{
        id: 'sentuh',
        label: 'Tombol sentuh',
        value: this.sentuh.tampil ? 'Tampil' : 'Mati',
        hint: this.sentuh.perangkatSentuh
          ? 'Tombol di layar untuk jempol'
          : 'Perangkat ini tidak terdeteksi punya layar sentuh',
      }] : []),
      // Baris ini disembunyikan di peramban yang tidak punya API layar penuh
      // (iPhone Safari) supaya tidak ada tombol yang pasti gagal.
      ...(bisaLayarPenuh() ? [{ id: 'penuh', label: 'Layar penuh', value: sedangPenuh() ? 'Ya' : 'Tidak', hint: 'Sembunyikan bilah peramban' }] : []),
      { id: 'back', label: 'Kembali', value: '', hint: 'Balik ke daftar jeda' },
    ];
  }

  rowCount() {
    if (this.page === 'root') return ROOT.length;
    if (this.page === 'settings') return this.settingsRows().length;
    if (this.page === 'ilmu') return Math.max(1, this.ilmu ? this.ilmu.semua().length : 1);
    return 1;                                   // help page: only "Kembali"
  }

  key(action) {
    // Pertanyaan "Keluar ke menu utama?" adalah lapisan tersendiri: selama ia
    // tampil, W/S/E/Esc hanya berlaku untuknya. Tanpa ini, E kedua bisa
    // "membatalkan" sambil diam-diam menjalankan baris menu di belakangnya.
    if (this.konfirmasiKeluar) return this.jawabKeluar(action);

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
        if (row.id === 'pandangan') this.renderer.stepSkala(dir);
        // Kiri = mati, kanan = tampil. Arah ini dipilih supaya sama dengan baris
        // lain (kanan selalu "menambah"), bukan karena urutan nilainya penting.
        if (row.id === 'sentuh') this.sentuh.aturTampil(dir > 0);
        return;
      }
      if (action === 'interact') {
        // Kembali ke daftar utama dengan kursor di baris "Pengaturan" lagi —
        // dicari lewat id, bukan nomor, supaya tidak meleset kalau urutan ROOT
        // berubah.
        if (row.id === 'back') { this.page = 'root'; this.cursor = ROOT.findIndex((r) => r.id === 'settings'); }
        if (row.id === 'mute') this.audio.toggleMute();
        // Ditangani sendiri (asinkron): permintaan layar penuh harus datang dari
        // gestur, dan gestur itu adalah tombol E yang baru saja ditekan.
        if (row.id === 'penuh') alihkanPenuh().then(() => this.audio.ui());
        else if (row.id === 'sentuh') { this.sentuh.alihkan(); this.audio.ui(); }
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
    if (item.id === 'simpan') {
      this.simpan();
      return;
    }
    if (item.id === 'quit') {
      // Dua langkah, DAN simpanan ditulis SEBELUM pertanyaan muncul.
      //
      // Dulu Keluar langsung berpindah halaman, dan yang menulis simpanan
      // adalah pemanggilnya. Itu bekerja, tetapi pemain tidak punya cara tahu
      // progresnya sudah aman — dan kalau satu hari pemanggilnya berubah,
      // tidak ada yang menangkap. Sekarang simpanan ditulis lebih dulu, lalu
      // baru bertanya; membatalkan pertanyaannya TIDAK membatalkan simpanan,
      // dan itu memang tujuannya.
      this.simpan();
      this.audio.ui();
      this.konfirmasiKeluar = true;
      return;
    }
  }

  /**
   * Simpan sekarang, lalu tampilkan pesannya di kaki panel.
   *
   * Mengembalikan teks yang ditampilkan supaya bisa diperiksa uji. Kalau
   * pemanggil tidak memasang `onSimpan` (mis. halaman tanpa simpanan), yang
   * ditulis apa adanya — berbohong "Tersimpan" lebih buruk daripada jujur.
   */
  simpan() {
    this.pesan = this.onSimpan?.() ?? 'Menyimpan tidak tersedia di halaman ini.';
    return this.pesan;
  }

  /**
   * Jawab pertanyaan keluar. `ya` = benar-benar keluar, selain itu kembali ke
   * menu (dan progres tetap tersimpan — lihat `key()`).
   */
  jawabKeluar(action) {
    if (action === 'interact' || action === 'ya') {
      this.konfirmasiKeluar = false;
      this.close();
      this.onQuit();
      return true;
    }
    if (action === 'menu' || action === 'down' || action === 'up') {
      // Esc = batal. Arah juga membatalkan: pemain yang menekan panah jelas
      // ingin memilih hal lain, bukan keluar.
      if (action === 'menu') this.konfirmasiKeluar = false;
      else if (action === 'up' || action === 'down') this.konfirmasiKeluar = false;
      this.audio.ui();
      return true;
    }
    return true;
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
    if (this.konfirmasiKeluar) {
      // Latar digelapkan dulu supaya panel di belakangnya jelas tidak aktif.
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, view.w, view.h);
      this.drawKonfirmasiKeluar(ctx);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, view.w, view.h);
    if (this.page === 'root') this.drawRoot(ctx);
    else if (this.page === 'settings') this.drawSettings(ctx);
    else if (this.page === 'ilmu') this.drawIlmu(ctx);
    else this.drawHelp(ctx);
  }

  /**
   * Berapa baris daftar jeda yang muat di layar sekarang.
   *
   * Panel ini dulu setinggi jumlah barisnya. Dengan enam baris (tambah "Simpan
   * sekarang") tingginya 350 px, dan di layar 320 px judul serta baris
   * terakhirnya terpotong. Sekarang tingginya dibatasi layar dan daftarnya
   * bergulir — sama seperti layar Pengaturan.
   */
  barisJedaMu(at = 40) {
    return Math.max(1, Math.floor((view.h - 24 - 76 - 34) / at));
  }

  drawRoot(ctx) {
    const BARIS = 40;
    const lihat = Math.min(ROOT.length, this.barisJedaMu(BARIS));
    const w = Math.min(320, view.w - 32), h = 76 + lihat * BARIS + 34;
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'JEDA', x + w / 2, y + 20, { font: UI.fontTitle, align: 'center', color: UI.red });

    const atas = Math.max(0, Math.min(this.cursor - lihat + 1, ROOT.length - lihat));
    this._geserJeda = atas;
    ROOT.slice(atas, atas + lihat).forEach((item, j) => {
      const i = atas + j;
      const ry = y + 58 + j * BARIS;
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 16, ry - 4, w - 32, 34); }
      // "Keluar" digambar merah: satu-satunya baris yang meninggalkan permainan.
      // Warna yang sama dipakai di seluruh game untuk hal yang perlu dihati-hati.
      const merah = item.id === 'quit';
      text(ctx, fit(ctx, `${on ? '▶' : ' '} ${item.label}`, w - 56, UI.fontBig), x + 34, ry,
        { font: UI.fontBig, color: merah ? UI.red : UI.outline });
    });
    // Penanda masih ada baris lain di atas/bawah (daftar bergulir di layar pendek).
    if (atas > 0) text(ctx, '▲', x + w - 14, y + 46, { font: UI.font, align: 'right', color: '#8a7550' });
    if (atas + lihat < ROOT.length) {
      text(ctx, '▼', x + w - 14, y + 58 + lihat * BARIS - 8, { font: UI.font, align: 'right', color: '#8a7550' });
    }

    // Kaki panel: pesan simpan (kalau ada) menggantikan keterangan baris, supaya
    // "Tersimpan." benar-benar terbaca — bukan sekadar kedipan yang tak terlihat.
    const kaki = this.pesan || ROOT[this.cursor].hint;
    text(ctx, fit(ctx, kaki, w - 32, UI.font), x + w / 2, y + h - 30,
      { font: UI.font, align: 'center', color: this.pesan ? '#4f7a2f' : '#7a6647' });
  }

  /**
   * "Keluar ke menu utama?" — digambar DI ATAS panel jeda, bukan sebagai
   * halaman baru. Alasannya: pemain harus tetap melihat pilihannya sendiri
   * sambil menjawab, dan batal harus mengembalikan tepat ke tempat semula.
   */
  drawKonfirmasiKeluar(ctx) {
    const w = Math.min(360, view.w - 32), h = 132;
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'KELUAR?', x + w / 2, y + 26, { font: UI.fontTitle, align: 'center', color: UI.red });
    // Dua baris, bukan satu kalimat panjang: yang pertama menjawab kekhawatiran
    // yang sebenarnya ("progres hilang?"), yang kedua menyebut akibatnya.
    text(ctx, 'Progres sudah tersimpan.', x + w / 2, y + 58, { font: UI.fontBig, align: 'center', color: '#4f7a2f' });
    text(ctx, 'Kembali ke menu utama?', x + w / 2, y + 80, { font: UI.fontBig, align: 'center', color: UI.outline });
    text(ctx, 'E keluar  ·  Esc batal', x + w / 2, y + h - 18,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }

  /**
   * Berapa baris Pengaturan yang muat di layar sekarang.
   *
   * Panelnya dulu setinggi jumlah baris, jadi setiap baris baru menambah tinggi
   * dan di jendela 360 px baris "Layar penuh" dan "Kembali" mulai terpotong.
   * Sekarang tingginya dibatasi layar dan daftarnya bergulir — pola yang sama
   * dengan rak perpustakaan dan papan Ragam Usaha.
   */
  barisPengaturanMu(at = 40) {
    // 76 px kepala + 34 px baris petunjuk di kaki + 16 px tepi atas/bawah.
    return Math.max(1, Math.floor((view.h - 24 - 76 - 34) / at));
  }

  drawSettings(ctx) {
    const rows = this.settingsRows();
    const BARIS = 40;
    const muat = this.barisPengaturanMu(BARIS);
    const lihat = Math.min(rows.length, muat);
    const w = Math.min(420, view.w - 32), h = 76 + lihat * BARIS + 34;
    const x = Math.round((view.w - w) / 2), y = Math.max(8, Math.round((view.h - h) / 2));
    panel(ctx, x, y, w, h);
    text(ctx, 'PENGATURAN', x + w / 2, y + 20, { font: UI.fontTitle, align: 'center', color: UI.red });

    // Kursor selalu terlihat: jendela bergeser hanya kalau ia keluar dari daftar.
    const atas = Math.max(0, Math.min(this.cursor - lihat + 1, rows.length - lihat));
    this._geserPengaturan = atas;
    rows.slice(atas, atas + lihat).forEach((row, j) => {
      const i = atas + j;
      const ry = y + 58 + j * BARIS;
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

    // Panah kecil di tepi daftar menunjukkan masih ada baris di atas/bawah.
    // Tanpa ini, baris "Kembali" yang tergeser keluar layar tampak seperti
    // hilang — dan pemain mengira menunya rusak, padahal Esc tetap bekerja.
    // Ditaruh rapat di tepi panel, bukan di kolom nilai (x + w - 30 dipakai
    // nilai baris — panah di situ menimpa "Tidak").
    if (atas > 0) text(ctx, '▲', x + w - 12, y + 46, { font: UI.font, align: 'right', color: '#8a7550' });
    if (atas + lihat < rows.length) {
      text(ctx, '▼', x + w - 12, y + 58 + lihat * BARIS - 8, { font: UI.font, align: 'right', color: '#8a7550' });
    }

    // Keterangan baris yang sedang ditunjuk, lalu petunjuk tombol. Kalau panelnya
    // bergulir, posisi baris disebut supaya pemain tahu masih ada di atas/bawah.
    const kini = rows[this.cursor];
    const geser = lihat < rows.length ? `  (${this.cursor + 1}/${rows.length})` : '';
    text(ctx, fit(ctx, `${kini?.hint ?? ''}${geser}`, w - 40, UI.font),
      x + w / 2, y + h - 46, { font: UI.font, align: 'center', color: '#7a6647' });
    text(ctx, '←/→ ubah  ·  E pilih  ·  Esc kembali', x + w / 2, y + h - 28,
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
