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

import { muridAktif, tersambung, panggilServer } from '../core/nilai-api.js';

export const BATAS_BARIS = 30;
const JEDA_MIN_MS = 900;      // jarak minimum antar-permintaan baca
const JEDA_GAGAL_MS = 6000;   // jeda setelah gagal, supaya tidak membanjiri server

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
    this.running = false;
    this.kelas = '';
    this.fails = 0;
  }

  setIdentity(name, avatar) {
    this.name = name;
    this.avatar = avatar;
  }

  /** Apakah obrolan bisa dipakai: ada akun, ada sambungan. */
  bisaPakai() {
    if (!tersambung()) return { ok: false, alasan: 'Spreadsheet belum disambungkan.' };
    const m = muridAktif();
    if (!m || !m.nama || !m.pin) return { ok: false, alasan: 'Masuk dulu dengan nama dan PIN untuk ikut obrolan.' };
    if (m.terdaftar === false) return { ok: false, alasan: 'Akun belum terdaftar di spreadsheet. Buka sekali sampai tersambung, lalu coba lagi.' };
    return { ok: true, murid: m };
  }

  start() {
    if (this.running) return;
    const cek = this.bisaPakai();
    if (!cek.ok) {
      this.status = 'tanpaakun';
      this.error = cek.alasan;
      return;
    }
    this.running = true;
    this.loop();
  }

  stop() { this.running = false; }

  /** Dulu mengirim `chat/bye` ke server Python. Sekarang tidak ada presence. */
  leave() { this.running = false; }

  async loop() {
    while (this.running) {
      const cek = this.bisaPakai();
      if (!cek.ok) { this.status = 'tanpaakun'; this.error = cek.alasan; return; }

      const mulai = Date.now();
      const r = await panggilServer({
        aksi: 'obrolan',
        nama: cek.murid.nama,
        pin: cek.murid.pin,
        sejak: this.last,
      });

      if (r.ok) {
        this.status = 'online';
        this.error = '';
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
        this.status = 'offline';
        // `tanpaObrolan` = Code.gs belum diperbarui. Pesannya berbeda supaya
        // guru langsung tahu yang perlu dilakukan: deploy ulang, bukan cek
        // jaringan.
        this.error = r.tanpaObrolan
          ? 'Obrolan belum dipasang di Apps Script. Tempel Obrolan.gs lalu deploy ulang.'
          : (r.error ?? 'Server obrolan tidak terhubung.');
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

    const cek = this.bisaPakai();
    if (!cek.ok) { this.status = 'tanpaakun'; this.error = cek.alasan; return cek.alasan; }

    const r = await panggilServer({
      aksi: 'obrolanTulis',
      nama: cek.murid.nama,
      pin: cek.murid.pin,
      avatar: this.avatar,
      pesan: bersih,
    });

    if (!r.ok) {
      this.error = r.tanpaObrolan
        ? 'Obrolan belum dipasang di Apps Script. Tempel Obrolan.gs lalu deploy ulang.'
        : (r.error ?? 'Gagal mengirim.');
      return this.error;
    }

    // Pesan sendiri dimasukkan langsung supaya layar tidak terasa menggantung
    // menunggu putaran baca berikutnya. Nomornya dari server, jadi tidak dobel
    // saat `obrolanAmbil` mengembalikannya nanti.
    const no = Number(r.no) || 0;
    if (no) {
      this.mine.add(no);
      if (!this.messages.some((m) => m.no === no)) {
        this.messages.push({ no, id: no, name: cek.murid.nama, avatar: this.avatar, text: bersih, jam: '' });
        this.pangkas();
      }
      if (no > this.last) this.last = no;
    }
    this.status = 'online';
    this.error = '';
    return null;
  }
}
