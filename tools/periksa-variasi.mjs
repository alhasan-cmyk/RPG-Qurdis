// Periksa bank soal remedial & pengayaan supaya jawaban benar tidak bisa ditebak
// hanya dari panjang pilihannya.
//
// Masalah yang dijaga: dulu kunci hampir selalu pilihan TERPANJANG (273 dari 300
// soal, bahkan 100% di pengayaan X dan XI). Murid yang tidak tahu jawaban bisa
// menebak dengan cukup memilih kalimat paling panjang, jadi soal kehilangan daya
// ukurnya.
//
// Tiga pagar yang diperiksa (dipakai juga oleh tests/uji.mjs):
//   1. Sebaran panjang dalam satu soal  <= 12 karakter  (max - min)
//   2. |kunci - rata-rata dua pengecoh|  <= 8 karakter
//   3. Kunci yang PALING PANJANG (sendirian) <= 40% soal di tiap bank 50 soal
//
// Pemakaian:
//   node tools/periksa-variasi.mjs          -> ringkasan semua bank
//   node tools/periksa-variasi.mjs --rinci  -> daftar tiap soal yang melanggar
//   node tools/periksa-variasi.mjs --json   -> keluaran mesin (dipakai uji)
//
// Keluar dengan kode 1 bila ada pelanggaran, supaya bisa dipakai di CI.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const BATAS_SEBARAN = 12;      // max - min panjang pilihan
export const BATAS_SELISIH = 8;       // |kunci - rata-rata pengecoh|
export const BATAS_KUNCI_PANJANG = 0.4; // porsi soal yang kuncinya paling panjang

export const BANK = [
  ['remedial', 'X'], ['remedial', 'XI'], ['remedial', 'XII'],
  ['pengayaan', 'X'], ['pengayaan', 'XI'], ['pengayaan', 'XII'],
];

// Periksa satu soal. `kunci` adalah indeks jawaban benar pada `pilihan`.
export function periksaSoal(soal, nomor) {
  const panjang = soal.pilihan.map((t) => t.length);
  const kunci = soal.kunci;
  const pengecoh = panjang.filter((_, i) => i !== kunci);
  const rataPengecoh = pengecoh.reduce((a, b) => a + b, 0) / pengecoh.length;
  const sebaran = Math.max(...panjang) - Math.min(...panjang);
  const selisih = panjang[kunci] - rataPengecoh;
  const terpanjang = Math.max(...pengecoh);

  return {
    nomor,
    panjang,
    sebaran,
    selisih,
    kunciPalingPanjang: panjang[kunci] > terpanjang,
    kunciSamaPanjang: panjang[kunci] === terpanjang,
    sebaranLewat: sebaran > BATAS_SEBARAN,
    selisihLewat: Math.abs(selisih) > BATAS_SELISIH,
    tanya: soal.tanya,
  };
}

// Periksa satu bank 50 soal sekaligus.
export function periksaBank(daftar) {
  const rinci = daftar.map((s, i) => periksaSoal(s, i + 1));
  const melanggar = rinci.filter((r) => r.sebaranLewat || r.selisihLewat);
  const kunciPanjang = rinci.filter((r) => r.kunciPalingPanjang).length;
  return {
    jumlah: rinci.length,
    melanggar,
    kunciPanjang,
    porsiKunciPanjang: rinci.length ? kunciPanjang / rinci.length : 0,
    rinci,
  };
}

export function periksaIlmu(ilmu) {
  const hasil = {};
  const pelanggaran = [];
  for (const [jenis, kelas] of BANK) {
    const daftar = ilmu?.[jenis]?.[kelas] ?? [];
    const r = periksaBank(daftar);
    hasil[`${jenis} ${kelas}`] = r;
    for (const m of r.melanggar) pelanggaran.push({ bank: `${jenis} ${kelas}`, ...m });
    if (r.porsiKunciPanjang > BATAS_KUNCI_PANJANG) {
      pelanggaran.push({
        bank: `${jenis} ${kelas}`,
        nomor: '-',
        tanya: 'kunci terlalu sering menjadi pilihan paling panjang',
        porsiKunciPanjang: r.porsiKunciPanjang,
        jumlah: r.jumlah,
      });
    }
  }
  return { hasil, pelanggaran };
}

// ------------------------------------------------------------------ CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ilmu = JSON.parse(readFileSync(join(ROOT, 'src/data/ilmu.json'), 'utf8'));
  const { hasil, pelanggaran } = periksaIlmu(ilmu);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ hasil, pelanggaran }, null, 1));
    process.exit(pelanggaran.length ? 1 : 0);
  }

  console.log('Bank                  soal  kunci-panjang  sebaran>12  selisih>8');
  for (const [nama, r] of Object.entries(hasil)) {
    console.log(
      nama.padEnd(20),
      String(r.jumlah).padStart(4),
      `${String(r.kunciPanjang).padStart(2)}/${r.jumlah}`.padStart(15),
      String(r.melanggar.filter((m) => m.sebaranLewat).length).padStart(11),
      String(r.melanggar.filter((m) => m.selisihLewat).length).padStart(11),
    );
  }

  if (process.argv.includes('--rinci')) {
    for (const p of pelanggaran) {
      console.log(`\n${p.bank} #${p.nomor} [${p.panjang?.join('/') ?? '-'}] ${p.tanya}`);
    }
  }

  if (pelanggaran.length) {
    console.error(`\n${pelanggaran.length} pelanggaran variasi panjang pilihan.`);
    process.exit(1);
  }
  console.log('\nSemua bank lolos: jawaban benar tidak lagi paling panjang.');
}
