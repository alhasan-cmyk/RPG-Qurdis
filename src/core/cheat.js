// Kode debug: cara cepat menguji permainan tanpa mengumpulkan gold dan diamond
// dengan bermain dulu.
//
// HANYA HIDUP DI MODE `?debug=1` (lihat main.js). Alasannya bukan kerapian:
// dengan 1.000 diamond seluruh ekonomi permainan bisa ditembus, dan nilai
// ujian yang dibelanjakan dari situ tidak sah. Karena itu pemasangan kode ini
// ditaruh DI DALAM blok debug, dan tests/uji.mjs mengunci dua arah — harus ada
// di dalam, dan tidak boleh ada pemanggilan di luarnya.
//
// Semua efek lewat jalur permainan yang sama dengan pemain biasa:
// `Upgrade.beliBangunan` + `terapkanUpgrade`, `Inventory.add`, `Diamond.tambah`,
// `Ilmu.lulusUjian`, `Kendaraan.beli`. Tidak ada yang menulis keadaan langsung.
// Bedanya, cheat ini memberi bahannya lebih dulu (atau mengabaikan harga), jadi
// hasilnya selalu keadaan yang bisa dicapai dengan bermain — dan bug yang
// sedang dicari tetap muncul, bukan tertutup oleh keadaan mustahil.
import { onPintas } from './input.js';
import { UPGRADE, NAMA_BAHAN } from '../systems/upgrade.js';
import { KENDARAAN } from '../systems/kendaraan.js';

/** Bahan yang dibagikan Ctrl+B, urut seperti di papan Ragam Usaha. */
export const BAHAN_DEBUG = Object.keys(NAMA_BAHAN);
export const JUMLAH_BAHAN = 50;
export const JUMLAH_UANG = 1000;
export const JUMLAH_DIAMOND = 1000;

/** 1000 -> '1.000' (titik ribuan, seperti HUD dan papan usaha). */
const rb = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Daftar kode yang dipasang.
 *
 * Urutan di sini = urutan di panel F1. `judul` sengaja pendek (muat di satu
 * baris panel) dan `catatan` menjelaskan akibatnya, karena beberapa kode
 * mengubah lebih dari yang tertulis di judulnya.
 */
export const KODE_DEBUG = [
  { tombol: 'KeyG', judul: 'Gold +1.000', catatan: 'uang pemain langsung bertambah' },
  { tombol: 'KeyD', judul: 'Diamond +1.000', catatan: 'untuk mencoba papan Ragam Usaha' },
  { tombol: 'KeyB', judul: `Bahan +${JUMLAH_BAHAN} tiap jenis`, catatan: `${BAHAN_DEBUG.length} jenis, untuk peningkatan bangunan` },
  { tombol: 'KeyK', judul: 'Buka 1 bab', catatan: 'bab berikutnya yang belum lulus dianggap lulus' },
  { tombol: 'KeyL', judul: 'Buka semua bab kelas', catatan: 'semua bab kelas yang sedang dipakai' },
  { tombol: 'KeyJ', judul: 'Bangunan naik 1 tingkat', catatan: 'semua peningkatan, efeknya ikut diterapkan' },
  { tombol: 'KeyH', judul: 'Energi penuh', catatan: 'sampai batas energi maksimum sekarang' },
  { tombol: 'KeyM', judul: 'Semua kendaraan', catatan: 'sepeda, motor, truk — tanpa memakai diamond' },
  { tombol: 'KeyU', judul: 'Maju 1 jam', catatan: 'jadwal warga dan lampu malam ikut jalan' },
  { tombol: 'KeyP', judul: 'Ganti musim', catatan: 'langsung ke musim berikutnya' },
  { tombol: 'KeyY', judul: 'Simpan sekarang', catatan: 'tanpa harus tidur' },
];

/**
 * Pasang kode debug.
 *
 * `state`   — keadaan permainan (main.js), dibaca langsung.
 * `toast`   — fungsi pesan singkat di layar.
 * `terapkan`— terapkan efek peningkatan (main.js: terapkanUpgrade).
 * `simpan`  — simpan permainan (main.js: saveGame).
 *
 * Mengembalikan `{ dipasang, riwayat, jalankan }`. `jalankan(kode)` dipakai
 * panel F1 dan kait uji supaya satu kode bisa dicoba tanpa menekan tombol.
 */
export function pasangKodeDebug({ state, toast = () => {}, terapkan = () => {}, simpan = () => {} } = {}) {
  const riwayat = [];
  const lepas = [];

  const efek = {
    /** Uang. `player.money` adalah satu-satunya tempat saldo gold disimpan. */
    KeyG: () => {
      const p = state?.player;
      if (!p) return 'Pemain belum siap.';
      p.money = (p.money ?? 0) + JUMLAH_UANG;
      return `+${rb(JUMLAH_UANG)} gold — sekarang ${rb(p.money)}`;
    },

    /** Diamond. Lewat `tambah()` supaya batas bawah 0 dan pembulatan tetap satu sumber. */
    KeyD: () => {
      const d = state?.diamond;
      if (!d) return 'Diamond belum siap.';
      d.tambah(JUMLAH_DIAMOND);
      return `+${rb(JUMLAH_DIAMOND)} diamond — sekarang ${rb(d.jumlah)}`;
    },

    /**
     * Bahan. `add()` mengembalikan SISA yang tidak muat, bukan berhasil/gagal —
     * membaca hasilnya sebagai boolean membuat pesan ini berbohong justru saat
     * semua bahan masuk. Pesannya karena itu menyebut berapa yang tertinggal.
     */
    KeyB: () => {
      const inv = state?.inv;
      if (!inv) return 'Tas belum siap.';
      let sisa = 0;
      for (const id of BAHAN_DEBUG) sisa += inv.add(id, JUMLAH_BAHAN) ?? 0;
      if (sisa > 0) return `Tas penuh: ${sisa} bahan tidak muat.`;
      return `+${JUMLAH_BAHAN} tiap bahan (${BAHAN_DEBUG.length} jenis)`;
    },

    KeyK: () => {
      const ilmu = state?.ilmu;
      const id = ilmu?.babTerbuka?.();
      if (!id) return 'Semua bab sudah lulus.';
      ilmu.lulusUjian(id);
      return `Bab ${ilmu.nomorBab(id)} dibuka`;
    },

    KeyL: () => {
      const ilmu = state?.ilmu;
      const daftar = ilmu?.semua?.() ?? [];
      if (!daftar.length) return 'Belum ada bab untuk kelas ini.';
      let n = 0;
      for (const b of daftar) if (!ilmu.lulus.has(b.id)) { ilmu.lulusUjian(b.id); n += 1; }
      return n ? `${n} bab dibuka` : 'Semua bab kelas ini sudah lulus.';
    },

    /**
     * Bangunan naik satu tingkat.
     *
     * Bahannya diberikan lebih dulu, lalu dibeli lewat `beliBangunan` — bukan
     * dengan menaikkan `level` langsung. Dengan begitu pengurangan bahan,
     * `pakaiUang`, dan efek (energi maks, slot tas/peti, ternak) tetap terjadi
     * di jalur yang sama seperti pemain yang menekan E di papan.
     */
    KeyJ: () => {
      const up = state?.upgrade;
      const inv = state?.inv;
      const p = state?.player;
      if (!up || !inv || !p) return 'Papan usaha belum siap.';
      const naik = [];
      for (const u of UPGRADE) {
        const lv = up.tingkat(u.id);
        if (lv >= up.maks(u.id)) continue;
        for (const [b, n] of Object.entries(u.bahan)) {
          inv.add(b, Math.max(0, n * (lv + 1) - inv.count(b)));
        }
        const uangAsli = p.money;
        p.money = u.biaya * (lv + 1);          // cukup untuk satu tingkat ini
        const r = up.beliBangunan(u.id, { inv, uang: p.money });
        p.money = uangAsli;                    // cheat ini tidak menagih uang
        if (r) naik.push(`${u.nama} ${r.level}/${up.maks(u.id)}`);
      }
      terapkan();
      return naik.length ? naik.join(' · ') : 'Semua bangunan sudah tertinggi.';
    },

    KeyH: () => {
      const p = state?.player;
      if (!p) return 'Pemain belum siap.';
      const maks = p.maxEnergy ?? 100;
      p.energy = maks;
      return `Energi penuh (${maks})`;
    },

    /**
     * Semua kendaraan dianggap sudah dimiliki. `beli()` menolak kalau diamond
     * kurang, jadi saldonya dititipkan sebentar lalu dikembalikan: kepemilikan
     * tetap tercatat lewat jalur yang sama (dan kendaraan terakhir langsung
     * dipakai), tanpa memberi diamond gratis yang tidak diminta.
     */
    KeyM: () => {
      const ken = state?.kendaraan;
      const d = state?.diamond;
      if (!ken || !d) return 'Kendaraan belum siap.';
      const simpanJumlah = d.jumlah;
      const baru = [];
      for (const k of KENDARAAN) {
        if (ken.punya(k.id)) continue;
        d.jumlah = k.harga;
        const r = ken.beli(k.id, { diamond: d });
        if (r && !r.gagal) baru.push(k.nama);
      }
      d.jumlah = simpanJumlah;
      terapkan();
      return baru.length ? `Diberi: ${baru.join(', ')}` : 'Semua kendaraan sudah dimiliki.';
    },

    KeyU: () => {
      const t = state?.time;
      if (!t) return 'Waktu belum siap.';
      t.skip(60);
      return `Maju 1 jam — ${t.clockText}`;
    },

    KeyP: () => {
      const t = state?.time;
      if (!t) return 'Waktu belum siap.';
      t.debugNextSeason();
      return 'Musim berganti';
    },

    KeyY: () => {
      simpan();
      return 'Permainan disimpan';
    },
  };

  const jalankan = (kode) => {
    const fn = efek[kode];
    if (!fn) return null;
    let pesan;
    try { pesan = fn(); } catch (e) { pesan = `Gagal: ${e.message}`; console.error('[debug]', e); }
    riwayat.push({ kode, pesan });
    if (riwayat.length > 40) riwayat.shift();
    toast(`[debug] ${pesan}`);
    return pesan;
  };

  /** Hanya pasang tombol untuk kode yang benar-benar ada efeknya. */
  for (const k of KODE_DEBUG) {
    const fn = efek[k.tombol];
    if (!fn) continue;
    lepas.push(onPintas((kode) => { if (kode === k.tombol) jalankan(kode); }));
  }

  return {
    dipasang: KODE_DEBUG.filter((k) => efek[k.tombol]).map((k) => k.tombol),
    riwayat,
    jalankan,
    /** Lepas semua pendengar (dipakai uji supaya tidak menumpuk). */
    lepas() { for (const f of lepas) f(); lepas.length = 0; },
  };
}
