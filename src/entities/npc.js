// NPC: wanders around an anchor point, talks when interacted with.
import { Character } from './character.js';
import { TILE } from '../world/map.js';

// Huruf nama di atas kepala. 16px VT323 sama dengan teks UI; dengan ukuran ini
// nama terpanjang di lembah ("Pak Lurah Harun", 15 huruf) muat dalam 120 px,
// jadi tidak pernah menutupi dua warga yang berdiri berdampingan.
const NAMA_FONT = '16px "VT323", monospace';

// Seberapa lama Ustadz Tasoro berhenti di satu tempat (detik). Delapan sampai
// lima belas detik cukup untuk satu kotak pilihan + satu ujian pendek, tetapi
// tetap membuat lembah terasa hidup: ia jelas berhenti, bukan nyangkut.
const HENTI_MIN = 8;
const HENTI_MAKS = 15;

// Kecepatan motor. Warga berjalan 48 px/s; kendaraan pemain 3x lipat. Motor
// Tasoro sengaja tidak secepat pemain — ia sedang berkeliling, bukan balapan.
const KECEPATAN_MOTOR = 62;

export class Npc extends Character {
  constructor(data, x, y) {
    super(data.sprite, x, y);
    this.id = data.id;
    this.name = data.name;
    this.portrait = data.portrait;
    this.dialogs = data.dialogs;
    this.gift = data.gift ?? null;   // starting tool handed over on first meeting
    this.schedule = data.schedule ?? null;
    this.place = null;               // nama tempat yang sedang dituju
    this.beast = !!data.beast;       // bukan warga: tanpa hati, hadiah, atau jadwal
    this.speed = data.beast ? 34 : 48;
    this.anchor = { x, y };
    // Tiga tile cukup untuk warga yang menunggui tokonya. Yang berkeliling
    // hutan butuh lebih luas, kalau tidak ia terlihat mondar-mandir di satu
    // titik saja.
    this.wanderRadius = (data.roam ?? 3) * TILE;
    this.target = null;
    this.wait = 1 + Math.random() * 3;
    this.talking = false;

    /**
     * Berkendara — hanya dipakai warga yang punya `kendaraan` di npcs.json
     * (sekarang: Ustadz Tasoro).
     *
     * `rute` berisi TITIK BERHENTI, bukan jalan yang harus dilalui persis.
     * Warga ini tidak mencari jalur: lembah dibangun dengan jalan desa yang
     * menyambung semua tempat penting (lihat `map.road`), jadi arah cukup
     * dihitung lurus ke titik berikutnya dan tabrakan diselesaikan per sumbu
     * oleh `Character.move`. Kalau ia tersangkut (mis. menabrak sudut lumbung),
     * `macet` menghitung dan setelah sedetik ia memilih titik lain — jadi
     * tidak pernah berhenti selamanya di balik pohon.
     */
    this.kendaraan = data.kendaraan ?? null;   // { naik, henti[] } nama tempat
    this.modeJalan = 'naik';                   // 'naik' (menuju titik) | 'henti'
    this.lamaHenti = 0;
    this.sasaran = -1;                         // indeks titik henti yang dituju
    this.macet = 0;
    if (this.kendaraan) {
      this.speed = KECEPATAN_MOTOR;
      this.wait = 0;
    }
  }

  /**
   * Rute berkeliling yang dibaca dari PETA, bukan dari berkas data.
   *
   * Musuh utamanya satu: warga yang menyangkut di sudut lumbung. Karena itu
   * rute tidak disimpan sebagai daftar koordinat di npcs.json (yang akan basi
   * begitu satu bangunan bergeser), melainkan dihitung `map.buatJalur` dari
   * jalan desa yang sudah ada. Hasilnya urutan tile; tile tempat ia berdiam
   * ditandai `henti`.
   */
  siapkanRute(map) {
    const daftar = this.kendaraan?.henti ?? [];
    const rute = map.buatJalur?.(daftar) ?? null;
    this.rute = rute;
    this.ruteSiap = true;
    this.titik = rute
      ? rute.map((t) => ({ ...t, henti: daftar.some((n) => {
          const p = map.places?.[n];
          return p && p.c === t.c && p.r === t.r;
        }) }))
      : [];
    if (!this.titik.length) {
      // Peta tidak menyediakan jalur (mis. uji tanpa peta): tetap ada dua titik
      // dari `places`, supaya ia tidak membeku sama sekali.
      this.titik = daftar.map((n) => map.places?.[n]).filter(Boolean)
        .map((p) => ({ c: p.c, r: p.r, henti: true }));
    }
    // Mulai menuju titik henti TERDEKAT, bukan ke tile pertama rute: warga
    // tidak boleh mengawali permainan dengan memutar setengah lembah hanya
    // untuk sampai ke tempat pertamanya. Keadaannya `naik`, bukan `henti`,
    // karena ia belum benar-benar berdiri DI tile itu — kalau dipaksa
    // berhenti, ia akan diam satu tile di sebelah tempat yang ia sebut.
    let dekat = 0, jarak = Infinity;
    this.titik.forEach((t, i) => {
      if (!t.henti) return;
      const d = Math.hypot(t.c * TILE + TILE / 2 - this.x, (t.r + 1) * TILE - this.y);
      if (d < jarak) { jarak = d; dekat = i; }
    });
    this.sasaran = dekat;
    this.modeJalan = 'naik';
    this.lamaHenti = 0;
  }

  /** Apakah warga ini sedang bisa diajak bicara (berhenti di tempat). */
  bisaDiajak() { return !this.kendaraan || this.modeJalan === 'henti'; }

  /**
   * Satu langkah berkendara.
   *
   * Dua keadaan saja, dan sengaja sesederhana itu:
   *   naik  — menyusuri rute tile menuju titik henti berikutnya; TIDAK bisa
   *           diajak bicara, karena ia sedang di tengah jalan.
   *   henti — diam 8–15 detik di Balai Desa atau Perpustakaan; E membuka
   *           percakapan. Motor tetap menyala (tetap digambar dengan lembar
   *           motor, bukan berdiri di sampingnya).
   */
  updateKendaraan(map, dt, rng) {
    if (!this.ruteSiap) this.siapkanRute(map);
    if (!this.titik.length) { this.moving = false; return; }
    if (this.talking) { this.moving = false; return; }

    if (this.modeJalan === 'henti') {
      this.moving = false;
      this.lamaHenti -= dt;
      if (this.lamaHenti <= 0 && !this.talking) {
        // Lanjut ke TILE BERIKUTNYA dalam rute, bukan langsung ke titik henti
        // jauh di ujung. Inilah bedanya menyusuri jalan dan menembus bangunan:
        // sasaran yang melompat ke ujung rute membuat ia berjalan lurus
        // menembus pohon, lalu diam di situ karena setiap langkah tertahan.
        this.sasaran = (this.sasaran + 1) % this.titik.length;
        this.modeJalan = 'naik';
        this.macet = 0;
      }
      return;
    }

    const t = this.titik[this.sasaran];
    if (!t) { this.modeJalan = 'henti'; this.lamaHenti = HENTI_MIN; return; }
    const cx = t.c * TILE + TILE / 2;
    const cy = (t.r + 1) * TILE;
    const dx = cx - this.x, dy = cy - this.y;
    const dist = Math.hypot(dx, dy);
    // Tile dianggap tercapai saat kakinya sudah masuk tile itu. Tanpa ambang
    // ini ia bisa berhenti 1 px dari pusat tile lalu berbalik arah terus.
    const dalamTile = Math.floor(this.x / TILE) === t.c
      && Math.floor((this.y - 1) / TILE) === t.r;
    if (dist < 4 || (dalamTile && dist < TILE * 0.55)) {
      if (t.henti) {
        this.modeJalan = 'henti';
        this.lamaHenti = HENTI_MIN + rng() * (HENTI_MAKS - HENTI_MIN);
        this.moving = false;
        return;
      }
      this.sasaran = (this.sasaran + 1) % this.titik.length;
      return;
    }
    const before = { x: this.x, y: this.y };
    this.move(map, dx / dist, dy / dist, dt);
    if (Math.hypot(this.x - before.x, this.y - before.y) < 0.1) {
      if ((this.macet += dt) > 0.8) {
        // Tersangkut: lewati tile ini dan coba berikutnya. Menunggu lebih lama
        // hanya membuatnya terlihat membeku di balik bangunan.
        this.macet = 0;
        this.sasaran = (this.sasaran + 1) % this.titik.length;
      }
    } else {
      this.macet = 0;
    }
  }

  /**
   * Nama di atas kepala.
   *
   * Digambar setiap frame, bukan sekali, karena warga berjalan — label yang
   * menempel di koordinat tetap akan tertinggal dua tile di belakang orangnya.
   *
   * Plat kecil di belakang teks bukan hiasan: lembah ini punya pohon, atap, dan
   * pagar berwarna hampir sama dengan teksnya, dan nama tanpa plat akan hilang
   * begitu warga berdiri di depan warung. Hurufnya digambar dengan `text` yang
   * sama seperti seluruh UI, supaya bentuknya tidak terasa asing.
   *
   * `dekat` menandai warga yang sedang bisa diajak bicara (benda yang menghadap
   * kita): namanya digambar lebih terang dan ada titik penanda, sehingga murid
   * tahu siapa yang harus dihampiri tanpa mencoba satu per satu.
   */
  /**
   * Warga bermotor memakai lembar 48x64 — 16 px lebih tinggi daripada pejalan
   * kaki (48 px), jadi kedua bingkai tidak boleh ditukar. Karena `Character.draw`
   * membaca `spriteKendaraan` lebih dulu, cukup isi medan itu dengan nama lembar
   * motor; mengosongkannya mengembalikan ia ke lembar jalan kaki.
   */
  draw(ctx, camX, camY) {
    if (this.kendaraan) this.spriteKendaraan = this.kendaraan.naik;
    super.draw(ctx, camX, camY);
  }

  drawName(ctx, camX, camY, dekat = false) {
    const jarakNama = this.kendaraan ? 62 : 46;   // motor 64 px, pejalan 48 px
    const x = Math.round(this.x - camX);
    const y = Math.round(this.y - camY);
    ctx.save();
    ctx.font = NAMA_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const w = Math.ceil(ctx.measureText(this.name).width) + 12;
    const h = 17;
    // Kendaraan berbingkai 64 px, pejalan kaki 48 px: nama harus ikut naik,
    // kalau tidak ia menutupi setang dan lampu motor.
    const bx = x - w / 2, by = y - jarakNama;
    ctx.globalAlpha = dekat ? 0.95 : 0.72;
    ctx.fillStyle = dekat ? '#2f2118' : '#3a2a2a';
    ctx.fillRect(bx, by, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = dekat ? '#ffe9b0' : '#f5e6c8';
    ctx.fillText(this.name, x, by + 2);
    if (dekat) {
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.moveTo(x - 4, by + h + 4);
      ctx.lineTo(x + 4, by + h + 4);
      ctx.lineTo(x, by + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  update(map, dt, rng = Math.random) {
    if (this.kendaraan) { this.updateKendaraan(map, dt, rng); return; }
    if (this.talking) { this.moving = false; return; }
    if (!this.target) {
      this.wait -= dt;
      this.moving = false;
      if (this.wait <= 0) {
        this.target = {
          x: this.anchor.x + (rng() * 2 - 1) * this.wanderRadius,
          y: this.anchor.y + (rng() * 2 - 1) * this.wanderRadius,
        };
        this.stuck = 0;
      }
      return;
    }
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) { this.target = null; this.wait = 2 + rng() * 4; return; }
    const before = { x: this.x, y: this.y };
    this.move(map, dx / dist, dy / dist, dt);
    if (Math.hypot(this.x - before.x, this.y - before.y) < 0.1) {
      if ((this.stuck += dt) > 0.5) { this.target = null; this.wait = 1; }
    }
  }

  /**
   * Pindahkan titik jangkarnya ke tempat lain.
   *
   * `snap` dipakai kalau pemain tidak sedang melihat. Berjalan menyeberangi
   * lembah butuh pencarian jalur, dan tanpa itu seorang warga akan tersangkut
   * di sudut lumbung sampai jam berikutnya. Menempatkannya langsung saat tidak
   * terlihat adalah kebohongan yang tidak pernah tertangkap mata — dan jauh
   * lebih murah daripada pencarian jalur untuk delapan orang.
   */
  moveTo(x, y, snap) {
    this.anchor = { x, y };
    if (snap) { this.x = x; this.y = y; this.target = null; this.wait = 0.5; }
    else { this.target = { x, y }; this.stuck = 0; }
  }

  /** Face toward a world point (used when the player talks to them). */
  faceToward(x, y) {
    const dx = x - this.x, dy = y - this.y;
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  pickDialog(time, hearts = 0) {
    // Baris "friend" hanya terbuka setelah beberapa hati. Kalau tidak ada,
    // baris musiman atau baris biasa yang dipakai — jadi menambahkannya untuk
    // satu warga tidak memaksa semua warga lain ikut ditulis ulang.
    if (hearts >= 4 && this.dialogs.friend) {
      const f = this.dialogs.friend;
      return f[time.day % f.length];
    }
    const key = time.season in this.dialogs ? time.season : 'default';
    const lines = this.dialogs[key] ?? this.dialogs.default;
    return lines[time.day % lines.length];
  }
}
