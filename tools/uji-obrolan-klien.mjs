// Uji klien obrolan: kapan ia menolak, kapan ia memperbaiki diri sendiri.
//
// Latar belakangnya satu keluhan nyata: murid sudah main normal, tetapi saat
// mengetik di obrolan ia disuruh "masuk dulu" — dan tidak ada cara memperbaiki
// dari dalam permainan. Penyebabnya penanda `terdaftar: false` di localStorage
// yang MENEMPEL setelah pendaftaran gagal karena jaringan.
//
// Yang dijaga di sini:
//   1. `terdaftar: false` TIDAK boleh jadi jalan buntu: chat mendaftarkan
//      ulang sekali, lalu lanjut kalau berhasil.
//   2. Kalau namanya sudah terdaftar (peramban baru), chat masuk dengan PIN
//      yang tersimpan tanpa murid mengetik apa pun.
//   3. PIN salah tetap ditolak, dan alasannya diteruskan apa adanya.
//   4. Tanpa nama/PIN sama sekali, chat berhenti bertanya (tidak menembak
//      server terus-menerus) dan memberi alasan yang bisa ditindaklanjuti.
//   5. Server yang belum dipasang tidak dilaporkan sebagai "belum masuk".
//
// Jalankan: node tools/uji-obrolan-klien.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let lulus = 0;
let gagal = 0;
function ok(nama, syarat, tambahan = '') {
  if (syarat) { lulus++; }
  else { gagal++; console.error(`GAGAL: ${nama}${tambahan ? ' — ' + tambahan : ''}`); }
}

/* ------------------------------------------------- tiruan peramban & server */

// localStorage sederhana: cukup untuk menyimpan `lk_murid`.
const gudang = new Map();
globalThis.localStorage = {
  getItem: (k) => (gudang.has(k) ? gudang.get(k) : null),
  setItem: (k, v) => gudang.set(k, String(v)),
  removeItem: (k) => gudang.delete(k),
};

// fetch tiruan: `server` diisi tiap uji. Mencatat setiap permintaan supaya
// "berapa kali chat menembak server" bisa diperiksa.
let server = () => ({ ok: false, error: 'belum diatur' });
let panggilan = [];
globalThis.fetch = async (_url, opsi) => {
  const isi = JSON.parse(opsi?.body ?? '{}');
  panggilan.push(isi);
  const balas = server(isi);
  return { ok: true, text: async () => JSON.stringify(balas) };
};

const { Chat, ALASAN, BATAS_BARIS } = await import(join(ROOT, 'src/systems/chat.js'));

const murid = (d) => gudang.set('lk_murid', JSON.stringify(d));
const muridTersimpan = () => JSON.parse(gudang.get('lk_murid') || 'null');
const chatBaru = () => new Chat({ name: 'ahmad', avatar: 'player_m' });

/* ---- 1. tanpa nama/PIN sama sekali */
gudang.clear();
server = () => ({ ok: false, error: 'tidak boleh dipanggil' });
let c = chatBaru();
let siap = await c.pastikanSiap();
ok('tanpa akun: ditolak dengan alasan belumMasuk', siap.ok === false && siap.alasan === ALASAN.belumMasuk,
  JSON.stringify(siap));
ok('tanpa akun: TIDAK menembak server', panggilan.length === 0, JSON.stringify(panggilan));
ok('tanpa akun: pesannya menyuruh masuk, bukan menyebut spreadsheet',
  /masuk/i.test(siap.pesan) && !/spreadsheet/i.test(siap.pesan), siap.pesan);

/* ---- 2. penanda terdaftar:false yang menempel — kasus keluhan murid */
gudang.clear();
murid({ nama: 'ahmad', kelas: 'X-M / X-13', pin: '1234', terdaftar: false });
panggilan = [];
server = (isi) => {
  if (isi.aksi === 'daftar') return { ok: true, nama: 'ahmad', kelas: 'X-M / X-13' };
  if (isi.aksi === 'obrolan') return { ok: true, kelas: 'X', pesan: [], terakhir: 0 };
  return { ok: false, error: 'aksi tak terduga: ' + isi.aksi };
};
c = chatBaru();
siap = await c.pastikanSiap();
ok('terdaftar:false: TIDAK ditolak — akun didaftarkan ulang', siap.ok === true, JSON.stringify(siap));
ok('terdaftar:false: mendaftar memakai nama+PIN yang sudah ada',
  panggilan[0]?.aksi === 'daftar' && panggilan[0]?.pin === '1234' && panggilan[0]?.nama === 'ahmad',
  JSON.stringify(panggilan[0]));
ok('terdaftar:false: penanda di localStorage dinaikkan jadi true',
  muridTersimpan()?.terdaftar === true, JSON.stringify(muridTersimpan()));
ok('terdaftar:false: alasan dikosongkan setelah berhasil', c.alasan === '', c.alasan);

// Setelah itu, kirim pesan harus benar-benar terkirim.
panggilan = [];
server = (isi) => (isi.aksi === 'obrolanTulis'
  ? { ok: true, no: 7, kelas: 'X' } : { ok: false, error: 'tak terduga' });
const galatKirim = await c.send('assalamualaikum');
ok('setelah pulih: pesan terkirim', galatKirim === null, String(galatKirim));
ok('setelah pulih: pesan sendiri langsung tampil di layar',
  c.messages.length === 1 && c.messages[0].text === 'assalamualaikum');
ok('setelah pulih: nomor pesan dari server dipakai', c.last === 7, String(c.last));

/* ---- 3. nama sudah terdaftar di spreadsheet (peramban baru) */
gudang.clear();
murid({ nama: 'siti', kelas: 'X-A / X-1', pin: '5678', terdaftar: false });
panggilan = [];
server = (isi) => {
  if (isi.aksi === 'daftar') return { ok: false, sudahAda: true, error: 'Nama sudah terdaftar.' };
  if (isi.aksi === 'masuk') return { ok: true, nama: 'siti', kelas: 'X-A / X-1' };
  return { ok: false, error: 'aksi tak terduga: ' + isi.aksi };
};
c = chatBaru();
siap = await c.pastikanSiap();
ok('sudah terdaftar: masuk otomatis dengan PIN tersimpan', siap.ok === true, JSON.stringify(siap));
ok('sudah terdaftar: urutannya daftar lalu masuk',
  panggilan.map((p) => p.aksi).join(',') === 'daftar,masuk', panggilan.map((p) => p.aksi).join(','));
ok('sudah terdaftar: kelas dari server dipakai', muridTersimpan()?.kelas === 'X-A / X-1');

/* ---- 4. PIN salah: ditolak, alasannya diteruskan */
gudang.clear();
murid({ nama: 'budi', kelas: 'XI-A / XI-1', pin: '0000', terdaftar: false });
server = (isi) => {
  if (isi.aksi === 'daftar') return { ok: false, sudahAda: true };
  if (isi.aksi === 'masuk') return { ok: false, error: 'PIN tidak cocok.' };
  return { ok: false, error: 'tak terduga' };
};
c = chatBaru();
siap = await c.pastikanSiap();
ok('PIN salah: ditolak', siap.ok === false);
ok('PIN salah: pesan server diteruskan apa adanya', siap.pesan === 'PIN tidak cocok.', siap.pesan);
ok('PIN salah: penanda terdaftar TIDAK dinaikkan (tidak boleh bohong)',
  muridTersimpan()?.terdaftar === false, JSON.stringify(muridTersimpan()));

/* ---- 5. server yang belum dipasang vs belum masuk: dua pesan berbeda */
gudang.clear();
murid({ nama: 'ahmad', kelas: 'X-M / X-13', pin: '1234', terdaftar: true });
server = () => ({ ok: false, tanpaObrolan: true, error: 'Berkas Obrolan.gs belum dipasang.' });
c = chatBaru();
c.last = 0;
// Satu putaran loop saja: jalankan sebentar lalu hentikan.
c.start();
await new Promise((r) => setTimeout(r, 60));
c.stop();
ok('tanpa Obrolan.gs: alasan takTersambung, bukan belumMasuk',
  c.alasan === ALASAN.takTersambung, c.alasan);
ok('tanpa Obrolan.gs: pesannya menyebut deploy, bukan menyuruh masuk',
  /deploy/i.test(c.error) && !/masuk dulu/i.test(c.error), c.error);

/* ---- 6. kelas kosong di tab Akun */
gudang.clear();
murid({ nama: 'tanpakelas', kelas: '', pin: '3333', terdaftar: true });
server = () => ({ ok: false, error: 'Kelas belum tercatat. Chat hanya untuk murid yang kelasnya jelas.' });
c = chatBaru();
c.start();
await new Promise((r) => setTimeout(r, 60));
c.stop();
ok('kelas kosong: alasannya bedaKelas', c.alasan === ALASAN.bedaKelas, c.alasan);
ok('kelas kosong: disarankan menghubungi guru',
  /kelas/i.test(c.error), c.error);

/* ---- 7. batas 30 baris tetap dijaga setelah perubahan ini */
gudang.clear();
murid({ nama: 'ahmad', kelas: 'X-M / X-13', pin: '1234', terdaftar: true });
c = chatBaru();
c.messages = Array.from({ length: 45 }, (_, i) => ({ no: i + 1, name: 'x', text: 'p' + i }));
c.pangkas();
ok('batas: layar menyimpan tepat 30 baris', c.messages.length === BATAS_BARIS, String(c.messages.length));
ok('batas: yang dibuang yang paling lama', c.messages[0].no === 16, String(c.messages[0].no));

/* ---- 8. segarkan() membangunkan loop setelah masuk dari dalam game */
gudang.clear();
c = chatBaru();
c.status = 'tanpaakun';
c.alasan = ALASAN.belumMasuk;
ok('segarkan: tanpa akun tetap ditolak', c.segarkan() === false);
murid({ nama: 'ahmad', kelas: 'X-M / X-13', pin: '1234', terdaftar: true });
c.running = false;
const hidup = c.segarkan();
ok('segarkan: setelah masuk, alasan dibersihkan', hidup === true && c.alasan === '', c.alasan);
ok('segarkan: loop dinyalakan lagi', c.running === true);
c.stop();

// Loop yang berhenti karena "belum masuk" harus benar-benar menurunkan
// `running`. Dulu ia hanya `return`, sehingga `running` tetap true dan
// `segarkan()` sesudah murid masuk tidak pernah membangunkan loop — panel
// terlihat siap padahal pesan baru tidak pernah datang.
gudang.clear();
c = chatBaru();
c.running = true;
await c.loop();
ok('loop: berhenti total saat belum masuk', c.running === false, String(c.running));
murid({ nama: 'ahmad', kelas: 'X-M / X-13', pin: '1234', terdaftar: true });
ok('loop: sesudah masuk, segarkan menyalakannya lagi', c.segarkan() === true && c.running === true);
c.stop();

/* ---- 9. teks pesan tidak boleh kosong walau hanya spasi */
gudang.clear();
murid({ nama: 'ahmad', kelas: 'X-M / X-13', pin: '1234', terdaftar: true });
c = chatBaru();
ok('spasi saja: tidak dikirim', (await c.send('    ')) === null);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
