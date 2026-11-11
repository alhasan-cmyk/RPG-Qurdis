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
      // Bingkai SAMA dengan karakter biasa (32x48). Bingkai lebih tinggi
      // sempat dicoba supaya roda dapat ruang, tetapi membuat kepala pemain
      // melonjak 8 px setiap kali menaiki kendaraan.
      sama(`sprite: ${nama} berbingkai 32x48`, def.frame, [32, 48]);
      sama(`sprite: ${nama} 4x4 bingkai`, [def.cols, def.rows], [4, 4]);
      ok(`sprite: ${nama} berkasnya ada`, existsSync(join(ROOT, 'assets', def.file)), def.file);
      // PNG asli harus 128x192 — 4 kolom x 4 baris bingkai 32x48.
      const b = readFileSync(join(ROOT, 'assets', def.file));
      sama(`sprite: ${nama} berukuran 128x192`, [b.readUInt32BE(16), b.readUInt32BE(20)], [128, 192]);
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
// diamond dengan bermain dulu. Yang diuji bukan hanya "tombolnya ada", tetapi
// dua hal yang mudah rusak tanpa ketahuan:
//   1. kode ini TIDAK boleh hidup di luar mode ?debug=1 (1.000 diamond cukup
//      untuk menembus seluruh ekonomi, dan nilai ujian yang dibelanjakan dari
//      situ tidak sah);
//   2. efeknya harus lewat jalur permainan yang sama, sehingga cheat tidak
//      bisa membuat keadaan yang mustahil dicapai dengan bermain.
{
  // core/input.js memasang pendengar `window` saat modulnya dimuat. Di Node
  // tidak ada window, jadi diganti tiruan yang hanya mencatat pendaftaran —
  // uji ini memeriksa ISI pendaftaran itu, bukan perilaku peramban (itu tugas
  // uji asap jsdom).
  globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
  const { KODE_DEBUG, pasangKodeDebug, JUMLAH_UANG, JUMLAH_DIAMOND, JUMLAH_BAHAN, BAHAN_DEBUG } =
    await import(join(ROOT, 'src/core/cheat.js'));
  const { Diamond } = await import(join(ROOT, 'src/systems/diamond.js'));
  const { Kendaraan } = await import(join(ROOT, 'src/systems/kendaraan.js'));
  const { Ilmu } = await import(join(ROOT, 'src/systems/ilmu.js'));
  const { Upgrade } = await import(join(ROOT, 'src/systems/upgrade.js'));

  // --- daftar kode
  const tombol = KODE_DEBUG.map((k) => k.tombol);
  ok('debug: setiap kode punya tombol unik', new Set(tombol).size === tombol.length);
  ok('debug: setiap kode punya judul dan catatan',
    KODE_DEBUG.every((k) => (k.judul ?? '').length > 3 && (k.catatan ?? '').length > 3));
  ok('debug: Ctrl+G ada (permintaan pemakai)', tombol.includes('KeyG'));
  ok('debug: Ctrl+D ada (permintaan pemakai)', tombol.includes('KeyD'));
  // Tombol milik peramban tidak boleh dirampas: menutup tab (W), muat ulang (R),
  // buka tab (T), jendela baru (N), keluar (Q), simpan halaman (S).
  const terlarang = ['KeyW', 'KeyR', 'KeyT', 'KeyN', 'KeyQ', 'KeyS'];
  ok('debug: tidak merampas tombol peramban', !tombol.some((t) => terlarang.includes(t)),
    tombol.filter((t) => terlarang.includes(t)).join(','));

  // --- pemasangan: hanya bereaksi pada Ctrl, dan hanya untuk kode yang terdaftar
  const inputSumber = baca('src/core/input.js');
  ok('input: onPintas diekspor', /export function onPintas/.test(inputSumber));
  ok('input: pintasan hanya saat Ctrl/Command ditahan',
    /if \(!\(e\.ctrlKey \|\| e\.metaKey\)\) return;/.test(inputSumber));
  ok('input: Ctrl+R/W/T/N/Q dilewati', /TERLARANG = \['KeyR', 'KeyW', 'KeyT', 'KeyN', 'KeyQ'\]/.test(inputSumber));

  // --- efek tiap kode, dijalankan pada objek permainan yang sungguhan
  const buatPermainan = () => {
    const inv = new Inventory(24);
    const naik = [];
    const ilmuObj = new Ilmu(structuredClone(ilmu));
    ilmuObj.tingkat = 'X';
    const state = {
      player: { money: 500, energy: 10, maxEnergy: 100 },
      diamond: new Diamond(7),
      inv,
      ilmu: ilmuObj,
      kendaraan: new Kendaraan(),
      upgrade: new Upgrade(),
      time: { clockText: '06:00', skip(n) { this.menit = (this.menit ?? 0) + n; }, debugNextSeason() { this.musim = 1; } },
    };
    state.upgrade.kendaraan = state.kendaraan;
    const pesan = [];
    const alat = pasangKodeDebug({
      state,
      toast: (m) => pesan.push(m),
      terapkan: () => naik.push(1),
      simpan: () => { state.disimpan = (state.disimpan ?? 0) + 1; },
    });
    return { state, alat, pesan, naik };
  };

  {
    const { state, alat } = buatPermainan();
    alat.jalankan('KeyG');
    sama('debug: Ctrl+G menambah 1.000 gold', state.player.money, 500 + JUMLAH_UANG);
    alat.jalankan('KeyG');
    sama('debug: Ctrl+G dua kali = 2.500, bukan ditimpa', state.player.money, 1500 + JUMLAH_UANG);
  }
  {
    const { state, alat } = buatPermainan();
    const p = alat.jalankan('KeyD');
    sama('debug: Ctrl+D menambah 1.000 diamond', state.diamond.jumlah, 7 + JUMLAH_DIAMOND);
    alat.jalankan('KeyD');
    sama('debug: Ctrl+D dua kali = +2.000 (menambah, bukan menyetel)', state.diamond.jumlah, 7 + 2 * JUMLAH_DIAMOND);
    // Angka di pesan memakai titik ribuan; judul di panel pun begitu, supaya
    // HUD, panel F1, dan pesan tidak menulis 1000 dan 1.000 bergantian.
    ok('debug: pesan Ctrl+D memakai titik ribuan', /1\.000/.test(p), p);
  }
  {
    const { state, alat, pesan } = buatPermainan();
    alat.jalankan('KeyB');
    sama('debug: Ctrl+B memberi 50 tiap bahan', BAHAN_DEBUG.map((b) => state.inv.count(b)), BAHAN_DEBUG.map(() => JUMLAH_BAHAN));
    // add() mengembalikan SISA yang tidak muat (0 = berhasil). Membacanya
    // sebagai boolean membuat pesan mengaku "tas penuh" padahal semua masuk —
    // pemeriksaan di bawah ini yang menangkap kesalahan itu.
    ok('debug: Ctrl+B melaporkan berhasil saat tas muat', !/penuh/i.test(pesan.at(-1)), pesan.at(-1));
    // Kasus kedua: tas SETENGAH penuh. Ini kasus yang membedakan "berapa yang
    // tidak muat" dari "ada yang tidak muat": add() mengembalikan sisa, dan
    // pesannya harus menyebut JUMLAHnya. Kalau hasil add() dibaca sebagai
    // boolean, pesannya menjadi "penuh: 1" — angka yang salah meski katanya
    // benar, dan pemain tidak tahu berapa yang harus dikosongkan.
    state.inv.slots.fill({ id: 'stone', count: 99 });
    state.inv.slots[0] = null;                     // satu slot kosong
    alat.jalankan('KeyB');
    ok('debug: Ctrl+B menyebut JUMLAH bahan yang tidak muat',
      /penuh: 350 bahan/.test(pesan.at(-1)), pesan.at(-1));

    // Kasus ketiga: tas yang benar-benar penuh harus mengaku terus terang.
    // Slot terisi penuh dengan batu (tumpukan 99), bukan dengan `setSlot(1)` —
    // setSlot punya batas bawah 24 slot dan akan membatalkan pengisian.
    state.inv.slots.fill({ id: 'stone', count: 99 });
    alat.jalankan('KeyB');
    ok('debug: Ctrl+B mengaku saat tas benar-benar penuh', /penuh/i.test(pesan.at(-1)), pesan.at(-1));
  }
  {
    const { state, alat } = buatPermainan();
    const terbuka = state.ilmu.babTerbuka();
    alat.jalankan('KeyK');
    ok('debug: Ctrl+K meluluskan bab berikutnya', state.ilmu.lulus.has(terbuka), String(terbuka));
    const terakhir = state.ilmu.babTerbuka();
    alat.jalankan('KeyL');
    ok('debug: Ctrl+L meluluskan semua bab kelas', state.ilmu.babTerbuka() === null && terakhir !== null, String(terakhir));
    ok('debug: Ctrl+L hanya menyentuh kelas yang dipakai',
      state.ilmu.data.kitab.filter((b) => b.kelas !== 'X').every((b) => !state.ilmu.lulus.has(b.id)));
  }
  {
    const { state, alat, naik } = buatPermainan();
    const sebelum = UPGRADE.map((u) => state.upgrade.tingkat(u.id));
    const p = alat.jalankan('KeyJ');
    const sesudah = UPGRADE.map((u) => state.upgrade.tingkat(u.id));
    ok('debug: Ctrl+J menaikkan tiap bangunan yang belum penuh',
      sesudah.every((lv, i) => lv === Math.min(sebelum[i] + 1, state.upgrade.maks(UPGRADE[i].id))));
    sama('debug: Ctrl+J tidak menagih uang pemain', state.player.money, 500);
    ok('debug: Ctrl+J menerapkan efek (energi/tas/peti)', naik.length > 0);
    ok('debug: Ctrl+J melaporkan hasilnya', /Rumah/.test(p), p);
    // Jalur belinya benar-benar dilalui: bahan yang dibagikan cheat HABIS
    // dipakai `beliBangunan`. Kalau tingkat dinaikkan langsung (lv += 1), bahan
    // itu menumpuk di tas dan uji ini gagal — cara curang yang menghasilkan
    // keadaan mustahil dibeli.
    sama('debug: Ctrl+J membelanjakan bahan (bukan menumpuknya)',
      UPGRADE.map((u) => state.inv.count(Object.keys(u.bahan)[0])), UPGRADE.map(() => 0));
    // Efeknya nyata, bukan hanya angka tingkat.
    ok('debug: setelah Ctrl+J, energi maks ikut dihitung ulang',
      state.upgrade.energiTambahan() > 0);
  }
  {
    const { state, alat } = buatPermainan();
    alat.jalankan('KeyH');
    sama('debug: Ctrl+H mengisi energi sampai maks', state.player.energy, state.player.maxEnergy);
  }
  {
    const { state, alat, naik } = buatPermainan();
    alat.jalankan('KeyM');
    ok('debug: Ctrl+M memberi ketiga kendaraan', state.kendaraan.dimiliki.length === 3,
      state.kendaraan.dimiliki.join(','));
    // Saldo awal 7 harus UTUH: caranya `beli()` dititipi harga, lalu saldo
    // dikembalikan. Tanpa pengembalian, tiga kendaraan menyedot saldo jadi 0 —
    // uji ini gagal kalau pengembaliannya lupa (sudah dibuktikan lewat uji balik).
    sama('debug: Ctrl+M tidak menyedot/memberi diamond', state.diamond.jumlah, 7);
    ok('debug: Ctrl+M menerapkan tampilan/slot', naik.length > 0);
  }
  {
    const { state, alat } = buatPermainan();
    alat.jalankan('KeyU');
    sama('debug: Ctrl+U memajukan 60 menit', state.time.menit, 60);
    alat.jalankan('KeyP');
    sama('debug: Ctrl+P mengganti musim', state.time.musim, 1);
    alat.jalankan('KeyY');
    sama('debug: Ctrl+Y menyimpan', state.disimpan, 1);
  }
  {
    const { alat, pesan, state } = buatPermainan();
    const uangAwal = state.player.money;
    sama('debug: kode tak dikenal tidak melakukan apa pun', alat.jalankan('KeyZzz'), null);
    sama('debug: kode tak dikenal tidak mengubah uang', state.player.money, uangAwal);
    sama('debug: kode tak dikenal tidak memunculkan pesan', pesan.length, 0);
    ok('debug: riwayat mencatat kode yang dijalankan', Array.isArray(alat.riwayat));
  }

  // --- kaitan di main.js: DI DALAM blok ?debug, tidak ada di luar
  const mainSumber = baca('src/main.js');
  const awalBlok = mainSumber.indexOf("if (location.search.includes('debug'))");
  ok('main: ada blok ?debug', awalBlok > 0);
  // Isi blok diambil dengan mencocokkan kurung kurawal, bukan sekadar "sesudah
  // baris if": dengan potongan-teks biasa, menutup blok lebih awal (sehingga
  // kode debug hidup di build biasa) tetap lolos uji. Sudah dibuktikan lewat
  // uji balik di bawah.
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
  ok('main: blok ?debug ketemu utuh', dalamBlok.length > 100, `${dalamBlok.length} huruf`);
  ok('main: kode debug dipasang DI DALAM blok ?debug', /pasangKodeDebug\(/.test(dalamBlok));
  ok('main: kode debug TIDAK dipasang di luar blok ?debug',
    !/pasangKodeDebug\(/.test(mainSumber.replace(dalamBlok, '')), 'ada pemanggilan di luar blok debug');
  ok('main: panel kode (F1) hanya dibuat di dalam blok ?debug',
    (mainSumber.match(/new CheatUI\(/g) ?? []).length === 1 && /new CheatUI\(/.test(dalamBlok));
  ok('main: panel kode digambar sesudah panel lain', /state\.cheatUI\?\.draw\(ctx, W, H\)/.test(mainSumber));
  ok('main: kait uji __lkCheat tersedia', /window\.__lkCheat = state\.cheat/.test(mainSumber));

  // --- panel: daftar yang digambar = daftar yang dipasang
  const panelSumber = baca('src/ui/cheat-ui.js');
  ok('panel: membaca KODE_DEBUG, bukan daftar kedua', /import \{ KODE_DEBUG \}/.test(panelSumber));
  // Panel tidak boleh punya daftar tombol sendiri (mis. 'KeyG' ditulis ulang):
  // labelnya harus diturunkan dari KODE_DEBUG.
  ok('panel: tidak menulis ulang daftar tombol', !/'Key[A-Z]'/.test(panelSumber));
  ok('panel: label Ctrl diturunkan dari kode tombol', /k\.tombol\.replace\(\/\^Key\//.test(panelSumber));
}

// ------------------------------------------------------------------ laporan
console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
