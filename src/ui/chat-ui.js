// Public chat: a bubble button in the bottom-left corner that opens a panel.
//
// Typing goes through a real (invisible) DOM <input> parked over the canvas
// rather than a hand-rolled key handler. That is not laziness — it is the only
// way to get IME composition, clipboard paste, autocorrect and the mobile
// keyboard for free, and text entry is exactly the place where reimplementing
// the browser goes wrong. What the player sees is still drawn on the canvas, so
// the panel matches the rest of the game.
import { view } from '../render/renderer.js';
import { panel, text, icon, wrap, fit, UI } from './draw.js';
import { assets } from '../render/assets.js';
import { BATAS_BARIS, ALASAN } from '../systems/chat.js';
import { masukMurid, muridAktif, periksaPin } from '../core/nilai-api.js';
import { writeProfile } from '../core/save.js';

const BTN = 44;          // bubble button, bottom-left
const PAD = 12;
const PANEL_W = 380;
const PANEL_H = 300;
const PANEL_H_MASUK = 340;   // formulir nama+PIN butuh lebih banyak baris
const ROW_GAP = 6;
const AVATAR = 32;       // portraits are 96px, so this is an exact 1/3
const MAX_LEN = 160;

export class ChatUI {
  constructor(chat) {
    this.chat = chat;
    this.open = false;
    this.notice = '';
    this.noticeT = 0;
    this.scroll = 0;         // 0 = pinned to the newest line
    this.input = null;
    // Layar masuk dari dalam permainan. Dulu murid harus keluar ke halaman
    // depan dan mengetik nama + PIN di sana hanya untuk bisa mengobrol; dari
    // sisi murid itu tampak seperti "game-nya rusak".
    this.masuk = false;      // formulir nama+PIN sedang terbuka
    this.bidang = 0;         // 0 = nama, 1 = PIN
    this.nama = '';
    this.pin = '';
    this.sibuk = false;      // sedang memeriksa PIN ke server
    this.pesanMasuk = '';
    this.masukan = null;     // <input> tak terlihat khusus formulir ini
  }

  /** Bidang tak terlihat untuk formulir masuk (nama / PIN). */
  ensureMasukan() {
    if (this.masukan) return this.masukan;
    const el = document.createElement('input');
    el.type = 'text';
    el.autocomplete = 'off';
    el.setAttribute('aria-label', 'Nama dan PIN untuk masuk obrolan');
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;opacity:0;';
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.kirimMasuk(); }
      if (e.key === 'Escape') { e.preventDefault(); this.tutupMasuk(); }
      // Tab memindahkan fokus antar-bidang, seperti formulir biasa.
      if (e.key === 'Tab') { e.preventDefault(); this.pindahBidang(); }
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    // Isi disalin ke `this.nama`/`this.pin` supaya tetap ada saat bidang
    // diganti: <input> yang sama dipakai untuk dua kolom, jadi nilainya harus
    // dipindahkan dulu sebelum kolomnya berganti.
    el.addEventListener('input', () => this.salinBidang());
    document.body.appendChild(el);
    this.masukan = el;
    return el;
  }

  /** The invisible field that actually receives keystrokes. */
  ensureInput() {
    if (this.input) return this.input;
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = MAX_LEN;
    el.autocomplete = 'off';
    el.setAttribute('aria-label', 'Tulis pesan obrolan');
    // Off-screen but focusable: `display:none` and `visibility:hidden` cannot
    // hold focus, and a zero-size input breaks the mobile keyboard.
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;opacity:0;';
    el.addEventListener('keydown', (e) => {
      // Stop here so the game's window-level handler never sees the keystroke;
      // otherwise typing "wasd" walks the farmer across the valley.
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    document.body.appendChild(el);
    this.input = el;
    return el;
  }

  toggle() { (this.open ? this.close : this.openPanel).call(this); }

  openPanel() {
    this.open = true;
    this.scroll = 0;
    this.maxScroll = 0;
    this.chat.unread = 0;
    // Kalau belum masuk, langsung tawarkan formulirnya di dalam panel.
    if (this.chat.alasan === ALASAN.belumMasuk && !this.masuk) this.bukaMasuk();
    const el = this.ensureInput();
    el.value = '';
    setTimeout(() => el.focus(), 0);
  }

  close() {
    this.open = false;
    this.masuk = false;
    this.input?.blur();
    this.masukan?.blur();
  }

  /* ------------------------------------------------- layar masuk (nama+PIN) */

  bukaMasuk() {
    this.masuk = true;
    this.bidang = 0;
    this.pesanMasuk = '';
    // Nama yang sudah dipakai bermain diisi lebih dulu: biasanya itu memang
    // nama muridnya, dan ia hanya perlu mengetik PIN.
    this.nama = this.chat.name || muridAktif()?.nama || '';
    this.pin = '';
    const el = this.ensureMasukan();
    el.value = this.nama;
    setTimeout(() => el.focus(), 0);
  }

  tutupMasuk() {
    this.masuk = false;
    this.masukan?.blur();
    this.input?.focus();
  }

  salinBidang() {
    const v = this.masukan?.value ?? '';
    if (this.bidang === 0) this.nama = v;
    else this.pin = v.replace(/[^0-9]/g, '');
  }

  pindahBidang() {
    this.salinBidang();
    this.bidang = this.bidang === 0 ? 1 : 0;
    const el = this.ensureMasukan();
    el.value = this.bidang === 0 ? this.nama : this.pin;
    el.setAttribute('inputmode', this.bidang === 1 ? 'numeric' : 'text');
    setTimeout(() => el.focus(), 0);
  }

  /** Tekan Enter di formulir: pindah ke PIN, lalu kirim. */
  async kirimMasuk() {
    if (this.sibuk) return;
    this.salinBidang();
    if (this.bidang === 0) {
      if (!this.nama.trim()) { this.pesanMasuk = 'Nama belum diisi.'; return; }
      this.pindahBidang();
      return;
    }

    const nama = this.nama.trim();
    const pin = this.pin.trim();
    if (!nama) { this.bidang = 0; this.pesanMasuk = 'Nama belum diisi.'; return; }
    const salahPin = periksaPin(pin);
    if (salahPin) { this.pesanMasuk = salahPin; return; }

    this.sibuk = true;
    this.pesanMasuk = 'Memeriksa PIN...';
    const r = await masukMurid(nama, pin);
    this.sibuk = false;

    if (!r.ok) {
      // Nama belum terdaftar: arahkan mendaftar di halaman depan, karena
      // pendaftaran butuh nama + kelas + PIN sekaligus.
      this.pesanMasuk = r.offline
        ? 'Spreadsheet belum terjangkau. Coba lagi saat jaringan tersambung.'
        : (r.error ?? 'PIN tidak cocok.');
      return;
    }

    // Nama di profil ikut diperbarui: karakter, sapaan pagi, dan avatar memakai
    // `state.profile`, dan tanpa ini murid melihat nama lamanya sendiri.
    writeProfile({ name: nama });
    this.chat.setIdentity(nama, this.chat.avatar);
    this.masuk = false;
    this.masukan?.blur();
    this.chat.segarkan();
    this.input?.focus();
  }

  async submit() {
    const el = this.ensureInput();
    const value = el.value.trim();
    if (!value) return;
    el.value = '';
    const err = await this.chat.send(value);
    if (err) this.say(err);
  }

  say(msg) { this.notice = msg; this.noticeT = 3; }

  update(dt) {
    if (this.noticeT > 0 && (this.noticeT -= dt) <= 0) this.notice = '';
    // Jangan rebut fokus dari formulir masuk: kalau `this.masuk` terbuka, yang
    // harus memegang kursor adalah bidang nama/PIN, bukan kotak pesan.
    if (this.open && !this.masuk && this.input && document.activeElement !== this.input) this.input.focus();
    if (this.masuk && this.masukan && document.activeElement !== this.masukan) this.masukan.focus();
  }

  // -- hit testing ---------------------------------------------------------
  buttonRect() {
    return { x: PAD, y: view.h - BTN - PAD, w: BTN, h: BTN };
  }

  panelRect() {
    // Formulir masuk butuh ruang lebih: judul, subjudul, dua kotak, tombol,
    // pesan galat, dan dua baris petunjuk. Di panel 300 px pesan galatnya
    // keluar menembus tepi bawah pada layar 568x320.
    const tinggi = this.masuk ? PANEL_H_MASUK : PANEL_H;
    const h = Math.min(tinggi, view.h - BTN - PAD * 3);
    const w = Math.min(PANEL_W, view.w - PAD * 2);
    return { x: PAD, y: view.h - BTN - PAD * 2 - h, w, h };
  }

  /** Kotak nama dan PIN di formulir masuk, dihitung dari ukuran panel. */
  bidangRect(i) {
    const p = this.panelRect();
    const w = p.w - 32;
    const h = 34;
    const y = p.y + 74 + i * (h + 24);
    return { x: p.x + 16, y, w, h };
  }

  /**
   * Satu kalimat di bawah kotak tulis yang menjelaskan apa yang kurang.
   *
   * Sengaja PENDEK. Kalimat lengkapnya sudah ada di tengah daftar pesan, tempat
   * ia boleh beberapa baris; di sini hanya tersedia satu baris antara kotak
   * tulis dan tepi panel. Versi panjang dulu dipotong "…" sehingga murid justru
   * kehilangan bagian yang memberi tahu apa yang harus dilakukan.
   */
  petunjukTerkunci() {
    switch (this.chat.alasan) {
      case ALASAN.belumMasuk: return 'Tekan Masuk untuk memakai akunmu.';
      case ALASAN.belumPasti: return 'Akunmu belum tercatat di spreadsheet.';
      case ALASAN.bedaKelas: return 'Kelasmu belum tercatat.';
      case ALASAN.takTersambung: return 'Server obrolan belum terhubung.';
      default: return this.chat.error || '';
    }
  }

  /** Tombol "Masuk" di atas kotak tulis, saat obrolan terkunci. */
  tombolPanelRect() {
    const p = this.panelRect();
    const iy = p.y + p.h - 30 - 18 - 10;
    return { x: p.x + p.w - 16 - 96, y: iy - 42, w: 96, h: 30 };
  }

  /** Tombol "Masuk" di bawah formulir. */
  tombolMasukRect() {
    const p = this.panelRect();
    const b = this.bidangRect(1);
    return { x: p.x + 16, y: b.y + b.h + 16, w: 120, h: 30 };
  }

  /** Returns true when the click belonged to the chat. */
  click(mx, my) {
    const b = this.buttonRect();
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) { this.toggle(); return true; }
    if (!this.open) return false;
    const p = this.panelRect();

    if (this.masuk) {
      const dalamPanel = mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h;
      if (!dalamPanel) { this.close(); return true; }
      for (let i = 0; i < 2; i++) {
        const r = this.bidangRect(i);
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          this.salinBidang();
          this.bidang = i;
          const el = this.ensureMasukan();
          el.value = i === 0 ? this.nama : this.pin;
          el.setAttribute('inputmode', i === 1 ? 'numeric' : 'text');
          setTimeout(() => el.focus(), 0);
          return true;
        }
      }
      const t = this.tombolMasukRect();
      if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) { this.kirimMasuk(); return true; }
      return true;
    }

    const inside = mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h;
    if (inside) {
      if (this.chat.alasan === ALASAN.belumMasuk) {
        const t = this.tombolPanelRect();
        if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) { this.bukaMasuk(); return true; }
      }
      this.input?.focus();
      return true;
    }
    this.close();
    return true;
  }

  wheel(dir) {
    if (!this.open) return false;
    // Batas atasnya dihitung saat menggambar, ketika tinggi tiap pesan sudah
    // diketahui. Tanpa batas, roda mouse menggulung riwayat sampai jauh ke atas
    // dan menyisakan panel kosong tanpa petunjuk cara kembali.
    this.scroll = Math.max(0, Math.min(this.maxScroll ?? 0, this.scroll + dir * 2));
    return true;
  }

  // -- drawing -------------------------------------------------------------
  draw(ctx) {
    if (this.open) this.drawPanel(ctx);
    this.drawButton(ctx);
    if (this.notice) {
      const b = this.buttonRect();
      text(ctx, this.notice, b.x + b.w + 10, b.y + 14, { font: UI.fontBig, color: '#ffd0c0', shadow: true });
    }
  }

  drawButton(ctx) {
    // Just the bubble. The online count lives inside the panel, where there is
    // room to say what the number means.
    const b = this.buttonRect();
    const unread = this.chat.unread > 0 && !this.open;
    icon(ctx, 'ui_chat_icons', unread ? 1 : 0, b.x, b.y, BTN / 32);
    if (unread) {
      const n = Math.min(99, this.chat.unread);
      text(ctx, String(n), b.x + b.w - 10, b.y + 2, { font: UI.font, align: 'center', color: UI.cream, shadow: true });
    }
  }

  drawPanel(ctx) {
    const p = this.panelRect();
    panel(ctx, p.x, p.y, p.w, p.h);

    if (this.masuk) { this.drawMasuk(ctx, p); return; }

    const headY = p.y + 12;
    // Judul menyebut kelasnya: obrolan ini SATU RUANG PER TINGKAT, dan murid
    // harus bisa memastikan dengan mata sendiri bahwa ia tidak sedang menulis
    // di ruang kelas lain.
    const kelas = this.chat.kelas;
    text(ctx, kelas ? `OBROLAN KELAS ${kelas}` : 'OBROLAN KELAS', p.x + 16, headY + 2,
      { font: UI.fontTitle, color: UI.red });
    if (this.chat.status === 'online') {
      icon(ctx, 'ui_chat_icons', 2, p.x + p.w - 16 - 20, headY - 2, 0.625);
      text(ctx, `${this.chat.messages.length}/${BATAS_BARIS} baris`, p.x + p.w - 16 - 26, headY + 2,
        { font: UI.fontBig, align: 'right', color: '#7a6647' });
    } else {
      const label = this.chat.status === 'tanpaakun' ? 'belum masuk'
        : (this.chat.status === 'connecting' ? 'menyambung...' : 'terputus');
      text(ctx, label, p.x + p.w - 16, headY + 2,
        { font: UI.fontBig, align: 'right', color: '#7a6647' });
    }

    const listY = headY + 26;
    const inputH = 30, hintH = 18;
    const listH = p.h - (listY - p.y) - inputH - hintH - 20;

    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x + 10, listY, p.w - 20, listH);
    ctx.clip();

    // Lay the messages out from the newest upward, so the freshest line always
    // sits against the input box no matter how long the backlog is.
    const rows = this.layout(ctx, p.w - 24 - AVATAR - 12);
    const total = rows.reduce((h, r) => h + r.h + ROW_GAP, 0);
    this.maxScroll = Math.max(0, Math.ceil((total - listH) / 20));
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll;
    let y = listY + listH + this.scroll * 20;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      y -= r.h + ROW_GAP;
      if (y > listY + listH) continue;
      // Kalau puncak baris sudah lewat atas daftar, berhenti. Dulu yang digambar
      // baris setengah terpotong: huruf atasnya hilang, dan nama pengirimnya
      // naik sampai menabrak judul panel.
      if (y < listY) break;
      this.drawRow(ctx, r, p.x + 12, p.x + p.w - 12, y);
    }
    ctx.restore();

    if (!rows.length) {
      // Tiap sebab punya kalimatnya sendiri. Dulu semuanya "masuk dulu",
      // termasuk ketika server belum dipasang — dan murid disuruh mencari
      // masalah yang salah.
      const alasan = this.chat.alasan;
      const msg = alasan === ALASAN.belumMasuk ? 'Masuk dulu untuk ikut obrolan kelas.'
        : alasan === ALASAN.belumPasti ? (this.chat.error || 'Akunmu belum tercatat di spreadsheet.')
          : alasan === ALASAN.bedaKelas ? 'Kelasmu belum tercatat. Hubungi gurumu.'
            : alasan === ALASAN.takTersambung ? (this.chat.error || 'Server obrolan belum terhubung.')
              : this.chat.status === 'offline' ? 'Server obrolan belum terhubung.'
                : 'Belum ada yang bicara. Sapa duluan!';
      const baris = wrap(ctx, msg, p.w - 48, UI.fontBig);
      // Digeser ke atas sebesar jumlah barisnya, lalu dijepit ke dalam daftar.
      // Tanpa jepitan ini, pesan tiga baris keluar menembus judul panel — yang
      // tertangkap uji tata letak, bukan oleh mata, karena tidak ada galat.
      const y0 = Math.max(listY + 14, listY + listH / 2 - 8 - (baris.length - 1) * 10);
      baris.forEach((b, i) => text(ctx, b, p.x + p.w / 2, y0 + i * 18,
        { font: UI.fontBig, align: 'center', color: '#9a8a72' }));
    }

    // Tombol "Masuk" hanya muncul kalau memang itu yang dibutuhkan, dan hanya
    // kalau ada tempat untuk menaruhnya di panel.
    if (this.chat.alasan === ALASAN.belumMasuk) {
      const t = this.tombolPanelRect();
      ctx.fillStyle = UI.red;
      ctx.fillRect(t.x, t.y, t.w, t.h);
      text(ctx, 'Masuk', t.x + t.w / 2, t.y + 7,
        { font: UI.fontBig, align: 'center', color: UI.cream });
    }

    // input line, with the hint on its own row underneath — sharing one row
    // with the typed text meant a long message ran straight through it
    const iy = p.y + p.h - inputH - hintH - 10;
    const iw = p.w - 24;
    const countW = 56;
    ctx.fillStyle = '#fff3d6';
    ctx.fillRect(p.x + 12, iy, iw, inputH);
    ctx.strokeStyle = UI.outline;
    ctx.strokeRect(p.x + 12.5, iy + 0.5, iw - 1, inputH - 1);

    // `tanpaakun` berarti belum masuk ATAU akun belum dipastikan. Keduanya
    // sama-sama tidak bisa menulis, tetapi kalimatnya berbeda.
    const bisaTulis = !this.chat.alasan;
    const typed = bisaTulis ? (this.input?.value ?? '') : '';
    const caret = bisaTulis && Math.floor(performance.now() / 500) % 2 ? '|' : '';
    const fieldW = iw - 16 - countW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x + 18, iy, fieldW, inputH);
    ctx.clip();
    ctx.font = UI.fontBig;
    // Scroll with the caret so the end of a long line stays visible, the way a
    // real text field does.
    const shown = typed + caret;
    const over = Math.max(0, ctx.measureText(shown).width - fieldW + 4);
    // Tanpa akun, kolomnya tetap digambar (supaya panel tidak berubah bentuk)
    // tetapi diisi alasannya, bukan pura-pura bisa diketik.
    const kosong = bisaTulis ? 'Ketik pesan...'
      : this.chat.alasan === ALASAN.belumMasuk ? 'Masuk dulu untuk menulis'
        : 'Belum bisa menulis';
    text(ctx, typed ? shown : kosong, p.x + 20 - over, iy + 6,
      { font: UI.fontBig, color: typed ? UI.outline : '#a89878' });
    ctx.restore();
    // Penghitung hanya berguna saat benar-benar menulis. Dulu ia selalu tampil,
    // dan di panel sempit "0/160" menabrak tulisan "Masuk dulu untuk menulis".
    if (bisaTulis) {
      text(ctx, `${typed.length}/${MAX_LEN}`, p.x + p.w - 20, iy + 9,
        { font: UI.font, align: 'right', color: typed.length >= MAX_LEN ? '#b8432e' : '#a89878' });
    }

    // Batas 30 baris ditulis di sini, bukan disembunyikan: murid berhak tahu
    // bahwa pesan lama memang hilang, bukan gagal tersimpan.
    const hint = bisaTulis
      ? `Enter kirim · Esc tutup · ${BATAS_BARIS} baris terakhir`
      : this.petunjukTerkunci();
    // Dipotong dengan "…" kalau masih panjang: satu baris saja di sini, karena
    // baris kedua akan menabrak tepi bawah panel.
    text(ctx, fit(ctx, hint, p.w - 24, UI.font), p.x + p.w / 2, iy + inputH + 4,
      { font: UI.font, align: 'center', color: bisaTulis ? '#7a6647' : '#b8432e' });
  }

  /** Wrap every message once per draw; the list is short enough for that. */
  layout(ctx, textW) {
    const out = [];
    for (const m of this.chat.messages) {
      const lines = wrap(ctx, m.text, textW, UI.fontBig);
      // Own lines hang on the right, everyone else on the left. Two people can
      // share a display name, so this goes by the ids this tab actually posted
      // rather than by comparing names.
      out.push({ m, lines, own: m.own ?? this.chat.mine.has(m.id), h: Math.max(AVATAR, 18 + lines.length * 20) });
    }
    return out;
  }

  /**
   * Formulir masuk: nama + PIN, langsung di dalam panel.
   *
   * Dulu murid harus keluar ke halaman depan untuk ini. Dari sisi murid, chat
   * yang menolak menulis dengan alasan "buka spreadsheet" terasa seperti game
   * yang rusak, padahal yang kurang hanya PIN.
   */
  drawMasuk(ctx, p) {
    const y0 = p.y + 12;
    text(ctx, 'MASUK UNTUK MENGOBROL', p.x + 16, y0 + 2,
      { font: UI.fontTitle, color: UI.red });

    // Satu baris pendek. Versi panjangnya ("Nama dan PIN yang kamu pakai saat
    // mendaftar.") membungkus dua baris di panel 380 px dan baris keduanya
    // menabrak label "Nama" — persis yang ditangkap uji tata letak.
    text(ctx, 'Pakai akun yang sudah terdaftar.', p.x + 16, y0 + 26,
      { font: UI.font, color: '#7a6647' });

    const label = ['Nama', 'PIN'];
    const nilai = [this.nama, this.pin ? '*'.repeat(this.pin.length) : ''];
    for (let i = 0; i < 2; i++) {
      const r = this.bidangRect(i);
      text(ctx, label[i], r.x, r.y - 13, { font: UI.font, color: '#7a6647' });
      ctx.fillStyle = '#fff3d6';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = this.bidang === i ? UI.red : UI.outline;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      // Kursor berkedip hanya di bidang yang sedang aktif.
      const kursor = this.bidang === i && Math.floor(performance.now() / 500) % 2 ? '|' : '';
      const isi = (nilai[i] || '') + kursor;
      const kosong = i === 0 ? 'mis. ahmad' : '4-8 angka';
      text(ctx, isi || kosong, r.x + 10, r.y + 9,
        { font: UI.fontBig, color: isi ? UI.outline : '#a89878' });
    }

    const t = this.tombolMasukRect();
    ctx.fillStyle = this.sibuk ? '#cbbf9e' : UI.red;
    ctx.fillRect(t.x, t.y, t.w, t.h);
    text(ctx, this.sibuk ? 'Memeriksa...' : 'Masuk', t.x + t.w / 2, t.y + 7,
      { font: UI.fontBig, align: 'center', color: UI.cream });

    if (this.pesanMasuk) {
      // Pesan galat dan pesan proses ditulis dengan warna berbeda, supaya
      // "Memeriksa PIN..." tidak terbaca seperti kegagalan.
      const gagal = /tidak|cocok|kosong|minimal|maksimal|angka|terjangkau|terdaftar/i.test(this.pesanMasuk);
      // Digambar DI ATAS tombol Masuk, bukan di bawahnya. Di bawah tombol ia
      // jatuh ke baris petunjuk bawah pada panel pendek, dan uji tata letak
      // menangkapnya sebagai tabrakan "PIN tidak cocok." / "Enter lanjut".
      const baris = wrap(ctx, this.pesanMasuk, p.w - 32, UI.font);
      baris.forEach((b, i) => text(ctx, b, p.x + 16, t.y - 10 - (baris.length - 1 - i) * 16,
        { font: UI.font, color: gagal ? '#b8432e' : '#7a6647' }));
    }

    // Dua baris tetap: "Enter/Esc" lalu ajakan mendaftar. Digabung jadi satu
    // baris panjang, kalimatnya tidak muat di panel 380 px. Keduanya dipotong
    // dengan "…" kalau panelnya lebih sempit lagi.
    text(ctx, fit(ctx, 'Enter lanjut · Esc tutup', p.w - 20, UI.font), p.x + p.w / 2, p.y + p.h - 34,
      { font: UI.font, align: 'center', color: '#7a6647' });
    text(ctx, 'Belum punya akun? Daftar di depan.', p.x + p.w / 2, p.y + p.h - 18,
      { font: UI.font, align: 'center', color: '#7a6647' });
  }

  drawRow(ctx, r, left, right, y) {
    const name = `portrait_${r.m.avatar || 'player_m'}`;
    const img = assets.images.get(name) ?? assets.images.get('portrait_player_m');
    const ax = r.own ? right - AVATAR : left;
    if (img) ctx.drawImage(img, 0, 0, img.width, img.height, ax, y, AVATAR, AVATAR);
    const tx = r.own ? right - AVATAR - 10 : left + AVATAR + 10;
    const align = r.own ? 'right' : 'left';
    text(ctx, r.own ? 'Kamu' : r.m.name, tx, y, { font: UI.font, align, color: r.own ? '#3f6f2a' : UI.red });
    r.lines.forEach((l, i) => text(ctx, l, tx, y + 16 + i * 20, { font: UI.fontBig, align }));
  }
}
