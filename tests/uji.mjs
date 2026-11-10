// Rangkaian uji lama (85 pemeriksaan) sempat dihapus saat repo diganti isi Drive.
// Berkas ini memulihkan inti yang paling penting + menambah uji untuk perbaikan
// papan Ragam Usaha, supaya tidak ada yang bisa kembali tanpa ketahuan.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(ROOT, p), 'utf8');

let lulus = 0, gagal = 0;
const ok = (nama, syarat, info = '') => {
  if (syarat) { lulus++; }
  else { gagal++; console.error(`  GAGAL: ${nama}${info ? ' — ' + info : ''}`); }
};
const sama = (nama, a, b) => ok(nama, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const ilmu = JSON.parse(baca('src/data/ilmu.json'));
const { UPGRADE, NAMA_BAHAN } = await import(join(ROOT, 'src/systems/upgrade.js'));
const { Inventory, setItemData } = await import(join(ROOT, 'src/systems/inventory.js'));
// Tanpa data item, tumpukan bawaannya 1, jadi 25 batu tidak muat di 24 slot —
// dan uji ini akan gagal karena alasannya salah, bukan karena kodenya salah.
setItemData(JSON.parse(baca('src/data/items.json')));

// ---------------------------------------------------------------- data soal
const ids = ilmu.kitab.map((b) => b.id);
sama('30 bab', ilmu.kitab.length, 30);
ok('id bab unik', new Set(ids).size === ids.length);
sama('kelas hanya X/XI/XII', [...new Set(ilmu.kitab.map((b) => b.kelas))].sort(), ['X', 'XI', 'XII']);
let totalSoal = 0;
for (const id of ids) {
  const bank = ilmu.ujian[id] ?? [];
  totalSoal += bank.length;
  ok(`${id}: ada soal`, bank.length > 0, `${bank.length}`);
  bank.forEach((s, i) => {
    ok(`${id}#${i + 1} kunci sah`, Number.isInteger(s.kunci) && s.kunci >= 0 && s.kunci < s.pilihan.length);
    ok(`${id}#${i + 1} ada pembahasan`, typeof s.bahas === 'string' && s.bahas.length > 3);
    ok(`${id}#${i + 1} pilihan unik`, new Set(s.pilihan).size === s.pilihan.length);
  });
}
sama('900 soal ujian', totalSoal, 900);

// ------------------------------------------------------- pembagian bab ke guru
for (const [k, daftar] of [['X', 12], ['XI', 10], ['XII', 8]]) {
  const babKelas = ilmu.kitab.filter((b) => b.kelas === k).map((b) => b.id);
  sama(`kelas ${k}: jumlah bab`, babKelas.length, daftar);
  const diajar = Object.values(ilmu.keahlian.ajar[k]).flat();
  sama(`kelas ${k}: semua bab diajar sekali`, [...diajar].sort(), [...babKelas].sort());
}

// ---------------------------------------------------------------- alat
const syarat = ilmu.keahlian.syarat;
for (const k of ['X', 'XI', 'XII']) {
  const babAlat = Object.values(syarat[k]);
  ok(`${k}: alat tidak berebut bab`, new Set(babAlat).size === babAlat.length);
  for (const id of babAlat) ok(`${k}: bab alat ${id} milik kelas itu`, ilmu.kitab.find((b) => b.id === id)?.kelas === k);
}

// -------------------------------------------------------- papan Ragam Usaha
sama('7 peningkatan', UPGRADE.length, 7);
for (const u of UPGRADE) {
  for (const k of ['X', 'XI', 'XII']) {
    const id = u.bab[k];
    ok(`${u.judul} (${k}) punya bab`, !!id);
    ok(`${u.judul} (${k}) bab kelas ${k}`, ilmu.kitab.find((b) => b.id === id)?.kelas === k, id);
  }
  ok(`${u.judul}: batas tingkat >= 1`, (u.perTingkat ?? 1) >= 1);
  ok(`${u.judul}: efek fungsi`, typeof u.efek === 'function');
  ok(`${u.judul}: ada bahan`, Object.keys(u.bahan ?? {}).length > 0);
  ok(`${u.judul}: bahan dikenal`, Object.keys(u.bahan).every((b) => NAMA_BAHAN[b]), Object.keys(u.bahan).join(','));
  ok(`${u.judul}: tanpa label alat palsu`, !u.alat || u.alat === 'beliung', String(u.alat));
  for (const k of ['X', 'XI', 'XII']) {
    const id = u.bab[k];
    if (!id) continue;
    // Papan boleh berbagi bab dengan pembuka alat, tapi hanya kalau memang tidak
    // ada bab bebas lagi. Diukur di tools/periksa-data.mjs; di sini cukup pastikan
    // tidak ada bab dipakai dua papan di kelas yang sama.
    const lain = UPGRADE.filter((v) => v.id !== u.id && v.bab[k] === id);
    ok(`${u.judul} (${k}): bab tidak dipakai papan lain`, lain.length === 0, lain.map((v) => v.judul).join(','));
  }
}

// ------------------------------------------------- status() + alasanTidakBoleh
const kelasDari = (id) => ilmu.kitab.find((b) => b.id === id)?.kelas ?? 'X';
const tasDengan = (isi) => {
  const inv = new Inventory();
  for (const [id, n] of Object.entries(isi)) inv.add(id, n);
  return inv;
};
const palsu = (lulus = [], tingkat = 0, uang = 0, isi = {}) => ({
  ilmu: {
    lulus: new Set(lulus),
    kitab: (id) => ilmu.kitab.find((b) => b.id === id) ?? null,
    nomorBab: (id) => ids.filter((x) => kelasDari(x) === kelasDari(id)).indexOf(id) + 1,
    alatUntukBab: (id) => {
      const k = kelasDari(id);
      const a = Object.keys(ilmu.keahlian.syarat[k]).find((x) => ilmu.keahlian.syarat[k][x] === id);
      return a ? ({ hoe: 'cangkul', water: 'penyiram', axe: 'kapak', pickaxe: 'beliung', scythe: 'sabit', fish: 'pancing' })[a] : null;
    },
    guruBab: (id) => {
      for (const [npc, daftar] of Object.entries(ilmu.keahlian.ajar[kelasDari(id)] ?? {})) {
        if (daftar.includes(id)) return { npcId: npc, nama: ilmu.npcNama[npc], urutan: daftar.indexOf(id) + 1 };
      }
      return null;
    },
  },
  inv: tasDengan(isi),
  tingkatKelas: (k) => k,
  uang: () => uang,
});
const up = new (await import(join(ROOT, 'src/systems/upgrade.js'))).Upgrade();

// Alat-alat yang dipakai uji ini bergantung pada pemetaan bab syarat; ambil dari data.
const babBibitX = UPGRADE.find((u) => u.id === 'bibit').bab.X;
const st1 = up.status('rumah', palsu([], 0, 0));
ok('status: ada judul bab syarat', typeof st1.judulBabInti === 'string' && st1.judulBabInti.length > 0);
ok('status: ada guru', !!st1.guru?.nama, JSON.stringify(st1.guru));
ok('status: perlu = bahan tingkat 1', JSON.stringify(st1.perlu) === JSON.stringify(UPGRADE.find((u) => u.id === 'rumah').bahan));
const st2 = up.status('rumah', palsu([], 0, 0));
ok('alasan menyebut bab dan guru', /Bab [IVX]+.*— ujian ke /.test(up.alasanTidakBoleh(st2)), up.alasanTidakBoleh(st2));
const st3 = up.status('rumah', palsu(ids.slice(0, 12), 0, 0));
ok('alasan menyebut bahan yang kurang', /Kurang .*batu/.test(up.alasanTidakBoleh(st3)), up.alasanTidakBoleh(st3));
ok('nama bahan tidak muncul sebagai id mentah', !/stone|wood/.test(up.alasanTidakBoleh(st3)), up.alasanTidakBoleh(st3));
// Bahan harus benar-benar ada di tas dulu, kalau tidak urutannya berhenti di bahan.
// Jumlahnya persis kebutuhan — menaruh 9999 tidak muat di 24 slot (tumpukan 99),
// jadi tasnya akan diam-diam menolak dan uji ini gagal karena sebab yang salah.
const bahanRumah = UPGRADE.find((u) => u.id === 'rumah').bahan;
const st4 = up.status('rumah', palsu(ids, 0, 0, bahanRumah));
ok('alasan menyebut uang kalau bahan cukup', /Uangnya kurang G[\d.]+/.test(up.alasanTidakBoleh(st4)), up.alasanTidakBoleh(st4));
up.level.rumah = up.maks('rumah');
const st5 = up.status('rumah', palsu(ids, 0, 99999));
// Papan menampilkan "Sudah pada tingkat tertinggi." — itu jawaban yang benar,
// bukan alasan kosong. Yang penting: tidak lagi menyebut bab atau bahan.
ok('penuh: alasan menyebut tingkat tertinggi', /tertinggi/.test(up.alasanTidakBoleh(st5)), up.alasanTidakBoleh(st5));
ok('penuh: tidak menyebut bab/bahan', !/Bab|Kurang/.test(up.alasanTidakBoleh(st5)), up.alasanTidakBoleh(st5));

// --------------------------------------------------- kalimat syarat yang lengkap
// Yang diuji bukan sekadar "ada alasan", tetapi isi kalimat yang benar-benar
// dibaca murid: harus menyebut nomor bab, judul bab, nama guru, dan — kalau bab
// itu juga bab pembuka alat — nama alatnya dalam bahasa Indonesia.
const { Ilmu } = await import(join(ROOT, 'src/systems/ilmu.js'));
const ilmuAsli = new Ilmu(ilmu);
ilmuAsli.tingkat = 'XII';
ilmuAsli.lulus = new Set();
const up2 = new (await import(join(ROOT, 'src/systems/upgrade.js'))).Upgrade();
const stRumah = up2.status('rumah', {
  ilmu: ilmuAsli, inv: tasDengan({}), uang: () => 0, tingkatKelas: 'XII',
});
const kalimat = up2.alasanTidakBoleh(stRumah);
ok('XII rumah: menyebut nomor bab', /Bab [IVX]+/.test(kalimat), kalimat);
ok('XII rumah: menyebut judul bab', kalimat.includes(stRumah.judulBabInti), kalimat);
ok('XII rumah: menyebut nama guru', /ujian ke \S/.test(kalimat), kalimat);
ok('XII rumah: menyebut alat dengan nama Indonesia', /kapak/.test(kalimat), kalimat);
ok('XII rumah: tidak membocorkan id alat', !/\baxe\b|\bhoe\b|pickaxe|scythe/.test(kalimat), kalimat);

for (const k of ['X', 'XI', 'XII']) {
  ilmuAsli.tingkat = k;
  for (const u of UPGRADE) {
    const st = up2.status(u.id, { ilmu: ilmuAsli, inv: tasDengan({}), uang: () => 0, tingkatKelas: k });
    const t = up2.alasanTidakBoleh(st);
    ok(`${k} ${u.id}: guru ditemukan`, !!st.guru, `${u.id}/${k}`);
    ok(`${k} ${u.id}: kalimat <= 160 huruf`, t.length <= 160, `${t.length}: ${t}`);
  }
}

// ------------------------------------------------------------------ diamond
//
// Aturan yang diminta pemain: lulus satu bab = +1 diamond, dan MENGULANG bab
// yang sama juga +1 lagi. Uji ini mengunci dua hal yang mudah rusak tanpa
// ketahuan: hadiahnya tidak boleh dobel dalam satu ujian, dan tidak boleh
// memberi apa pun kalau tidak lulus.
{
  const { Diamond, DIAMOND_PER_LULUS } = await import(join(ROOT, 'src/systems/diamond.js'));

  ok('diamond: hadiah per lulus = 1', DIAMOND_PER_LULUS === 1, String(DIAMOND_PER_LULUS));

  const d = new Diamond();
  sama('diamond: pemain baru mulai dari 0', d.jumlah, 0);

  sama('diamond: tidak lulus -> 0 hadiah', d.hadiahLulus(false), 0);
  sama('diamond: gagal tidak menambah apa pun', d.jumlah, 0);

  sama('diamond: lulus -> +1', d.hadiahLulus(true), 1);
  sama('diamond: jumlah jadi 1', d.jumlah, 1);

  // Diulang: bab yang SAMA, dan tetap dapat.
  sama('diamond: ulang bab yang sama tetap +1', d.hadiahLulus(true), 1);
  sama('diamond: jumlah jadi 2 setelah ulang', d.jumlah, 2);
  sama('diamond: sepuluh kali lulus jadi 12', (Array.from({ length: 10 }, () => d.hadiahLulus(true)), d.jumlah), 12);

  // Simpanan lama tidak punya field ini sama sekali: harus jadi 0, bukan NaN.
  const lama = new Diamond();
  lama.load(undefined);
  sama('diamond: simpanan lama tanpa data -> 0', lama.jumlah, 0);
  sama('diamond: simpanan rusak (NaN) -> 0', (lama.load({ jumlah: 'bukan angka' }), lama.jumlah), 0);
  sama('diamond: simpanan negatif dijepit ke 0', (lama.load({ jumlah: -5 }), lama.jumlah), 0);
  sama('diamond: simpanan pecahan dibulatkan ke bawah', (lama.load({ jumlah: 3.9 }), lama.jumlah), 3);

  // Simpan -> muat -> tetap sama.
  const d2 = new Diamond(7);
  sama('diamond: toJSON hanya menyimpan angka', d2.toJSON(), { jumlah: 7 });
  const d3 = new Diamond();
  d3.load(JSON.parse(JSON.stringify(d2)));            // lewat JSON, seperti di localStorage
  sama('diamond: muat ulang tidak menghilangkan jumlah', d3.jumlah, 7);

  // `terakhir` dipakai layar hasil untuk menulis "+1". Gagal harus mengosongkannya,
  // kalau tidak layar menulis "+1" untuk ujian yang tidak lulus.
  const d4 = new Diamond();
  d4.hadiahLulus(true);
  sama('diamond: terakhir = 1 setelah lulus', d4.terakhir, 1);
  d4.hadiahLulus(false);
  sama('diamond: terakhir dikosongkan setelah gagal', d4.terakhir, 0);

  // Jalur di main.js: hadiah diberikan TEPAT SEKALI per onLulus, dan disimpan
  // segera. Diperiksa dari sumber karena main.js butuh kanvas untuk dijalankan.
  const mainSumber = baca('src/main.js');
  ok('main: hadiah diberikan di jalur onLulus', /state\.diamond\.hadiahLulus\(/.test(mainSumber));
  ok('main: hadiah disimpan segera setelah didapat',
    /if \(dapat\) \{\s*\n\s*saveGame\(\);/.test(mainSumber), 'saveGame tidak langsung dipanggil');
  ok('main: hadiah tidak bergantung pada keberhasilan kirim nilai',
    mainSumber.indexOf('state.diamond.hadiahLulus(') < mainSumber.indexOf('return kirimNilai({'),
    'hadiah diberikan setelah kirimNilai');
  ok('main: diamond ikut tersimpan', /diamond: state\.diamond\.toJSON\(\)/.test(mainSumber));
  ok('main: diamond ikut dimuat', /state\.diamond\.load\(save\.diamond\)/.test(mainSumber));

  // HUD menggambar dua baris: ikon diamond di atas koin.
  const hudSumber = baca('src/ui/hud.js');
  ok('hud: menggambar ikon diamond', /icon\(ctx, 'ui_diamond'/.test(hudSumber));
  ok('hud: ikon diamond di ATAS ikon koin',
    hudSumber.indexOf("icon(ctx, 'ui_diamond'") < hudSumber.indexOf("icon(ctx, 'ui_coin'"),
    'urutan baris terbalik');
  ok('hud: panel kanan atas cukup tinggi untuk dua baris',
    /GOLD_TINGGI = 56/.test(hudSumber), 'tinggi panel bukan 56');

  // Aset: ikonnya harus ada di manifest, kalau tidak panel diamond kosong tanpa error.
  const manifest = JSON.parse(baca('assets/manifest.json'));
  ok('aset: ui_diamond terdaftar', !!manifest.sprites.ui_diamond, JSON.stringify(manifest.sprites.ui_diamond ?? null));
  sama('aset: ui_diamond berbingkai 24x24', manifest.sprites.ui_diamond?.frame, [24, 24]);
  ok('aset: berkas ui_diamond ada', /^PNG/.test(readFileSync(join(ROOT, 'assets/sprites/ui/ui_diamond.png')).subarray(1, 4).toString('latin1'))
    || readFileSync(join(ROOT, 'assets/sprites/ui/ui_diamond.png')).length > 100);
}

// ------------------------------------------------------------------ laporan
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
