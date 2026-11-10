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

// --------------------------------------------------- papan usaha: kendaraan
//
// Papan itu sekarang menjual KENDARAAN dengan diamond — bukan rumah/dapur
// dengan uang dan bahan. Yang diuji: jumlahnya, harganya masuk akal, tidak ada
// syarat bab yang tertinggal, dan datanya SATU sumber dengan systems/kendaraan.js.
{
  const { KENDARAAN } = await import(join(ROOT, 'src/systems/kendaraan.js'));

  sama('papan: 3 kendaraan', UPGRADE.length, 3);
  sama('papan: id sama dengan daftar kendaraan', UPGRADE.map((u) => u.id), KENDARAAN.map((k) => k.id));
  sama('papan: harga sama dengan daftar kendaraan', UPGRADE.map((u) => u.harga), KENDARAAN.map((k) => k.harga));

  // Harga yang dipilih pemain: 10 / 25 / 50 diamond. Truk harus paling mahal,
  // kalau tidak tarikan "mengerjakan soal" hilang.
  sama('papan: harga 10 / 25 / 50 diamond', KENDARAAN.map((k) => k.harga), [10, 25, 50]);
  ok('papan: truk paling mahal', KENDARAAN.at(-1).harga === Math.max(...KENDARAAN.map((k) => k.harga)));

  for (const k of KENDARAAN) {
    ok(`${k.id}: ada nama & judul`, !!k.nama && !!k.judul);
    ok(`${k.id}: ada kalimat guna`, typeof k.guna === 'string' && k.guna.length > 10, k.guna);
    ok(`${k.id}: lebih cepat dari jalan kaki`, k.cepat > 1, String(k.cepat));
    ok(`${k.id}: slot tas tidak negatif`, (k.slotTas ?? 0) >= 0);
    // Tidak boleh ada sisa syarat bab / bahan / uang dari versi lama.
    ok(`${k.id}: tidak lagi punya syarat bab`, k.bab === undefined);
    ok(`${k.id}: tidak lagi butuh bahan`, k.bahan === undefined);
    ok(`${k.id}: tidak lagi butuh uang`, k.biaya === undefined);
  }

  // Tiap kendaraan harus terasa berbeda — bukan tiga salinan dengan harga beda.
  const ragam = new Set(KENDARAAN.map((k) => `${k.cepat}|${k.slotTas ?? 0}`));
  sama('papan: tiap kendaraan punya efek berbeda', ragam.size, 3);
  ok('papan: hanya truk yang menambah slot tas', KENDARAAN.filter((k) => (k.slotTas ?? 0) > 0).length === 1);
  ok('papan: motor yang paling cepat', KENDARAAN.find((k) => k.cepat === Math.max(...KENDARAAN.map((x) => x.cepat))).id === 'motor');
}

// ---------------------------------------------- status() + alasanTidakBoleh
//
// Status papan sekarang hanya bergantung pada dua hal: berapa diamond yang
// dipunyai, dan kendaraan mana yang sudah dimiliki. Uji ini mengunci keduanya,
// plus janji bahwa pesannya tidak pernah menyebut bab/guru/bahan lagi.
{
  const { Kendaraan } = await import(join(ROOT, 'src/systems/kendaraan.js'));
  const { Diamond } = await import(join(ROOT, 'src/systems/diamond.js'));
  const { Upgrade } = await import(join(ROOT, 'src/systems/upgrade.js'));

  const kend = new Kendaraan();
  const up = new Upgrade(kend);
  const ctxDari = (jumlah) => ({ diamond: () => jumlah, kendaraan: kend });

  const st0 = up.status('truk', ctxDari(0));
  ok('status: harga terbaca dari data', st0.harga === 50, String(st0.harga));
  ok('status: kurang 50 diamond saat saldo 0', st0.kurang === 50, String(st0.kurang));
  ok('status: belum boleh dibeli', st0.boleh === false);
  ok('status: belum punya', st0.punya === false);
  ok('alasan: menyebut jumlah diamond yang kurang', /Kurang 50 diamond/.test(up.alasanTidakBoleh(st0)), up.alasanTidakBoleh(st0));
  ok('alasan: menjelaskan dari mana diamond didapat', /satu bab lulus = 1 diamond/.test(up.alasanTidakBoleh(st0)), up.alasanTidakBoleh(st0));
  ok('alasan: kalimat panjangnya cukup pendek untuk satu baris',
    up.alasanTidakBoleh(st0).length <= 60, `${up.alasanTidakBoleh(st0).length}: ${up.alasanTidakBoleh(st0)}`);
  ok('alasan ringkas tetap menyebut angka', /Kurang 50 diamond/.test(up.alasanTidakBoleh(st0, { ringkas: true })));
  // Sisa versi lama tidak boleh muncul lagi di kalimat mana pun.
  for (const st of [st0, up.status('sepeda', ctxDari(9999))]) {
    const t = `${up.alasanTidakBoleh(st)} ${up.alasanTidakBoleh(st, { ringkas: true })}`;
    ok('alasan: tidak menyebut bab/guru/bahan/uang', !/Bab |ujian ke |batu|kayu|Uangnya/.test(t), t);
  }

  // Cukup uang -> boleh, dan pembelian benar-benar memotong saldo.
  // 30 diamond: cukup untuk sepeda (10), sisa 20 tidak cukup untuk truk (50).
  const d = new Diamond(30);
  const ctx = { diamond: () => d.jumlah, kendaraan: kend };
  const stBoleh = up.status('sepeda', ctx);
  ok('status: boleh dibeli saat diamond cukup', stBoleh.boleh === true);
  const r = up.beli('sepeda', { diamond: d, kendaraan: kend });
  ok('beli: berhasil', !!r && r.id === 'sepeda');
  sama('beli: saldo terpotong 10', d.jumlah, 20);
  sama('beli: kendaraan tercatat dimiliki', kend.dimiliki, ['sepeda']);
  sama('beli: yang baru dibeli langsung dipakai', kend.dipakai, 'sepeda');
  sama('beli: pengali cepat aktif', kend.pengaliCepat(), 2);

  // Tidak boleh beli dua kali, dan tidak boleh beli tanpa uang.
  ok('beli: tidak bisa beli dua kali', up.beli('sepeda', { diamond: d, kendaraan: kend }) === null);
  ok('beli: pesan gagal menyebut sudah punya', /sudah punya/i.test(up.pesanGagal), up.pesanGagal);
  sama('beli: saldo tidak terpotong lagi', d.jumlah, 20);
  ok('beli: ditolak kalau diamond kurang', up.beli('truk', { diamond: d, kendaraan: kend }) === null);
  ok('beli: pesan gagal menyebut kekurangan', /Kurang 30 diamond/.test(up.pesanGagal), up.pesanGagal);
  sama('beli: saldo tetap utuh saat ditolak', d.jumlah, 20);

  // Memakai & menurunkan kendaraan.
  ok('pakai: sepeda dipakai', kend.pakai('sepeda') === true);
  sama('pakai: pengali cepat sepeda', kend.pengaliCepat(), 2);
  ok('pakai: turun = jalan kaki', kend.pakai(null) === true && kend.dipakai === null);
  sama('pakai: jalan kaki pengali 1', kend.pengaliCepat(), 1);
  ok('pakai: tidak bisa memakai yang belum dibeli', kend.pakai('motor') === false);

  // Truk menambah slot tas; kendaraan lain tidak.
  d.tambah(100);
  up.beli('truk', { diamond: d, kendaraan: kend });
  sama('truk: dipakai otomatis setelah dibeli', kend.dipakai, 'truk');
  sama('truk: tas +12', kend.slotTas(), 12);
  kend.pakai('sepeda');
  sama('sepeda: tas kembali 0', kend.slotTas(), 0);

  // Simpanan: hanya id yang dikenal, dan "dipakai" tidak boleh menunjuk barang
  // yang tidak dimiliki — itu yang membuat pemain mendapat efek gratis.
  const k2 = new Kendaraan();
  k2.load({ dimiliki: ['truk', 'bukan-kendaraan'], dipakai: 'motor' });
  sama('muat: id asing dibuang', k2.dimiliki, ['truk']);
  ok('muat: dipakai yang tidak dimiliki diabaikan', k2.dipakai === null);
  k2.load({ dimiliki: ['motor', 'sepeda'], dipakai: 'motor' });
  sama('muat: urutan mengikuti daftar, bukan urutan simpanan', k2.dimiliki, ['sepeda', 'motor']);
  sama('muat: yang dipakai dipertahankan', k2.dipakai, 'motor');
  k2.load(undefined);
  sama('muat: simpanan lama tanpa data -> kosong', k2.dimiliki, []);
}

// ------------------------------------ kendaraan tersambung ke permainan
//
// Tiga sambungan yang mudah putus tanpa ada yang error — dan kalau putus,
// pemain membeli kendaraan tetapi tidak ada yang berubah:
//   1. kecepatan berjalan dikali pengaliCepat()
//   2. slot tas mengikuti slotTas(), dan diterapkan SESUDAH tas dimuat
//   3. kendaraan ikut tersimpan & dimuat
{
  const main = baca('src/main.js');
  ok('main: kecepatan berjalan memakai pengali kendaraan',
    /player\.speed = .*\n?.*pengaliCepat\(\)/.test(main) || /pengaliCepat\(\)/.test(main),
    'pengaliCepat tidak dipakai');
  ok('main: slot tas memakai slotTas() kendaraan', /slotTas\?\.\(\)/.test(main), 'slotTas tidak dipakai');
  ok('main: kendaraan ikut tersimpan', /kendaraan: state\.kendaraan\.toJSON\(\)/.test(main));
  ok('main: kendaraan ikut dimuat', /state\.kendaraan\.load\(/.test(main));
  // Urutan: memuat tas HARUS sebelum menerapkan slot kendaraan, kalau tidak
  // barang ke-25 ke atas hilang saat simpanan dibuka.
  const posLoad = main.indexOf('state.inv.load(');
  const posTerap = main.indexOf('terapkanUpgrade();', posLoad);
  // Dua sisi: ada pemanggilan SESUDAH tas dimuat, dan TIDAK ada pemanggilan
  // tepat sebelumnya. Versi pertama uji ini hanya memeriksa sisi pertama, jadi
  // pemanggilan tambahan sebelum tas dimuat lolos tanpa ketahuan.
  const sebelum = main.slice(Math.max(0, posLoad - 400), posLoad);
  ok('main: efek kendaraan diterapkan sesudah tas dimuat', posLoad > 0 && posTerap > posLoad,
    `load ${posLoad}, terapkan ${posTerap}`);
  ok('main: efek kendaraan tidak diterapkan sebelum tas dimuat',
    !/terapkanUpgrade\(\);/.test(sebelum), 'ada terapkanUpgrade() sebelum state.inv.load');
  // Papan menerima OBJEK diamond, bukan fungsi. Kalau yang dikirim fungsi,
  // `beli()` tidak punya apa pun untuk memotong saldo — dan pembelian selalu
  // ditolak "Kurang N diamond" walau saldonya cukup. Itu pernah terjadi.
  ok('main: papan diberi objek diamond (bukan fungsi)',
    /diamond: state\.diamond,/.test(main) && !/diamond: \(\) => state\.diamond\.jumlah/.test(main),
    'papan masih menerima fungsi, saldo tidak bisa dipotong');
  ok('main: papan diberi kendaraan', /kendaraan: state\.kendaraan,/.test(main));
}

// ------------------------------- beli lewat LAYAR, bukan hanya lewat sistem
//
// Uji sistem di atas memanggil Kendaraan.beli() langsung; itu tidak menangkap
// kesalahan bentuk data antara layar dan sistem (diamond sebagai fungsi vs
// objek). Di sini alurnya dijalankan seperti pemain: tombol E di papan.
{
  const { Kendaraan } = await import(join(ROOT, 'src/systems/kendaraan.js'));
  const { Diamond } = await import(join(ROOT, 'src/systems/diamond.js'));
  const { Upgrade } = await import(join(ROOT, 'src/systems/upgrade.js'));

  const kend = new Kendaraan();
  const d = new Diamond(12);
  const upLayar = new Upgrade(kend);
  // ctx persis seperti yang dikirim main.js
  const ctxLayar = { diamond: d, kendaraan: kend };
  const stLayar = upLayar.status('sepeda', ctxLayar);
  ok('layar: saldo terbaca dari objek diamond', stLayar.saldo === 12, String(stLayar.saldo));
  ok('layar: sepeda boleh dibeli saat saldo 12', stLayar.boleh === true);

  const r = upLayar.beli('sepeda', { diamond: ctxLayar.diamond, kendaraan: ctxLayar.kendaraan });
  ok('layar: pembelian lewat jalur layar berhasil', !!r, JSON.stringify(r));
  sama('layar: diamond terpotong lewat jalur layar', d.jumlah, 2);
  sama('layar: sepeda dimiliki & dipakai', kend.dimiliki.concat(kend.dipakai), ['sepeda', 'sepeda']);
  const stHabis = upLayar.status('motor', ctxLayar);
  ok('layar: motor tidak boleh setelah saldo habis', stHabis.boleh === false && stHabis.kurang === 23,
    `${stHabis.boleh} / ${stHabis.kurang}`);
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
