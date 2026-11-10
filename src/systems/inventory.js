// 24-slot inventory; the first 9 slots are the hotbar.
import { emit } from '../core/events.js';

export const SLOTS = 24;
export const HOTBAR = 9;

let ITEMS = {};
export function setItemData(data) { ITEMS = data; }
export function itemDef(id) { return ITEMS[id]; }
export function itemName(id) { return ITEMS[id]?.name ?? id; }

export class Inventory {
  /**
   * `slot` boleh diperbesar lewat peningkatan Lemari (lihat systems/upgrade.js).
   * Bawaannya tetap 24; lemari tiap tingkat menambah 4. Slot baru ditambahkan di
   * BELAKANG, jadi barang yang sudah tersusun tidak bergeser saat tas diperbesar.
   */
  constructor(slot = SLOTS) {
    this.slot = Math.max(SLOTS, slot);
    this.slots = new Array(this.slot).fill(null); // {id, count, water?}
    this.index = 0;                            // selected hotbar slot
  }

  /**
   * Perbesar tas. Mengembalikan true kalau benar-benar bertambah.
   *
   * Tidak ada barang yang dibuang: yang menambah hanya ruang kosong di ujung.
   * Kalau suatu saat tas MENGECIL (mis. simpanan lama dimuat dengan lemari yang
   * lebih kecil), barang di slot yang hilang dipindahkan ke slot kosong lain
   * lebih dulu — kehilangan barang karena perubahan pengaturan bukan kesalahan
   * pemain.
   */
  setSlot(n) {
    n = Math.max(SLOTS, n | 0);
    if (n === this.slot) return false;
    if (n > this.slot) {
      this.slots = this.slots.concat(new Array(n - this.slot).fill(null));
    } else {
      const sisa = this.slots.slice(n).filter(Boolean);
      this.slots = this.slots.slice(0, n);
      for (const it of sisa) {
        const kosong = this.slots.findIndex((s) => !s);
        if (kosong >= 0) this.slots[kosong] = it;
      }
    }
    this.slot = n;
    if (this.index >= n) this.index = 0;
    emit('inv:change', this);
    return true;
  }

  /** Buang `n` barang dengan id ini dari mana pun ia berada. */
  take(id, n = 1) {
    let sisa = n;
    for (let i = 0; i < this.slots.length && sisa > 0; i++) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const ambil = Math.min(sisa, s.count);
      s.count -= ambil;
      sisa -= ambil;
      if (s.count <= 0) this.slots[i] = null;
    }
    emit('inv:change', this);
    return n - sisa;
  }

  get held() { return this.slots[this.index]; }

  maxStack(id) { return ITEMS[id]?.stack ?? 99; }

  /** Add items; returns how many did NOT fit. */
  add(id, count = 1, extra = null) {
    const max = this.maxStack(id);
    if (max > 1) {
      for (const s of this.slots) {
        if (s && s.id === id && s.count < max) {
          const move = Math.min(count, max - s.count);
          s.count += move; count -= move;
          if (count === 0) { emit('inv:change', this); return 0; }
        }
      }
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (!this.slots[i]) {
        const move = Math.min(count, max);
        this.slots[i] = { id, count: move, ...(extra || {}) };
        count -= move;
      }
    }
    emit('inv:change', this);
    return count;
  }

  removeAt(i, count = 1) {
    const s = this.slots[i];
    if (!s) return false;
    s.count -= count;
    if (s.count <= 0) this.slots[i] = null;
    emit('inv:change', this);
    return true;
  }

  count(id) { return this.slots.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0); }

  swap(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    emit('inv:change', this);
  }

  toJSON() { return { slots: this.slots, index: this.index }; }
  load(d) { if (d) { this.slots = d.slots; this.index = d.index ?? 0; } }
}
