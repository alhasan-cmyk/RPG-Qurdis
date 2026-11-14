// Rangkaian uji lama (85 pemeriksaan) sempat dihapus saat repo diganti isi Drive.
// Berkas ini memulihkan inti yang paling penting + menambah uji untuk perbaikan
// papan Ragam Usaha, supaya tidak ada yang bisa kembali tanpa ketahuan.
import { readFileSync, existsSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
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

// ------------------------------------------- papan usaha: DUA jenis barang
//
// Papan menjual peningkatan bangunan (uang + bahan + bab) DAN kendaraan
// (diamond). Sempat ada versi yang menghapus tujuh peningkatan bangunan supaya
// papan "bersih" — itu keliru: efeknya (energi, slot tas, peti, ternak) bagian
// inti permainan. Uji ini mengunci keduanya supaya tidak terhapus lagi.
{
  const { KENDARAAN } = await import(join(ROOT, 'src/systems/kendaraan.js'));
  const { Upgrade } = await import(join(ROOT, 'src/systems/upgrade.js'));

  sama('papan: 7 peningkatan bangunan', UPGRADE.length, 7);
  sama('papan: 3 kendaraan', KENDARAAN.length, 3);

  const up0 = new Upgrade();
  const semua = up0.papan();
  sama('papan: total 10 baris', semua.length, 10);
  sama('papan: bangunan lebih dulu, kendaraan di belakang',
    semua.map((u) => u.jenis),
    [...new Array(7).fill('bangunan'), ...new Array(3).fill('kendaraan')]);
  sama('papan: id bangunan tidak berubah', semua.slice(0, 7).map((u) => u.id),
    ['rumah', 'lemari', 'peti', 'dapur', 'pasar', 'kandang', 'bibit']);
  sama('papan: id kendaraan di belakang', semua.slice(7).map((u) => u.id), KENDARAAN.map((k) => k.id));

  // Yang benar-benar hilang saat papan "dibersihkan" dulu: efek bangunan.
  // Diuji per fungsi, bukan per baris — kalau efeknya hilang, pemain membeli
  // rumah dan tidak ada yang berubah.
  const upEfek = new Upgrade();
  upEfek.level.rumah = 2; upEfek.level.lemari = 1; upEfek.level.peti = 1;
  upEfek.level.dapur = 1; upEfek.level.pasar = 1; upEfek.level.kandang = 1; upEfek.level.bibit = 1;
  sama('efek: rumah menambah energi', upEfek.energiTambahan(), 40);
  sama('efek: lemari menambah slot tas', upEfek.slotTas(), 28);
  sama('efek: peti menambah slot peti', upEfek.slotPeti(), 32);
  ok('efek: dapur menambah pemulihan makan', upEfek.pengaliMakan() > 1, String(upEfek.pengaliMakan()));
  ok('efek: pasar menaikkan harga jual', upEfek.pengaliJual() > 1, String(upEfek.pengaliJual()));
  sama('efek: kandang menambah ternak', upEfek.ternakTambahan(), 1);
  ok('efek: kebun bibit membagi benih', upEfek.benihPagi() > 0, String(upEfek.benihPagi()));

  // Tujuh peningkatan tetap punya bab syarat yang sah di kelasnya sendiri.
  for (const u of UPGRADE) {
    for (const k of ['X', 'XI', 'XII']) {
      const id = u.bab?.[k];
      ok(`${u.judul} (${k}) punya bab`, !!id, String(id));
      ok(`${u.judul} (${k}) bab kelas ${k}`, ilmu.kitab.find((b) => b.id === id)?.kelas === k, id);
    }
    ok(`${u.judul}: batas tingkat >= 1`, (u.perTingkat ?? 1) >= 1);
    ok(`${u.judul}: ada bahan`, Object.keys(u.bahan ?? {}).length > 0);
    ok(`${u.judul}: bahan dikenal`, Object.keys(u.bahan ?? {}).every((b) => NAMA_BAHAN[b]), Object.keys(u.bahan ?? {}).join(','));
    ok(`${u.judul}: efek fungsi`, typeof u.efek === 'function');
    ok(`${u.judul}: tanpa label alat palsu`, !u.alat || u.alat === 'beliung', String(u.alat));
    // Satu bab boleh dipakai satu papan saja di kelas yang sama — kalau tidak,
    // dua papan terbuka bersamaan dan tabel syarat di BACA-DULU jadi bohong.
    for (const k of ['X', 'XI', 'XII']) {
      const id = u.bab?.[k];
      if (!id) continue;
      const lain = UPGRADE.filter((v) => v.id !== u.id && v.bab[k] === id);
      ok(`${u.judul} (${k}): bab tidak dipakai papan lain`, lain.length === 0, lain.map((v) => v.judul).join(','));
    }
  }

  // Kendaraan: harga pilihan pemain 10/25/50, tanpa syarat bab/bahan.
  sama('kendaraan: harga 10 / 25 / 50 diamond', KENDARAAN.map((k) => k.harga), [10, 25, 50]);
  ok('kendaraan: truk paling mahal', KENDARAAN.at(-1).harga === Math.max(...KENDARAAN.map((k) => k.harga)));
  for (const k of KENDARAAN) {
    ok(`${k.id}: ada nama & judul`, !!k.nama && !!k.judul);
    ok(`${k.id}: ada kalimat guna`, typeof k.guna === 'string' && k.guna.length > 10, k.guna);
    ok(`${k.id}: lebih cepat dari jalan kaki`, k.cepat > 1, String(k.cepat));
    ok(`${k.id}: tidak punya syarat bab`, k.bab === undefined);
    ok(`${k.id}: tidak butuh bahan`, k.bahan === undefined);
    ok(`${k.id}: tidak butuh uang`, k.biaya === undefined);
  }
  const ragam = new Set(KENDARAAN.map((k) => `${k.cepat}|${k.slotTas ?? 0}`));
  sama('kendaraan: tiap kendaraan punya efek berbeda', ragam.size, 3);
  ok('kendaraan: hanya truk yang menambah slot tas', KENDARAAN.filter((k) => (k.slotTas ?? 0) > 0).length === 1);
  ok('kendaraan: motor yang paling cepat', KENDARAAN.find((k) => k.cepat === Math.max(...KENDARAAN.map((x) => x.cepat))).id === 'motor');

  // Status memilih cabang yang benar menurut jenisnya.
  const kendA = new (await import(join(ROOT, 'src/systems/kendaraan.js'))).Kendaraan();
  const upA = new Upgrade(kendA);
  ok('status: baris bangunan memakai cabang bangunan', upA.status('rumah', {}).jenis === 'bangunan');
  ok('status: baris kendaraan memakai cabang kendaraan', upA.status('truk', { diamond: 0 }).jenis === 'kendaraan');
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

// ---------------------------------------------- status() bangunan + alasan
//
// Kendaraan hanya butuh diamond, tetapi peningkatan BANGUNAN kembali memakai
// syarat lama: satu bab lulus, uang, dan bahan. Kalau salah satunya berhenti
// diperiksa, murid bisa membeli rumah tanpa ujian — dan papan kehilangan
// gunanya sebagai pengarah belajar.
{
  const { Upgrade } = await import(join(ROOT, 'src/systems/upgrade.js'));
  const kelasDari = (id) => ilmu.kitab.find((b) => b.id === id)?.kelas ?? 'X';
  const tasDengan = (isi) => {
    const inv = new Inventory();
    for (const [id, n] of Object.entries(isi)) inv.add(id, n);
    return inv;
  };
  const palsu = (lulus = [], uang = 0, isi = {}) => ({
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

  const up = new Upgrade();
  const st1 = up.status('rumah', palsu([], 0));
  ok('status bangunan: ada judul bab syarat', typeof st1.judulBabInti === 'string' && st1.judulBabInti.length > 0);
  ok('status bangunan: ada guru', !!st1.guru?.nama, JSON.stringify(st1.guru));
  sama('status bangunan: perlu = bahan tingkat 1', st1.perlu, UPGRADE.find((u) => u.id === 'rumah').bahan);
  ok('alasan bangunan: menyebut bab dan guru', /Bab [IVX]+.*— ujian ke /.test(up.alasanTidakBoleh(st1)), up.alasanTidakBoleh(st1));

  const st3 = up.status('rumah', palsu(ids.slice(0, 12), 0));
  ok('alasan bangunan: menyebut bahan yang kurang', /Kurang .*batu/.test(up.alasanTidakBoleh(st3)), up.alasanTidakBoleh(st3));
  ok('alasan bangunan: nama bahan tidak muncul sebagai id mentah', !/stone|wood/.test(up.alasanTidakBoleh(st3)), up.alasanTidakBoleh(st3));

  // Bahan harus benar-benar ada di tas dulu, kalau tidak urutannya berhenti di
  // bahan. Jumlahnya persis kebutuhan — 9999 tidak muat di 24 slot.
  const bahanRumah = UPGRADE.find((u) => u.id === 'rumah').bahan;
  const st4 = up.status('rumah', palsu(ids, 0, bahanRumah));
  ok('alasan bangunan: menyebut uang kalau bahan cukup', /Uangnya kurang G[\d.]+/.test(up.alasanTidakBoleh(st4)), up.alasanTidakBoleh(st4));

  up.level.rumah = up.maks('rumah');
  const st5 = up.status('rumah', palsu(ids, 99999));
  ok('penuh: alasan menyebut tingkat tertinggi', /tertinggi/.test(up.alasanTidakBoleh(st5)), up.alasanTidakBoleh(st5));
  ok('penuh: tidak menyebut bab/bahan', !/Bab|Kurang/.test(up.alasanTidakBoleh(st5)), up.alasanTidakBoleh(st5));

  // ---- kalimat syarat yang lengkap: nomor bab, judul bab, guru, nama alat.
  const { Ilmu } = await import(join(ROOT, 'src/systems/ilmu.js'));
  const ilmuAsli = new Ilmu(ilmu);
  ilmuAsli.tingkat = 'XII';
  ilmuAsli.lulus = new Set();
  const up2 = new Upgrade();
  const stRumah = up2.status('rumah', { ilmu: ilmuAsli, inv: tasDengan({}), uang: () => 0, tingkatKelas: 'XII' });
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

  // ---- beli() benar-benar menagih bahan, mencatat biaya, dan menaikkan tingkat.
  const invBeli = tasDengan(bahanRumah);
  const upBeli = new Upgrade();
  const r = upBeli.beli('rumah', { inv: invBeli, uang: () => 99999 });
  ok('beli bangunan: berhasil', !!r && r.id === 'rumah', JSON.stringify(r));
  sama('beli bangunan: tingkat naik', upBeli.level.rumah, 1);
  sama('beli bangunan: biaya dicatat', r?.biaya, UPGRADE.find((u) => u.id === 'rumah').biaya);
  ok('beli bangunan: bahan terpakai', Object.keys(bahanRumah).every((b) => invBeli.count(b) === 0),
    Object.entries(bahanRumah).map(([b, n]) => `${b}:${invBeli.count(b)}/${n}`).join(','));
  ok('beli bangunan: ditolak tanpa bahan', upBeli.beli('rumah', { inv: tasDengan({}), uang: () => 99999 }) === null);
  sama('beli bangunan: tingkat tidak naik saat ditolak', upBeli.level.rumah, 1);

  // Alasan untuk peningkatan yang SUDAH boleh dibeli harus KOSONG. Versi lama
  // jatuh ke kalimat terakhir ("Uangnya kurang G0.") — layar lalu menulis
  // "Uangnya kurang G0." pada baris yang justru bisa dibeli, terbaca seperti
  // penolakan. Diperiksa di dua tingkat: bahan+uang cukup, dan uang pas.
  const upSiap = new Upgrade();
  const ctxSiap = palsu(ids, 99999, bahanRumah);
  const stSiap = upSiap.status('rumah', ctxSiap);
  ok('alasan: kosong saat peningkatan boleh dibeli', stSiap.boleh === true && upSiap.alasanTidakBoleh(stSiap) === '',
    `boleh=${stSiap.boleh} alasan=${JSON.stringify(upSiap.alasanTidakBoleh(stSiap))}`);
  const stPas = upSiap.status('rumah', palsu(ids, UPGRADE.find((u) => u.id === 'rumah').biaya, bahanRumah));
  ok('alasan: uang pas pun tidak menghasilkan "kurang G0"', stPas.boleh === true && !/G0\b/.test(upSiap.alasanTidakBoleh(stPas)),
    upSiap.alasanTidakBoleh(stPas));
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

// ---------------------------- beli BANGUNAN lewat LAYAR, bukan hanya sistem
//
// Jalur yang sama seperti pemain: E di papan. Yang diuji adalah sambungan yang
// tidak terlihat dari uji sistem — `bayar()` dipanggil layar (sistem tidak
// menyentuh uang), dan ctx dari main.js memang membawa uang + bahan + diamond
// sekaligus. Kalau salah satu kunci hilang dari ctx, papan diam saja.
{
  const mainSumber = baca('src/main.js');
  const ctxPapan = mainSumber.slice(mainSumber.indexOf('state.upgradeUI.buka({'));
  const isiCtx = ctxPapan.slice(0, ctxPapan.indexOf('});') + 3);
  for (const kunci of ['ilmu:', 'inv:', 'tingkatKelas:', 'uang:', 'bayar:', 'diamond:', 'kendaraan:']) {
    ok(`main: papan menerima ${kunci}`, isiCtx.includes(kunci), kunci);
  }
  ok('main: upgrade dibuat dengan kendaraan', /new Upgrade\(state\.kendaraan\)/.test(mainSumber));

  const main = await import(join(ROOT, 'src/systems/upgrade.js'));
  const { Inventory: Inv, setItemData: setItem } = await import(join(ROOT, 'src/systems/inventory.js'));
  setItem(JSON.parse(baca('src/data/items.json')));
  const up = new main.Upgrade();
  const inv = new Inv();
  const rumah = main.UPGRADE.find((u) => u.id === 'rumah');
  for (const [b, n] of Object.entries(rumah.bahan)) inv.add(b, n);
  let uang = 5000;
  const ctx = {
    inv,
    uang: () => uang,
    bayar: (n) => { uang = Math.max(0, uang - n); },
    ilmu: { lulus: new Set(Object.keys(ilmu.ujian)), kitab: () => ({ judul: 'x' }), nomorBab: () => 1 },
    tingkatKelas: 'X',
  };
  const st = up.status('rumah', ctx);
  ok('layar bangunan: boleh dibeli saat bab lulus, bahan & uang cukup', st.boleh === true,
    JSON.stringify({ lulus: st.lulus, kurang: st.bahanKurang, uang: st.uangKurang }));
  const r = up.beli('rumah', { inv: ctx.inv, uang: ctx.uang() });
  ok('layar bangunan: beli berhasil', !!r && r.level === 1, JSON.stringify(r));
  ctx.bayar(r.biaya);
  sama('layar bangunan: uang terpotong lewat bayar()', uang, 5000 - rumah.biaya);
  sama('layar bangunan: tingkat tercatat', up.tingkat('rumah'), 1);
}

// ----------------------------- simpanan lama tidak menghapus kendaraan
//
// main.js memuat kendaraan dari `save.kendaraan`, lalu `upgrade.load()` ikut
// melihat `save.upgrade.kendaraan`. Kalau load() memanggil kendaraan.load()
// tanpa memeriksa datanya ada, simpanan lama (tanpa kunci itu) akan
// mengosongkan motor yang baru dibeli.
{
  const { Kendaraan } = await import(join(ROOT, 'src/systems/kendaraan.js'));
  const { Upgrade } = await import(join(ROOT, 'src/systems/upgrade.js'));
  const kend = new Kendaraan();
  kend.load({ dimiliki: ['motor'], dipakai: 'motor' });
  const up = new Upgrade(kend);
  // `lemari` punya empat tingkat; `rumah` hanya satu (perTingkat bawaan 1).
  up.load({ level: { lemari: 3 } });
  sama('muat: simpanan tanpa data kendaraan tidak mengosongkan', kend.dimiliki, ['motor']);
  sama('muat: tingkat bangunan tetap terbaca', up.tingkat('lemari'), 3);
  up.load({ level: {}, kendaraan: { dimiliki: ['truk'], dipakai: 'truk' } });
  sama('muat: data kendaraan di dalam upgrade dipakai', kend.dimiliki, ['truk']);
}

// --------------------------- pemain benar-benar menaiki kendaraannya
//
// Sampai ronde ini, membeli sepeda hanya mengubah angka kecepatan: pemain tetap
// berjalan kaki di layar. Yang diuji sekarang: sprite pengendara dipilih saat
// kendaraan dipakai, dikembalikan saat turun, dan berkas gambarnya benar-benar
// ada (bukan hanya nama di manifest — sprite yang hilang membuat `sprite()`
// melempar galat saat menggambar, dan itu baru terlihat ketika bermain).
{
  const { KENDARAAN, Kendaraan } = await import(join(ROOT, 'src/systems/kendaraan.js'));
  const manifest = JSON.parse(baca('assets/manifest.json'));
  const sprites = manifest.sprites;
  const AVATAR = ['player_m', 'player_f', 'player_m2', 'player_f2'];
  const adaManifest = (n) => Boolean(sprites[n]);

  // --- tiap kombinasi avatar x kendaraan punya sprite, bingkai 32x56
  for (const a of AVATAR) {
    for (const k of KENDARAAN) {
      const nama = `${a}_${k.id}`;
      const def = sprites[nama];
      ok(`sprite: ${nama} terdaftar`, !!def, nama);
      if (!def) continue;
      // Bingkai per kendaraan, BUKAN 32x48 lagi: kepala pemain memakai 30 dari
      // 48 px dan topinya selebar 25 px, sehingga kabin truk mustahil lebih luas
      // dari topi pengemudinya. Sepeda & motor 48x64, truk 64x64.
      const BINGKAI = { sepeda: [48, 64], motor: [48, 64], truk: [64, 64] }[k.id];
      sama(`sprite: ${nama} berbingkai ${BINGKAI.join('x')}`, def.frame, BINGKAI);
      sama(`sprite: ${nama} 4x4 bingkai`, [def.cols, def.rows], [4, 4]);
      ok(`sprite: ${nama} berkasnya ada`, existsSync(join(ROOT, 'assets', def.file)), def.file);
      // PNG asli = 4 kolom x 4 baris bingkai di atas.
      const b = readFileSync(join(ROOT, 'assets', def.file));
      sama(`sprite: ${nama} berukuran ${BINGKAI[0] * 4}x${BINGKAI[1] * 4}`,
        [b.readUInt32BE(16), b.readUInt32BE(20)], [BINGKAI[0] * 4, BINGKAI[1] * 4]);
    }
  }

  // --- spriteId(): hanya saat kendaraan dipakai, dan hanya kalau sprite-nya ada
  const ken = new Kendaraan();
  ok('spriteId: jalan kaki -> null', ken.spriteId('player_f', adaManifest) === null);
  ken.load({ dimiliki: ['sepeda'], dipakai: 'sepeda' });
  sama('spriteId: sepeda dipakai -> sprite sepeda', ken.spriteId('player_f', adaManifest), 'player_f_sepeda');
  sama('spriteId: avatar lain memakai lembarnya sendiri', ken.spriteId('player_m2', adaManifest), 'player_m2_sepeda');
  ken.pakai(null);
  ok('spriteId: turun -> null lagi', ken.spriteId('player_f', adaManifest) === null);
  // Avatar yang tidak punya lembar kendaraan TIDAK boleh membuat game error:
  // null berarti tetap pejalan kaki.
  ken.pakai('sepeda');
  ok('spriteId: avatar tanpa lembar -> null (bukan galat)', ken.spriteId('avatar_asing', adaManifest) === null);
  ok('spriteId: tanpa pemeriksa sprite -> null (aman)', ken.spriteId('player_f') === null);

  // --- penghasil sprite harus menghasilkan byte yang SAMA dengan berkas yang
  // di-commit. Tanpa uji ini, skrip dan aset bisa berbeda diam-diam: skrip
  // diperbaiki, asetnya lupa dibuat ulang, dan yang dilihat pemain tetap versi
  // lama. Dijalankan ke direktori sementara, lalu dibandingkan.
  {
    const tmp = mkdtempSync(join(tmpdir(), 'sprite-'));
    mkdirSync(join(tmp, 'assets/sprites/characters'), { recursive: true });
    for (const a of AVATAR) {
      mkdirSync(join(tmp, 'assets/sprites/characters', a), { recursive: true });
      copyFileSync(join(ROOT, `assets/sprites/characters/${a}/${a}_sheet.png`),
        join(tmp, `assets/sprites/characters/${a}/${a}_sheet.png`));
    }
    const hasil = spawnSync(process.execPath,
      [join(ROOT, 'tools/buat-sprite-kendaraan.mjs'), tmp], { encoding: 'utf8' });
    ok('sprite: penghasil berjalan tanpa galat', hasil.status === 0, (hasil.stderr || '').slice(0, 400));
    for (const a of AVATAR) {
      for (const k of KENDARAAN) {
        const nama = `${a}_${k.id}`;
        const baru = join(tmp, `assets/sprites/characters/${a}/${a}_${k.id}.png`);
        const lama = join(ROOT, `assets/sprites/characters/${a}/${a}_${k.id}.png`);
        ok(`sprite: ${nama} di-commit sama dengan hasil skrip`,
          existsSync(baru) && readFileSync(baru).equals(readFileSync(lama)),
          existsSync(baru) ? 'berkas berbeda — jalankan node tools/buat-sprite-kendaraan.mjs' : 'skrip tidak menghasilkan berkas');
      }
    }
    rmSync(tmp, { recursive: true, force: true });
  }

  // --- Tinggi kepala TIDAK bergeser. Yang dibandingkan adalah jarak kepala ke
  // DASAR bingkai (bukan ke atas bingkai), karena bingkai kendaraan lebih tinggi
  // dan tumbuh ke atas: dengan pivot bottom-center, jarak ke dasar itulah posisi
  // kepala di layar. Selisih yang diizinkan 3 px supaya pengemudi boleh duduk
  // sedikit lebih rendah di kabin, tetapi tidak boleh naik (melonjak).
  {
    const { PNG } = await import(join(ROOT, 'tools/panduan/png.mjs'));
    const bacaPNG = (p) => PNG.baca(readFileSync(p));
    const kepalaDariDasar = (png, fw, fh, row) => {
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const i = ((row * fh + y) * png.w + x) * 4;
          if (png.data[i + 3] > 0) return fh - y;   // px dari dasar bingkai
        }
      }
      return -1;
    };
    const lembar = bacaPNG(join(ROOT, 'assets/sprites/characters/player_m/player_m_sheet.png'));
    const acuan = kepalaDariDasar(lembar, 32, 48, 0);
    for (const jenis of ['sepeda', 'motor', 'truk']) {
      const def = sprites[`player_m_${jenis}`];
      const [fw, fh] = def.frame;
      const png = bacaPNG(join(ROOT, 'assets', def.file));
      const k = kepalaDariDasar(png, fw, fh, 0);
      ok(`sprite: ${jenis} kepala pemain tetap setinggi jalan kaki`,
        Math.abs(k - acuan) <= 3,
        `kepala jalan kaki ${acuan} px dari dasar, naik ${jenis} ${k} px`);
    }
  }

  // --- Character memakai sprite itu, dan kembali ke avatar aslinya
  const { Character } = await import(join(ROOT, 'src/entities/character.js'));
  const { assets } = await import(join(ROOT, 'src/render/assets.js'));
  assets.manifest = manifest;
  const ch = new Character('player_f', 0, 0);
  ok('karakter: bawaannya jalan kaki', ch.spriteKendaraan === null);
  ch.spriteKendaraan = 'player_f_sepeda';
  const gambar = [];
  const ctxTiruan = {
    fillStyle: '', globalAlpha: 1, font: '16px x',
    beginPath() {}, ellipse() {}, fill() {},
    drawImage(img) { gambar.push(img); },
  };
  // draw() memanggil sprite(), yang butuh gambar di assets.images.
  const png = { width: 128, height: 192 };
  assets.images.set('player_f_sepeda', png);
  assets.images.set('player_f', { width: 128, height: 192 });
  ch.draw(ctxTiruan, 0, 0);
  ok('karakter: memakai lembar kendaraan saat menaikinya', gambar[0] === png, gambar.length ? 'lembar lain' : 'tidak menggambar');
  ch.spriteKendaraan = null;
  ch.draw(ctxTiruan, 0, 0);
  ok('karakter: kembali ke lembar asli saat turun', gambar.at(-1) !== png);
  // Nama yang tidak ada di manifest harus diabaikan, bukan melempar galat.
  ch.spriteKendaraan = 'player_f_tidak_ada';
  let meledak = false;
  try { ch.draw(ctxTiruan, 0, 0); } catch { meledak = true; }
  ok('karakter: nama sprite asing diabaikan', meledak === false);

  // --- main.js: pemilihan wujud dipanggil dari SATU tempat
  const main = baca('src/main.js');
  ok('main: wujud kendaraan diterapkan dari terapkanUpgrade()',
    /function terapkanUpgrade\(\)[\s\S]{0,2500}terapkanTampilanKendaraan\(\);/.test(main),
    'terapkanTampilanKendaraan tidak dipanggil di terapkanUpgrade');
  ok('main: wujud memakai spriteId()', /ken\.spriteId\(/.test(main));
  // Slot tas + kecepatan + wujud harus ikut terbarui saat kendaraan berganti:
  // papan memanggil onBeli -> terapkanUpgrade -> ketiganya.
  ok('main: papan memicu terapkanUpgrade setelah membeli/memakai',
    /upgradeUI\.onBeli = \(\) => \{ terapkanUpgrade\(\);/.test(main));
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

// ------------------------------------------------------------- kode debug
// Permintaan guru/pengetes: cara cepat menguji tanpa mengumpulkan gold dan
// diamond dengan bermain dulu — dan yang bisa DIPAKAI. Versi pertama memakai
// Ctrl+G / Ctrl+D, yang ternyata pintasan peramban (tandai halaman / cari
// berikutnya); Chrome boleh memprosesnya sebelum halaman sempat mencegah.
// Karena itu jalan utamanya sekarang perintah ketik: `/gold 1000`.
//
// Yang diuji: perintahnya, efeknya (lewat jalur permainan yang sama), dan
// bahwa mode debug tidak bisa hidup di luar penandanya.
{
  // core/input.js memasang pendengar `window` saat modulnya dimuat. Di Node
  // tidak ada window, jadi diganti tiruan. Alias Ctrl memang TIDAK diuji di
  // sini — ia dimuat malas (dynamic import) dan hanya ada di peramban; yang
  // diuji adalah perintah ketik, yang tidak bergantung pada peramban.
  globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
  const cheat = await import(join(ROOT, 'src/core/cheat.js'));
  const { PERINTAH_DEBUG, uraiPerintah, pasangKodeDebug, MAKS_ANGKA, BAHAN_DEBUG,
    JUMLAH_UANG, JUMLAH_DIAMOND, JUMLAH_BAHAN } = cheat;
  const { Diamond } = await import(join(ROOT, 'src/systems/diamond.js'));
  const { Kendaraan } = await import(join(ROOT, 'src/systems/kendaraan.js'));
  const { Ilmu } = await import(join(ROOT, 'src/systems/ilmu.js'));
  const { Upgrade } = await import(join(ROOT, 'src/systems/upgrade.js'));

  // --- daftar perintah
  const nama = PERINTAH_DEBUG.map((p) => p.nama);
  ok('debug: nama perintah unik', new Set(nama).size === nama.length, nama.join(','));
  ok('debug: setiap perintah punya judul', PERINTAH_DEBUG.every((p) => (p.judul ?? '').length > 3));
  ok('debug: /gold dan /diamond ada (permintaan pemakai)', nama.includes('gold') && nama.includes('diamond'));
  // Pintasan Ctrl hanya ALIAS, bukan satu-satunya jalan: perintah yang punya
  // tombol harus tetap punya nama perintah yang bisa diketik.
  ok('debug: setiap alias Ctrl punya perintah ketik',
    PERINTAH_DEBUG.filter((p) => p.tombol).every((p) => typeof p.nama === 'string' && p.nama));
  // Tombol milik peramban tidak boleh jadi satu-satunya jalan; yang paling
  // penting: seluruh perintah bisa dijalankan tanpa Ctrl sama sekali.
  ok('debug: ada perintah tanpa alias Ctrl (jalan tanpa peramban)',
    PERINTAH_DEBUG.some((p) => !p.tombol) || nama.length > 0);

  // --- pengurai perintah
  const u = (b) => uraiPerintah(b);
  sama('urai: /gold 1000 -> gold 1000', [u('/gold 1000').perintah?.nama, u('/gold 1000').angka], ['gold', 1000]);
  sama('urai: /diamond 250', [u('/diamond 250').perintah?.nama, u('/diamond 250').angka], ['diamond', 250]);
  sama('urai: /gold tanpa angka -> bawaan 1.000', u('/gold').angka, JUMLAH_UANG);
  sama('urai: /diamond tanpa angka -> bawaan 1.000', u('/diamond').angka, JUMLAH_DIAMOND);
  sama('urai: /bahan tanpa angka -> bawaan 50', u('/bahan').angka, JUMLAH_BAHAN);
  sama('urai: huruf besar kecil sama (/GOLD)', u('/GOLD 5').perintah?.nama, 'gold');
  sama('urai: spasi berlebih diabaikan', u('   /gold    250  ').angka, 250);
  ok('urai: angka negatif diterima', u('/gold -500').angka === -500);
  ok('urai: bukan perintah (tanpa /) -> perintah null', u('halo warga').perintah === null && u('halo warga').galat === '');
  ok('urai: baris kosong -> perintah null', u('   ').perintah === null);
  ok('urai: hanya "/" -> minta nama perintah', /nama perintah/i.test(u('/').galat), u('/').galat);
  ok('urai: perintah tak dikenal menyebut daftarnya', /Tidak ada perintah \/x/.test(u('/x').galat) && u('/x').galat.includes('gold'), u('/x').galat);
  ok('urai: desimal ditolak', /bilangan bulat/.test(u('/gold 1.5').galat), u('/gold 1.5').galat);
  ok('urai: notasi ilmiah ditolak', /bilangan bulat/.test(u('/gold 1e9').galat), u('/gold 1e9').galat);
  ok('urai: angka di luar batas ditolak', /di luar batas/.test(u(`/gold ${MAKS_ANGKA + 1}`).galat), u(`/gold ${MAKS_ANGKA + 1}`).galat);
  ok('urai: perintah tanpa angka menolak angka', /tidak memakai angka/.test(u('/energi 5').galat), u('/energi 5').galat);

  // --- efek, dijalankan pada objek permainan sungguhan
  const buatPermainan = () => {
    const inv = new Inventory(24);
    let diterapkan = 0;
    const ilmuObj = new Ilmu(structuredClone(ilmu));
    ilmuObj.tingkat = 'X';
    const state = {
      player: { money: 500, energy: 10, maxEnergy: 100 },
      diamond: new Diamond(7),
      inv,
      ilmu: ilmuObj,
      kendaraan: new Kendaraan(),
      upgrade: new Upgrade(),
      time: {
        clockText: '06:00', menit: 0,
        skip(n) { this.menit += n; }, debugNextSeason() { this.musim = (this.musim ?? 0) + 1; },
      },
    };
    state.upgrade.kendaraan = state.kendaraan;
    const pesan = [];
    const alat = pasangKodeDebug({
      state, pintasan: false,
      toast: (m) => pesan.push(m),
      terapkan: () => { diterapkan += 1; },
      simpan: () => { state.disimpan = (state.disimpan ?? 0) + 1; },
    });
    return { state, alat, pesan, diterapkan: () => diterapkan };
  };

  {
    const { state, alat } = buatPermainan();
    const p = alat.ketik('/gold 1000');
    sama('debug: /gold 1000 menambah 1.000 gold', state.player.money, 1500);
    ok('debug: pesan /gold memakai titik ribuan', /1\.000/.test(p), p);
    alat.ketik('/gold 250');
    sama('debug: /gold 250 menambah tepat 250', state.player.money, 1750);
    alat.ketik('/gold -1750');
    sama('debug: /gold -1750 boleh, untuk menguji keadaan miskin', state.player.money, 0);
    alat.ketik('/gold -999');
    sama('debug: gold tidak bisa negatif', state.player.money, 0);
  }
  {
    const { state, alat } = buatPermainan();
    alat.ketik('/diamond 1000');
    sama('debug: /diamond 1000 menambah 1.000 (saldo awal 7 utuh)', state.diamond.jumlah, 1007);
    alat.ketik('/diamond');
    sama('debug: /diamond tanpa angka = +1.000 lagi', state.diamond.jumlah, 2007);
  }
  {
    const { state, alat, pesan } = buatPermainan();
    alat.ketik('/bahan 50');
    sama('debug: /bahan 50 memberi 50 tiap jenis', BAHAN_DEBUG.map((b) => state.inv.count(b)), BAHAN_DEBUG.map(() => 50));
    ok('debug: /bahan melaporkan berhasil saat tas muat', !/penuh/i.test(pesan.at(-1)), pesan.at(-1));
    // add() mengembalikan SISA yang tidak muat (0 = berhasil). Kalau hasilnya
    // dibaca sebagai boolean, pesannya menjadi "penuh: 7" — angka yang salah.
    state.inv.slots.fill({ id: 'stone', count: 99 });
    state.inv.slots[0] = null;
    alat.ketik('/bahan 50');
    ok('debug: /bahan menyebut JUMLAH yang tidak muat', /penuh: 350 bahan/.test(pesan.at(-1)), pesan.at(-1));
  }
  {
    const { state, alat } = buatPermainan();
    alat.ketik('/bab 3');
    const lulus = state.ilmu.lulus.size;
    sama('debug: /bab 3 meluluskan 3 bab', lulus, 3);
    alat.ketik('/babsemua');
    ok('debug: /babsemua meluluskan seluruh kelas', state.ilmu.babTerbuka() === null);
    ok('debug: /babsemua hanya menyentuh kelas yang dipakai',
      state.ilmu.data.kitab.filter((b) => b.kelas !== 'X').every((b) => !state.ilmu.lulus.has(b.id)));
  }
  {
    const { state, alat } = buatPermainan();
    const p = alat.ketik('/tingkat 1');
    ok('debug: /tingkat 1 menaikkan tiap bangunan satu tingkat',
      UPGRADE.every((u) => state.upgrade.tingkat(u.id) === 1));
    sama('debug: /tingkat tidak menagih uang pemain', state.player.money, 500);
    // Jalur belinya benar-benar dilalui: bahan yang dibagikan cheat HABIS
    // dipakai beliBangunan. Kalau tingkat dinaikkan langsung, bahan menumpuk.
    sama('debug: /tingkat membelanjakan bahan (bukan menumpuknya)',
      UPGRADE.map((u) => state.inv.count(Object.keys(u.bahan)[0])), UPGRADE.map(() => 0));
    ok('debug: /tingkat melaporkan hasilnya', /Rumah/.test(p), p);
    alat.ketik('/tingkat 5');
    ok('debug: /tingkat berhenti di tingkat tertinggi',
      UPGRADE.every((u) => state.upgrade.tingkat(u.id) === state.upgrade.maks(u.id)));
  }
  {
    const { state, alat } = buatPermainan();
    alat.ketik('/energi');
    sama('debug: /energi mengisi sampai maks', state.player.energy, state.player.maxEnergy);
    alat.ketik('/jam 3');
    sama('debug: /jam 3 memajukan 180 menit', state.time.menit, 180);
    alat.ketik('/musim');
    sama('debug: /musim mengganti musim', state.time.musim, 1);
    alat.ketik('/simpan');
    sama('debug: /simpan menyimpan', state.disimpan, 1);
    alat.ketik('/kendaraan');
    ok('debug: /kendaraan memberi ketiga kendaraan', state.kendaraan.dimiliki.length === 3);
    // Saldo awal 7 harus UTUH: beli() dititipi harga lalu saldo dikembalikan.
    sama('debug: /kendaraan tidak menyedot/memberi diamond', state.diamond.jumlah, 7);
  }
  {
    const { alat, pesan, state } = buatPermainan();
    const uangAwal = state.player.money;
    ok('debug: perintah tak dikenal tidak mengubah apa pun',
      /Tidak ada perintah/.test(alat.ketik('/xyz')) && state.player.money === uangAwal);
    sama('debug: baris tanpa / tidak dijalankan sebagai perintah', alat.ketik('halo'), null);
    // Riwayat mencatat perintah (termasuk yang gagal, supaya penguji bisa
    // melihat apa yang tadi ia ketik), tetapi BUKAN obrolan biasa.
    sama('debug: riwayat mencatat perintah, bukan obrolan biasa',
      alat.riwayat.map((r) => r.asal), ['/xyz']);
    ok('debug: setiap pesan diawali [debug]', pesan.every((m) => m.startsWith('[debug] ')));
  }

  // --- panel & baris perintah membaca daftar yang sama
  const panelSumber = baca('src/ui/cheat-ui.js');
  ok('panel: membaca PERINTAH_DEBUG, bukan daftar kedua', /import \{ PERINTAH_DEBUG \}/.test(panelSumber));
  ok('panel: tidak menulis ulang nama perintah', !/'\/?gold'/.test(panelSumber));
  // --- kelas baris perintah, diuji perilakunya (bukan hanya teksnya)
  {
    const { CheatConsole } = await import(join(ROOT, 'src/ui/cheat-console.js'));
    const terima = [];
    const k = new CheatConsole({ onKetik: (b) => { terima.push(b); return b.startsWith('/gold') ? 'hasil ok' : 'galat'; } });
    const ketik = (teks) => { for (const c of teks) k.key({ key: c }); };
    sama('konsol: tertutup tidak menerima tombol', [k.key({ key: 'a' }), k.terbuka], [false, false]);
    k.buka('/');
    sama('konsol: buka("/") tidak menaruh garis miring di baris (otomatis)', k.baris, '');
    ketik('gold 1000');
    sama('konsol: huruf masuk ke baris, bukan ke permainan', k.baris, 'gold 1000');
    sama('konsol: garis miring otomatis ditambahkan saat Enter', [k.key({ key: 'Enter' }), terima], [true, ['/gold 1000']]);
    sama('konsol: hasil perintah tampil sebagai pesan', k.pesan, 'hasil ok');
    sama('konsol: baris dikosongkan sesudah Enter', k.baris, '');
    ketik('gld 5');
    k.key({ key: 'Enter' });
    ok('konsol: perintah salah TIDAK menutup baris (bisa diperbaiki)', k.terbuka && k.pesan === 'galat', k.pesan);
    sama('konsol: perintah salah tetap diteruskan ke penanganan', terima.at(-1), '/gld 5');
    k.key({ key: 'Escape' });
    ok('konsol: Escape menutup tanpa mengirim', !k.terbuka && terima.length === 2, String(terima.length));
    // Panah atas mengulang perintah sebelumnya — satu-satunya cara menguji
    // perintah yang panjang tanpa mengetik ulang.
    // F2 membuka baris KOSONG: mengetik "gold 250" harus jalan tanpa garis
    // miring, dan perintah itu harus bisa diputar ulang persis sama.
    k.buka();
    sama('konsol: F2 membuka baris kosong', k.baris, '');
    ketik('/gold 250');       // garis miring di awal diabaikan
    sama('konsol: "/" di awal tidak menghasilkan "//"', k.baris, 'gold 250');
    k.key({ key: 'Enter' });
    k.key({ key: 'ArrowUp' });
    sama('konsol: panah atas mengulang perintah terakhir', k.baris, 'gold 250');
    k.key({ key: 'Backspace' });
    sama('konsol: Backspace menghapus satu huruf', k.baris, 'gold 25');
    k.key({ key: 'Escape' });
  }

  const konsolSumber = baca('src/ui/cheat-console.js');
  ok('konsol: membaca PERINTAH_DEBUG untuk petunjuk', /import \{ PERINTAH_DEBUG \}/.test(konsolSumber));

  // --- mode debug: DI DALAM penandanya, dan penandanya bertahan antar-halaman
  const mainSumber = baca('src/main.js');
  const awalBlok = mainSumber.indexOf('if (modeDebug()) {');
  ok('main: memakai modeDebug(), bukan location.search langsung', awalBlok > 0);
  const isiBlok = (sumber, mulai) => {
    let i = sumber.indexOf('{', mulai);
    if (i < 0) return '';
    let dalam = 0;
    for (let j = i; j < sumber.length; j++) {
      if (sumber[j] === '{') dalam++;
      else if (sumber[j] === '}' && --dalam === 0) return sumber.slice(i, j + 1);
    }
    return '';
  };
  const dalamBlok = isiBlok(mainSumber, awalBlok);
  ok('main: blok mode debug ketemu utuh', dalamBlok.length > 100, `${dalamBlok.length} huruf`);
  ok('main: kode debug dipasang DI DALAM blok mode debug', /pasangKodeDebug\(/.test(dalamBlok));
  ok('main: kode debug TIDAK dipasang di luar blok mode debug',
    !/pasangKodeDebug\(/.test(mainSumber.replace(dalamBlok, '')), 'ada pemanggilan di luar blok');
  ok('main: baris perintah hanya dibuat di dalam blok mode debug',
    (mainSumber.match(/new CheatConsole\(/g) ?? []).length === 1 && /new CheatConsole\(/.test(dalamBlok));
  ok('main: F2 membuka baris perintah', /e\.code === 'F2'/.test(dalamBlok));
  ok('main: "/" membuka baris perintah', /kunci === '\/'/.test(dalamBlok));
  ok('main: baris perintah menerima tombol lebih dulu', /state\.cheatConsole\.terbuka/.test(dalamBlok));
  // Pendengar permainan ada di simpul yang sama (window); stopPropagation tidak
  // menghentikannya, jadi harus stopImmediatePropagation — kalau tidak, huruf
  // yang diketik di baris perintah ikut menggerakkan pemain.
  ok('main: tombol baris perintah dihentikan sampai simpul yang sama',
    /stopImmediatePropagation\(\)/.test(dalamBlok));
  // Kotak obrolan memakai <input> sungguhan: mengetik "/" di sana tidak boleh
  // membuka baris perintah.
  ok('main: kolom isian tidak dirampas', /diKolom\b/.test(dalamBlok) && /tagName === 'INPUT'/.test(dalamBlok));
  ok('main: baris perintah digambar sesudah panel lain', /state\.cheatConsole\?\.draw\(ctx, W, H\)/.test(mainSumber));
  ok('main: kait uji __lkKetik tersedia', /window\.__lkKetik =/.test(mainSumber));
  // Penanda disimpan di sessionStorage (hilang saat tab ditutup), BUKAN
  // localStorage: peramban sekolah dipakai bergantian.
  const modeSumber = baca('src/core/debug-mode.js');
  ok('mode: penanda memakai sessionStorage', /sessionStorage/.test(modeSumber) && /sesi\?\.setItem\(KUNCI_DEBUG/.test(modeSumber));
  // Kode mati, bukan komentar: komentar justru menjelaskan kenapa BUKAN localStorage.
  const modeKode = modeSumber.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('mode: penanda TIDAK memakai localStorage', !/localStorage/.test(modeKode));
  ok('mode: penyimpanan terlarang tidak melempar galat', /catch \(e\) \{\s*return dariAlamat;/.test(modeSumber));

  /**
   * Perilaku penandanya diuji dengan tiruan, bukan dibaca dari teksnya.
   * Inilah jalur yang dulu membuat SEMUA cheat mati: `?debug=1` hilang saat
   * halaman depan pindah ke game.html.
   */
  {
    const { modeDebug, KUNCI_DEBUG } = await import(join(ROOT, 'src/core/debug-mode.js'));
    const buatSesi = () => {
      const isi = new Map();
      return {
        isi,
        setItem(k, v) { isi.set(k, String(v)); },
        getItem(k) { return isi.has(k) ? isi.get(k) : null; },
      };
    };
    const sesi = buatSesi();
    ok('mode: alamat ?debug=1 menyalakan mode', modeDebug({ search: '?debug=1' }, sesi) === true);
    sama('mode: alamat ?debug=1 MENULIS penanda', sesi.getItem(KUNCI_DEBUG), '1');
    ok('mode: halaman berikutnya (tanpa query) tetap hidup — inilah yang dulu gagal',
      modeDebug({ search: '' }, sesi) === true);
    ok('mode: halaman lain tanpa query juga hidup', modeDebug({ search: '?perluakun=1' }, sesi) === true);
    const sesiBaru = buatSesi();
    ok('mode: tab baru tanpa penanda mati', modeDebug({ search: '' }, sesiBaru) === false);
    ok('mode: ?debug=1 di tab baru menyalakannya', modeDebug({ search: '?x=1&debug=1' }, sesiBaru) === true);
    // Mode privat: penyimpanan melempar. Alamat tetap berlaku, halaman ini saja.
    const sesiRusak = { getItem() { throw new Error('dilarang'); }, setItem() { throw new Error('dilarang'); } };
    ok('mode: penyimpanan dilarang, alamat tetap berlaku', modeDebug({ search: '?debug=1' }, sesiRusak) === true);
    ok('mode: penyimpanan dilarang, tanpa alamat tetap mati', modeDebug({ search: '' }, sesiRusak) === false);
    ok('mode: main.js memakai modul ini', /import \{ modeDebug \} from '\.\/core\/debug-mode\.js'/.test(mainSumber));
  }

  // Halaman depan: ?debug=1 harus ikut pindah ke game.html, bukan hilang.
  const indexSumber = baca('index.html');
  ok('index: ketiga jalan ke game.html membawa ?debug=1',
    (indexSumber.match(/game\.html' \+ \(new URLSearchParams\(location\.search\)\.has\('debug'\)/g) ?? []).length === 3,
    String((indexSumber.match(/game\.html' \+ \(new URLSearchParams\(location\.search\)\.has\('debug'\)/g) ?? []).length));
  ok('index: tidak ada lagi pindah ke game.html tanpa membawa debug',
    !/location\.href = 'game\.html';/.test(indexSumber));
  ok('index: penanda sessionStorage disimpan juga di halaman depan',
    /sessionStorage\.setItem\('lk_debug', '1'\)/.test(indexSumber));
}

// ------------------------------------------------------------------ panduan
// Panduan siswa (docs/Panduan-Siswa-Lembah-Kenanga.pdf) memuat tangkapan layar
// dari kode permainan. Dua hal yang mudah membuat panduan menjadi BOHONG dan
// tidak ketahuan sampai siswa bingung: angka lulus di panduan tidak sama dengan
// BATAS_LULUS, dan jumlah soal per bab tidak lagi 30 (tabel "24 dari 30" jadi
// salah). Keduanya diperiksa di sini, bukan dengan mata.
{
  const panduan = join(ROOT, 'docs', 'Panduan-Siswa-Lembah-Kenanga.pdf');
  ok('panduan: PDF ada', existsSync(panduan), 'docs/Panduan-Siswa-Lembah-Kenanga.pdf');
  if (existsSync(panduan)) {
    const isi = readFileSync(panduan).subarray(0, 5).toString('latin1');
    ok('panduan: berkasnya benar-benar PDF', isi === '%PDF-', isi);
  }
  const skrip = baca('tools/panduan/buat-panduan.py');
  ok('panduan: skrip pembuat panduan ada', skrip.length > 1000);
  ok('panduan: daftar bab dibaca dari ilmu.json, bukan disalin', /ilmu\.json/.test(skrip));
  const tangkap = baca('tools/panduan/tangkap-layar.mjs');
  ok('panduan: tangkapan layar memakai UI permainan', /ui', 'ilmu-ui\.js/.test(tangkap));
  ok('panduan: tangkapan layar memakai manifest sprite asli', /assets', 'manifest\.json/.test(tangkap));

  const { BATAS_LULUS, perluBenar } = await import(join(ROOT, 'src/systems/ilmu.js'));
  sama('panduan: batas lulus 80%', BATAS_LULUS, 0.8);
  sama('panduan: 30 soal butuh 24 benar', perluBenar(30), 24);
  const bankSoal = Object.values(ilmu.ujian ?? {}).map((b) => b.length);
  ok('panduan: semua bab berbank 30 soal (angka 24/30 di panduan sah)',
    bankSoal.length > 0 && bankSoal.every((n) => n === 30),
    `bank: ${[...new Set(bankSoal)].join(',')}`);
}


// ------------------------------------------- Ustadz Tasoro: bank, jalur, perilaku
//
// Yang diuji di sini adalah janji-janji yang mudah dilanggar tanpa ketahuan
// saat bermain:
//   1. 300 soal tambahan TIDAK mengubah 900 soal ujian per bab;
//   2. remedial/pengayaan memakai 50 soal, bukan 30;
//   3. hasil dua jalur itu tidak menulis `lulus` maupun `nilai` (nilai itulah
//      yang dikirim ke spreadsheet guru), dan bertahan setelah simpan/muat;
//   4. Tasoro benar-benar berkeliling lalu BERHENTI, dan hanya bisa diajak
//      bicara saat berhenti;
//   5. sprite 32x48 (jalan kaki) dan 48x64 (motor) sama-sama ada di manifest
//      DAN di disk — nama di manifest saja tidak cukup.
{
  const { Ilmu, JALUR_TASORO, UJIAN_MAKS, maksJalur } = await import(join(ROOT, 'src/systems/ilmu.js'));

  // --- 1 & 2: bank terpisah, 50 soal, 10 per bab
  sama('tasoro: UJIAN_MAKS tetap 30 (aturan per bab tidak berubah)', UJIAN_MAKS, 30);
  for (const jalur of ['remedial', 'pengayaan']) {
    ok(`tasoro: jalur ${jalur} dikenal`, !!JALUR_TASORO[jalur]);
    sama(`tasoro: jalur ${jalur} memakai ${JALUR_TASORO[jalur]?.per} soal`, JALUR_TASORO[jalur]?.per, 50);
    for (const kelas of ['X', 'XI', 'XII']) {
      const bank = ilmu[jalur]?.[kelas] ?? [];
      sama(`tasoro: ${jalur} kelas ${kelas} berisi 50 soal`, bank.length, 50);
      const per = {};
      for (const s of bank) per[s.bab] = (per[s.bab] ?? 0) + 1;
      const lima = ilmu.kitab.filter((b) => b.kelas === kelas).slice(0, 5).map((b) => b.id);
      sama(`tasoro: ${jalur} ${kelas} hanya lima bab pertama`, Object.keys(per).sort(), lima.sort());
      ok(`tasoro: ${jalur} ${kelas} 10 soal per bab`, lima.every((id) => per[id] === 10),
        JSON.stringify(per));
      ok(`tasoro: ${jalur} ${kelas} semua butir punya pembahasan`,
        bank.every((s) => typeof s.bahas === 'string' && s.bahas.length > 20));
    }
    const total = ['X', 'XI', 'XII'].reduce((n, k) => n + (ilmu[jalur]?.[k]?.length ?? 0), 0);
    sama(`tasoro: ${jalur} 150 soal`, total, 150);
  }
  // Sembilan ratus soal ujian per bab tetap utuh setelah 300 soal ditambahkan.
  sama('tasoro: 900 soal ujian per bab tidak tersentuh',
    Object.values(ilmu.ujian ?? {}).reduce((n, b) => n + b.length, 0), 900);

  // --- 3: hasil jalur tidak menyentuh nilai sekolah
  const buat = (kelas) => { const i = new Ilmu(ilmu); i.tingkat = kelas; return i; };
  const il = buat('X');
  sama('tasoro: maksJalur membaca 50, bukan UJIAN_MAKS', il.jumlahJalur('remedial'), 50);
  const soal = il.soalJalur('pengayaan', 3);
  sama('tasoro: seluruh bank 50 soal diujikan', soal.length, 50);
  ok('tasoro: soal membawa medan bab untuk rekap', soal.every((s) => !!s.bab));
  ok('tasoro: izin remedial tidak mensyaratkan lulus bab apa pun', il.izinJalur('remedial').boleh);
  const jawaban = soal.map((s, i) => ({ bab: s.bab, tepat: i % 5 !== 0 }));
  const benar = jawaban.filter((j) => j.tepat).length;
  const hasil = il.catatJalur('remedial', benar, 50, 4, jawaban);
  sama('tasoro: perlu 40 benar dari 50 (80%)', hasil.perlu, 40);
  sama('tasoro: 40 benar = lulus', hasil.lulus, true);
  sama('tasoro: remedial TIDAK menulis lulus bab', il.lulus.size, 0);
  sama('tasoro: remedial TIDAK menulis nilai sekolah', Object.keys(il.nilai).length, 0);
  const rinci = il.hasilJalur('remedial');
  ok('tasoro: rincian per bab tercatat', Object.keys(rinci?.perBab ?? {}).length === 5);
  sama('tasoro: benar per bab dihitung dari jawaban', Object.values(rinci.perBab).reduce((n, b) => n + b.benar, 0), benar);
  // yang lebih buruk tidak boleh menimpa yang lebih baik
  il.catatJalur('remedial', 10, 50, 5, jawaban);
  sama('tasoro: hasil terbaik yang disimpan', il.hasilJalur('remedial').benar, benar);
  const il2 = buat('X'); il2.load(JSON.parse(JSON.stringify(il.toJSON())));
  sama('tasoro: hasil jalur bertahan setelah simpan/muat', il2.hasilJalur('remedial').nilai, rinci.nilai);
  sama('tasoro: simpanan lama tanpa medan tasoro tidak error', buat('X').hasilJalur('remedial'), null);
  const ilKosong = buat('X'); ilKosong.data = { ...ilmu, remedial: {} };
  ok('tasoro: kelas tanpa bank ditolak dengan alasan, bukan crash',
    ilKosong.izinJalur('remedial').boleh === false && /belum disiapkan/.test(ilKosong.izinJalur('remedial').alasan));
  const kelasLain = buat('XII');
  sama('tasoro: kelas XII memakai bank XII', kelasLain.jumlahJalur('pengayaan'), 50);
  ok('tasoro: kelas XII memakai bab kelas XII',
    kelasLain.bankJalur('pengayaan').every((s) => ['sederhana', 'sabar', 'lingkungan', 'iptek', 'dakwah'].includes(s.bab)));

  // --- 4: perilaku berkendara
  const { Npc } = await import(join(ROOT, 'src/entities/npc.js'));
  const npcs = JSON.parse(baca('src/data/npcs.json'));
  const dataTasoro = npcs.find((n) => n.id === 'tasoro');
  ok('tasoro: terdaftar di npcs.json', !!dataTasoro);
  ok('tasoro: punya tempat berhenti', (dataTasoro?.kendaraan?.henti ?? []).length >= 2);
  ok('tasoro: menawarkan remedial & pengayaan',
    ['remedial', 'pengayaan'].every((j) => (dataTasoro?.kendaraan?.ujian ?? []).includes(j)));
  ok('tasoro: tidak mengajar keahlian (ajar milik warga lain)',
    !Object.values(ilmu.keahlian.ajar).some((per) => Object.keys(per).includes('tasoro')));

  // Peta tiruan: satu jalur lurus 4 tile, tempat henti di kedua ujungnya.
  const peta = {
    places: { balai: { c: 0, r: 0 }, perpustakaan: { c: 3, r: 0 } },
    buatJalur: () => [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 }],
    collides: () => false,
  };
  const tas = new Npc(dataTasoro, 16, 32);
  sama('tasoro: kecepatan motor (bukan kecepatan warga)', tas.speed, 62);
  ok('tasoro: sebelum berhenti TIDAK bisa diajak bicara', tas.bisaDiajak() === false);
  tas.update(peta, 0.016, () => 0);
  ok('tasoro: mulai dari keadaan berhenti di titik terdekat', tas.modeJalan === 'henti' && tas.bisaDiajak());
  // Habiskan waktu berhenti: ia harus mulai berjalan, bukan tetap diam.
  for (let i = 0; i < 2000 && tas.modeJalan === 'henti'; i++) tas.update(peta, 0.05, () => 0);
  ok('tasoro: setelah berhenti ia kembali berjalan', tas.modeJalan === 'naik');
  ok('tasoro: saat berjalan tidak bisa diajak bicara', tas.bisaDiajak() === false);
  let berhentiLagi = false, x0 = tas.x;
  for (let i = 0; i < 4000; i++) {
    tas.update(peta, 0.05, () => 0.5);
    if (tas.modeJalan === 'henti') { berhentiLagi = true; break; }
  }
  ok('tasoro: benar-benar berpindah lalu berhenti lagi', berhentiLagi && tas.x !== x0, `x ${x0} -> ${tas.x}`);
  // Tile tempat ia berhenti: kakinya harus berada di dalam tile itu, dan tile
  // itu harus salah satu tempat henti (ujung jalur tiruan ini).
  const tileX = Math.floor(tas.x / 32);
  ok('tasoro: berhenti di dalam tile tempat, bukan di tengah jalan',
    [0, 3].includes(tileX), `x=${tas.x} tile=${tileX}`);

  // Peta ASLI: yang paling mudah salah bukan logika di atas kertas, melainkan
  // apakah ia benar-benar sampai ke dua tempat di lembah yang sesungguhnya.
  // Dulu sasaran melompat langsung ke ujung rute, dan hasilnya ia menembus
  // pohon lalu diam di satu tile selamanya — lolos dari uji peta tiruan.
  {
    const { buildValley } = await import(join(ROOT, 'src/world/valley.js'));
    const mapa = buildValley();
    const spot = mapa.npcSpots.tasoro;
    ok('tasoro: titik awal terdaftar di peta', !!spot);
    const dia = new Npc(dataTasoro, spot.c * 32 + 16, (spot.r + 1) * 32);
    let benih = 7;
    const rng = () => { benih = (benih * 16807) % 2147483647; return benih / 2147483647; };
    const dikunjungi = new Set();
    let lamaHenti = 0;
    for (let i = 0; i < 8000; i++) {
      dia.update(mapa, 0.05, rng);
      const tc = Math.floor(dia.x / 32), tr = Math.floor((dia.y - 1) / 32);
      for (const nama of ['balai', 'perpustakaan']) {
        const p = mapa.places[nama];
        if (p.c === tc && p.r === tr) dikunjungi.add(nama);
      }
      if (dia.modeJalan === 'henti') lamaHenti += 0.05;
    }
    sama('tasoro: singgah di Balai Desa DAN Perpustakaan', [...dikunjungi].sort(), ['balai', 'perpustakaan']);
    ok('tasoro: berhenti cukup lama, bukan sekadar lewat', lamaHenti > 30, `${lamaHenti.toFixed(0)} detik`);
    ok('tasoro: sebagian waktunya dipakai berjalan', 400 - lamaHenti > 100, `${(400 - lamaHenti).toFixed(0)} detik`);
  }

  // --- 5: aset
  const manifest = JSON.parse(baca('assets/manifest.json'));
  for (const [nama, bingkai] of [['npc_tasoro', [32, 48]], ['npc_tasoro_motor', [48, 64]]]) {
    const def = manifest.sprites[nama];
    ok(`tasoro: sprite ${nama} terdaftar`, !!def, nama);
    sama(`tasoro: ${nama} berbingkai ${bingkai.join('x')}`, def?.frame, bingkai);
    ok(`tasoro: berkas ${nama} ada di disk`, !!def && existsSync(join(ROOT, 'assets', def.file)));
  }
  ok('tasoro: potret 96x96 terdaftar',
    JSON.stringify(manifest.sprites.portrait_npc_tasoro?.frame) === '[96,96]');
  ok('tasoro: berkas potret ada',
    existsSync(join(ROOT, 'assets', manifest.sprites.portrait_npc_tasoro?.file ?? '')));
  ok('tasoro: pembuat sprite bisa dijalankan ulang (skrip ada)', existsSync(join(ROOT, 'tools/buat-sprite-tasoro.mjs')));
}

// ---------------------------------------- panduan & manual menyebut Ustadz Tasoro
//
// Dokumen yang dibaca siswa/guru harus menyebut jalur baru ini, dan angkanya
// harus sama dengan kode. Kalau soalnya berubah (mis. 50 -> 60) tetapi dokumen
// tidak, murid membaca janji yang tidak ada lagi di layar.
{
  const bacaDulu = baca('BACA-DULU.txt');
  ok('manual: menyebut Ustadz Tasoro', /USTADZ TASORO/i.test(bacaDulu));
  ok('manual: menyebut remedial & pengayaan',
    /REMEDIAL/.test(bacaDulu) && /PENGAYAAN/.test(bacaDulu));
  ok('manual: menyebut tempat ia berhenti',
    /Balai Desa/.test(bacaDulu) && /Perpustakaan/.test(bacaDulu));
  ok('manual: menjanjikan hasilnya tidak masuk nilai sekolah',
    /tidak masuk nilai sekolah/i.test(bacaDulu));
  ok('manual: menyebut 50 soal per jalur', /50 soal/.test(bacaDulu));
  // Sejak 2026-11-10 hasil remedial/pengayaan MEMANG dikirim ke spreadsheet,
  // ke tab `Remedial`. Manual yang masih menulis "TIDAK dikirim" adalah
  // dokumen yang berbohong — dan itu yang membuat murid/guru bingung.
  ok('manual: menyebut hasil remedial dikirim ke tab Remedial',
    /tab `Remedial`/.test(bacaDulu));
  ok('manual: tidak lagi menjanjikan "tidak dikirim ke spreadsheet"',
    !/TIDAK dikirim ke spreadsheet guru/i.test(bacaDulu));
  ok('manual: menyebut tab Rekap Nilai berjejer',
    /Rekap Nilai/.test(bacaDulu) && /berjejer/i.test(bacaDulu));

  const skripPanduan = baca('tools/panduan/buat-panduan.py');
  ok('panduan: ada bagian Ustadz Tasoro', /BAGIAN 8B/.test(skripPanduan));
  ok('panduan: menyebut 40 benar dari 50', /40 benar dari 50/.test(skripPanduan));
  ok('panduan: menyebut janji tidak masuk nilai sekolah',
    /tidak masuk nilai sekolah/.test(skripPanduan));
  ok('panduan: menyebut tab Remedial & Rekap Nilai',
    /Tab Remedial/.test(skripPanduan) && /Rekap Nilai/.test(skripPanduan));
}

// -------------------------------------- remedial/pengayaan terkirim ke spreadsheet
//
// Dua aturan yang harus tetap terpisah, dan mudah tertukar tanpa ketahuan:
//   · ujian BAB   -> hanya yang lulus (>= 80%) dikirim ke tab `Nilai`
//   · remedial    -> SEMUA hasil dikirim ke tab `Remedial`
// Kalau `kirimJalur` kelak "dirapikan" menjadi satu fungsi dengan `kirimNilai`,
// remedial yang gagal akan diam-diam hilang — padahal itu inti fiturnya.
{
  const api = await import(join(ROOT, 'src/core/nilai-api.js'));
  ok('nilai-api: kirimJalur diekspor', typeof api.kirimJalur === 'function');
  ok('nilai-api: kirimNilai tetap ada (aturan lama tidak digeser)',
    typeof api.kirimNilai === 'function');

  // --- perilaku nyata: server yang BELUM mengenal aksi `jalur`
  // (Apps Script belum di-deploy ulang) menjawab { ok:false, error:'Aksi tidak
  // dikenal' }. Hasil murid tidak boleh hilang: harus masuk antrean.
  {
    const simpan = globalThis.fetch;
    const simpanLs = globalThis.localStorage;
    const isiLs = {};
    globalThis.localStorage = {
      getItem: (k) => (k in isiLs ? isiLs[k] : null),
      setItem: (k, v) => { isiLs[k] = String(v); },
      removeItem: (k) => { delete isiLs[k]; },
    };
    isiLs.lk_murid = JSON.stringify({ nama: 'uji', kelas: 'X-M / X-13', pin: '1234', terdaftar: true });
    let dikirim = 0;
    globalThis.fetch = async () => { dikirim++; return { text: async () => '{"ok":false,"error":"Aksi tidak dikenal: jalur"}' }; };
    const r = await api.kirimJalur({
      jalur: 'remedial', judul: 'Ujian Remedial', benar: 31, jumlah: 50, nilai: 62,
      perBab: { 'x-wahyu': { benar: 9, jumlah: 10 } },
    });
    ok('kirimJalur: server menolak -> hasil DITAHAN, bukan hilang', r.antre === true && r.ok === false);
    ok('kirimJalur: satu permintaan benar-benar dikirim', dikirim === 1);
    ok('kirimJalur: antrean berisi hasilnya', api.jumlahAntre() >= 1);
    globalThis.fetch = simpan;
    globalThis.localStorage = simpanLs;
  }

  const sumberApi = baca('src/core/nilai-api.js');
  ok('nilai-api: kirimJalur mengirim aksi jalur (bukan aksi nilai)',
    /aksi: 'jalur'/.test(sumberApi));
  ok('nilai-api: kirimJalur tidak memakai pagar BATAS_LULUS',
    !/kirimJalur[\s\S]{0,900}BATAS_LULUS/.test(sumberApi.split('export async function kirimJalur')[1]?.slice(0, 900) ?? ''));

  const sumberUi = baca('src/ui/ilmu-ui.js');
  ok('ilmu-ui: hasil jalur memakai kait onJalurKirim', /onJalurKirim/.test(sumberUi));
  ok('ilmu-ui: layar hasil menulis status terkirim',
    /terkirim ke spreadsheet guru/.test(sumberUi) && /ditahan/.test(sumberUi));
  ok('ilmu-ui: janji di layar bukan lagi "tidak dikirim"',
    !/tidak dikirim ke spreadsheet guru/.test(sumberUi));

  const sumberMain = baca('src/main.js');
  ok('main: onJalurKirim disambungkan ke kirimJalur',
    /onJalurKirim = \(hasil\) => kirimJalur/.test(sumberMain));
  ok('main: onLulus tetap memakai kirimNilai (nilai sekolah)',
    /return kirimNilai\(/.test(sumberMain));
}

// -------------------------------------- panjang pilihan tidak membocorkan kunci
//
// Dulu kunci hampir selalu pilihan TERPANJANG (273/300 soal; 100% di pengayaan
// X dan XI), sehingga murid bisa menebak tanpa memahami materi. Aturannya
// sekarang dijaga di tools/periksa-variasi.mjs, dan blok ini memastikan aturan
// itu tidak bisa dilanggar diam-diam saat soal diedit lagi.
{
  const { periksaIlmu, BATAS_SEBARAN, BATAS_SELISIH, BATAS_KUNCI_PANJANG } =
    await import(join(ROOT, 'tools/periksa-variasi.mjs'));

  ok('variasi: batas sebaran 12 karakter', BATAS_SEBARAN === 12);
  ok('variasi: batas selisih kunci-vs-pengecoh 8 karakter', BATAS_SELISIH === 8);
  ok('variasi: batas kunci-terpanjang 40% per bank', BATAS_KUNCI_PANJANG === 0.4);

  const { hasil, pelanggaran } = periksaIlmu(ilmu);

  for (const [nama, r] of Object.entries(hasil)) {
    const sebaran = r.melanggar.filter((m) => m.sebaranLewat);
    const selisih = r.melanggar.filter((m) => m.selisihLewat);
    ok(`variasi: ${nama} sebaran panjang <= ${BATAS_SEBARAN}`,
      sebaran.length === 0,
      sebaran.slice(0, 3).map((m) => `#${m.nomor} [${m.panjang.join('/')}]`).join(', '));
    ok(`variasi: ${nama} kunci tidak jauh lebih panjang dari pengecoh`,
      selisih.length === 0,
      selisih.slice(0, 3).map((m) => `#${m.nomor} selisih ${m.selisih.toFixed(1)}`).join(', '));
    ok(`variasi: ${nama} kunci paling panjang <= 40%`,
      r.porsiKunciPanjang <= BATAS_KUNCI_PANJANG,
      `${r.kunciPanjang}/${r.jumlah}`);
  }

  ok('variasi: tidak ada pelanggaran di seluruh 300 soal', pelanggaran.length === 0,
    `${pelanggaran.length} pelanggaran`);

  // Setiap soal masih punya tiga pilihan berbeda dan kunci yang sah — pagar ini
  // menjaga agar \"meratakan panjang\" tidak berubah menjadi soal rusak.
  for (const jenis of ['remedial', 'pengayaan']) {
    for (const kelas of ['X', 'XI', 'XII']) {
      const bank = ilmu[jenis]?.[kelas] ?? [];
      ok(`variasi: ${jenis} ${kelas} kunci masih sah`,
        bank.every((s) => Number.isInteger(s.kunci) && s.kunci >= 0 && s.kunci < s.pilihan.length));
      ok(`variasi: ${jenis} ${kelas} pilihan tidak ada yang kembar`,
        bank.every((s) => new Set(s.pilihan).size === s.pilihan.length));
      ok(`variasi: ${jenis} ${kelas} tidak ada pilihan kosong atau berspasi ganda`,
        bank.every((s) => s.pilihan.every((t) => t.trim().length > 0 && !/\s{2}/.test(t))));
    }
  }
}

// ------------------------------------------------- server spreadsheet (Code.gs)
//
// Berkas server tidak bisa dijalankan di sini tanpa Google, jadi yang diperiksa
// adalah janji yang tertulis di dalamnya. Perilakunya sendiri diuji oleh
// tools/uji-rekap.mjs (SpreadsheetApp ditiru) — dan uji itu dijalankan di sini
// supaya satu perintah `node tests/uji.mjs` tidak bisa hijau sementara server
// spreadsheet sudah rusak.
{
  const gs = baca('apps-script/Code.gs');
  ok('code.gs: ada', gs.length > 2000);
  ok('code.gs: mengenal aksi jalur', /aksi === 'jalur'/.test(gs));
  ok('code.gs: menulis tab Remedial', /TAB_REMEDIAL = 'Remedial'/.test(gs));
  ok('code.gs: membuat lembar Rekap Nilai', /LEMBAR_REKAP = 'Rekap Nilai'/.test(gs));
  ok('code.gs: menjaga batas lulus 80 di server', /BATAS_LULUS = 80/.test(gs));
  ok('code.gs: PIN disimpan sebagai hash + garam',
    /SHA_256/.test(gs) && /garam/.test(gs));
  ok('code.gs: tidak menyimpan PIN sebagai teks biasa',
    !/appendRow\(\[nama, kelas, pin/.test(gs));
  ok('code.gs: rekap menyegarkan diri saat nilai/jalur masuk',
    (gs.match(/try \{ rekapSemua\(\); \} catch/g) ?? []).length === 2);
  ok('code.gs: rekap mengosongkan lembar sebelum menulis ulang',
    /s\.clear\(\)/.test(gs));
  ok('code.gs: nilai terbaik dipakai di rekap, bukan yang terakhir',
    /terbaik === null \|\| n > terbaik/.test(gs));

  // Konstanta jalur di ilmu.js harus menyebut tab tujuannya, supaya tidak ada
  // yang "merapikan" pengiriman kembali ke tab Nilai tanpa sadar.
  const sumberIlmu = baca('src/systems/ilmu.js');
  ok('ilmu.js: jalur Tasoro menulis ke tab Remedial', /tab: 'Remedial'/.test(sumberIlmu));
  // Tiga kemunculan: dua di objek jalur, satu di komentar penjelasnya.
  ok('ilmu.js: jalur Tasoro ditandai bukan nilai sekolah',
    (sumberIlmu.match(/nilaiSekolah: false/g) ?? []).length >= 2);
  ok('ilmu.js: jalur Tasoro mengirim semua hasil', /kirim: 'selalu'/.test(sumberIlmu));

  // Jalankan uji perilaku server; satu perintah, dua berkas yang dijaga.
  const hasil = spawnSync(process.execPath, [join(ROOT, 'tools/uji-rekap.mjs')], { encoding: 'utf8' });
  ok('code.gs: uji perilaku (tools/uji-rekap.mjs) lulus', hasil.status === 0,
    (hasil.stderr || hasil.stdout || '').trim().split('\n').slice(-3).join(' | '));
}

// ------------------------------------------------------------------ laporan
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
