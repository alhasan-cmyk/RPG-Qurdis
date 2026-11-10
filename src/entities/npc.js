// NPC: wanders around an anchor point, talks when interacted with.
import { Character } from './character.js';
import { TILE } from '../world/map.js';

// Huruf nama di atas kepala. 16px VT323 sama dengan teks UI; dengan ukuran ini
// nama terpanjang di lembah ("Pak Lurah Harun", 15 huruf) muat dalam 120 px,
// jadi tidak pernah menutupi dua warga yang berdiri berdampingan.
const NAMA_FONT = '16px "VT323", monospace';

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
  drawName(ctx, camX, camY, dekat = false) {
    const x = Math.round(this.x - camX);
    const y = Math.round(this.y - camY);
    ctx.save();
    ctx.font = NAMA_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const w = Math.ceil(ctx.measureText(this.name).width) + 12;
    const h = 17;
    const bx = x - w / 2, by = y - 46;
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
