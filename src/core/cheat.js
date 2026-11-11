// Kode debug: cara cepat menguji permainan tanpa mengumpulkan gold dan diamond
// dengan bermain dulu.
//
// HANYA HIDUP DI MODE DEBUG (lihat main.js). Alasannya bukan kerapian: dengan
// 1.000 diamond seluruh ekonomi permainan bisa ditembus, dan nilai ujian yang
// dibelanjakan dari situ tidak sah. Karena itu pemasangan kode ini ditaruh DI
// DALAM blok debug, dan tests/uji.mjs mengunci dua arah — harus ada di dalam,
// dan tidak boleh ada pemanggilan di luarnya.
//
// DUA jalan masuk, dan yang kedua adalah yang utama:
//
//   1. PERINTAH KETIK — `/gold 1000`, `/diamond 1000`, … lewat F2 atau `/`.
//      Ini jalan yang diandalkan. Ctrl+D dan Ctrl+G TIDAK bisa diandalkan:
//      keduanya pintasan peramban (tandai halaman / cari berikutnya), dan Chrome
//      boleh menelannya sebelum halaman sempat mencegahnya. Perintah ketik tidak
//      bergantung pada belas kasihan peramban, dan bisa diberi angka.
//   2. PINTASAN Ctrl+<tombol> — tetap ada sebagai alias cepat saat kebetulan
//      berhasil, tetapi BUKAN satu-satunya jalan.
//
// Semua efek lewat jalur permainan yang sama dengan pemain biasa:
// `Upgrade.beliBangunan` + `terapkanUpgrade`, `Inventory.add`, `Diamond.tambah`,
// `Ilmu.lulusUjian`, `Kendaraan.beli`. Tidak ada yang menulis keadaan langsung.
// Bedanya, cheat ini memberi bahannya lebih dulu (atau mengabaikan harga), jadi
// hasilnya selalu keadaan yang bisa dicapai dengan bermain — dan bug yang
// sedang dicari tetap muncul, bukan tertutup oleh keadaan mustahil.
import { UPGRADE, NAMA_BAHAN } from '../systems/upgrade.js';
import { KENDARAAN } from '../systems/kendaraan.js';

/** Bahan yang dibagikan `/bahan`, urut seperti di papan Ragam Usaha. */
export const BAHAN_DEBUG = Object.keys(NAMA_BAHAN);
export const JUMLAH_BAHAN = 50;
export const JUMLAH_UANG = 1000;
export const JUMLAH_DIAMOND = 1000;

/** Batas angka perintah. Bukan pembatasan permainan — jaring pengaman supaya
 *  salah ketik (`/gold 99999999999`) tidak membuat HUD kehilangan tempat. */
export const MAKS_ANGKA = 999999;

/** 1000 -> '1.000' (titik ribuan, seperti HUD dan papan usaha). */
const rb = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Daftar perintah — SATU sumber untuk baris perintah, panel F1, dan uji.
 *
 * `nama`   : yang diketik sesudah garis miring.
 * `angka`  : 'wajib' | 'boleh' | 'tidak'.
 * `bawaan` : dipakai kalau angka tidak diketik (hanya untuk `angka: 'boleh'`).
 * `tombol` : pintasan Ctrl sebagai alias (boleh kosong). Sengaja TIDAK ada
 *            Ctrl+D / Ctrl+G sebagai satu-satunya jalan — lihat catatan di atas.
 * `jalankan(ctx, n)` : `n` sudah berupa angka yang sah (atau null).
 */
export const PERINTAH_DEBUG = [
  {
    nama: 'gold', angka: 'boleh', bawaan: JUMLAH_UANG, tombol: 'KeyG',
    judul: 'Tambah gold', catatan: 'uang pemain bertambah n (bawaan 1.000)',
    jalankan: (ctx, n) => {
      const p = ctx.state?.player;
      if (!p) return 'Pemain belum siap.';
      p.money = Math.max(0, (p.money ?? 0) + n);
      return `+${rb(n)} gold — sekarang ${rb(p.money)}`;
    },
  },
  {
    nama: 'diamond', angka: 'boleh', bawaan: JUMLAH_DIAMOND, tombol: 'KeyD',
    judul: 'Tambah diamond', catatan: 'untuk mencoba papan Ragam Usaha',
    jalankan: (ctx, n) => {
      const d = ctx.state?.diamond;
      if (!d) return 'Diamond belum siap.';
      // Lewat tambah() supaya batas bawah 0 dan pembulatan tetap satu sumber.
      d.tambah(n);
      return `+${rb(n)} diamond — sekarang ${rb(d.jumlah)}`;
    },
  },
  {
    nama: 'bahan', angka: 'boleh', bawaan: JUMLAH_BAHAN, tombol: 'KeyB',
    judul: 'Tambah bahan', catatan: `${BAHAN_DEBUG.length} jenis sekaligus`,
    /**
     * `add()` mengembalikan SISA yang tidak muat, bukan berhasil/gagal —
     * membaca hasilnya sebagai boolean membuat pesan ini berbohong justru saat
     * semua bahan masuk. Pesannya karena itu menyebut berapa yang tertinggal.
     */
    jalankan: (ctx, n) => {
      const inv = ctx.state?.inv;
      if (!inv) return 'Tas belum siap.';
      let sisa = 0;
      for (const id of BAHAN_DEBUG) sisa += inv.add(id, n) ?? 0;
      if (sisa > 0) return `Tas penuh: ${sisa} bahan tidak muat.`;
      return `+${rb(n)} tiap bahan (${BAHAN_DEBUG.length} jenis)`;
    },
  },
  {
    nama: 'bab', angka: 'boleh', bawaan: 1, tombol: 'KeyK',
    judul: 'Buka n bab', catatan: 'bab berikutnya yang belum lulus',
    jalankan: (ctx, n) => {
      const ilmu = ctx.state?.ilmu;
      if (!ilmu) return 'Ilmu belum siap.';
      let buka = 0;
      for (let i = 0; i < n; i++) {
        const id = ilmu.babTerbuka?.();
        if (!id) break;
        ilmu.lulusUjian(id);
        buka += 1;
      }
      if (!buka) return 'Semua bab sudah lulus.';
      return `${buka} bab dibuka`;
    },
  },
  {
    nama: 'babsemua', angka: 'tidak', tombol: 'KeyL',
    judul: 'Buka semua bab', catatan: 'semua bab kelas yang sedang dipakai',
    jalankan: (ctx) => {
      const ilmu = ctx.state?.ilmu;
      const daftar = ilmu?.semua?.() ?? [];
      if (!daftar.length) return 'Belum ada bab untuk kelas ini.';
      let n = 0;
      for (const b of daftar) if (!ilmu.lulus.has(b.id)) { ilmu.lulusUjian(b.id); n += 1; }
      return n ? `${n} bab dibuka` : 'Semua bab kelas ini sudah lulus.';
    },
  },
  {
    nama: 'tingkat', angka: 'boleh', bawaan: 1, tombol: 'KeyJ',
    judul: 'Bangunan naik n tingkat', catatan: 'tanpa bahan dan tanpa uang',
    /**
     * Bahannya diberikan lebih dulu, lalu dibeli lewat `beliBangunan` — bukan
     * dengan menaikkan `level` langsung. Dengan begitu pengurangan bahan,
     * `pakaiUang`, dan efek (energi maks, slot tas/peti, ternak) tetap terjadi
     * di jalur yang sama seperti pemain yang menekan E di papan.
     */
    jalankan: (ctx, n) => {
      const up = ctx.state?.upgrade;
      const inv = ctx.state?.inv;
      const p = ctx.state?.player;
      if (!up || !inv || !p) return 'Papan usaha belum siap.';
      const naik = [];
      let ada = 0;
      for (const u of UPGRADE) {
        for (let i = 0; i < n; i++) {
          const lv = up.tingkat(u.id);
          if (lv >= up.maks(u.id)) break;
          for (const [b, butuh] of Object.entries(u.bahan)) {
            inv.add(b, Math.max(0, butuh * (lv + 1) - inv.count(b)));
          }
          const uangAsli = p.money;
          p.money = u.biaya * (lv + 1);        // cukup untuk satu tingkat ini
          const r = up.beliBangunan(u.id, { inv, uang: p.money });
          p.money = uangAsli;                  // cheat ini tidak menagih uang
          if (!r) break;
          ada += 1;
        }
        naik.push(`${u.nama} ${up.tingkat(u.id)}/${up.maks(u.id)}`);
      }
      ctx.terapkan?.();
      return ada ? naik.join(' · ') : 'Semua bangunan sudah tertinggi.';
    },
  },
  {
    nama: 'energi', angka: 'tidak', tombol: 'KeyH',
    judul: 'Energi penuh', catatan: 'sampai batas energi maksimum sekarang',
    jalankan: (ctx) => {
      const p = ctx.state?.player;
      if (!p) return 'Pemain belum siap.';
      const maks = p.maxEnergy ?? 100;
      p.energy = maks;
      return `Energi penuh (${maks})`;
    },
  },
  {
    nama: 'kendaraan', angka: 'tidak', tombol: 'KeyM',
    judul: 'Beri semua kendaraan', catatan: 'sepeda, motor, truk — tanpa diamond',
    /**
     * `beli()` menolak kalau diamond kurang, jadi saldonya dititipkan sebentar
     * lalu dikembalikan: kepemilikan tetap tercatat lewat jalur yang sama (dan
     * kendaraan terakhir langsung dipakai), tanpa memberi diamond gratis yang
     * tidak diminta.
     */
    jalankan: (ctx) => {
      const ken = ctx.state?.kendaraan;
      const d = ctx.state?.diamond;
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
      ctx.terapkan?.();
      return baru.length ? `Diberi: ${baru.join(', ')}` : 'Semua kendaraan sudah dimiliki.';
    },
  },
  {
    nama: 'jam', angka: 'boleh', bawaan: 1, tombol: 'KeyU',
    judul: 'Maju n jam', catatan: 'jadwal warga dan lampu malam ikut jalan',
    jalankan: (ctx, n) => {
      const t = ctx.state?.time;
      if (!t) return 'Waktu belum siap.';
      t.skip(60 * n);
      return `Maju ${n} jam — ${t.clockText}`;
    },
  },
  {
    nama: 'musim', angka: 'tidak', tombol: 'KeyP',
    judul: 'Ganti musim', catatan: 'langsung ke musim berikutnya',
    jalankan: (ctx) => {
      const t = ctx.state?.time;
      if (!t) return 'Waktu belum siap.';
      t.debugNextSeason();
      return 'Musim berganti';
    },
  },
  {
    nama: 'simpan', angka: 'tidak', tombol: 'KeyY',
    judul: 'Simpan sekarang', catatan: 'tanpa harus tidur',
    jalankan: (ctx) => {
      ctx.simpan?.();
      return 'Permainan disimpan';
    },
  },
];

/**
 * Urai satu baris perintah: `/gold 1000` -> { perintah, angka, galat }.
 *
 * Mengembalikan `perintah: null` kalau barisnya tidak diawali garis miring
 * (itu obrolan biasa, bukan perintah) atau kosong. `galat` berisi kalimat
 * Indonesia siap ditampilkan — baris perintah tidak boleh diam saja ketika
 * salah ketik, karena pemain akan mengira cheatnya rusak.
 */
export function uraiPerintah(baris) {
  const teks = String(baris ?? '').trim();
  if (!teks.startsWith('/')) return { perintah: null, angka: null, galat: '' };
  const bagian = teks.slice(1).trim().split(/\s+/);
  const nama = (bagian.shift() ?? '').toLowerCase();
  if (!nama) return { perintah: null, angka: null, galat: 'Ketik nama perintah, mis. /gold 1000' };
  const def = PERINTAH_DEBUG.find((p) => p.nama === nama);
  if (!def) {
    const mirip = PERINTAH_DEBUG.map((p) => p.nama).join(', ');
    return { perintah: null, angka: null, galat: `Tidak ada perintah /${nama}. Ada: ${mirip}` };
  }
  const sisa = bagian.join(' ').trim();

  if (def.angka === 'tidak') {
    return sisa ? { perintah: def, angka: null, galat: `/${nama} tidak memakai angka.` } : { perintah: def, angka: null, galat: '' };
  }
  if (!sisa) {
    if (def.angka === 'wajib') return { perintah: def, angka: null, galat: `/${nama} perlu angka, mis. /${nama} 100.` };
    return { perintah: def, angka: def.bawaan, galat: '' };
  }
  // Hanya bilangan bulat. Angka desimal dan huruf ditolak dengan terang —
  // menerimanya setengah-setengah membuat "/gold 1e9" menjadi gold yang tidak
  // pernah bisa dicapai dengan bermain.
  if (!/^-?\d+$/.test(sisa)) {
    return { perintah: def, angka: null, galat: `Angka /${nama} harus bilangan bulat, bukan "${sisa}".` };
  }
  const n = Number(sisa);
  if (!Number.isFinite(n) || Math.abs(n) > MAKS_ANGKA) {
    return { perintah: def, angka: null, galat: `Angka /${nama} di luar batas (maks ${rb(MAKS_ANGKA)}).` };
  }
  return { perintah: def, angka: n, galat: '' };
}

/**
 * Pasang kode debug.
 *
 * `state`   — keadaan permainan (main.js), dibaca langsung.
 * `toast`   — fungsi pesan singkat di layar.
 * `terapkan`— terapkan efek peningkatan (main.js: terapkanUpgrade).
 * `simpan`  — simpan permainan (main.js: saveGame).
 * `pintasan`— pasang alias Ctrl+<tombol>? (boleh dimatikan di uji)
 *
 * Mengembalikan `{ dipasang, riwayat, jalankan, ketik }`. `jalankan(tombol)`
 * menjalankan satu alias Ctrl; `ketik(baris)` menjalankan satu baris perintah.
 */
export function pasangKodeDebug({
  state, toast = () => {}, terapkan = () => {}, simpan = () => {}, pintasan = true,
} = {}) {
  const riwayat = [];
  const lepas = [];
  const ctx = { state, terapkan, simpan };

  const catat = (asal, pesan) => {
    riwayat.push({ asal, pesan });
    if (riwayat.length > 40) riwayat.shift();
    toast(`[debug] ${pesan}`);
    return pesan;
  };

  /** Jalankan satu definisi perintah dengan angka yang sudah sah. */
  const eksekusi = (def, n, asal) => {
    let pesan;
    try { pesan = def.jalankan(ctx, n) ?? ''; } catch (e) { pesan = `Gagal: ${e.message}`; console.error('[debug]', e); }
    return catat(asal, pesan);
  };

  /** Jalankan satu baris perintah (`/gold 1000`). Mengembalikan pesan atau null. */
  const ketik = (baris) => {
    const { perintah, angka, galat } = uraiPerintah(baris);
    if (galat) return catat(baris.trim(), galat);
    if (!perintah) return null;             // bukan perintah: biarkan jadi obrolan
    return eksekusi(perintah, angka, `/${perintah.nama}`);
  };

  /** Jalankan alias Ctrl berdasarkan kode tombol ('KeyG'). */
  const jalankan = (kode) => {
    const def = PERINTAH_DEBUG.find((p) => p.tombol === kode);
    if (!def) return null;
    const n = def.angka === 'tidak' ? null : (def.bawaan ?? 1);
    return eksekusi(def, n, def.tombol);
  };

  if (pintasan) {
    // Dimuat malas: core/input.js memasang pendengar `window` saat modulnya
    // dibaca, dan uji Node tidak punya window. Alias Ctrl memang tidak diuji
    // di sini (itu tugas uji asap peramban) — perintah ketik yang diuji.
    import('./input.js').then(({ onPintas }) => {
      for (const p of PERINTAH_DEBUG) {
        if (!p.tombol) continue;
        lepas.push(onPintas((kode) => { if (kode === p.tombol) jalankan(kode); }));
      }
    }).catch(() => { /* tanpa peramban: alias Ctrl memang tidak ada */ });
  }

  return {
    dipasang: PERINTAH_DEBUG.map((p) => p.nama),
    riwayat,
    jalankan,
    ketik,
    /** Lepas semua pendengar (dipakai uji supaya tidak menumpuk). */
    lepas() { for (const f of lepas) f(); lepas.length = 0; },
  };
}
