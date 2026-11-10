// Pemeriksa data pelajaran — dijalankan sebelum push, bukan saat bermain.
//
// Kenapa ada: hubungan "warga ↔ bab ↔ alat ↔ papan usaha" dijaga di tiga
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

// ---------------------------------------- 4. papan usaha: dua jenis barang
//
// Papan menjual peningkatan BANGUNAN (uang + bahan + satu bab) dan KENDARAAN
// (diamond). Yang diperiksa di sini bukan lagi "kendaraan saja", melainkan
// kelengkapan keduanya: setiap baris punya syarat yang benar-benar diperiksa
// kode, datanya satu sumber, dan tidak ada sisa syarat lama yang diam-diam
// diabaikan.
{
  const { KENDARAAN } = await import(join(AKAR, 'src/systems/kendaraan.js'));
  const { Upgrade } = await import(join(AKAR, 'src/systems/upgrade.js'));

  // --- peningkatan bangunan
  if (UPGRADE.length !== 7) catat(`papan: ${UPGRADE.length} peningkatan bangunan, seharusnya 7`);
  for (const u of UPGRADE) {
    if (!u.judul) catat(`papan "${u.id}": tanpa judul`);
    if (!Object.keys(u.bahan ?? {}).length) catat(`papan "${u.judul}": tanpa bahan`);
    for (const b of Object.keys(u.bahan ?? {})) {
      if (!itemData[b]) catat(`papan "${u.judul}": bahan "${b}" tidak ada di items.json`);
    }
    if (!(u.biaya > 0)) catat(`papan "${u.judul}": biaya bukan angka positif`);
    if (typeof u.efek !== 'function') catat(`papan "${u.judul}": efek bukan fungsi`);
    for (const k of ['X', 'XI', 'XII']) {
      const id = u.bab?.[k];
      if (!id) { catat(`papan "${u.judul}": tidak punya bab syarat kelas ${k}`); continue; }
      if (!ids.includes(id)) catat(`papan "${u.judul}" (${k}): bab tak dikenal "${id}"`);
      else if (kelas[id] !== k) catat(`papan "${u.judul}" (${k}): bab "${id}" milik kelas ${kelas[id]}`);
      // Satu bab untuk satu papan — dulu Kebun Bibit menumpang bab pembuka alat
      // penyiram, jadi satu bab ditagih dua kali.
      const lain = UPGRADE.filter((v) => v.id !== u.id && v.bab?.[k] === id);
      if (lain.length) catat(`papan "${u.judul}" (${k}): bab "${id}" juga dipakai ${lain.map((v) => v.judul).join(', ')}`);
    }
  }

  // --- kendaraan
  for (const k of KENDARAAN) {
    if (!Number.isInteger(k.harga) || k.harga <= 0) catat(`kendaraan "${k.nama}": harga bukan bilangan bulat positif`);
    if (typeof k.guna !== 'string' || k.guna.length < 10) catat(`kendaraan "${k.nama}": kalimat guna terlalu pendek`);
    if (!(k.cepat > 1)) catat(`kendaraan "${k.nama}": tidak lebih cepat dari berjalan kaki`);
    if (k.bab || k.bahan || k.biaya) {
      catat(`kendaraan "${k.nama}": masih menyimpan syarat lama (bab/bahan/biaya) yang tidak dipakai lagi`);
    }
  }
  if (new Set(KENDARAAN.map((k) => k.harga)).size !== KENDARAAN.length) {
    catat('kendaraan: ada dua kendaraan berharga sama — tangganya jadi tidak jelas');
  }

  // --- keduanya benar-benar muncul di satu papan, dengan urutan yang dijanjikan
  const semua = new Upgrade().papan();
  if (semua.length !== UPGRADE.length + KENDARAAN.length) {
    catat(`papan: ${semua.length} baris, seharusnya ${UPGRADE.length + KENDARAAN.length}`);
  }
  const bangunanPapan = semua.filter((u) => u.jenis === 'bangunan').map((u) => u.id).join(',');
  const kendaraanPapan = semua.filter((u) => u.jenis === 'kendaraan').map((u) => u.id).join(',');
  if (bangunanPapan !== UPGRADE.map((u) => u.id).join(',')) {
    catat(`papan: baris bangunan bukan daftar UPGRADE — ${bangunanPapan}`);
  }
  if (kendaraanPapan !== KENDARAAN.map((k) => k.id).join(',')) {
    catat(`papan: baris kendaraan bukan daftar KENDARAAN — ${kendaraanPapan}`);
  }
  if (semua.slice(0, UPGRADE.length).some((u) => u.jenis !== 'bangunan')) {
    catat('papan: peningkatan bangunan harus tampil lebih dulu');
  }

  console.log(`papan usaha: ${UPGRADE.length} peningkatan bangunan (uang + bahan) · ${KENDARAAN.length} kendaraan (${KENDARAAN.map((k) => `${k.nama} ${k.harga}💎`).join(' · ')})`);
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
  { nama: 'Papan Usaha & Bengkel', obj: /kind:\s*'usaha'/, dekat: /o\.kind === 'usaha'/, aksi: /case 'upgrade'/ },
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
console.log(`  papan usaha: ${UPGRADE.length} peningkatan bangunan + ${(await import(join(AKAR, 'src/systems/kendaraan.js'))).KENDARAAN.length} kendaraan, alat sah: ${[...ALAT_SAH].join(', ')}`);
