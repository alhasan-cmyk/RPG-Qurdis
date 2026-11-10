// Pemeriksa data pelajaran — dijalankan sebelum push, bukan saat bermain.
//
// Kenapa ada: hubungan "warga ↔ bab ↔ alat ↔ papan Ragam Usaha" dijaga di tiga
// tempat berbeda (data/ilmu.json, systems/upgrade.js, world/valley.js). Kesalahan
// di sana tidak membuat game error — ia hanya menampilkan keterangan yang salah,
// dan itu paling sulit ditemukan. Contoh nyata yang ditangkap berkas ini:
//   - bab yang diajarkan dua warga di kelas yang sama,
//   - bab yang dipakai dua peningkatan sekaligus (dulu Kebun Bibit memakai bab
//     pembuka alat penyiram, jadi satu bab ditagih dua kali),
//   - label alat yang tidak ada di permainan ("Pena", "Lesung", "Sekop").
//
// Jalankan:  node tools/periksa-data.mjs
// Keluar dengan kode 1 kalau ada masalah, jadi bisa dipakai di CI atau pre-push.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(AKAR, p), 'utf8');

const ilmu = JSON.parse(baca('src/data/ilmu.json'));

// ESM asli dipakai apa adanya — tidak ada salinan aturan di berkas ini.
const { UPGRADE } = await import(join(AKAR, 'src/systems/upgrade.js'));
const { itemDef, setItemData } = await import(join(AKAR, 'src/systems/inventory.js'));

// Alat yang benar-benar ada di permainan, dibaca dari data item — bukan daftar
// yang ditulis ulang di sini, supaya pemeriksa ini tidak bisa ikut basi.
const itemData = JSON.parse(baca('src/data/items.json'));
setItemData(itemData);
const ALAT_SAH = new Set(Object.values(itemData).filter((d) => d?.tool).map((d) => d.tool));
// Nama Indonesia yang juga diterima sebagai label ("beliung" untuk alat pickaxe).
const ALAT_SAH_KATA = new Set([...ALAT_SAH]);
for (const d of Object.values(itemData)) {
  if (d?.tool) ALAT_SAH_KATA.add(String(d.name ?? '').toLowerCase());
}

const masalah = [];
const catat = (pesan) => masalah.push(pesan);
const ids = ilmu.kitab.map((b) => b.id);
const kelas = Object.fromEntries(ilmu.kitab.map((b) => [b.id, b.kelas]));
const nama = ilmu.npcNama ?? {};

// ---------------------------------------------------------------- 1. bab & kelas
for (const k of ['X', 'XI', 'XII']) {
  const bab = ids.filter((id) => kelas[id] === k);
  if (!bab.length) catat(`kelas ${k} tidak punya bab sama sekali`);
  for (const id of bab) {
    const bank = ilmu.ujian?.[id];
    if (!Array.isArray(bank) || !bank.length) catat(`${id}: tidak ada soal ujian`);
    else {
      bank.forEach((s, i) => {
        if (!s.tanya || !Array.isArray(s.pilihan) || !s.pilihan.length) catat(`${id} soal #${i + 1}: tidak lengkap`);
        if (typeof s.kunci !== 'number' || s.kunci < 0 || s.kunci >= (s.pilihan?.length ?? 0)) {
          catat(`${id} soal #${i + 1}: kunci jawaban di luar jangkauan`);
        }
        if (!s.bahas) catat(`${id} soal #${i + 1}: tanpa pembahasan`);
      });
    }
  }
}

// -------------------------------------------------- 2. pembagian bab per warga
const ajar = ilmu.keahlian?.ajar ?? {};
for (const k of Object.keys(ajar)) {
  const pemilik = new Map();
  for (const [npc, daftar] of Object.entries(ajar[k])) {
    for (const id of daftar) {
      if (!ids.includes(id)) catat(`ajar ${k}: ${nama[npc] ?? npc} mengajar bab tak dikenal "${id}"`);
      else if (kelas[id] !== k) catat(`ajar ${k}: ${nama[npc] ?? npc} mengajar bab kelas ${kelas[id]} ("${id}")`);
      if (pemilik.has(id)) catat(`ajar ${k}: "${id}" diajarkan ${nama[pemilik.get(id)]} DAN ${nama[npc] ?? npc}`);
      else pemilik.set(id, npc);
    }
  }
  const belum = ids.filter((id) => kelas[id] === k && !pemilik.has(id));
  if (belum.length) catat(`ajar ${k}: bab tidak diajar siapa pun -> ${belum.join(', ')}`);
}

// --------------------------------- 3. alat: pembuka & papan tidak berebut satu bab
const syaratAlat = ilmu.keahlian?.syarat ?? {};
const pembukaAlat = new Map();          // kitabId -> [kelas, alat]
for (const [k, perAlat] of Object.entries(syaratAlat)) {
  for (const [alat, id] of Object.entries(perAlat)) {
    if (!ids.includes(id)) catat(`syarat ${k}.${alat}: bab tak dikenal "${id}"`);
    else if (kelas[id] !== k) catat(`syarat ${k}.${alat}: bab kelas ${kelas[id]} ("${id}")`);
    if (!ALAT_SAH.has(alat)) catat(`syarat ${k}: alat "${alat}" tidak ada di hotbar`);
    if (pembukaAlat.has(id)) catat(`"${id}" jadi pembuka dua alat (${pembukaAlat.get(id)} & ${alat})`);
    else pembukaAlat.set(id, `${k}.${alat}`);
  }
}
for (const [k, guru] of Object.entries(ilmu.keahlian?.guru ?? {})) {
  if (!(nama[guru])) catat(`guru alat "${k}" menunjuk warga tak dikenal "${guru}"`);
}

// ------------------------------------------------------- 4. papan Ragam Usaha
const papanPerKelas = new Map();
const tumpangTindih = [];           // papan memakai bab yang sama dengan pembuka alat
for (const u of UPGRADE) {
  if (u.alat && !ALAT_SAH_KATA.has(String(u.alat).toLowerCase())) {
    catat(`upgrade "${u.judul}": label alat "${u.alat}" bukan alat yang ada di permainan`);
  }
  for (const [k, id] of Object.entries(u.bab ?? {})) {
    if (!ids.includes(id)) { catat(`upgrade "${u.judul}" (${k}): bab tak dikenal "${id}"`); continue; }
    if (kelas[id] !== k) { catat(`upgrade "${u.judul}" (${k}): bab kelas ${kelas[id]} ("${id}")`); continue; }
    if (!papanPerKelas.has(k)) papanPerKelas.set(k, new Map());
    const peta = papanPerKelas.get(k);
    if (peta.has(id)) catat(`upgrade ${k}: "${id}" dipakai "${peta.get(id)}" dan "${u.judul}"`);
    else peta.set(id, u.judul);
    if (pembukaAlat.has(id)) tumpangTindih.push({ k, id, judul: u.judul, alat: pembukaAlat.get(id) });
  }
  if (!Object.keys(u.bahan ?? {}).length) catat(`upgrade "${u.judul}": tanpa bahan`);
  if (typeof u.efek !== 'function') catat(`upgrade "${u.judul}": tanpa efek`);
}

// Tumpang-tindih papan vs pembuka alat TIDAK selalu bisa dihindari: kelas X punya
// 12 bab, sedangkan 6 alat + 7 papan meminta 13. Jadi aturannya bukan "dilarang",
// melainkan "tidak boleh selama masih ada bab yang belum dipakai" — kalau ada,
// berarti penempatannya bisa diperbaiki dan memang perlu diperbaiki.
for (const k of ['X', 'XI', 'XII']) {
  const babKelas = ids.filter((id) => kelas[id] === k);
  const pembukaKelas = new Set(Object.values(syaratAlat[k] ?? {}));
  const papanKelas = UPGRADE.filter((u) => u.bab?.[k]);
  // Bab yang bukan pembuka alat = pilihan bebas. Kalau jumlahnya lebih sedikit
  // daripada jumlah papan, sebagian papan PASTI berbagi bab dengan alat.
  const bebasMurni = babKelas.filter((id) => !pembukaKelas.has(id));
  const minimal = Math.max(0, papanKelas.length - bebasMurni.length);
  const tabrakan = tumpangTindih.filter((t) => t.k === k);

  if (tabrakan.length === minimal) {
    console.log(`catatan: papan ${k}: ${tabrakan.length} papan berbagi bab dengan alat `
      + `(minimal ${minimal} karena hanya ${bebasMurni.length} bab bebas untuk `
      + `${papanKelas.length} papan) — tidak ada yang bisa diperbaiki.`);
  } else if (tabrakan.length > minimal) {
    const namaAlat = Object.fromEntries(Object.entries(syaratAlat[k] ?? {}).map(([a, id]) => [id, a]));
    for (const t of tabrakan) {
      const sisa = babKelas.filter((id) => !pembukaKelas.has(id)
        && !UPGRADE.some((u) => u.id !== t.id && u.bab?.[k] === id));
      catat(`papan ${k}: "${t.judul}" memakai ${t.id} yang juga pembuka alat ${namaAlat[t.id]}`
        + (sisa.length ? `; bab bebas yang belum dipakai: ${sisa.join(', ')}` : '')
        + ` — seharusnya cukup ${minimal} papan yang berbagi bab, sekarang ${tabrakan.length}`);
    }
  }
}

// --------------------------------------------- 5. soal latihan harian per warga
const npcSoal = ilmu.npc ?? {};
for (const [warga, daftar] of Object.entries(npcSoal)) {
  if (!nama[warga]) catat(`npc "${warga}" tidak punya nama di npcNama`);
  for (const s of daftar) {
    if (!ids.includes(s.kitab)) catat(`latihan ${nama[warga] ?? warga}: bab tak dikenal "${s.kitab}"`);
    if (typeof s.kunci !== 'number' || s.kunci < 0 || s.kunci >= (s.pilihan?.length ?? 0)) {
      catat(`latihan ${nama[warga] ?? warga}: kunci jawaban di luar jangkauan`);
    }
  }
}
for (const k of ['X', 'XI', 'XII']) {
  const n = Object.values(npcSoal).flat().filter((s) => kelas[s.kitab] === k).length;
  if (!n) catat(`kelas ${k}: tidak ada soal latihan harian sama sekali`);
}

// ------------------------------------------------------- 6. papan di dunia nyata
const valley = baca('src/world/valley.js');
const mainjs = baca('src/main.js');
// Papan harus ada di dunia DAN punya dua jalur: label saat mendekat, dan aksi
// saat E ditekan. Kalau salah satu hilang, papan tetap terlihat tapi bisu.
const papanCek = [
  { nama: 'papan pengumuman', obj: /kind:\s*'notice'/, dekat: /o\.kind === 'notice'/, aksi: /case 'notice'/ },
  { nama: 'Ragam Usaha', obj: /kind:\s*'usaha'/, dekat: /o\.kind === 'usaha'/, aksi: /case 'upgrade'/ },
];
for (const cek of papanCek) {
  if (!cek.obj.test(valley)) catat(`${cek.nama}: tidak ada objeknya di world/valley.js`);
  if (!cek.dekat.test(mainjs)) catat(`${cek.nama}: tidak bisa didekati (label E tidak muncul) di main.js`);
  if (!cek.aksi.test(mainjs)) catat(`${cek.nama}: tidak ada aksi saat E ditekan di main.js`);
}

// ---------------------------------------------------------------------- laporan
if (masalah.length) {
  console.error(`Ditemukan ${masalah.length} masalah data:\n`);
  for (const m of masalah) console.error(`  - ${m}`);
  process.exit(1);
}
console.log('Data pelajaran konsisten:');
console.log(`  ${ids.length} bab, ${ids.reduce((n, id) => n + (ilmu.ujian?.[id]?.length ?? 0), 0)} soal ujian`);
console.log(`  ${Object.keys(nama).length} warga, ${Object.values(npcSoal).flat().length} soal latihan harian`);
console.log(`  ${UPGRADE.length} peningkatan di papan Ragam Usaha, alat sah: ${[...ALAT_SAH].join(', ')}`);
