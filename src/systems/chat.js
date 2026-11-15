// Obrolan kelas: satu ruang per tingkat (X, XI, XII), dititipkan ke Apps Script.
//
// Kenapa bukan server sendiri
//   Versi pertama berkas ini memanggil `api/chat`, long-poll 25 detik ke
//   `tools/serve.py`. Berkas itu TIDAK PERNAH ADA di repo — jadi obrolan tidak
//   pernah hidup, bahkan di komputer sendiri, dan di GitHub Pages mustahil
//   karena Pages tidak menerima POST. Sekarang obrolan memakai pintu yang sama
//   dengan nilai: Web App Apps Script (`apps-script/Obrolan.gs`).
//
// Yang dijaga di sini
//   1. BATAS_BARIS = 30. Baris tertua dibuang saat yang ke-31 masuk, sama
//      seperti chat game lain. Server juga memangkas; ini lapisan kedua supaya
//      layar tidak pernah menampilkan lebih dari 30.
//   2. Hanya 30 baris itu yang disimpan server. Tidak ada riwayat lebih tua
//      yang bisa digulir, jadi tidak ada kejutan "kok pesan lama hilang".
//   3. Tanpa akun (nama + PIN), chat tidak dibuka sama sekali. Server menolak
//      setiap pesan tanpa PIN yang cocok, jadi tidak ada yang bisa menulis atas
//      nama temannya.
//   4. `sejak` adalah nomor urut pesan terakhir yang sudah dilihat. Peramban
//      yang baru dibuka mengirim 0 dan langsung menerima 30 baris terakhir.
//
// Kenapa ada `pastikanSiap()`
//   Percobaan pertama menolak menulis hanya karena penanda `terdaftar === false`
//   di localStorage. Penanda itu MENEMPEL: sekali murid mendaftar saat jaringan
//   sekolah mati, ia tidak pernah bisa memakai obrolan lagi walau jaringannya
//   sudah normal — dan yang ia lihat hanya "buka spreadsheet dulu", yang tidak
//   masuk akal dari sisi murid. Sekarang penanda itu hanya berarti "belum
//   dipastikan": chat mencoba mendaftarkannya sekali, lalu lanjut kalau berhasil.

import { muridAktif, tersambung, panggilServer, simpanMurid } from '../core/nilai-api.js';

export const BATAS_BARIS = 30;
const JEDA_MIN_MS = 900;      // jarak minimum antar-permintaan baca
const JEDA_GAGAL_MS = 6000;   // jeda setelah gagal, supaya tidak membanjiri server

/**
 * Alasan chat tidak bisa dipakai, dipisah supaya layar bisa memberi saran yang
 * BERBEDA untuk masalah yang berbeda. Dulu semuanya jatuh ke satu kalimat
 * "masuk dulu", termasuk ketika masalahnya sebenarnya server belum dipasang.
 */
export const ALASAN = {
  belumMasuk: 'belum-masuk',        // tidak ada nama/PIN di peramban ini
  belumPasti: 'belum-dipastikan',   // ada nama/PIN, tetapi belum tercatat di sheet
  takTersambung: 'tak-tersambung',  // spreadsheet belum disambungkan
  bedaKelas: 'kelas-kosong',        // kelas tidak tercatat, ruang tidak bisa ditentukan
};

export class Chat {
  constructor({ name, avatar } = {}) {
    this.name = name ?? '';
    this.avatar = avatar ?? 'player_m';
    this.messages = [];        // paling banyak BATAS_BARIS, terlama di depan
    this.mine = new Set();     // nomor pesan yang dikirim tab ini
    this.online = 0;           // tidak dipakai lagi: Apps Script tidak menghitung
    this.last = 0;             // nomor pesan terakhir yang sudah dilihat
    this.unread = 0;
    this.status = 'connecting'; // connecting | online | offline | tanpaakun
    this.error = '';
    this.alasan = '';          // salah satu ALASAN di atas, atau '' kalau siap
    this.running = false;
    this.kelas = '';
    this.fails = 0;
    this.mendaftar = false;    // sedang mencoba mendaftar ulang (hindari dobel)
  }

  setIdentity(name, avatar) {
    this.name = name;
    this.avatar = avatar;
  }

  /**
   * Pemeriksaan cepat tanpa menyentuh jaringan: apakah ada nama + PIN.
   *
   * `bisaPakai()` sengaja tetap sinkron supaya layar bisa memutuskan menggambar
   * apa tanpa menunggu. Pekerjaan jaringan ada di `pastikanSiap()`.
   */
  bisaPakai() {
    if (!tersambung()) return { ok: false, alasan: ALASAN.takTersambung, pesan: 'Spreadsheet belum disambungkan.' };
    const m = muridAktif();
    if (!m || !m.nama || !m.pin) {
      return { ok: false, alasan: ALASAN.belumMasuk, pesan: 'Masuk dulu dengan nama dan PIN.' };
    }
    // `terdaftar: false` BUKAN jalan buntu: itu hanya berarti "belum dipastikan".
    // Diperlakukan sebagai siap, lalu didaftarkan oleh `pastikanSiap()`.
    return { ok: true, murid: m };
  }

  /**
   * Pastikan akun ini benar-benar tercatat di tab `Akun`, sekali, lalu simpan
   * hasilnya. Mengembalikan { ok, murid } atau { ok:false, alasan, pesan }.
   *
   * Ini yang menggantikan penolakan langsung terhadap `terdaftar === false`.
   * Pendaftaran memakai nama + PIN yang SUDAH ada di peramban, jadi murid tidak
   * perlu mengetik apa pun; kalau namanya ternyata sudah dipakai orang lain
   * dengan PIN berbeda, server menolak dan pesannya diteruskan apa adanya.
   */
  async pastikanSiap() {
    const cek = this.bisaPakai();
    if (!cek.ok) { this.catat(cek.alasan, cek.pesan); return cek; }

    const m = { ...cek.murid };
    if (m.terdaftar === true) { this.alasan = ''; return { ok: true, murid: m }; }

    if (this.mendaftar) {
      return { ok: false, alasan: ALASAN.belumPasti, pesan: 'Sedang mendaftarkan akunmu...' };
    }
    this.mendaftar = true;
    try {
      const d = await panggilServer({ aksi: 'daftar', nama: m.nama, kelas: m.kelas, pin: m.pin });
      if (d.ok) {
        simpanMurid({ ...m, kelas: d.kelas || m.kelas, terdaftar: true });
        this.alasan = '';
        return { ok: true, murid: { ...m, terdaftar: true } };
      }
      if (d.sudahAda) {
        // Nama sudah terdaftar (mis. peramban baru). Masuk dengan PIN yang sama
        // yang sudah tersimpan; kalau cocok, selesai tanpa murid mengetik apa pun.
        const masuk = await panggilServer({ aksi: 'masuk', nama: m.nama, pin: m.pin });
        if (masuk.ok) {
          simpanMurid({ ...m, kelas: masuk.kelas || m.kelas, terdaftar: true });
          this.alasan = '';
          return { ok: true, murid: { ...m, terdaftar: true } };
        }
        return this.catat(ALASAN.belumPasti, masuk.error ?? 'PIN tidak cocok dengan nama ini.');
      }
      if (d.offline) return this.catat(ALASAN.takTersambung, 'Spreadsheet belum terjangkau.');
      return this.catat(ALASAN.belumPasti, d.error ?? 'Akun belum bisa didaftarkan.');
    } finally {
      this.mendaftar = false;
    }
  }

  /** Simpan alasan supaya layar tahu apa yang harus disarankan. */
  catat(alasan, pesan) {
    this.alasan = alasan;
    this.error = pesan;
    this.status = 'tanpaakun';
    return { ok: false, alasan, pesan };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() { this.running = false; }

  /** Dulu mengirim `chat/bye` ke server Python. Sekarang tidak ada presence. */
  leave() { this.running = false; }

  async loop() {
    while (this.running) {
      const mulai = Date.now();

      const siap = await this.pastikanSiap();
      if (!siap.ok) {
        // Belum masuk sama sekali: berhenti bertanya, tidak ada gunanya
        // menembak server berulang kali. Layar akan memberi tahu caranya.
        // `running` dimatikan supaya `segarkan()` / kirim pertama bisa
        // membangkitkan loop ini lagi setelah murid masuk dari dalam game.
        if (siap.alasan === ALASAN.belumMasuk) { this.running = false; return; }
        // Selain itu (belum tersambung / belum terdaftar): coba lagi nanti.
        await new Promise((r) => setTimeout(r, JEDA_GAGAL_MS));
        continue;
      }

      const r = await panggilServer({
        aksi: 'obrolan',
        nama: siap.murid.nama,
        pin: siap.murid.pin,
        sejak: this.last,
      });

      if (r.ok) {
        this.status = 'online';
        this.error = '';
        this.alasan = '';
        this.fails = 0;
        this.kelas = r.kelas ?? this.kelas;
        if (Array.isArray(r.pesan) && r.pesan.length) {
          for (const m of r.pesan) {
            if (this.mine.has(m.no)) continue;    // pesan sendiri tidak dihitung belum dibaca
            this.messages.push(m);
            this.unread++;
          }
          this.pangkas();
        }
        if (Number.isFinite(Number(r.terakhir))) this.last = Number(r.terakhir);
      } else {
        // `tanpaObrolan` = berkas Obrolan.gs belum dipasang di Apps Script.
        // Pesannya berbeda supaya yang perlu dilakukan jelas: deploy ulang,
        // bukan memeriksa jaringan.
        if (r.tanpaObrolan) this.catat(ALASAN.takTersambung, 'Obrolan belum dipasang di Apps Script. Tempel Server-Lengkap.gs lalu deploy ulang.');
        else if (/kelas/i.test(r.error ?? '')) this.catat(ALASAN.bedaKelas, r.error);
        else { this.status = 'offline'; this.error = r.error ?? 'Server obrolan tidak terhubung.'; }
        this.fails++;
      }

      const jeda = r.ok ? JEDA_MIN_MS : Math.min(JEDA_GAGAL_MS, JEDA_MIN_MS * this.fails);
      const sisa = jeda - (Date.now() - mulai);
      if (sisa > 0) await new Promise((res) => setTimeout(res, sisa));
    }
  }

  /** Sisakan BATAS_BARIS baris terakhir. */
  pangkas() {
    if (this.messages.length > BATAS_BARIS) {
      this.messages = this.messages.slice(-BATAS_BARIS);
    }
  }

  /** Kirim satu baris. Mengembalikan pesan galat, atau null kalau terkirim. */
  async send(text) {
    const bersih = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!bersih) return null;

    const siap = await this.pastikanSiap();
    if (!siap.ok) return siap.pesan;

    const r = await panggilServer({
      aksi: 'obrolanTulis',
      nama: siap.murid.nama,
      pin: siap.murid.pin,
      avatar: this.avatar,
      pesan: bersih,
    });

    if (!r.ok) {
      if (r.tanpaObrolan) return this.catat(ALASAN.takTersambung, 'Obrolan belum dipasang di Apps Script. Tempel Server-Lengkap.gs lalu deploy ulang.').pesan;
      if (/kelas/i.test(r.error ?? '')) return this.catat(ALASAN.bedaKelas, r.error).pesan;
      this.error = r.error ?? 'Gagal mengirim.';
      return this.error;
    }

    // Pesan sendiri dimasukkan langsung supaya layar tidak terasa menggantung
    // menunggu putaran baca berikutnya. Nomornya dari server, jadi tidak dobel
    // saat `obrolanAmbil` mengembalikannya nanti.
    const no = Number(r.no) || 0;
    if (no) {
      this.mine.add(no);
      if (!this.messages.some((m) => m.no === no)) {
        this.messages.push({ no, id: no, name: siap.murid.nama, avatar: this.avatar, text: bersih, jam: '' });
        this.pangkas();
      }
      if (no > this.last) this.last = no;
    }
    this.status = 'online';
    this.error = '';
    this.alasan = '';
    // Kalau loop sempat berhenti (mis. belum masuk saat game dibuka), kirim
    // pertama membangunkannya lagi.
    if (!this.running) { this.running = true; this.loop(); }
    return null;
  }

  /**
   * Dipanggil layar setelah murid memasukkan nama + PIN dari DALAM permainan.
   * Identitasnya sudah disimpan oleh `masukMurid`, jadi tinggal bangunkan loop
   * dan bersihkan alasan lama.
   */
  segarkan() {
    const cek = this.bisaPakai();
    this.alasan = cek.ok ? '' : cek.alasan;
    this.error = cek.ok ? '' : (cek.pesan ?? '');
    this.status = cek.ok ? 'connecting' : 'tanpaakun';
    if (cek.ok && !this.running) { this.running = true; this.loop(); }
    return cek.ok;
  }
}
