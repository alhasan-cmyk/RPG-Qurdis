// Perpustakaan Balai Desa — layar baca kitab, dan layar tanya-jawab warga.
//
// Digambar dengan primitif yang sama seperti toko dan inventori (panel kayu,
// teks VT323), supaya terasa bagian dari game ini, bukan jendela tempelan.
// Teks Arab butuh perlakuan sendiri: arah kanan-ke-kiri, font yang lebih besar,
// dan baris pendek — kalau tidak, harakatnya bertumpuk dan tak terbaca.
import { view } from '../render/renderer.js';
import { panel, text, wrap, fit, UI } from './draw.js';
import { UJIAN_MAKS, perluBenar } from '../systems/ilmu.js';

const ARAB_FONT = '26px "Traditional Arabic", "Scheherazade New", "Amiri", "Noto Naskh Arabic", serif';

/**
 * Potong teks Arab per kata menurut lebar SUNGGUHAN tiap kata.
 *
 * Versi lama menebak lebar kata Arab = 15 px lalu memotong menurut jumlah kata.
 * Tebakan itu meleset empat kali lipat: pada font 26px satu kata Arab rata-rata
 * 57 px, sehingga satu baris bisa menjadi 4.000 px pada panel selebar 1.000 px —
 * teks tumpah ke luar kotak, bukan turun baris. measureText sendiri akurat untuk
 * huruf Arab, jadi sekarang diukur seperti teks latin.
 *
 * `maxW` adalah lebar baris yang boleh dipakai. Kalau satu kata sendirian sudah
 * lebih lebar dari itu (kata Arab panjang jarang, tapi ada), kata itu tetap
 * diletakkan di barisnya sendiri: memotong per huruf pada teks Arab akan memutus
 * harakat dari hurufnya dan hasilnya rusak. Lebih baik sedikit melewati batas
 * daripada tulisan yang tidak bisa dibaca.
 */
function wrapArab(kata, maxW, font) {
  const c = document.createElement('canvas').getContext('2d');
  c.font = font;
  const baris = [];
  let cur = '';
  for (const w of kata) {
    const test = cur ? cur + ' ' + w : w;
    if (!cur || c.measureText(test).width <= maxW) { cur = test; continue; }
    baris.push(cur);
    cur = w;
  }
  if (cur) baris.push(cur);
  return baris;
}

const ctxDummy = document.createElement('canvas').getContext('2d');

/**
 * Siapa yang mengajar sebuah bab di kelas ini — atau null.
 *
 * Dicari dari data `keahlian.ajar` (bukan ditebak dari urutan), sehingga rak
 * bisa menyebut nama pengajarnya dan murid tidak perlu berkeliling desa untuk
 * menemukan siapa yang memegang bab itu.
 */
export function whoMengajarBab(ilmu, kitabId) {
  if (!kitabId) return null;
  const ajar = ilmu.data.keahlian?.ajar?.[ilmu.tingkat] ?? ilmu.data.keahlian?.ajar?.X ?? {};
  for (const [npcId, daftar] of Object.entries(ajar)) {
    if (daftar.includes(kitabId)) return npcId;
  }
  return null;
}

export class IlmuUI {
  constructor(ilmu, audio = null) {
    this.ilmu = ilmu;
    this.audio = audio;
    this.open = false;
    this.mode = 'rak';        // rak | baca | tanya
    this.kitabIndex = 0;
    this.halaman = 0;
    this.bagian = 0;          // potongan halaman yang sedang dilihat
    this.cursor = 0;          // pilihan pada mode rak / jawaban pada mode tanya
    this.scroll = 0;          // baris pertama yang tergambar di rak
    this.tanya = null;        // { npcId, npcName, data }
    this.selesai = null;      // { tepat, bahas } setelah menjawab
    this.pesan = '';
  }

  /* ---------------------------------------------------------------- buka */

  bukaRak() {
    this.open = true;
    this.mode = 'rak';
    this.cursor = 0;
    this.scroll = 0;
    this.pesan = '';
    this.selesai = null;
  }

  bukaTanya(npcId, npcName, tanya) {
    this.open = true;
    this.mode = 'tanya';
    this.tanya = { npcId, npcName, data: tanya };
    this.cursor = 0;
    this.selesai = null;
  }

  tutup() {
    this.open = false;
    this.tanya = null;
    this.selesai = null;
  }

  /* ---------------------------------------------------------------- input */

  /** Semua tombol yang dipakai layar ini. Mengembalikan true bila ditangani. */
  key(action, hari = 0) {
    if (!this.open) return false;

    if (this.mode === 'rak') {
      const total = this.ilmu.semua().length;
      if (action === 'up') { this.cursor = Math.max(0, this.cursor - 1); this.pesan = ''; }
      if (action === 'down') { this.cursor = Math.min(total - 1, this.cursor + 1); this.pesan = ''; }
      // Jaga agar kursor selalu terlihat. Tanpa ini, dengan 21 kitab pemain bisa
      // menekan S terus dan memilih baris yang tidak tergambar di layar.
      const terlihat = this.barisTerlihat ?? 6;
      if (this.cursor < this.scroll) this.scroll = this.cursor;
      if (this.cursor >= this.scroll + terlihat) this.scroll = this.cursor - terlihat + 1;
      this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, total - terlihat)));
      if (action === 'interact') {
        this.kitabIndex = this.cursor;
        this.halaman = 0;
        this.bagian = 0;
        this.mode = 'baca';
        this.audio?.ui?.();
        const k = this.ilmu.semua()[this.kitabIndex];
        if (k && this.ilmu.tandaiDibaca(k.id)) this.onProgress?.();
      }
      if (action === 'menu') this.tutup();
      return true;
    }

    if (this.mode === 'baca') {
      const k = this.ilmu.semua()[this.kitabIndex];
      const total = k ? k.halaman.length : 0;
      // Berapa bagian halaman ini, dihitung dengan ukuran panel yang sama
      // seperti saat menggambar. Tanpa ini, E pada akhir bagian pertama akan
      // melompat ke halaman berikutnya dan melewati sisa ayatnya.
      const W = Math.min(620, view.w - 60);
      const H = Math.min(460, view.h - 120);
      const jumlahBagian = k
        ? this.halamanTerbagi(k, this.halaman, W - 56, (H - 78) - 58).length
        : 1;
      if (action === 'interact' || action === 'right') {
        if (this.bagian < jumlahBagian - 1) { this.bagian++; this.audio?.ui?.(); }
        else if (this.halaman < total - 1) { this.halaman++; this.bagian = 0; this.audio?.ui?.(); }
        else { this.mode = 'rak'; }
      }
      if (action === 'left') {
        if (this.bagian > 0) this.bagian--;
        else if (this.halaman > 0) { this.halaman--; this.bagian = 0; }
        else this.mode = 'rak';
          }
      if (action === 'up' || action === 'down') this.audio?.ui?.();
      if (action === 'menu') { this.mode = 'rak'; }
      return true;
    }

    if (this.mode === 'ujian') {
      const n = (this.ujian.soal[this.ujian.i].pilihan ?? []).length;
      if (action === 'up') this.cursor = (this.cursor + n - 1) % n;
      if (action === 'down') this.cursor = (this.cursor + 1) % n;
      if (action === 'interact') { this.audio?.ui?.(); this.jawabUjian(); }
      if (action === 'menu') this.mode = 'ujianHasil';   // Esc: berhenti, dihitung gagal
      return true;
    }

    if (this.mode === 'ujianHasil') {
      if (action === 'interact') { this.tutup(); }
      if (action === 'menu') this.tutup();
      return true;
    }

    if (this.mode === 'tanya') {
      if (this.selesai) {
        // T = naik ke ujian keahlian, hanya kalau warga ini memang mengajar dan
        // bab-nya belum lulus. Selain itu T tidak melakukan apa pun.
        if (action === 'ujian' && this.selesai.adaUjian) {
          this.mulaiUjian(hari);
          return true;
        }
        if (action === 'interact' || action === 'menu') this.tutup();
        return true;
      }
      const n = this.tanya.data.pilihan.length;
      if (action === 'up') this.cursor = (this.cursor + n - 1) % n;
      if (action === 'down') this.cursor = (this.cursor + 1) % n;
      if (action === 'interact') {
        const tepat = this.cursor === this.tanya.data.kunci;
        if (tepat) {
          this.ilmu.benar++;
          this.audio?.coin?.();
          if (!this.tanya.data.ulang) this.saatTepat?.();   // ulangan: tanpa hati
        }
        else { this.ilmu.salah++; this.audio?.denied?.(); }
        this.ilmu.catat(this.tanya.npcId, hari);
        // Warga yang mengajari keahlian langsung menyodorkan ujian begitu
        // latihannya dijawab tepat. Tanpa tawaran ini, satu-satunya jalan ke
        // ujian adalah menebak bahwa ujian itu ada.
        // Tawaran ujian tidak lagi menempel pada satu soal tertentu: warga yang
        // memang mengajar menawarkannya setiap kali pemain menjawab, asalkan bab
        // syaratnya sudah dibaca. Kalau masih belum, ia menyebut bab mana yang
        // harus dibaca — pemain tidak dibiarkan menebak.
        const gj = this.ilmu.alatNpc(this.tanya.npcId);
        let tawaran = 'E  lanjut mengobrol';
        if (tepat && gj && !this.ilmu.lulus.has(gj.kitab)) {
          tawaran = this.ilmu.sudahDibaca(gj.kitab)
            ? 'T: minta diuji keahlian · E: cukup, lanjut'
            : `Baca dulu ${(this.ilmu.kitab(gj.kitab)?.judul ?? '').split(' — ')[0]}, lalu kembali untuk diuji`;
        }
        this.selesai = { tepat, bahas: this.tanya.data.bahas, tawaran, adaUjian: !!gj && this.ilmu.sudahDibaca(gj.kitab) };
        // Pembacaan kitabnya ikut ditandai: pertanyaan ini sudah terjawab,
        // jadi rak tidak lagi menandainya "belum dibaca".
        this.ilmu.tandaiDibaca(this.tanya.data.kitab);
        this.onProgress?.();
      }
      return true;
    }
    return false;
  }

  /**
   * Mulai ujian keahlian untuk bab yang sedang dibicarakan.
   *
   * Tiga soal diambil dari bank soal bab itu (`ujian` di data). Kalau banknya
   * belum terisi, yang ada dipakai apa adanya dan jumlahnya ditampilkan jujur
   * di layar — lebih baik daripada berpura-pura ada tiga soal.
   */
  /** Buka ujian keahlian langsung, tanpa lewat layar latihan. */
  bukaUjian(kitabId, npcId, npcName, hari = 0) {
    this.open = true;
    this.mode = 'ujian';
    this.tanya = { npcId, npcName, data: { kitab: kitabId } };
    this.cursor = 0;
    this.selesai = null;
    return this.mulaiUjian(hari);
  }

  mulaiUjian(hari = 0) {
    // Bab yang diujikan: yang DIPILIH murid di kotak pilihan.
    //
    // Dulu di sini selalu dipakai `alatNpc(npcId).kitab` — satu-satunya bab yang
    // terhubung ke alat warga itu. Sekarang seorang warga mengajar dua-tiga bab,
    // jadi memaksa bab pertama akan membuat baris "belajar Bab II" di kotak
    // pilihan diam-diam mengujikan Bab I. Pilihan murid didahulukan; `alatNpc`
    // hanya cadangan untuk pemanggil lama (mis. tombol T di layar latihan).
    const gj = this.ilmu.alatNpc(this.tanya?.npcId);
    const kid = this.tanya?.data?.kitab ?? gj?.kitab;
    if (!kid) return false;

    const soal = this.ilmu.soalUjian(kid);
    if (!soal.length) { this.pesan = 'Warga ini belum menyiapkan soal ujian.'; return false; }

    // Aturan urutan bab diperiksa DI SINI, bukan hanya di layar warga. Dengan
    // begitu tidak ada jalan memutar — lewat warga mana pun, hasilnya sama.
    // Diperiksa setelah "ada soal?" supaya pesannya jujur: bab yang soalnya
    // belum diisi guru tidak disebut "terkunci" hanya karena urutan.
    const izin = this.ilmu.bolehUjian(kid);
    if (!izin.boleh) { this.pesan = izin.alasan; return false; }
    this.ujian = { kitab: kid, soal, bank: this.ilmu.jumlahSoal(kid), i: 0,
                   benar: 0, salah: [], hari,
                   perlu: perluBenar(soal.length),
                   judul: this.ilmu.kitab(kid)?.judul ?? '',
                   terkirim: null };   // null | 'mengirim' | 'ok' | 'gagal'
    this.mode = 'ujian';
    this.cursor = 0;
    this.selesai = null;
    return true;
  }

  /** Pilih jawaban pada ujian, lalu pindah ke soal berikutnya. */
  jawabUjian() {
    const u = this.ujian;
    const s = u.soal[u.i];
    const pilihan = s.pilihan ?? s.pilihanSemua ?? [];
    const tepat = this.cursor === (s.kunci ?? 0);
    if (tepat) u.benar++;
    if (!tepat) u.salah.push({ soal: s.tanya, bahas: s.bahas, benar: pilihan[s.kunci ?? 0] });
    u.i++;
    this.cursor = 0;
    if (u.i < u.soal.length) return;

    // Ujian selesai. Batas lulus 80% dari jumlah soal yang ditanyakan, dihitung
    // di satu tempat (perluBenar) supaya layar dan penyimpanan tidak pernah
    // memakai angka yang berbeda.
    const hasil = this.ilmu.catatNilai(u.kitab, u.benar, u.soal.length, u.hari);
    u.lulus = hasil.lulus;
    u.perlu = hasil.perlu;
    u.nilai = hasil.nilai;
    this.mode = 'ujianHasil';
    this.onProgress?.();

    // Nilai dikirim ke spreadsheet HANYA kalau lulus. Murid yang belum lulus
    // boleh mengulang kapan saja — yang tercatat di sekolah hanya bab yang
    // benar-benar sudah dituntaskan.
    if (u.lulus) {
      u.terkirim = 'mengirim';
      Promise.resolve(this.onLulus?.({
        kitab: u.kitab,
        judul: u.judul,
        benar: u.benar,
        jumlah: u.soal.length,
        nilai: u.nilai,
        hari: u.hari,
      })).then((r) => {
        // Tiga keadaan yang harus dibedakan di layar: terkirim, DITAHAN di
        // peramban (jaringan/spreadsheet belum siap), dan gagal. Dulu semua
        // yang bukan `false` dianggap "ok" — layar lalu berbohong.
        u.terkirim = !r ? 'gagal' : (r.ok ? 'ok' : (r.antre || r.offline ? 'antre' : 'gagal'));
      }).catch(() => { u.terkirim = 'gagal'; });
    }
  }

  /* ---------------------------------------------------------------- gambar */

  draw(ctx) {
    if (!this.open) return;
    const W = Math.min(620, view.w - 60);
    const H = Math.min(460, view.h - 120);
    const x = Math.round((view.w - W) / 2);
    const y = Math.round((view.h - H) / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, view.w, view.h);
    panel(ctx, x, y, W, H);

    if (this.mode === 'rak') return this.drawRak(ctx, x, y, W, H);
    if (this.mode === 'baca') return this.drawBaca(ctx, x, y, W, H);
    if (this.mode === 'ujian') return this.drawUjian(ctx, x, y, W, H);
    if (this.mode === 'ujianHasil') return this.drawUjianHasil(ctx, x, y, W, H);
    return this.drawTanya(ctx, x, y, W, H);
  }

  drawRak(ctx, x, y, W, H) {
    text(ctx, 'PERPUSTAKAAN DESA', x + W / 2, y + 18, { font: UI.fontTitle, align: 'center', color: UI.red });
    text(ctx, `Terbaca ${this.ilmu.dibaca.size} dari ${this.ilmu.semua().length} kitab (${this.ilmu.progres()}%)`,
      x + W / 2, y + 38, { font: UI.font, align: 'center', color: '#7a6647' });

    const listY = y + 68;
    const ROW = 62;
    const semua = this.ilmu.semua();
    // Berapa baris yang muat, dihitung dari tinggi panel — bukan angka tetap,
    // supaya jendela kecil dan besar sama-sama utuh.
    const terlihat = Math.max(3, Math.floor((H - 68 - 40) / ROW));
    this.barisTerlihat = terlihat;
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + terlihat) this.scroll = this.cursor - terlihat + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, semua.length - terlihat)));

    semua.slice(this.scroll, this.scroll + terlihat).forEach((k, j) => {
      const i = this.scroll + j;
      const ry = listY + j * ROW;
      const on = i === this.cursor;
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 16, ry - 4, W - 32, 56); }
      const sudah = this.ilmu.sudahDibaca(k.id);
      const lulus = this.ilmu.lulus.has(k.id);
      const bank = this.ilmu.jumlahSoal(k.id);
      text(ctx, fit(ctx, k.judul, W - 150, UI.fontBig), x + 28, ry + 2, { font: UI.fontBig });
      // Satu baris keterangan yang menjawab pertanyaan yang sebenarnya: bab ini
      // sudah kubaca? sudah kululuskan? berapa soalnya? Dulu baris ini hanya
      // menyebut fase dan jumlah halaman.
      text(ctx, `${sudah ? '✓ dibaca' : 'belum dibaca'} · ${lulus ? 'LULUS' : (bank ? `${bank} soal` : 'soal belum ada')}`
        + ` · ${this.ilmu.nomorBab(k.id)}/${this.ilmu.semua().length}`,
        x + 28, ry + 26, { font: UI.font, color: lulus ? '#4f7a2f' : '#7a6647' });
      text(ctx, sudah ? '✓' : '', x + W - 28, ry + 26,
        { font: UI.font, align: 'right', color: '#4f7a2f' });
    });

    // Penanda posisi: tanpa ini, daftar 21 kitab terasa seperti daftar 6 kitab
    // yang tidak bisa digulir.
    if (semua.length > terlihat) {
      const halaman = Math.floor(this.scroll / terlihat) + 1;
      const totalHalaman = Math.ceil(semua.length / terlihat);
      text(ctx, `▲▼  ${this.scroll + 1}–${Math.min(this.scroll + terlihat, semua.length)} dari ${semua.length}`
        + (totalHalaman > 1 ? `  (bagian ${halaman}/${totalHalaman})` : ''),
        x + W - 28, y + 38, { font: UI.font, align: 'right', color: '#7a6647' });
    }

    // Keterangan ini penting dan sering ditanyakan: rak hanya untuk MEMBACA.
    // Ujian tiap bab dibuka oleh warga yang mengajarnya — dan siapa mengajar apa
    // disebutkan di sini, bukan dibiarkan murid menebak.
    const kid = semua[this.cursor]?.id;
    const idGuru = whoMengajarBab(this.ilmu, kid);
    const siapa = idGuru ? `Pengajar: ${this.ilmu.data.npcNama?.[idGuru] ?? idGuru}` : '';
    text(ctx, this.pesan || (siapa || 'W/S pilih · E buka · Esc keluar'),
      x + W / 2, y + H - 30, { font: UI.font, align: 'center', color: '#7a6647' });
  }

  /**
   * Bagi satu halaman kitab menjadi beberapa "bagian" yang masing-masing muat
   * di panel. Dihitung dari teksnya, bukan ditebak: satu halaman berisi ayat
   * penuh (QS An-Nur 24:31, 78 kata) butuh 8 baris Arab saja, sementara teks
   * latin dan terjemahnya ikut menuntut ruang.
   *
   * Sebelum ini, halaman yang kepanjangan dipotong diam-diam: latin dan
   * terjemah disembunyikan, sisa ayat hilang tanpa tanda. Dari 77 halaman,
   * 25 di antaranya kena. Sekarang semuanya bisa dibaca — hanya berpindah
   * bagian dengan tombol yang sama (E), dan judulnya menyebut "bagian 2/3"
   * supaya pemain tahu itu halaman yang sama, bukan halaman baru.
   */
  halamanTerbagi(k, index, innerW, tinggi) {
    const h = k.halaman[index];
    const teks = wrap(ctxDummy, h.teks ?? '', innerW, UI.fontBig).map((t) => ({ t, f: UI.fontBig, w: 22 }));
    const arab = h.arab
      ? wrapArab(h.arab.split(' '), innerW, ARAB_FONT).map((t) => ({ t, f: ARAB_FONT, w: 34, arab: true }))
      : [];
    const latin = h.latin ? wrap(ctxDummy, h.latin, innerW, UI.font).map((t) => ({ t, f: UI.font, w: 18 })) : [];
    const terj = h.terjemah
      ? wrap(ctxDummy, `\u201c${h.terjemah}\u201d`, innerW, UI.fontBig).map((t) => ({ t, f: UI.fontBig, w: 21 }))
      : [];

    // Jarak antar blok, sama seperti yang dipakai penggambar di bawah.
    const GAP_ARAB = 6, GAP_LATIN = 2, GAP_TERJ = 4;
    const blok = [];
    for (const b of teks) blok.push(b);
    if (arab.length) { blok.push({ gap: GAP_ARAB }); blok.push(...arab); }
    if (latin.length) { blok.push({ gap: GAP_LATIN }); blok.push(...latin); }
    if (terj.length) { blok.push({ gap: GAP_TERJ }); blok.push(...terj); }

    // Pemecahan per halaman, dengan satu aturan tambahan: kalau mungkin,
    // potong di AKHIR KALIMAT, bukan di tengahnya. Tanpa ini, terjemahan
    // terpotong seperti "...tetapi Kami menjadikannya" lalu lanjut di bagian
    // berikutnya — benar secara teknis, tetapi menyulitkan pemahaman.
    const akhirKalimat = (b) => !b.gap && !b.arab && /[.!?…""']\s*$/.test(b.t);

    const bagian = [];
    let i = 0;
    while (i < blok.length) {
      // Buang jarak kosong di awal halaman.
      while (i < blok.length && blok[i].gap) i++;
      if (i >= blok.length) break;

      let cur = [], tinggiCur = 0, j = i;
      for (; j < blok.length; j++) {
        const b = blok[j];
        const hgt = b.gap ?? b.w;
        if (cur.length && tinggiCur + hgt > tinggi) break;
        cur.push(b); tinggiCur += hgt;
      }

      // Masih ada sisa: coba cari akhir kalimat untuk dipotong di sana,
      // asalkan halamannya tidak jadi terlalu pendek (minimal 55% penuh).
      let lanjut = j;
      if (j < blok.length) {
        let kandidat = -1, tinggiSampai = 0;
        for (let k = i; k < j; k++) {
          tinggiSampai += blok[k].gap ?? blok[k].w;
          if (akhirKalimat(blok[k]) && tinggiSampai >= tinggi * 0.55) kandidat = k;
        }
        if (kandidat >= i) {
          lanjut = kandidat + 1;
          cur = blok.slice(i, lanjut);
        }
      }
      while (cur.length && cur[cur.length - 1].gap) cur.pop();
      bagian.push(cur);
      i = lanjut;
    }

    return bagian.length ? bagian : [[]];
  }

  drawBaca(ctx, x, y, W, H) {
    const k = this.ilmu.semua()[this.kitabIndex];
    if (!k) { this.mode = 'rak'; return; }
    const h = k.halaman[this.halaman];
    const innerW = W - 56;

    // Tinggi yang boleh dipakai isi: dari bawah judul sampai di atas kaki panel.
    const atas = y + 58;
    const bawah = y + H - 78;                       // sisakan sumber + petunjuk
    const bagian = this.halamanTerbagi(k, this.halaman, innerW, bawah - atas);
    // Bagian yang sedang dilihat dijepit: kalau teks berubah (materi disunting),
    // nomor bagian lama bisa melebihi jumlah bagian yang baru.
    if (this.bagian >= bagian.length) this.bagian = bagian.length - 1;
    const isi = bagian[this.bagian] ?? [];

    text(ctx, fit(ctx, k.judul.toUpperCase(), W - 40, UI.fontTitle), x + W / 2, y + 16,
      { font: UI.fontTitle, align: 'center', color: UI.red });
    const nomor = `Halaman ${this.halaman + 1} / ${k.halaman.length}`
      + (bagian.length > 1 ? `  \u00b7  bagian ${this.bagian + 1}/${bagian.length}` : '');
    text(ctx, nomor, x + W / 2, y + 34, { font: UI.font, align: 'center', color: '#7a6647' });

    let cy = atas;
    for (const b of isi) {
      if (b.gap) { cy += b.gap; continue; }
      if (b.arab) {
        ctx.save();
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = b.f;
        ctx.fillStyle = '#3a2a2a';
        ctx.fillText(b.t, x + W - 28, cy);
        ctx.restore();
        cy += b.w;
      } else {
        text(ctx, b.t, x + 28, cy, { font: b.f, color: b.f === UI.font ? '#7a6647' : UI.outline });
        cy += b.w;
      }
    }

    if (h.sumber) {
      text(ctx, h.sumber, x + W - 28, y + H - 56, { font: UI.font, align: 'right', color: UI.red });
    }

    const lanjut = this.bagian + 1 < bagian.length;
    const kaki = this.pesan || (lanjut
      ? 'E lanjut bagian berikutnya · A kembali · Esc tutup'
      : 'E halaman berikutnya · A kembali · Esc tutup');
    text(ctx, kaki, x + W / 2, y + H - 26,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }

  drawUjian(ctx, x, y, W, H) {
    const u = this.ujian;
    if (!u) { this.tutup(); return; }
    const s = u.soal[u.i];
    const nama = u.judul.split(' \u2014 ')[0];
    text(ctx, `UJIAN KEAHLIAN \u2014 ${nama.toUpperCase()}`, x + W / 2, y + 16,
      { font: UI.fontTitle, align: 'center', color: UI.red });
    // Bank soal boleh puluhan; ujian hanya menanyakan sebagian. Kalau banknya
    // baru terisi sedikit, katakan apa adanya — jangan berpura-pura lengkap.
    const bank = u.bank ?? u.soal.length;
    const catatan = bank > u.soal.length
      ? `  \u00b7  diundi dari ${bank} soal`
      : (bank < UJIAN_MAKS ? '  (bank soal baru terisi sebagian)' : '');
    text(ctx, `Soal ${u.i + 1} / ${u.soal.length}` + catatan
      + `   \u00b7   benar ${u.benar}   \u00b7   lulus \u2265 ${u.perlu}`,
      x + W / 2, y + 34, { font: UI.font, align: 'center', color: '#7a6647' });

    let cy = y + 62;
    const innerW = W - 56;
    wrap(ctx, s.tanya, innerW, UI.fontBig).forEach((l) => { text(ctx, l, x + 28, cy, { font: UI.fontBig }); cy += 22; });
    cy += 12;
    (s.pilihan ?? []).forEach((p, i) => {
      const on = i === this.cursor;
      const baris = wrap(ctx, `${on ? '\u25b8' : ' '} ${i + 1}. ${p}`, innerW, UI.fontBig);
      if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 20, cy - 4, W - 40, baris.length * 22 + 6); }
      baris.forEach((l, j) => { text(ctx, l, x + 28, cy + j * 22, { font: UI.fontBig }); });
      cy += baris.length * 22 + 10;
    });
    text(ctx, 'W/S pilih \u00b7 E jawab \u00b7 Esc berhenti', x + W / 2, y + H - 26,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }

  drawUjianHasil(ctx, x, y, W, H) {
    const u = this.ujian;
    if (!u) { this.tutup(); return; }
    const nama = u.judul.split(' \u2014 ')[0];
    text(ctx, u.lulus ? 'LULUS UJIAN' : 'BELUM LULUS', x + W / 2, y + 16,
      { font: UI.fontTitle, align: 'center', color: u.lulus ? '#4f7a2f' : UI.red });
    let cy = y + 48;
    const innerW = W - 56;
    text(ctx, `${nama} \u00b7 benar ${u.benar} dari ${u.soal.length} (perlu ${u.perlu})`,
      x + 28, cy, { font: UI.fontBig }); cy += 26;
    text(ctx, `Nilai ${u.nilai ?? Math.round((u.benar / u.soal.length) * 100)}% \u00b7 batas lulus 80%`,
      x + 28, cy, { font: UI.fontBig, color: u.lulus ? '#4f7a2f' : UI.red }); cy += 30;

    if (u.lulus) {
      const alat = this.ilmu.alatNpc(this.tanya?.npcId)?.alat;
      const namaAlat = { hoe: 'mencangkul', water: 'menyiram', axe: 'menebang',
                         pickaxe: 'menambang', scythe: 'memanen rumput', fish: 'memancing' }[alat] ?? 'bekerja';
      wrap(ctx, `Kau lulus. Mulai sekarang kau boleh ${namaAlat} sendiri \u2014 alatmu tidak lagi sia-sia di tangan.`,
        innerW, UI.fontBig).forEach((l) => { text(ctx, l, x + 28, cy, { font: UI.fontBig, color: '#4f7a2f' }); cy += 22; });
      cy += 8;
    } else {
      wrap(ctx, 'Baca lagi bagian yang belum kau kuasai, lalu datang lagi. Kali ini tidak perlu menunggu besok \u2014 dan nilai yang gagal tidak dikirim ke guru.',
        innerW, UI.font).forEach((l) => { text(ctx, l, x + 28, cy, { font: UI.font, color: '#5a4230' }); cy += 18; });
      cy += 6;
      // Ujian sekarang 30 soal: yang salah bisa belasan, dan dulu hanya dua yang
      // ditampilkan — murid kehilangan penjelasan pada soal yang justru paling
      // perlu dibaca. Sekarang sampai enam, dua kolom, dipotong hanya kalau
      // benar-benar tidak muat.
      const bawah = y + H - 96;
      const kolom = [];
      let kol = 0, kc = cy;
      for (const sl of (u.salah ?? [])) {
        if (kol >= 6) break;
        const barisP = wrap(ctx, `\u2022 ${sl.bahas}`, innerW / 2 - 16, UI.font).length;
        if (kc + barisP * 18 > bawah) { if (kol % 2 === 0) break; kol = kol % 2 ? kol + 1 : kol; }
        kolom.push({ sl, kol: kol % 2, y: kc });
        if (kol % 2) kc += barisP * 18 + 6;
        kol++;
      }
      for (const { sl, kol: k, y: ky } of kolom) {
        let ly = ky;
        wrap(ctx, `\u2022 ${sl.bahas}`, innerW / 2 - 16, UI.font)
          .forEach((l) => { text(ctx, l, x + 28 + k * (innerW / 2), ly, { font: UI.font, color: '#7a6647' }); ly += 18; });
      }
      if ((u.salah ?? []).length > kolom.length) {
        text(ctx, `+ ${(u.salah ?? []).length - kolom.length} pembahasan lain — tekan E untuk menutup`,
          x + 28, bawah + 8, { font: UI.font, color: '#8a7455' });
      }
    }
    if (u.lulus) {
      const st = { mengirim: 'Nilai dikirim ke spreadsheet guru...',
                   ok: 'Nilai sudah tercatat di spreadsheet guru.',
                   antre: 'Nilai tertahan di peramban ini. Tekan V (Rekap Belajar) untuk mengirim ulang, atau biarkan terkirim sendiri saat jaringan pulih.',
                   gagal: 'Nilai belum terkirim. Buka Rekap Belajar lalu tekan V untuk mencoba lagi.' }[u.terkirim ?? 'mengirim'];
      wrap(ctx, st, innerW, UI.font)
        .forEach((l) => { text(ctx, l, x + 28, y + H - 66, { font: UI.font, color: (u.terkirim === 'gagal' || u.terkirim === 'antre') ? UI.red : '#7a6647' }); cy += 16; });
    }
    text(ctx, u.lulus ? 'E  tutup' : 'E  tutup \u00b7 bicara lagi dengan warga ini untuk mengulang',
      x + W / 2, y + H - 26, { font: UI.font, align: 'center', color: '#7a6647' });
  }

  drawTanya(ctx, x, y, W, H) {
    const t = this.tanya;
    if (!t) { this.tutup(); return; }
    const ulang = !!t.data.ulang;
    // Label di kepala panel menyebut nama babnya. Tanpa itu, pemain tidak tahu
    // ayat yang ditanyakan milik pelajaran mana — dan latihan terasa acak.
    text(ctx, `LATIHAN — ${(t.data.judul || '').toUpperCase() || t.npcName.toUpperCase()}`,
      x + W / 2, y + 16, { font: UI.fontTitle, align: 'center', color: UI.red });

    let cy = y + 46;
    const innerW = W - 56;
    wrap(ctx, t.data.tanya, innerW, UI.fontBig).forEach((l) => { text(ctx, l, x + 28, cy, { font: UI.fontBig }); cy += 22; });
    cy += 10;

    if (!this.selesai) {
      t.data.pilihan.forEach((p, i) => {
        const on = i === this.cursor;
        if (on) { ctx.fillStyle = '#fff3d6'; ctx.fillRect(x + 20, cy - 4, W - 40, 30); }
        text(ctx, `${on ? '▸' : ' '} ${i + 1}. ${p}`, x + 28, cy, { font: UI.fontBig });
        cy += 32;
      });
      text(ctx, 'W/S pilih · E jawab', x + W / 2, y + H - 26, { font: UI.font, align: 'center', color: '#7a6647' });
      return;
    }

    text(ctx, this.selesai.tepat
      ? (ulang ? 'Jawabanmu tepat.  (ulangan — tanpa tambahan hati)' : 'Jawabanmu tepat.  ♥ +1 hati')
      : 'Belum tepat.',
      x + 28, cy, { font: UI.fontBig, color: this.selesai.tepat ? '#4f7a2f' : '#b8432e' });
    cy += 26;
    wrap(ctx, this.selesai.bahas, innerW, UI.font).forEach((l) => { text(ctx, l, x + 28, cy, { font: UI.font, color: '#5a4230' }); cy += 19; });
    cy += 6;
    // Kalimat penutup diambil dari data warga (tutup[tepat|salah]) supaya tiap
    // warga punya suaranya sendiri. Kalau datanya belum ada, pakai kalimat umum.
    const tutup = this.tanya?.data?.tutup?.[this.selesai.tepat ? 'tepat' : 'salah'];
    text(ctx, tutup || (this.selesai.tepat
      ? 'Bacaan dan jawabanmu dicatat. Warga akan ingat kau rajin.'
      : 'Baca dulu kitabnya di Perpustakaan Balai Desa, lalu datang lagi besok.'),
      x + 28, cy, { font: UI.font, color: '#7a6647' });
    text(ctx, this.selesai.tawaran || 'E  lanjut mengobrol', x + W / 2, y + H - 26,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }
}
