// Game bootstrap and main loop.
import { loadAssets, sprite, assets } from './render/assets.js';
import { Renderer, view } from './render/renderer.js';
import { Camera } from './render/camera.js';
import { startLoop } from './core/loop.js';
import { input, mouse, bindMouse, sentuhan, keKanvas } from './core/input.js';
import { on } from './core/events.js';
import { GameTime, SEASON_NAMES } from './core/time.js';
import { readSave, writeSave, takeNewGame, readProfile, writeProfile, avatarOf } from './core/save.js';
import { getArea, markRemoved, removalsToJSON, removalsFromJSON } from './world/areas.js';
import { TILE } from './world/map.js';
import { Character } from './entities/character.js';
import { Npc } from './entities/npc.js';
import { Animal } from './entities/animal.js';
import { Inventory, setItemData, itemDef, HOTBAR } from './systems/inventory.js';
import { Farming } from './systems/farming.js';
import { Weather } from './systems/weather.js';
import { drawHud, drawPrompt, drawToast, GOLD_LEBAR } from './ui/hud.js';
import { InventoryUI } from './ui/inventory-ui.js';
import { ChestUI, CHEST_SLOTS } from './ui/chest-ui.js';
import { ShopUI } from './ui/shop-ui.js';
import { Juice } from './systems/juice.js';
import { Fishing, Shadows } from './systems/fishing.js';
import { FishingUI } from './ui/fishing-ui.js';
import { Critters } from './systems/critters.js';
import { Social, GIFT_REPLY, MAX_HEARTS } from './systems/social.js';
import { Requests, requestText } from './systems/requests.js';
import { Chat } from './systems/chat.js';
import { Ilmu, POIN_JAWAB_TEPAT } from './systems/ilmu.js';
import { Diamond } from './systems/diamond.js';
import { IlmuUI } from './ui/ilmu-ui.js';
import { PilihanUI } from './ui/pilihan.js';
import { pasangSentuh } from './ui/touch.js';
import { pasangTombolKeluar } from './ui/tombolKeluar.js';
import { pasangLandscape } from './ui/landscape.js';
import { pasangTombolLayarPenuh, pasangAjakanPasang, pernahPenuh } from './ui/fullscreen.js';
import { UpgradeUI } from './ui/upgrade-ui.js';
import { Upgrade, BENIH_HARIAN } from './systems/upgrade.js';
import { Kendaraan } from './systems/kendaraan.js';
import { JALUR_TASORO } from './systems/ilmu.js';
import { kirimNilai, kirimAntre, muridAktif, labelKelasMurid } from './core/nilai-api.js';
import { NilaiUI } from './ui/nilai-ui.js';
import { ChatUI } from './ui/chat-ui.js';
import { AudioSystem } from './systems/audio.js';
import { Menu } from './ui/menu.js';
import { Dialog } from './ui/dialog.js';
import { text, UI } from './ui/draw.js';
import { CheatUI } from './ui/cheat-ui.js';
import { CheatConsole } from './ui/cheat-console.js';
import { pasangKodeDebug, PERINTAH_DEBUG } from './core/cheat.js';
import { modeDebug } from './core/debug-mode.js';

const canvas = document.getElementById('game');
const loadingEl = document.getElementById('loading');
const renderer = new Renderer(canvas);
const ctx = renderer.ctx;
bindMouse(canvas, view);

const state = {
  time: new GameTime(),
  weather: new Weather(),
  areaId: 'valley',
  map: null,
  player: null,
  npcs: [],
  animals: [],
  camera: new Camera(view.dunW, view.dunH),
  dialog: new Dialog(),
  inv: new Inventory(),
  chest: new Array(CHEST_SLOTS).fill(null),
  invUI: null,
  chestUI: null,
  shopUI: null,
  shops: {},
  juice: new Juice(),
  audio: new AudioSystem(),
  menu: null,
  ilmu: null,
  ilmuUI: null,
  diamond: new Diamond(),
  pilihanUI: null,
  upgradeUI: null,
  upgrade: null,
  kendaraan: null,
  farming: null,
  shipping: [],
  npcData: [],
  fade: 0,
  fadeDir: 0,
  pendingTravel: null,
  toast: null,
  // Tanpa `avatar` maupun `gender`: keduanya dibiarkan kosong supaya nilai
  // bawaan di sini tidak menutupi `gender` milik profil lama saat digabungkan.
  // `avatarOf()` yang menentukan wajahnya, dan bawaannya sudah player_m.
  profile: { name: 'Petani', farmName: 'Ladang Kenanga' },
};
state.invUI = new InventoryUI(state.inv);
state.chestUI = new ChestUI(state.inv, state.chest);

// ---------------------------------------------------------------- bootstrap
// Tampilan mendatar dipasang SEBELUM aset diunduh: petunjuk "putar ponsel"
// harus muncul seketika, bukan setelah beberapa megabita sprite selesai dimuat.
// Tanpa ini, murid di ponsel melihat layar pemuatan yang terpotong dan
// menyimpulkan gamenya rusak.
//
// Modul ini hanya dijalankan di halaman permainan. Kalau `#game` tidak ada
// (misalnya skrip ini tak sengaja dimuat di halaman lain), jangan pasang apa pun
// — jangan sampai petunjuk "putar ponsel" muncul di tempat yang tidak ada
// permainannya.
if (document.getElementById('game')) {
  state.landscape = pasangLandscape({
    // Dipanggil setiap kali orientasi berubah. Saat ponsel tegak, renderer
    // memakai ukuran layar yang sudah ditukar (lebar = tinggi layar) dan
    // kanvasnya diputar 90° — jadi ukuran logisnya dihitung ulang, lalu kamera
    // dipusatkan lagi supaya pemain tidak terlempar ke tepi layar.
    onUbah: () => {
      renderer.fit();
      if (state.player) state.camera.snapTo(state.player.x, state.player.y - 16);
    },
  });
}

// Tombol layar penuh (⛶). Dipasang bersama landscape supaya bisa dipakai sejak
// layar pemuatan. `onUbah` menghitung ulang kanvas: begitu bilah alamat hilang,
// tinggi layar bertambah dan pandangan harus ikut memanjang.
if (document.getElementById('game')) {
  pasangTombolLayarPenuh({ onUbah: () => renderer.fit() });
}

async function boot() {
  await document.fonts.ready;
  await loadAssets('assets/', (p) => { loadingEl.textContent = `Memuat aset ${Math.round(p * 100)}%`; });
  const [items, crops, npcData, shops, fish] = await Promise.all(
    ['items', 'crops', 'npcs', 'shops', 'fish'].map((f) => fetch(`src/data/${f}.json`).then((r) => r.json())),
  );
  setItemData(items);
  state.shops = shops;
  state.npcData = npcData;
  // Materi Al-Qur'an Hadis dimuat sebagai data, bukan ditanam di kode — supaya
  // guru bisa menambah bab tanpa menyentuh satu baris JavaScript.
  const ilmuData = await fetch('src/data/ilmu.json').then((r) => r.json());
  state.ilmu = new Ilmu(ilmuData);
  state.ilmuUI = new IlmuUI(state.ilmu, state.audio);
  // Tombol layar sentuh. Dipasang tanpa syarat: modulnya sendiri yang memutuskan
  // apakah layar ini memang layar sentuh, jadi di komputer tidak ada yang
  // berubah (tidak ada tombol yang digambar).
  state.sentuh = pasangSentuh({
    onPetunjuk: () => showToast('◀ jalan · E pakai · ketuk alat', 5),
  });
  // Tombol power: satu-satunya jalan keluar yang terlihat, untuk SEMUA
  // perangkat. Dipasang di luar lapisan sentuh justru karena lapisan itu
  // disembunyikan di komputer.
  state.tombolKeluar = pasangTombolKeluar();
  // Pilihan pemain soal tombol sentuh disimpan per perangkat (lihat ui/touch.js),
  // jadi di sini tidak ada yang perlu dimuat: pasangSentuh sudah membacanya.
  ukuranTombolSentuh();

  state.pilihanUI = new PilihanUI(state.audio);
  // Papan "Ragam Usaha Desa" menjual kendaraan; kepemilikannya disimpan di
  // Kendaraan (systems/kendaraan.js), dan papan hanya membaca/menulisnya.
  state.kendaraan = new Kendaraan();
  state.upgrade = new Upgrade(state.kendaraan);
  state.upgradeUI = new UpgradeUI(state.upgrade, state.audio);
  state.upgradeUI.onBeli = () => { terapkanUpgrade(); saveGame(); };
  // Layar nilai dipakai dari dua arah: dari dalam game (Rekap Belajar → V)
  // dan dari halaman awal (tombol "Nilai saya").
  state.nilaiUI = new NilaiUI(state.ilmu);
  // Progres belajar disimpan begitu terjadi, bukan menunggu pemain tidur: satu
  // pertemuan di kelas bisa berakhir tanpa pernah menyentuh kasur.
  state.ilmuUI.onProgress = saveGame;
  // Layar hasil ujian perlu tahu berapa diamond yang baru didapat, jadi hadiahnya
  // diambil dari objek yang sama — tidak ada penghitungan kedua di UI.
  state.ilmuUI.diamond = state.diamond;

  // Setiap bab yang LULUS dikirim ke spreadsheet guru. Yang gagal tidak
  // dikirim sama sekali — keputusan sekolah, dan dijaga di dua tempat
  // (di sini dan di Code.gs) supaya tidak bisa dilangkahi.
  // Hadiah diamond diberikan DI SINI, di jalur yang sama dengan pengiriman nilai:
  // satu ujian yang lulus = satu hadiah, sekali. Ditaruh sebelum `kirimNilai`
  // supaya hadiahnya tidak bergantung pada jaringan — spreadsheet yang sedang
  // mati tidak boleh membuat murid kehilangan diamond yang sudah ia usahakan.
  state.ilmuUI.onLulus = (hasil) => {
    const dapat = state.diamond.hadiahLulus(Boolean(hasil?.lulus ?? true));
    if (dapat) {
      saveGame();                 // langsung ditulis; jangan menunggu tidur
      showToast(`+${dapat} diamond · ${hasil?.judul ?? 'bab lulus'}`, 3.5);
    }
    return kirimNilai({
      kitab: hasil.kitab,
      judul: hasil.judul,
      benar: hasil.benar,
      jumlah: hasil.jumlah,
      nilai: hasil.nilai,
      kelas: labelKelasMurid(state.ilmu.tingkat, state.ilmu.rombel) || muridAktif()?.kelas,
    }).then((r) => {
      // Nilai yang tertahan dari sesi sebelumnya ikut terkirim begitu satu
      // pengiriman berhasil — bukan menunggu game dibuka ulang.
      if (r?.ok) kirimAntre();
      return r;
    });
  };

  /**
   * Hadiah untuk ujian PENGAYAAN yang lulus.
   *
   * Dipisah dari `onLulus` dengan sengaja. `onLulus` milik ujian bab: ia
   * memberi diamond, MENULIS SIMPANAN, dan MENGIRIM NILAI ke spreadsheet guru.
   * Hasil pengayaan hanya boleh mendapat diamond — tidak boleh masuk nilai
   * sekolah. Kait sendiri membuat janji itu tidak bisa rusak karena perubahan
   * di jalur ujian bab.
   */
  state.ilmuUI.onJalurLulus = (hasil) => {
    const dapat = state.diamond.hadiahLulus(Boolean(hasil?.lulus ?? true));
    if (dapat) {
      saveGame();
      showToast(`+${dapat} diamond · ${hasil?.judul ?? 'pengayaan'}`, 3.5);
    }
    return dapat;
  };

  state.farming = new Farming(crops);
  state.social = new Social(npcData);
  state.requests = new Requests(npcData, items);
  state.fishing = new Fishing(fish);
  state.fishingUI = new FishingUI(state.fishing);

  const save = readSave(0);
  const fresh = takeNewGame();
  // Newest wins: the homepage handoff, then the save file, then whatever was
  // stored the last time the game booted. Then store it again straight away, so
  // a reload before the first night still knows who the player is.
  if (fresh) Object.assign(state.profile, fresh);
  else if (save?.profile) Object.assign(state.profile, save.profile);
  else Object.assign(state.profile, readProfile() ?? {});
  writeProfile(state.profile);

  // Kelas pemain: dari profil (halaman pendaftaran) atau dari simpanan lama.
  // Simpanan versi 3 belum mengenal kelas, jadi `tingkat` kosong — dan selama
  // kosong, semua kitab tetap terbuka dan semua soal tetap boleh muncul. Tidak
  // ada pemain lama yang tiba-tiba terkunci karena fitur baru.
  state.ilmu.tingkat = state.profile.tingkat ?? save?.tingkat ?? null;
  state.ilmu.rombel = state.profile.rombel ?? save?.rombel ?? null;

  if (!fresh && save) {
    removalsFromJSON(save.removals);
    state.time.load(save.time);
    state.weather.load(save.weather);
    state.inv.load(save.inv);
    state.diamond.load(save.diamond);
    state.farming.load(save.soil);
    state.shipping = save.shipping ?? [];
    if (save.chest) save.chest.forEach((s, i) => { state.chest[i] = s; });
    state.areaId = 'valley';
    state.animalState = save.animals ?? [];
    state.social.load(save.social);
    state.requests.load(save.requests);
    state.ilmu.load(save.ilmu);
    // Simpanan lama belum punya `upgrade`; bawaannya tingkat 0, jadi pemain lama
    // tidak kehilangan apa pun dan hanya perlu membelinya seperti pemain baru.
    // Kendaraan dimuat SEBELUM papan: papan membaca kepemilikan dari sana.
    state.kendaraan.load(save.kendaraan ?? save.upgrade?.kendaraan);
    state.upgrade.load(save.upgrade);
  }

  // Nilai yang tertinggal karena jaringan putus dikirim diam-diam sekarang.
  // Tidak ditunggu: game tidak boleh tertahan karena urusan spreadsheet.
  Promise.resolve(kirimAntre()).then((r) => {
    if (r?.terkirim) showToast(`${r.terkirim} nilai tertunda sudah terkirim ke spreadsheet guru.`);
  });

  enterArea(state.areaId, null);
  state.player = new Character(avatarOf(state.profile), state.map.spawn.x, state.map.spawn.y);
  Object.assign(state.player, { money: 500, energy: 100, maxEnergy: 100 });

  if (!fresh && save?.player) Object.assign(state.player, save.player);
  else {
    state.inv.add('hoe'); state.inv.add('axe'); state.inv.add('pickaxe'); state.inv.add('scythe');
    state.inv.slots[4] = { id: 'watering_can', count: 1, water: 40 };
    state.inv.add('seed_turnip', 15);
    state.weather.roll(state.time.season);
  }

  // Efek kendaraan (slot tas truk) diterapkan SESUDAH tas dimuat. Kalau
  // dipanggil sebelum `state.inv.load(...)`, tas masih 24 slot dan barang
  // simpanan yang ke-25 ke atas akan hilang tanpa pesan apa pun.
  terapkanUpgrade();

  // Public chat. The name and avatar are the ones chosen on the homepage, so
  // other players see the same farmer they meet in the valley.
  state.chat = new Chat({
    name: state.profile.name,
    avatar: avatarOf(state.profile),
  });
  state.chatUI = new ChatUI(state.chat);
  state.chat.start();
  // Tanpa ini, semua warga berdiri di titik awalnya sampai jam bulat pertama
  // lewat — pemain yang bangun jam 06:00 melihat seisi desa salah tempat.
  applySchedules();
  // pagehide fires on close, navigation and the mobile back-forward cache;
  // beforeunload does not fire reliably on mobile at all.
  window.addEventListener('pagehide', () => state.chat.leave());

  state.shopUI = new ShopUI(state.inv, state.player, state.audio);
  state.menu = new Menu({
    audio: state.audio,
    renderer,
    ilmu: state.ilmu,
    // Baris "Tombol sentuh" di Pengaturan butuh lapisan ini untuk mengetahui
    // keadaannya dan mengubahnya. Tanpa ini, tombol yang muncul keliru di
    // laptop tidak bisa dimatikan sama sekali.
    sentuh: state.sentuh,
    tombolKeluar: state.tombolKeluar,
    // Baris "Simpan sekarang" memakai saveGame yang sama dengan keluar dan
    // tidur; tidak ada jalur simpan kedua yang bisa berbeda isinya.
    onSimpan: () => (saveGame()
      ? 'Tersimpan di peramban ini.'
      // Mode privat dan kuota penuh membuat localStorage menolak. Berbohong
      // "Tersimpan" di situ lebih buruk daripada mengakuinya.
      : 'GAGAL menyimpan — peramban menolak. Coba tutup mode privat.'),
    onQuit: () => { saveGame(); location.href = 'index.html'; },
  });
  // V di Rekap Belajar membuka rincian nilai per bab tanpa menutup menu:
  // keduanya sama-sama layar, bukan tempat di dunia.
  state.menu.onNilai = () => state.nilaiUI.buka();

  // Audio is synthesised, so nothing to download — it just needs a gesture to
  // start, because browsers block audio until the player interacts.
  const unlock = () => state.audio.unlock();
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock);
  state.player.onStep = () => state.audio.step();
  const dayNight = (h) => state.audio.setAmbience(h >= 6 && h < 18 ? 'day' : 'night');
  on('time:hour', (t) => dayNight(t.hour24));
  on('time:hour', () => applySchedules());
  dayNight(state.time.hour24);
  state.camera.snapTo(state.player.x, state.player.y - 16);
  on('time:passout', () => sleep(true));
  on('view:resize', (v) => {
    // Kamera mengikuti ukuran DUNIA (bukan kanvas): dengan skala 0,7 kamera
    // boleh menampilkan 1/0,7 kali lebih banyak, dan itulah pandangan yang
    // lebih luas. HUD tetap memakai v.w/v.h (ukuran kanvas).
    state.camera.viewW = v.dunW ?? v.w; state.camera.viewH = v.dunH ?? v.h;
    state.camera.snapTo(state.player.x, state.player.y - 16);
    // Tombol sentuh adalah elemen HTML, jadi ia tidak tahu apa-apa soal skala
    // pandangan. Ukuran kanvas (v.w/v.h) sudah dalam piksel layar, dan itulah
    // yang dipakai HUD — jadi tombol tidak pernah tertimpa hotbar.
    ukuranTombolSentuh();
  });

  loadingEl.remove();
  // Game sudah tergambar: petunjuk "putar ponsel" menyusut dari layar penuh
  // menjadi kartu kecil, supaya murid bisa mengetuk layar untuk memulai
  // sekaligus menekan tombol "Putar otomatis" (peramban hanya mau memutar
  // orientasi dari gestur pengguna, bukan otomatis saat halaman dimuat).
  state.landscape?.siap();
  // iPhone/iPad: layar penuh hanya bisa lewat "Tambahkan ke Layar Utama", jadi
  // di situ ditawarkan sekali (bukan di perangkat lain, tempat tombol ⛶ sudah
  // cukup). Tidak pernah memblokir permainan.
  pasangAjakanPasang();
  // Pemain yang dulu memilih layar penuh cukup diberi satu ketukan untuk
  // melanjutkannya — peramban tidak mengizinkan memintanya sendiri.
  if (pernahPenuh() && !document.fullscreenElement) {
    showToast('Ketuk ⛶ di kanan atas untuk layar penuh', 5);
  }
  canvas.focus();
  if (fresh) showToast(`Selamat datang di ${state.profile.farmName}, ${state.profile.name}!`, 4);
  startLoop({
    update,
    render,
    // Ketukan yang tidak terpakai jangan dibawa ke frame berikutnya: satu
    // sentuhan pada hotbar akan terhitung berkali-kali dan alat berpindah
    // beberapa slot sekaligus.
    akhirFrame: () => sentuhan.kosongkan(),
  });
  window.__lk = state;
}

function showToast(msg, secs = 3) { state.toast = { msg, t: secs }; }

// ---------------------------------------------------------------- areas
/** Swap to `id`, positioning the player at the named entry (null = map spawn). */
function enterArea(id, entryName) {
  if (state.areaId === 'valley' && state.animals.length) syncAnimals();
  state.areaId = id;
  state.map = getArea(id);
  // Zoom stays the same in every area: changing it would also rescale the HUD.
  state.camera.viewW = view.dunW;
  state.camera.viewH = view.dunH;
  state.camera.bounds = { w: state.map.w, h: state.map.h };

  // Ruangan dalam tidak punya ikan maupun serangga: bayangan ikan yang
  // tergambar di lantai kayu perpustakaan akan terlihat seperti kotoran.
  if (id !== 'valley') { state.shadows = null; state.critters = null; }

  const e = entryName && state.map.entries[entryName];
  if (state.player) {
    if (e) {
      state.player.x = e.c * TILE + TILE / 2;
      state.player.y = (e.r + 1) * TILE;
      state.player.dir = e.dir;
    } else {
      state.player.x = state.map.spawn.x;
      state.player.y = state.map.spawn.y;
    }
    state.camera.snapTo(state.player.x, state.player.y - 16);
  }
  spawnEntities(id);
}

/** Animals only exist while the farm is loaded, so their state lives in `animalState`. */
function syncAnimals() {
  state.animalState = state.animals.map((a) => ({ fed: a.fed, hasProduce: a.hasProduce, friendship: a.friendship }));
}

function spawnEntities(id) {
  state.npcs = [];
  state.animals = [];
  const map = state.map;
  if (id === 'valley') {
    const spots = map.npcSpots;
    state.npcs = state.npcData.map((d) => {
      const s = spots[d.id] ?? { c: 34, r: 19 };
      return new Npc(d, s.c * TILE + TILE / 2, (s.r + 1) * TILE);
    });
    // One shadow per twenty tiles of open water, but never fewer than two in
    // any one body: enough that the shore always has one in sight, few enough
    // that they stay worth walking towards.
    state.shadows = new Shadows(map, 20);
    state.critters = new Critters(map);

    const pen = map.pen;
    const bounds = { c0: pen.c0, r0: pen.r0, c1: pen.c1, r1: pen.r1 };
    // Spawn tiles were derived from a formula that ran past the pen's south
    // fence, so a cow started life inside the fence and could never walk out of
    // it. Now each animal names a tile and is nudged to the nearest free one,
    // which also survives the buildings being moved around later.
    const spot = (c, r) => {
      for (let ring = 0; ring < 8; ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
          for (let dc = -ring; dc <= ring; dc++) {
            const x = c + dc, y = r + dr;
            if (x < pen.c0 || x > pen.c1 || y < pen.r0 || y > pen.r1) continue;
            if (!map.isSolid(x, y)) return [x * TILE + TILE / 2, (y + 1) * TILE];
          }
        }
      }
      return [(pen.c0 + 1) * TILE, (pen.r0 + 2) * TILE];
    };
    const egg = { produce: { item: 'egg' }, radius: 64, bounds };
    const milk = { produce: { item: 'milk' }, radius: 72, speed: 16, bounds };
    state.animals = [
      new Animal('chicken', ...spot(pen.c0 + 4, pen.r1), egg),
      new Animal('chicken', ...spot(pen.c0 + 6, pen.r1), egg),
      new Animal('chicken', ...spot(pen.c0 + 5, pen.r0 + 4), egg),
      new Animal('cow', ...spot(pen.c0 + 2, pen.r0 + 4), milk),
      new Animal('cow', ...spot(pen.c0 + 6, pen.r0 + 3), milk),
      new Animal('dog', map.spawn.x + 48, map.spawn.y + 24, { radius: 96, speed: 40 }),
    ];
    if (state.animalState) state.animalState.forEach((a, i) => Object.assign(state.animals[i] ?? {}, a));
  }
}

/** Fade out, swap area, fade in. */
function travel(to, entry) {
  if (state.fadeDir) return;
  state.pendingTravel = { to, entry };
  state.fadeDir = 1;
}

const WALK_SPEED = 96;   // px/s = 3 tiles/s
const RUN_SPEED = 168;   // px/s = 5.25 tiles/s

// ---------------------------------------------------------------- day cycle
function sleep(passedOut = false) {
  if (state.fadeDir) return;
  state.audio.sleep();
  state.fadeDir = 1;
  state.pendingTravel = { sleep: true, passedOut };
  state.time.paused = true;
}

function doSleep(passedOut) {
  // Koperasi pasar (peningkatan "Pasar") menaikkan harga jual. Dihitung di sini,
  // satu tempat, supaya angka di kotak jual dan uang yang benar-benar masuk
  // tidak pernah berbeda.
  const pengali = state.upgrade?.pengaliJual() ?? 1;
  let earned = 0;
  for (const s of state.shipping) earned += Math.round((itemDef(s.id)?.sell ?? 0) * pengali) * s.count;
  state.shipping = [];
  state.player.money += earned;

  // Kebun bibit membagikan benih tiap pagi. Ditaruh sebelum hari berganti
  // supaya benihnya masuk ke tas hari yang baru, bukan hari yang lewat.
  const benih = state.upgrade?.benihPagi() ?? 0;
  if (benih) state.inv.add(BENIH_HARIAN, benih);
  state.time.nextDay();
  const rained = state.weather.isRaining;
  state.weather.advance(state.time.season);
  state.farming.newDay(state.time.season, rained);
  if (state.areaId === 'valley' && state.animals.length) syncAnimals();
  state.animalState = (state.animalState ?? []).map((a) => ({
    fed: false,
    hasProduce: a.hasProduce || a.fed,
    friendship: Math.min(10, a.friendship + (a.fed ? 1 : 0)),
  }));

  state.player.energy = passedOut ? Math.floor(state.player.maxEnergy * 0.5) : state.player.maxEnergy;
  enterArea('valley', 'houseDoor');
  saveGame();
  state.time.paused = false;

  const lines = [];
  if (earned) lines.push(`Penjualan G${earned.toLocaleString('id-ID')}`);
  lines.push(`${state.time.dateText} · ${state.weather.name}`);
  showToast(passedOut ? 'Kamu pingsan kelelahan... (energi 50%)' : lines.join(' · '), 4.5);
}

/**
 * Beri tahu lapisan tombol sentuh di mana HUD berakhir.
 *
 * Tombol sentuh adalah elemen HTML, sedangkan panel gold dan hotbar digambar di
 * kanvas. Tanpa angka ini, tombol hanya bisa menebak — dan tebakan yang sama
 * tidak bisa benar untuk layar 390 px maupun desktop. Angka diambil dari
 * geometri HUD yang SEBENARNYA (ui/hud.js), lalu dikalikan zoom karena tombol
 * HTML memakai piksel layar, bukan piksel kanvas.
 *
 * Diukur dalam piksel layar: `1` piksel kanvas = `view.zoom` piksel layar.
 */
function ukuranTombolSentuh() {
  if (!state.sentuh?.ukuranHud) return;
  const z = view.zoom || 1;
  const W = view.w, H = view.h;
  // Hotbar: S=40, gap=2, 12 px dari bawah; panel pembungkusnya 8 px lebih tinggi.
  const S = 40;
  const hudBawah = (S + 12 + 4) * z;                 // tepi atas panel hotbar
  // Panel kanan atas sekarang DUA baris (diamond di atas, gold di bawah); ukuran
  // dan posisinya datang dari ui/hud.js supaya tidak ada dua angka yang bisa
  // berbeda. Tombol power + inventori digantung pada garis tengah baris ATAS
  // (baris diamond), karena di situlah mata pemain mendarat lebih dulu.
  const goldKiri = (GOLD_LEBAR + 8) * z;             // tepi kiri panel + jarak
  const goldTengah = (8 + 24 / 2) * z;               // tengah baris pertama
  // Di layar sempit (ponsel tegak, view 390 px) panel jam selebar 226 px +
  // panel gold 150 px sudah memenuhi seluruh lebar — tidak ada sisa untuk
  // tombol power + inventori. Kalau begitu, pasangan itu TURUN ke bawah panel
  // jam: tetap di kiri panel gold, tetap tidak menempel, hanya tidak sebaris.
  const lebarTombol = 36 * 2 + 6;                    // dua tombol + jarak
  const jamKanan = 234 * z;
  const sisa = (W * z) - goldKiri - jamKanan;
  const sempit = sisa < lebarTombol + 12;
  // Layar sempit: titik tengah digeser supaya bibir ATAS tombol (40 px) berhenti
  // 6 px di bawah panel jam yang berakhir di y=98.
  const goldBawah = sempit ? (98 + 6 + 40 / 2) * z : goldTengah;
  // Panel hotbar: 9 slot 40 px + jarak 2 px, dibungkus 10 px kiri-kanan, jadi
  // menempati x = W/2 ± 198 di kanvas. Dibulatkan ke 204 supaya ada sisa aman.
  const hotbarKanan = W / 2 + 204;
  const hotbarKiri = W / 2 - 204;
  // Kluster kanan turun mendekati dasar layar, TAPI hanya kalau sisi kirinya
  // tidak menimpa hotbar: kalau bertabrakan, kluster tetap di atas panel hotbar
  // seperti sebelumnya supaya slot angka tidak pernah tertutup.
  const sel = Math.max(42, Math.min(56, Math.round(W * 0.12)));
  const klusterKiri = W - 10 - (3 * sel + 2 * 6);
  // Boleh turun ke 10 px kalau tidak menimpa hotbar; kalau menimpa, bertahan di
  // atas panel hotbar (hudBawah + 4) — slot angka tidak boleh tertutup.
  const kananBawah = klusterKiri > hotbarKanan ? 10 * z : hudBawah + 4 * z;
  // D-pad kiri diperiksa dengan cara yang sama: turun ke 8 px kalau tepi
  // kanannya masih di kiri hotbar. Di ponsel tegak (390 px) hotbar selebar
  // hampir seluruh layar, jadi di sana D-pad tetap 52 px seperti dulu.
  // D-pad: jarak antar tombol 2 px (CSS .lk-touch .kiri), bukan 6 px — empat
  // tombol arah harus terasa satu genggaman, bukan empat tombol terpisah.
  const selKiri = Math.max(38, Math.min(52, Math.round(W * 0.11)));
  const dpadKanan = 10 + (3 * selKiri + 2 * 2);
  const kiriBawah = dpadKanan + 4 < hotbarKiri ? 8 * z : hudBawah + 4 * z;
  state.sentuh.ukuranHud({ w: W * z, h: H * z, hudBawah, goldBawah, goldKiri, kananBawah, kiriBawah });
  // Tombol power duduk di tempat yang sama dengan tombol inventori di kluster
  // sentuh — dikirim angka yang sama supaya keduanya berjajar.
  state.tombolKeluar?.aturPosisi?.({ goldBawah, goldKiri });
}

function saveGame() {
  const p = state.player;
  const data = {
    profile: state.profile,
    tingkat: state.ilmu.tingkat,
    rombel: state.ilmu.rombel,
    time: state.time.toJSON(),
    weather: state.weather.toJSON(),
    player: { x: p.x, y: p.y, dir: p.dir, money: p.money, energy: p.energy, maxEnergy: p.maxEnergy },
    inv: state.inv.toJSON(),
    diamond: state.diamond.toJSON(),
    chest: state.chest,
    soil: state.farming.toJSON(),
    shipping: state.shipping,
    removals: removalsToJSON(),
    social: state.social.toJSON(),
    requests: state.requests.toJSON(),
    ilmu: state.ilmu.toJSON(),
    upgrade: state.upgrade.toJSON(),
    kendaraan: state.kendaraan.toJSON(),
    animals: state.areaId === 'valley' && state.animals.length
      ? state.animals.map((a) => ({ fed: a.fed, hasProduce: a.hasProduce, friendship: a.friendship }))
      : state.animalState ?? [],
    area: state.areaId,
  };
  // Simpanan hanya di peramban ini. Dulu ada dorongan ke `/api/player/save`
  // supaya simpanan bisa dibuka dari komputer lain, tetapi alamat itu tidak
  // pernah ada di GitHub Pages (halaman statis tidak bisa menjalankan server),
  // jadi setiap penyimpanan mengirim permintaan yang pasti gagal. Progres tidak
  // pernah hilang karena itu — `writeSave` di bawah ini yang jadi sumber
  // kebenaran — tetapi janji "lanjut dari komputer lain" tidak berlaku.
  // Nilai kembalian diteruskan: baris "Simpan sekarang" memakainya untuk
  // membedakan "Tersimpan" dari "peramban menolak menyimpan".
  const ok = writeSave(data, 0);
  writeProfile(state.profile);
  return ok;
}

/**
 * Nomor hari yang tidak pernah mundur, dipakai sebagai "sekali sehari".
 * Tanggal saja tidak cukup: hari 1 musim gugur dan hari 1 musim semi akan
 * terbaca sama, dan jatah hadiah harian ikut tereset saat musim berganti.
 */
function dayNumber() {
  const t = state.time;
  return ((t.year - 1) * 4 + t.seasonIndex) * 28 + t.day;
}

/** Serahkan barang yang sedang dipegang ke warga yang dihadapi. */
function giveGift(npc) {
  if (npc.beast) { showToast(`${npc.name} cuma menatapmu.`); state.audio.denied(); return; }
  const held = state.inv.held;
  const def = held && itemDef(held.id);
  if (!def) { showToast('Pegang dulu barang yang mau diberikan.'); state.audio.denied(); return; }

  const r = state.social.give(npc.id, { ...def, id: held.id }, dayNumber());
  if (!r.ok) {
    showToast(r.why === 'tool' ? 'Alat tidak bisa diberikan.' : `${npc.name} sudah dapat hadiah hari ini.`);
    state.audio.denied();
    return;
  }

  state.inv.removeAt(state.inv.index, 1);
  npc.talking = true;
  npc.faceToward(state.player.x, state.player.y);
  state.audio.talk();
  const lines = GIFT_REPLY[r.kind];
  state.dialog.open({
    speaker: npc.name,
    portrait: npc.portrait,
    text: lines[state.time.day % lines.length],
    hearts: { filled: r.hearts, max: MAX_HEARTS },
  });
  state.dialog.onClose = () => { npc.talking = false; };
  if (r.gained) state.juice.text(npc.x, npc.y - 44, `♥ ${r.hearts}`);
}

// ---------------------------------------------------------------- interaction
function facing() {
  const p = state.player;
  const c = Math.floor(p.x / TILE), r = Math.floor((p.y - 1) / TILE);
  const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.dir];
  return { c: c + d[0], r: r + d[1], selfC: c, selfR: r };
}

const tileOf = (o) => [Math.floor(o.x / TILE), Math.floor((o.y - 1) / TILE)];
const findObj = (c, r, test) => state.map.objects.find((o) => {
  const [oc, or] = tileOf(o);
  return oc === c && or === r && test(o);
});

function interactTarget() {
  const p = state.player;
  const f = facing();
  const m = state.map;

  const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.dir];
  const inFront = (e, range) => {
    const dx = e.x - p.x, dy = e.y - (p.y - 8);
    return Math.hypot(dx, dy) < range && dx * d[0] + dy * d[1] > -6;
  };

  if (m.id === 'valley') {
    // Shops are served at the door: no interior to walk into, E opens the counter.
    //
    // Two things this has to get right:
    //   1. Match the tile the player is FACING, not the tile they stand on. A
    //      building's door tile belongs to its own solid footprint — unlike the
    //      farmhouse, whose door marker sits on the walkable tile below it — so
    //      testing the player's own tile could never match and shopping was dead.
    //   2. Check it before the NPC sweep. Shopkeepers wait by their own door, and
    //      "talk to them" would otherwise swallow every attempt to reach the
    //      counter behind them.
    for (const [key, id, verb] of [
      ['storeDoor', 'shop', 'Belanja di'],
      ['smithDoor', 'smith', 'Perbaiki alat di'],
      ['warungDoor', 'warung', 'Pesan di'],
      ['townHallDoor', 'balai', 'Lihat papan permintaan di'],
      ['clinicDoor', 'klinik', 'Periksa di'],
    ]) {
      const dpos = m[key];
      if (!dpos || f.c !== dpos.c || f.r !== dpos.r) continue;
      const place = state.shops[id];
      if (!place) return { kind: 'closed', label: 'Segera buka' };
      const hour = state.time.hour24;
      if (hour < place.open[0] || hour >= place.open[1]) {
        return { kind: 'shut', label: `${place.name} tutup`, msg: place.closedMsg };
      }
      // Setiap pintu membuka layar yang berbeda, tapi jam buka dan pesan
      // tutupnya diurus di satu tempat — itu yang paling sering salah kalau
      // tiap tempat mengurus jamnya sendiri-sendiri.
      if (place.kind === 'clinic') return { kind: 'clinic', id, label: `${verb} ${place.name}` };
      if (place.kind === 'requests') {
        const day = dayNumber();
        const ready = state.requests.canFill(state.inv, day);
        const req = state.requests.today(day);
        const label = state.requests.done(day) ? `${place.name}`
          : ready ? `Serahkan ${req.count} ${req.itemName}`
          : `${verb} ${place.name}`;
        return { kind: 'requests', id, label };
      }
      return { kind: 'shop', shop: id, label: `${verb} ${place.name}` };
    }
  }

  // Papan Usaha & Bengkel: diletakkan di rumah pemain, jadi baik peningkatan
  // bangunan maupun kendaraan bisa dibeli tanpa berjalan jauh. `kind` tetap
  // 'usaha' supaya peta, simpanan, dan alat uji tidak perlu diubah.
  if (findObj(f.c, f.r, (o) => o.kind === 'usaha')) {
    return { kind: 'upgrade', label: 'Papan Usaha & Bengkel' };
  }

  // Rak buku di dalam Perpustakaan Desa. Diperiksa sebelum warga dan sebelum
  // pintu, karena rak paling dekat dengan pemain saat ia berdiri menghadapnya.
  if (findObj(f.c, f.r, (o) => o.kind === 'shelf')) {
    return { kind: 'shelf', label: 'Baca rak buku' };
  }

  // Pintu Perpustakaan Desa: berdiri di depannya, tekan E.
  if (m.librarySteps && f.c === m.librarySteps.c && f.r === m.librarySteps.r) {
    return { kind: 'library', label: 'Masuk Perpustakaan' };
  }

  for (const n of state.npcs) {
    if (!inFront(n, 44)) continue;
    // Warga bermotor hanya bisa dihampiri saat ia BERHENTI. Menawarkan
    // percakapan kepada orang yang sedang melaju membuat pemain mengejarnya
    // sambil menekan E, dan dialog bisa terbuka ketika ia sudah jauh.
    if (typeof n.bisaDiajak === 'function' && !n.bisaDiajak()) continue;
    const held = state.inv.held;
    const canGift = !n.beast && held && !itemDef(held.id)?.tool;
    return { kind: 'npc', npc: n, label: canGift ? `Bicara · G beri hadiah` : `Bicara dengan ${n.name}` };
  }
  for (const a of state.animals) {
    if (!inFront(a, 40)) continue;
    if (a.hasProduce) return { kind: 'collect', animal: a, label: `Ambil ${itemDef(a.produce.item).name}` };
    if (a.produce && !a.fed) return { kind: 'feed', animal: a, label: 'Beri makan' };
    return { kind: 'pet', animal: a, label: 'Elus' };
  }

  if (m.id === 'valley') {
    if (f.selfC === m.door.c && f.selfR === m.door.r && p.dir === 'up') return { kind: 'bed', label: 'Tidur sampai besok' };
    if (m.well && f.c >= m.well.c && f.c <= m.well.c + 1 && f.r === m.well.r) return { kind: 'well', label: 'Isi penyiram' };
    if (m.bin && f.c >= m.bin.c && f.c <= m.bin.c + 1 && f.r === m.bin.r) return { kind: 'bin', label: 'Masukkan ke kotak jual' };
    if (findObj(f.c, f.r, (o) => o.kind === 'notice')) return { kind: 'notice', label: 'Baca papan pengumuman' };
  }

  // Water in front of you plus a rod in hand is the whole cast condition. The
  // pond and the sea use the same terrain, so which one it is comes from where
  // the tile sits, not from a separate flag on the map.
  if (m.terrainAt(f.c, f.r) === 'water' && itemDef(state.inv.held?.id)?.tool === 'fish') {
    const shadow = state.shadows?.near(f.c, f.r);
    return { kind: 'fish', c: f.c, r: f.r, lucky: !!shadow, label: shadow ? 'Pancing (ada ikan!)' : 'Pancing' };
  }

  const soil = state.farming.at(f.c, f.r);
  if (soil && state.farming.ripe(soil)) return { kind: 'harvest', c: f.c, r: f.r, label: 'Panen' };
  const bush = findObj(f.c, f.r, (o) => o.kind === 'bush' && o.col === 1);
  if (bush) return { kind: 'forage', obj: bush, label: 'Petik beri' };
  const pick = findObj(f.c, f.r, (o) => o.kind === 'pick');
  if (pick) return { kind: 'pick', obj: pick, c: f.c, r: f.r, label: `Ambil ${itemDef(pick.drop)?.name ?? pick.drop}` };
  return null;
}

/** Energy for one swing, reduced by the held tool's upgrade level. */
function toolCost(def) {
  const level = state.inv.held?.level ?? 0;
  return Math.max(1, (def.energy ?? 2) - level);
}

function spend(n) {
  if (state.player.energy < n) { showToast('Energi habis — istirahatlah.'); state.audio.denied(); return false; }
  state.player.energy -= n;
  return true;
}

function give(id, count = 1) {
  const left = state.inv.add(id, count);
  if (left) { showToast('Inventori penuh!'); state.audio.denied(); return; }
  const p = state.player;
  state.juice.text(p.x, p.y - 34, `+${count} ${itemDef(id)?.name ?? id}`);
  state.juice.burst(p.x, p.y - 20, { count: 5, frames: [6, 7], up: 40, spread: 26, gravity: 120, life: 0.6 });
}

/** Particle burst centred on the tile the player is working. */
function tileBurst(f, opts) {
  state.juice.burst(f.c * TILE + TILE / 2, f.r * TILE + TILE / 2, opts);
}

function removeObject(o, c, r) {
  markRemoved(state.areaId, o);
  const i = state.map.objects.indexOf(o);
  if (i >= 0) state.map.objects.splice(i, 1);
  state.map.setSolid(c, r, 0);
}

function useHeld() {
  const held = state.inv.held;
  if (!held) return false;
  const d = itemDef(held.id);
  if (!d) return false;
  // Makanan ikut jalur "pakai barang yang dipegang" seperti alat dan benih:
  // satu tombol untuk semua isi hotbar. `eat` khusus tetap ada di C bagi yang
  // sudah terbiasa, tapi tidak ada lagi barang yang butuh tombolnya sendiri.
  if (d.eat && !d.tool) return eatHeld(true);

  // Keahlian alat: alat hanya berguna setelah pemain lulus ujian bab yang
  // diajarkan warga pemilik keahlian itu. Ditulis sebagai "warga mengajari kau",
  // bukan "alat terkunci" — pemain memegang cangkulnya, hanya belum terampil.
  // Menanam dan memanen sengaja TIDAK dikunci: keduanya bisa dilakukan dengan
  // tangan dan dibutuhkan untuk bisa makan di hari-hari pertama.
  if (d.tool && !state.ilmu.bolehPakai(d.tool)) {
    const guru = state.ilmu.guruAlat(d.tool);
    const bab = guru ? state.ilmu.kitab(guru.oleh.kitab) : null;
    if (bab) {
      showToast(`Belum terampil memakai ${d.name}. Kejar ${guru.nama}, lulus ujian ${bab.judul.split(' — ')[0]} dulu.`);
      state.audio.denied();
      return true;
    }
  }

  const f = facing();
  const m = state.map, farm = state.farming;
  if (d.tool || d.seed) state.juice.startSwing(held.id, state.player.dir);

  if (d.seed) {
    if (!m.tillable(f.c, f.r)) { showToast('Benih hanya bisa ditanam di petak kebun.'); return true; }
    const res = farm.plant(f.c, f.r, d.seed, state.time.season);
    if (res === 'season') { showToast(`${d.name} tidak tumbuh di musim ini.`); return true; }
    if (res) {
      state.inv.removeAt(state.inv.index, 1);
      tileBurst(f, { frames: [6, 7], count: 4, up: 40, gravity: 140 });
      state.audio.plant();
      return true;
    }
    showToast('Cangkul dulu tanahnya.');
    return true;
  }

  switch (d.tool) {
    case 'hoe': {
      if (!m.tillable(f.c, f.r)) { showToast('Hanya bisa mencangkul di petak kebun.'); return true; }
      if (m.isSolid(f.c, f.r) || findObj(f.c, f.r, (o) => o.kind === 'weed')) { showToast('Ada yang menghalangi.'); return true; }
      const soil = farm.at(f.c, f.r);
      if (soil) { if (!soil.crop && spend(toolCost(d))) farm.clear(f.c, f.r); return true; }
      if (spend(toolCost(d))) {
        farm.till(f.c, f.r);
        tileBurst(f, { tile: 'tilled_dry', count: 8, up: 55 });
        state.juice.hit('small');
        state.audio.hoe();
      }
      return true;
    }
    case 'water': {
      if ((held.water ?? 0) <= 0) { showToast('Penyiram kosong — isi di sumur.'); return true; }
      if (farm.water(f.c, f.r) && spend(toolCost(d))) {
        held.water -= 1;
        tileBurst(f, { frames: [1], count: 5, up: 45, gravity: 180 });
        state.audio.water();
      }
      return true;
    }
    case 'axe': {
      const o = findObj(f.c, f.r, (x) => ['tree', 'stump', 'log'].includes(x.kind) && x.hp);
      if (o) return chop(o, d, f);
      return true;
    }
    case 'pickaxe': {
      const o = findObj(f.c, f.r, (x) => x.kind === 'rock' && x.hp);
      if (o) return chop(o, d, f);
      return true;
    }
    case 'scythe': {
      const w = findObj(f.c, f.r, (o) => o.kind === 'weed');
      if (w && spend(toolCost(d))) {
        removeObject(w, f.c, f.r);
        tileBurst(f, { frames: [4, 5], count: 6, up: 50 });
        state.juice.hit('small');
        state.audio.scythe();
        if (Math.random() < 0.7) give('fiber');
      }
      return true;
    }
    default: return false;
  }
}

function chop(o, tool, f) {
  if (!spend(toolCost(tool))) return true;
  o.hp -= 1;
  o.shake = 0.2;
  const stone = o.kind === 'rock';
  const debris = stone ? { tile: 'plaza' } : { frames: [4, 5] };
  tileBurst(f, { ...debris, count: 7, up: 70 });
  state.juice.hit('medium');
  if (stone) state.audio.rock(false); else state.audio.chop(false);
  if (o.hp <= 0) {
    removeObject(o, f.c, f.r);
    state.juice.hit('large');
    tileBurst(f, { ...debris, count: 14, up: 110, spread: 70 });
    if (stone) state.audio.rock(true); else state.audio.chop(true);
    give(o.drop, o.kind === 'tree' ? 4 : stone ? 2 : 3);
  }
  return true;
}

/** Obrolan biasa dengan seorang warga — dipakai juga setelah pertanyaan dijawab. */
function bicaraBiasa(npc, owedGift = null, gift = null) {
  npc.talking = true;
  npc.faceToward(state.player.x, state.player.y);
  state.audio.talk();
  state.dialog.open({
    speaker: npc.name,
    portrait: npc.portrait,
    text: owedGift ? gift.text : npc.pickDialog(state.time, state.social.hearts(npc.id)),
    hearts: npc.beast ? null : { filled: state.social.hearts(npc.id), max: MAX_HEARTS },
  });
  state.dialog.onClose = () => {
    npc.talking = false;
    if (owedGift) give(gift.item);
  };
}

/**
 * Warga menawarkan ujian keahlian yang ia ajarkan, kalau bab syaratnya sudah
 * dibaca dan belum lulus. Kalau belum dibaca, ia menyebut bab mana — pemain
 * tidak dibiarkan menebak mengapa alatnya tidak berguna.
 */
function tawarkanUjian(npc) {
  const t = state.ilmu.tawaranAlat(npc.id);
  if (!t || t.lulus) return false;
  if (!t.boleh) {
    // Alasan sudah disusun di satu tempat (Ilmu.tawaranAlat), jadi layar warga
    // dan layar ujian tidak mungkin memberi keterangan yang berbeda.
    showToast(`${npc.name}: "${t.alasan}"`, 4);
    return false;
  }
  state.ilmuUI.bukaUjian(t.kitab, npc.id, npc.name, dayNumber());
  return true;
}

/**
 * Kotak pilihan warga — inilah wajah percakapan di game ini.
 *
 * Bentuknya sengaja seperti tetangga yang menyapa, bukan seperti mesin ujian:
 *   "Halo, Kang Dadang."
 *   "Aku ingin belajar mencangkul (Bab I)."        <- yang ini ujian bab
 *   "Aku ingin belajar menebang (Bab II)."         <- Abu, hanya kalau ia guru
 *
 * Kata "belajar mencangkul" yang dipakai murid; bab dan nomornya ditulis di
 * belakangnya supaya guru dan murid sama-sama tahu bab mana yang sedang
 * ditempuh — itulah penanda yang dulu hilang ketika soal latihan menumpang di
 * dialog biasa.
 *
 * Baris yang belum bisa dipilih tetap ditampilkan, tetapi mati dan bercatatan
 * ("Bab III belum terbuka"). Menyembunyikannya membuat murid mengira tidak ada
 * apa-apa di sini, lalu berhenti datang.
 */
/** Jalur ujian khusus yang dipegang seorang warga, dari data NPC-nya. */
function npcUjianJalur(npc) {
  const daftar = npc?.kendaraan?.ujian;
  return Array.isArray(daftar) ? daftar : [];
}

function bukaPilihanNpc(npc) {
  const ilmu = state.ilmu;
  const opsi = [
    { label: 'Halo. Aku cuma mau menyapa.', nilai: 'sapa' },
  ];

  // Guru keahlian: satu baris per bab yang ia ajarkan di kelas ini — dua sampai
  // tiga baris, berurutan. Kata "belajar mencangkul" hanya dipakai pada bab
  // PERTAMA, karena hanya bab itulah yang membuat alatnya berguna; bab
  // berikutnya cukup disebut nomornya supaya murid tahu ia sedang melanjutkan.
  const tawaran = ilmu.tawaranWarga(npc.id);
  for (const t of tawaran) {
    const inti = t.judul.split(' — ')[1] ?? '';
    const label = t.bukaAlat && !t.lulus
      ? `Aku ingin belajar ${t.kata} (${t.labelBab}).`
      : t.lulus
        ? `Aku ingin mengulang ${t.labelBab}: ${inti}.`
        : `Aku ingin belajar ${t.labelBab}: ${inti}.`;
    opsi.push({
      label,
      nilai: 'bab:' + t.kitab,
      mati: !t.boleh,
      catatan: t.boleh ? (t.lulus ? 'sudah lulus — boleh diulang' : null) : t.alasan,
    });
  }

  // Jalur khusus yang dipegang seorang warga (sekarang hanya Ustadz Tasoro).
  // Dibaca dari `kendaraan.ujian` di npcs.json — bukan dari id warga yang
  // ditulis di kode — supaya menambah guru remedial lain kelak cukup di data.
  for (const jalur of npcUjianJalur(npc)) {
    const j = JALUR_TASORO[jalur];
    if (!j) continue;
    const izin = ilmu.izinJalur(jalur);
    const hasil = ilmu.hasilJalur(jalur);
    opsi.push({
      label: `${j.judul} kelas ${ilmu.kelasAktif()} (${izin.jumlah ?? j.per} soal).`,
      nilai: 'jalur:' + jalur,
      mati: !izin.boleh,
      catatan: !izin.boleh ? izin.alasan
        : hasil ? `nilai terbaikmu ${hasil.nilai}% — boleh diulang`
          : (jalur === 'remedial' ? 'lima bab pertama, untuk mengulang' : 'lima bab pertama, soal nalar'),
    });
  }

  // Latihan harian: satu soal dari bab kelas pemain, sekali sehari, +1 hati.
  const tanya = npc.beast ? null : ilmu.bolehTanya(npc.id, dayNumber());
  let labelTanya;
  let catatanTanya;
  if (tanya) {
    // "Bab I: Al-Qur'an adalah Wahyu Allah" — nomor babnya ikut disebut karena
    // itulah penanda yang menyambungkan latihan harian dengan rak dan ujian.
    const [nomor, topik] = (tanya.judul || '').split(' — ');
    labelTanya = `Boleh aku bertanya soal ${nomor}${topik ? ': ' + topik : ''}?`;
    catatanTanya = tanya.ulang ? 'ulangan — tanpa tambahan hati' : '+1 hati kalau tepat';
  } else {
    labelTanya = 'Aku ingin bertanya soal pelajaran.';
    catatanTanya = 'sudah kutanyai hari ini — besok lagi, ya';
  }
  if (!npc.beast) opsi.push({ label: labelTanya, nilai: 'tanya', mati: !tanya, catatan: catatanTanya });

  if (npc.beast) { bukaDialogSaja(npc); return; }

  state.pilihanUI.buka({
    judul: npc.name.toUpperCase(),
    kata: tawaran.length
      ? `Apa yang ingin kau lakukan?  (${tawaran.filter((t) => t.lulus).length}/${tawaran.length} bab sudah lulus)`
      : 'Apa yang ingin kau lakukan?',
    opsi,
    pilih: (nilai) => {
      if (nilai === 'sapa') { bicaraBiasa(npc); return; }
      if (nilai.startsWith('bab:')) {
        const kitab = nilai.slice(4);
        const t = ilmu.tawaranWarga(npc.id).find((b) => b.kitab === kitab);
        if (!t?.boleh) { showToast(`${npc.name}: "${t?.alasan ?? ''}"`, 4); return; }
        state.ilmuUI.bukaUjian(kitab, npc.id, npc.name, dayNumber());
        return;
      }
      if (nilai.startsWith('jalur:')) {
        const jalur = nilai.slice(6);
        const izin = ilmu.izinJalur(jalur);
        if (!izin.boleh) { showToast(`${npc.name}: "${izin.alasan}"`, 4); return; }
        state.ilmuUI.bukaJalur(jalur, npc.id, npc.name, dayNumber());
        return;
      }
      if (nilai === 'tanya') {
        state.ilmuUI.bukaTanya(npc.id, npc.name, tanya);
        state.ilmuUI.saatTepat = () => {
          state.social.add(npc.id, POIN_JAWAB_TEPAT);
          state.juice.text(npc.x, npc.y - 44, `♥ ${state.social.hearts(npc.id)}`);
        };
        state.ilmuUI.setelahTanyaNpc = npc;
      }
    },
    batal: () => { npc.talking = false; },
  });
}

/** Dialog biasa tanpa kotak pilihan — untuk yang bukan warga (mis. harimau). */
function bukaDialogSaja(npc) {
  const gift = npc.gift;
  const owed = gift && state.inv.count(gift.item) === 0;
  state.dialog.open({
    speaker: npc.name,
    portrait: npc.portrait,
    text: owed ? gift.text : npc.pickDialog(state.time, state.social.hearts(npc.id)),
    hearts: npc.beast ? null : { filled: state.social.hearts(npc.id), max: MAX_HEARTS },
  });
  state.dialog.onClose = () => { npc.talking = false; if (owed) give(gift.item); };
}

/** Buka layar peningkatan dengan seluruh data yang dibutuhkannya. */
function bukaUpgrade() {
  state.upgradeUI.buka({
    // Papan menjual dua jenis barang, jadi dua syarat ikut dikirim:
    //   bangunan  -> ilmu + inv + uang (bab lulus, bahan, dan biaya)
    //   kendaraan -> diamond (objek, bukan fungsi: papan MEMOTONG saldonya)
    ilmu: state.ilmu,
    inv: state.inv,
    tingkatKelas: state.ilmu.tingkat ?? 'X',
    uang: () => state.player.money,
    bayar: (n) => { state.player.money = Math.max(0, state.player.money - n); },
    diamond: state.diamond,
    kendaraan: state.kendaraan,
  });
}

function doInteract() {
  const t = interactTarget();
  if (!t) { useHeld(); return; }
  const { dialog, inv, farming } = state;
  switch (t.kind) {
    case 'npc': {
      t.npc.talking = true;
      t.npc.faceToward(state.player.x, state.player.y);
      state.audio.talk();
      // Yang bukan warga tidak punya hati dan tidak menambah persahabatan.
      if (!t.npc.beast) state.social.talk(t.npc.id, dayNumber());
      // Dulu urutannya: dialog asli → soal latihan → tawaran ujian, tiga lapisan
      // yang saling menimpa. Sekarang warga menyapa SEBAGAI DIALOG, lalu satu
      // kotak pilihan memuat semua yang bisa dilakukan bersamanya — termasuk
      // "Aku ingin belajar mencangkul (Bab I)" yang membuka ujian bab itu.
      // Semua pilihan berangkat dari satu tempat, jadi tidak ada lagi
      // percakapan yang bercampur.
      bukaPilihanNpc(t.npc);
      break;
    }
    case 'shelf': state.ilmuUI.bukaRak(); break;
    case 'library': travel('library', 'fromFarm'); break;
    case 'shut': showToast(t.msg); break;
    case 'shop': state.shopUI.openShop(t.shop, state.shops[t.shop], state.time.season); break;
    case 'clinic': visitClinic(state.shops[t.id]); break;
    case 'requests': readRequestBoard(); break;
    case 'bed':
      dialog.open({ text: 'Tidur sampai besok pagi?|(Tekan E untuk tidur — progres tersimpan)' });
      dialog.onClose = () => sleep(false);
      break;
    case 'chest': state.chestUI.toggle(); break;
    case 'upgrade': bukaUpgrade(); break;
    case 'fish': castLine(t); break;
    case 'well': {
      const held = inv.held;
      if (held && itemDef(held.id)?.capacity) { held.water = itemDef(held.id).capacity; showToast('Penyiram terisi penuh.'); }
      else showToast('Pegang penyiram dulu.');
      break;
    }
    case 'bin': {
      const held = inv.held;
      if (!held) { showToast('Tidak ada yang dijual.'); break; }
      const def = itemDef(held.id);
      if (!def?.sell) { showToast('Barang ini tidak bisa dijual.'); break; }
      state.audio.coin();
      state.shipping.push({ id: held.id, count: held.count });
      showToast(`${held.count}x ${def.name} → G${def.sell * held.count} (dibayar besok)`, 3);
      inv.removeAt(inv.index, held.count);
      break;
    }
    case 'notice': {
      const req = state.requests.today(dayNumber());
      const done = state.requests.done(dayNumber());
      dialog.open({
        speaker: 'Papan Pengumuman',
        text: `Hari ini ${state.time.dateText}, cuaca ${state.weather.name}.|`
          + `Ramalan besok: ${state.weather.nameOf(state.weather.next)}.`
          + (state.weather.next === 'rain' ? ' Hujan akan menyiram tanamanmu.' : ' Jangan lupa menyiram.')
          + '|' + (done || !req
            ? 'Tidak ada titipan yang menunggu di Balai Desa hari ini.'
            : `${req.npcName} menitipkan permintaan di Balai Desa: ${req.count} ${req.itemName}.`)
          + '|' + Object.values(state.shops)
            .map((p) => `${p.name} ${String(p.open[0]).padStart(2, '0')}:00–${String(p.open[1]).padStart(2, '0')}:00`)
            .join(', ') + '.',
      });
      break;
    }
    case 'closed': showToast('Belum buka — segera hadir.'); break;
    case 'harvest': {
      const item = farming.harvest(t.c, t.r);
      if (item) {
        state.juice.hit('small');
        state.juice.burst(t.c * TILE + TILE / 2, t.r * TILE + TILE / 2, { count: 8, frames: [6, 7], up: 80 });
        state.audio.harvest();
        give(item);
      }
      break;
    }
    case 'forage': t.obj.col = 0; state.audio.harvest(); give('berry', 2); break;
    case 'pick':
      removeObject(t.obj, t.c, t.r);
      state.juice.burst(t.c * TILE + TILE / 2, t.r * TILE + TILE / 2, { count: 6, frames: [6, 7], up: 60 });
      state.audio.harvest();
      give(t.obj.drop);
      break;
    case 'collect': { const item = t.animal.collect(); if (item) give(item); break; }
    case 'feed':
      if (inv.count('feed') > 0) {
        inv.removeAt(inv.slots.findIndex((s) => s?.id === 'feed'), 1);
        t.animal.fed = true;
        showToast('Diberi makan.');
      } else { t.animal.fed = true; showToast('Dibiarkan merumput.'); }
      break;
    case 'pet': t.animal.friendship = Math.min(10, t.animal.friendship + 0.5); showToast('❤'); break;
  }
}

/**
 * Makan barang yang sedang dipegang. Mengembalikan true kalau ada yang dimakan.
 *
 * Tenaga penuh menolak, bukan memakan tanpa guna. Sejak E dipakai untuk memakan
 * juga, satu tekan yang tidak sengaja bisa menghabiskan Soto Ayam seharga G260
 * tanpa menambah apa pun — dan pemain tidak akan tahu apa yang barusan hilang.
 */
function eatHeld(quiet = false) {
  const held = state.inv.held;
  const d = held && itemDef(held.id);
  if (!d?.eat) { if (!quiet) showToast('Tidak bisa dimakan.'); return false; }
  const p = state.player;
  // Dapur (peningkatan) membuat setiap makanan memulihkan 25% lebih banyak.
  const pulih = Math.round((d.eat ?? 0) * (state.upgrade?.pengaliMakan() ?? 1));
  if (p.energy >= p.maxEnergy) {
    showToast(`Tenagamu masih penuh — simpan ${d.name} itu.`);
    state.audio.denied();
    return true;
  }
  p.energy = Math.min(p.maxEnergy, p.energy + pulih);
  state.inv.removeAt(state.inv.index, 1);
  state.juice.text(p.x, p.y - 34, `+${d.eat}`);
  state.audio.harvest();
  showToast(`Makan ${d.name} (+${d.eat} energi)`);
  return true;
}

/**
 * Istirahat di klinik: bayar, tenaga penuh, jam berjalan.
 *
 * Waktunya yang membuat ini sebuah pilihan, bukan uangnya. Tanpa jam yang
 * hilang, membayar Dokter Ratna selalu lebih baik daripada tidur, dan malam
 * hari tidak lagi punya arti apa-apa.
 */
function visitClinic(place) {
  const p = state.player;
  if (p.energy >= p.maxEnergy) {
    state.dialog.open({
      speaker: 'Dokter Ratna', portrait: 'portrait_npc_ratna',
      text: 'Kamu sehat-sehat saja. Simpan uangmu, nanti juga terpakai.',
      hearts: { filled: state.social.hearts('ratna'), max: MAX_HEARTS },
    });
    return;
  }
  if (p.money < place.price) {
    state.dialog.open({
      speaker: 'Dokter Ratna', portrait: 'portrait_npc_ratna',
      text: `Istirahat di sini G${place.price}. Uangmu belum cukup — pulanglah, tidur juga menyembuhkan.`,
      hearts: { filled: state.social.hearts('ratna'), max: MAX_HEARTS },
    });
    state.audio.denied();
    return;
  }
  const hilang = place.restHours;
  state.dialog.open({
    speaker: 'Dokter Ratna', portrait: 'portrait_npc_ratna',
    text: `Berbaring ${hilang} jam, G${place.price}?|(Tekan E untuk istirahat)`,
    hearts: { filled: state.social.hearts('ratna'), max: MAX_HEARTS },
  });
  state.dialog.onClose = () => {
    p.money -= place.price;
    p.energy = p.maxEnergy;
    state.audio.coin();
    state.time.skip(hilang * 60);
    showToast(`Istirahat ${hilang} jam — tenaga pulih.`, 3);
  };
}

/** Papan permintaan di Balai Desa: baca titipan hari ini, atau serahkan. */
function readRequestBoard() {
  const day = dayNumber();
  const req = state.requests.today(day);
  if (!req) { showToast('Papan permintaan masih kosong.'); return; }
  if (state.requests.done(day)) {
    state.dialog.open({
      speaker: 'Balai Desa',
      text: `Titipan ${req.npcName} hari ini sudah kamu penuhi.|Sudah ${state.requests.total} kali kamu membantu warga sini.`,
    });
    return;
  }
  const ready = state.requests.canFill(state.inv, day);
  state.dialog.open({ speaker: 'Balai Desa', text: requestText(req, ready) });
  if (!ready) return;
  state.dialog.onClose = () => {
    const filled = state.requests.fill(state.inv, day);
    if (!filled) return;                 // tasnya berubah sebelum dialog ditutup
    state.player.money += filled.gold;
    state.social.add(filled.npcId, filled.points);
    state.audio.coin();
    const p = state.player;
    state.juice.text(p.x, p.y - 34, `+G${filled.gold}`);
    showToast(`${filled.npcName} berterima kasih — G${filled.gold} dan hatinya bertambah.`, 3);
  };
}

// ---------------------------------------------------------------- fishing
/** Tiles below row `seaRow` are salt water; the forest pond is fresh. */
function waterKind(r) { return r >= 36 ? 'sea' : 'pond'; }

function castLine(t) {
  if (!spend(2)) return;
  const bait = state.inv.count('bait') > 0;
  if (bait) state.inv.removeAt(state.inv.slots.findIndex((s) => s?.id === 'bait'), 1);
  state.fishing.cast({ c: t.c, r: t.r }, {
    water: waterKind(t.r),
    season: state.time.season,
    hour: state.time.hour24,
    lucky: t.lucky,
    bait,
  });
  state.player.dir = state.player.dir;   // keep facing the water while casting
  state.audio.water();
}

/** Runs before everything else in update() while a line is out. */
function updateFishing(dt) {
  const f = state.fishing;
  f.update(dt, input.held('interact'));

  if (f.state === 'bite' && input.pressed('interact')) { f.hook(); state.audio.ui(); }
  if (input.pressed('menu')) { f.cancel(); showToast('Pancing ditarik.'); return true; }

  if (f.state === 'done') {
    const r = f.take();
    if (r === 'missed') { showToast('Umpannya lepas...'); state.audio.denied(); }
    else if (r === 'lost') { showToast('Ikannya kabur!'); state.audio.denied(); }
    else {
      const d = itemDef(r.item);
      state.juice.hit('small');
      state.juice.text(state.player.x, state.player.y - 40, `${d?.name ?? r.item}!`);
      state.audio.harvest();
      give(r.item);
    }
    return true;
  }
  // Reeling takes both hands: no walking, no swinging, no shopping.
  return f.state === 'reel' || f.state === 'bite' || f.state === 'wait';
}

/**
 * Terapkan seluruh efek peningkatan ke keadaan permainan.
 *
 * Satu fungsi, dipanggil setiap kali sesuatu yang relevan berubah (muat
 * simpanan, beli peningkatan). Alasannya: kalau efeknya ditulis ulang di tiap
 * tempat, cepat atau lambat satu tempat ketinggalan — misalnya tas bertambah di
 * layar tetapi tidak di inventori. Di sini semuanya dihitung dari `level`, jadi
 * selalu bisa dipulihkan dengan memanggilnya lagi.
 */
function terapkanUpgrade() {
  const up = state.upgrade;
  if (!up) return;
  // 1. energi maksimum: naik dengan rumah, dan energi yang sedang dipakai ikut
  //    naik sebesar selisihnya supaya pemain tidak "kehilangan" tenaga saat
  //    peningkatan dibeli di tengah hari.
  const maks = 100 + up.energiTambahan();
  const p = state.player;
  if (p) {
    const selisih = maks - (p.maxEnergy ?? 100);
    p.maxEnergy = maks;
    if (selisih > 0) p.energy = Math.min(maks, (p.energy ?? 0) + selisih);
  }
  // 2. ruang tas dan peti.
  //
  // Slot tas = peningkatan lemari + tambahan kendaraan (truk +12). Dihitung di
  // SATU tempat ini, lalu dipanggil lagi setiap kali peningkatan dibeli,
  // kendaraan berganti, atau simpanan dimuat — supaya tas tidak "menyusut" saat
  // pemain turun dari truk, dan tidak "berlipat" saat simpanan dibuka berulang.
  state.inv?.setSlot(up.slotTas() + (state.kendaraan?.slotTas?.() ?? 0));
  if (state.chestUI) state.chestUI.slotPeti = up.slotPeti();
  // 3. kandang: tambahan ternak muncul sebagai sapi/ayam baru di kandang yang
  //    sama. Dibuat sekali per tingkat; kalau simpanan dimuat, jumlahnya
  //    disesuaikan, bukan ditumpuk.
  sesuaikanTernak(up.ternakTambahan());
  // 4. wujud: pemain yang memakai kendaraan duduk di atasnya.
  terapkanTampilanKendaraan();
}

/**
 * Wujud pemain mengikuti kendaraan yang sedang dipakai.
 *
 * Dipanggil dari terapkanUpgrade() — jadi ia ikut jalan setiap kali papan
 * dibeli, kendaraan dipakai/diturunkan, dan simpanan dimuat. SATU tempat: kalau
 * pemilihan sprite ditulis juga di tempat lain, cepat atau lambat dua tempat itu
 * berbeda dan pemain turun dari sepeda tetapi tetap terlihat mengayuh.
 */
function terapkanTampilanKendaraan() {
  const p = state.player;
  const ken = state.kendaraan;
  if (!p || !ken) return;
  const avatar = avatarOf(state.profile);
  const nama = ken.spriteId(avatar, (n) => Boolean(assets.manifest?.sprites?.[n]));
  p.spriteKendaraan = nama;
}

/**
 * Sesuaikan jumlah ternak dengan tingkat kandang.
 *
 * Sapi/ayam tambahan muncul di dalam kandang yang sama, diambil dari titik yang
 * pasti bisa dilalui (fungsi `spot` yang sudah dipakai spawn awal). Yang penting
 * di sini adalah KONSISTENSI: fungsi ini menambah atau membuang, tidak pernah
 * menumpuk, sehingga memuat ulang simpanan tidak membuat ternak terus bertambah.
 */
function sesuaikanTernak(tambahan) {
  const map = state.map;
  if (state.areaId !== 'valley' || !map?.pen || !state.animals.length) return;
  const dasar = 5;                    // 3 ayam + 2 sapi, sesuai spawnEntities
  const target = dasar + Math.max(0, Math.min(tambahan, 3));
  const pen = map.pen;
  const bebas = (c, r) => c >= pen.c0 && c <= pen.c1 && r >= pen.r0 && r <= pen.r1 && !map.isSolid(c, r);
  // Ayam dulu (murah, hasilnya telur), lalu sapi kalau masih ada ruang.
  while (state.animals.length < target) {
    const i = state.animals.length;
    const ayam = i % 2 === 0;
    let spot = null;
    for (let coba = 0; coba < 60 && !spot; coba++) {
      const c = pen.c0 + 1 + Math.floor(Math.random() * (pen.c1 - pen.c0 - 1));
      const r = pen.r0 + 1 + Math.floor(Math.random() * (pen.r1 - pen.r0 - 1));
      if (bebas(c, r)) spot = { c, r };
    }
    if (!spot) return;                // kandang penuh: berhenti, jangan paksa
    const prop = ayam
      ? { produce: { item: 'egg' }, radius: 64, bounds: pen }
      : { produce: { item: 'milk' }, radius: 72, speed: 16, bounds: pen };
    state.animals.push(new Animal(ayam ? 'chicken' : 'cow',
      spot.c * TILE + TILE / 2, (spot.r + 1) * TILE, prop));
  }
  while (state.animals.length > target) state.animals.pop();
}

/**
 * Pindahkan tiap warga ke tempat yang dijadwalkan untuk jam ini.
 *
 * Yang sudah berada di tempat yang benar tidak disentuh, supaya ia tidak
 * berhenti berkeliaran tiap jam bulat. Yang berada jauh di luar layar
 * ditempatkan langsung — lihat `Npc.moveTo`.
 */
function applySchedules() {
  const places = state.map.places;
  if (!places) return;
  const hour = state.time.hour24;
  const cam = state.camera;
  for (const npc of state.npcs) {
    if (npc.beast || !npc.schedule?.length) continue;
    let entry = npc.schedule[npc.schedule.length - 1];
    for (const e of npc.schedule) if (hour >= e.h) entry = e;
    if (entry.at === npc.place) continue;
    const p = places[entry.at] ?? state.map.npcSpots[npc.id];
    if (!p) continue;
    npc.place = entry.at;
    const x = p.c * TILE + TILE / 2, y = (p.r + 1) * TILE;
    const offScreen = Math.abs(x - cam.ix - view.dunW / 2) > view.dunW || Math.abs(y - cam.iy - view.dunH / 2) > view.dunH;
    npc.moveTo(x, y, offScreen);
  }
}

// ---------------------------------------------------------------- update
/**
 * Titik-titik ketuk frame ini, dalam koordinat kanvas (piksel logis).
 *
 * Di komputer isinya kosong dan seluruh permainan memakai `mouse` seperti
 * biasa. Di ponsel, ketukan pada kanvas masuk ke `sentuhan.daftar`: itu satu-
 * satunya cara mengetuk hotbar atau memilih di panel saat kanvas diputar,
 * karena `mousedown` tidak selalu dikirim peramban setelah `touchstart`
 * di-`preventDefault`.
 */
function titikKetuk() {
  const hasil = [];
  // keKanvas() mengembalikan piksel KANVAS. Itu koordinat yang dipakai seluruh
  // UI (HUD, hotbar, panel), jadi `x`/`y` dipakai apa adanya. Untuk yang
  // menyentuh dunia (petak, objek), pakai `dunia` — piksel dunia, yaitu piksel
  // kanvas dibagi skala pandangan.
  const skala = view.skala || 1;
  for (const s of sentuhan.daftar) {
    // Kanvas bisa sedang diputar 90° (ponsel tegak) — keKanvas() yang tahu.
    const k = keKanvas(s.kanvas, s.x, s.y);
    hasil.push({
      x: k.x,
      y: k.y,
      dunia: { x: k.x / skala, y: k.y / skala },
      dipakai: false,
    });
  }
  return hasil;
}

function update(dt) {
  const { player, map, time, dialog, invUI, chestUI } = state;
  state.juice.update(dt);
  if (state.juice.stop > 0) { input.endFrame(); return; }   // brief freeze on impact

  state.chatUI?.update(dt);
  if (mouse.clicked && state.chatUI?.click(mouse.x, mouse.y)) mouse.clicked = false;
  if (state.chatUI?.open) {
    // The world keeps running while the panel is open — this is a cozy game,
    // not a lobby — but every key belongs to the text field, so nothing else
    // reads input this frame.
    if (mouse.wheel) { state.chatUI.wheel(mouse.wheel); }
    state.shadows?.update(dt);
    state.critters?.update(dt, time.hour24);
    for (const n of state.npcs) n.update(map, dt);
    for (const a of state.animals) a.update(map, dt);
    time.update(dt);
    input.endFrame();
    return;
  }

  // Layar Ilmu (perpustakaan/pertanyaan warga) mengambil semua tombol selagi
  // terbuka. Diletakkan sebelum dialog dan menu: E dan Esc miliknya, bukan
  // milik keduanya.
  if (state.nilaiUI?.open) {
    // Tombol dibaca dengan cara yang sama seperti panel lain (input.pressed),
    // bukan variabel `action` — `update()` tidak punya variabel itu, dan versi
    // pertama baris ini membuat setiap frame melempar ReferenceError.
    for (const a of ['up', 'down', 'left', 'right', 'interact', 'nilai', 'menu']) {
      if (input.pressed(a)) state.nilaiUI.onKey(a);
    }
    input.endFrame();
    return;
  }

  if (state.ilmuUI?.open) {
    const il = state.ilmuUI;
    for (const a of ['up', 'down', 'left', 'right', 'interact', 'gift', 'menu', 'ujian']) {
      if (input.pressed(a)) il.key(a, dayNumber());
    }
    if (!il.open) {
      // Ditutup dari dalam layar: kembalikan warga ke keadaan diam, dan buka
      // obrolan biasa kalau tadi memang sedang berbicara dengan seseorang.
      il.onClose?.();
      il.onClose = null;
      if (il.setelahTanyaNpc) {
        const n = il.setelahTanyaNpc;
        il.setelahTanyaNpc = null;
        // Hanya layar LATIHAN yang menutup dengan kalimat perpisahan warga.
        // Ujian bab selesai dengan layarnya sendiri (nilai + status kirim), dan
        // menempelkan obrolan di belakangnya mengembalikan campur aduk yang
        // justru sedang kita bereskan.
        if (il.mode !== 'ujian' && il.mode !== 'ujianHasil') bicaraBiasa(n);
        else n.talking = false;
      }
    }
    input.endFrame();
    return;
  }

  // Layar modal yang punya arti sendiri untuk Esc HARUS diperiksa sebelum
  // penanganan Esc global di bawah. Versi pertama menaruh dua blok ini sesudahnya,
  // dan akibatnya menekan Esc di kotak pilihan warga atau di layar Ragam Usaha
  // membuka menu jeda — layarnya tetap terbuka di belakang menu, dan Esc terasa
  // tidak berfungsi.
  if (state.pilihanUI?.open) {
    for (const a of ['up', 'down', 'interact', 'menu']) {
      if (input.pressed(a)) state.pilihanUI.key(a);
    }
    input.endFrame();
    return;
  }

  if (state.upgradeUI?.open) {
    for (const a of ['up', 'down', 'interact', 'menu']) {
      if (input.pressed(a)) state.upgradeUI.key(a);
    }
    input.endFrame();
    return;
  }

  const menu = state.menu;
  if (input.pressed('menu')) {
    if (state.shopUI?.open) state.shopUI.close();
    else if (invUI.open) invUI.open = false;
    else if (chestUI.open) chestUI.open = false;
    else if (menu?.open) menu.back();
    else menu?.toggle();
  }
  if (menu?.open) {
    for (const a of ['up', 'down', 'left', 'right', 'interact', 'nilai']) if (input.pressed(a)) menu.key(a);
    input.endFrame();
    return;
  }



  if (dialog.active) {
    dialog.update(dt);
    if (input.pressed('interact')) dialog.advance();
    input.endFrame();
    return;
  }

  if (state.fishing?.active) {
    const busy = updateFishing(dt);
    state.shadows?.update(dt);
    time.update(dt);
    if (busy) { input.endFrame(); return; }
  }

  const shopUI = state.shopUI;
  if (shopUI?.open) {
    for (const a of ['left', 'right', 'up', 'down', 'interact']) if (input.pressed(a)) shopUI.key(a);
    if (input.pressed('inventory')) shopUI.cycleTool();
    if (input.pressed('menu')) shopUI.close();
    input.endFrame();
    return;
  }

  if (chestUI.open) {
    for (const a of ['left', 'right', 'up', 'down', 'interact']) if (input.pressed(a)) chestUI.key(a);
    if (mouse.clicked) { const i = chestUI.slotAt(mouse.x, mouse.y); if (i >= 0) { chestUI.cursor = i; chestUI.transfer(); } }
    input.endFrame();
    return;
  }

  // Jalan keluar tidak ditangani di sini: tombol power adalah elemen HTML
  // (ui/tombolKeluar.js) yang mengirim aksi 'menu' yang sama dengan Esc, jadi
  // ia masuk lewat jalur papan ketik di atas.

  // Ketuk hotbar untuk memilih alat. Di ponsel tidak ada tombol 1-9, dan hotbar
  // adalah tempat yang paling wajar diketuk — ia sudah menggambar sembilan slot
  // itu. Geometrinya HARUS sama dengan ui/hud.js (S=40, gap=2, di tengah bawah);
  // kalau salah satu berubah, ubah keduanya.
  //
  // Dipakai `titikKetuk()` (bukan mouse.x/y langsung) karena sentuhan datang
  // sebagai daftar dan harus diterjemahkan dulu: kanvas bisa sedang diputar 90°
  // di ponsel tegak, dan di ponsel zoom otomatisnya 1 sehingga ukuran kanvas
  // tidak sama dengan ukuran layar.
  for (const t of (state.sentuh?.tampil ? titikKetuk() : [])) {
    // Hotbar adalah UI, jadi memakai koordinat kanvas (`t.x`/`t.y`) — bukan
    // `t.dunia`. Kalau pandangan diperluas (skala 0,7), hotbar TIDAK ikut
    // mengecil, dan mengetuknya harus tetap kena slot yang terlihat.
    const S = 40, gap = 2, totalW = 9 * (S + gap) - gap;
    const x0 = Math.round((view.w - totalW) / 2), y0 = view.h - S - 12;
    if (t.y >= y0 - 8 && t.y <= y0 + S + 8) {
      const i = Math.floor((t.x - x0) / (S + gap));
      if (i >= 0 && i < 9 && t.x <= x0 + totalW) {
        state.inv.index = i;
        state.audio.ui();
        t.dipakai = true;
      }
    }
  }

  if (input.pressed('inventory')) { invUI.toggle(); state.audio.ui(); }
  if (invUI.open) {
    invUI.update(dt);
    for (const a of ['left', 'right', 'up', 'down', 'interact', 'drop']) if (input.pressed(a)) invUI.key(a);
    if (mouse.clicked) invUI.pick(invUI.slotAt(mouse.x, mouse.y));
    input.endFrame();
    return;
  }

  if (state.fadeDir === 0) {
    const a = input.axis();
    // Hold Shift to run. No energy cost: the valley is 48 tiles across and the
    // walk between the farm and the shore is the one thing players repeat all
    // day — charging for it would just make them stop doing it.
    // Kendaraan mengali kecepatan, bukan menggantinya: lari tetap mungkin, dan
    // pemain yang belum punya kendaraan mendapat pengali 1 (tidak berubah).
    player.speed = (input.held('run') ? RUN_SPEED : WALK_SPEED)
      * (state.kendaraan?.pengaliCepat() ?? 1);
    player.move(map, a.x, a.y, dt);
    time.update(dt);


    // walking onto a portal tile travels
    const pc = Math.floor(player.x / TILE), pr = Math.floor((player.y - 1) / TILE);
    const portal = map.portalAt(pc, pr);
    if (portal) travel(portal.to, portal.entry);

    const digit = input.digit();
    if (digit) state.inv.index = digit - 1;
    if (input.pressed('nextTool')) state.inv.index = (state.inv.index + 1) % HOTBAR;
    if (input.pressed('prevTool')) state.inv.index = (state.inv.index + HOTBAR - 1) % HOTBAR;
    if (mouse.wheel) state.inv.index = (state.inv.index + mouse.wheel + HOTBAR) % HOTBAR;

    if (input.pressed('interact')) doInteract();
    if (input.pressed('gift')) {
      const t = interactTarget();
      if (t?.kind === 'npc') giveGift(t.npc);
      else showToast('Berdiri menghadap warga dulu.');
    }
    if (input.pressed('eat')) eatHeld();
    if (input.pressed('debugSeason')) { time.debugNextSeason(); state.weather.roll(time.season); showToast(`[debug] ${SEASON_NAMES[time.season]}`); }
    // Lewat `skip`, bukan `minute += 60`: menambah menit langsung akan
    // melompati event jam, sehingga jadwal warga dan lampu malam tidak ikut
    // berubah — persis hal yang biasanya ingin dilihat saat menekan tombol ini.
    if (input.pressed('debugTime')) { time.skip(60); showToast(`[debug] ${time.clockText}`); }
    if (input.pressed('zoom')) { const z = renderer.cycleZoom(); showToast(`Zoom: ${z ? '×' + z : 'otomatis ×' + view.zoom}`); }
  }

  for (const n of state.npcs) n.update(map, dt);
  state.shadows?.update(dt);
  state.critters?.update(dt, time.hour24);
  for (const a of state.animals) a.update(map, dt);
  if (!map.indoor) state.weather.update(dt, view.dunW, view.dunH, time.season);
  else state.weather.particles.length = 0;
  state.camera.follow(player.x, player.y - 16, dt);

  for (const o of map.objects) if (o.shake > 0) o.shake -= dt;

  // fade in/out drives both travel and sleep
  if (state.fadeDir) {
    state.fade = Math.max(0, Math.min(1, state.fade + state.fadeDir * dt * 2.6));
    if (state.fade >= 1 && state.fadeDir > 0) {
      const t = state.pendingTravel;
      state.pendingTravel = null;
      if (t?.sleep) doSleep(t.passedOut);
      else if (t) enterArea(t.to, t.entry);
      state.fadeDir = -1;
    } else if (state.fade === 0 && state.fadeDir < 0) {
      state.fadeDir = 0;
    }
  }
  if (state.toast && (state.toast.t -= dt) <= 0) state.toast = null;
  input.endFrame();
}

// ---------------------------------------------------------------- render
function nightTint(hour) {
  if (hour < 17) return null;
  if (hour < 19) { const t = (hour - 17) / 2; return [255, 200 - 40 * t, 150 - 40 * t, 0.28 * t]; }
  if (hour < 21) { const t = (hour - 19) / 2; return [255 - 190 * t, 160 - 90 * t, 110 + 40 * t, 0.28 + 0.32 * t]; }
  return [60, 65, 145, 0.6];
}

// The darkness layer is built once per frame on its own canvas so the lamps can
// be punched out of it before it is multiplied over the scene. Drawing the tint
// straight onto the game canvas leaves no way to make a hole in it afterwards.
let darkCv = null, darkCtx = null;

/** Tint the whole view, minus a soft hole around every lamp and lit window. */
function darknessLayer(ov, cx, cy, now) {
  // Seukuran DUNIA (bukan kanvas): lapisan ini digambar di dalam blok yang sudah
  // diskalakan, dan harus menutupi seluruh pandangan yang lebih luas.
  const W = view.dunW, H = view.dunH;
  if (!darkCv) { darkCv = document.createElement('canvas'); darkCtx = darkCv.getContext('2d'); }
  if (darkCv.width !== W || darkCv.height !== H) { darkCv.width = W; darkCv.height = H; }

  const g = darkCtx;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.fillStyle = `rgba(${ov[0] | 0},${ov[1] | 0},${ov[2] | 0},${ov[3]})`;
  g.fillRect(0, 0, W, H);

  // Lamps only matter once it is actually dark, so their strength rides on the
  // tint's own alpha instead of switching on at some arbitrary hour.
  const strength = Math.min(1, ov[3] / 0.6);
  g.globalCompositeOperation = 'destination-out';
  for (const L of state.map.lights ?? []) {
    const r = L.r * (1 + Math.sin(now * 2 + L.phase) * 0.03);   // a slight breathing flicker
    const x = L.x - cx, y = L.y - cy;
    if (x < -r || y < -r || x > W + r || y > H + r) continue;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(0,0,0,${0.95 * strength})`);
    grad.addColorStop(0.4, `rgba(0,0,0,${0.6 * strength})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'source-over';
  return { cv: darkCv, strength };
}

/** A warm bloom on top, so a lamp glows rather than merely failing to darken. */
function drawLampGlow(cx, cy, strength, now) {
  const W = view.dunW, H = view.dunH;
  ctx.globalCompositeOperation = 'lighter';
  for (const L of state.map.lights ?? []) {
    const r = L.r * 0.75 * (1 + Math.sin(now * 2 + L.phase) * 0.04);
    const x = L.x - cx, y = L.y - cy;
    if (x < -r || y < -r || x > W + r || y > H + r) continue;
    const a = (L.kind === 'lamp' ? 0.2 : 0.13) * strength;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,196,110,${a})`);
    grad.addColorStop(0.5, `rgba(255,170,80,${a * 0.4})`);
    grad.addColorStop(1, 'rgba(255,160,70,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawSoil(cx, cy) {
  const { farming } = state;
  const dry = assets.images.get('tilled_dry'), wet = assets.images.get('tilled_wet');
  const c0 = Math.floor(cx / TILE), r0 = Math.floor(cy / TILE);
  const c1 = c0 + Math.ceil(view.dunW / TILE) + 1, r1 = r0 + Math.ceil(view.dunH / TILE) + 1;
  const crops = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const s = farming.at(c, r);
      if (!s) continue;
      const img = s.watered ? wet : dry;
      if (img) ctx.drawImage(img, c * TILE - cx, r * TILE - cy);
      if (s.crop) crops.push({ soil: s, x: c * TILE + TILE / 2, y: r * TILE + TILE, isCrop: true });
    }
  }
  return crops;
}

/**
 * One ambient creature. Ground-dwellers go through the y-sorted pass so the
 * player can walk in front of them; fliers are drawn afterwards, over the lot,
 * because they are in the air and sorting them by y would bury them in grass.
 */
function drawCritter(ctx, s, cx, cy) {
  const def = assets.manifest.sprites[s.rule.sprite];
  const img = assets.images.get(s.rule.sprite);
  if (!def || !img) return;
  const [w, h] = def.frame;
  const p = state.critters.place(s);
  const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
  if (x < -w || y < -h || x > view.dunW + w || y > view.dunH + h) return;
  const f = Math.floor((state.critters.t + s.phase) * def.fps) % def.cols;
  ctx.globalAlpha = s.alpha;
  ctx.save();
  ctx.translate(x, y);
  // The sheets all face left, so travelling right is the mirrored draw.
  if (s.dirX > 0) ctx.scale(-1, 1);
  ctx.drawImage(img, f * w, 0, w, h, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Fish shadows and the float: drawn on the water, under everything else. */
function drawWaterLife(cx, cy, now) {
  const shadows = state.shadows;
  const sh = assets.images.get('fish_shadow');
  const shDef = assets.manifest.sprites.fish_shadow;
  if (shadows && sh && shDef) {
    const [w, h] = shDef.frame;
    ctx.globalAlpha = 0.55;
    for (const s of shadows.list) {
      const x = Math.round(s.x - cx), y = Math.round(s.y - cy);
      if (x < -w || y < -h || x > view.dunW + w || y > view.dunH + h) continue;
      const f = Math.floor((s.animT + s.phase) * shDef.fps) % shDef.cols;
      // The strip faces right, so swimming left is the mirrored draw.
      ctx.save();
      ctx.translate(x, y);
      if (s.dirX < 0) ctx.scale(-1, 1);
      ctx.drawImage(sh, f * w, 0, w, h, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const fish = state.fishing;
  const bob = assets.images.get('bobber');
  const bobDef = assets.manifest.sprites.bobber;
  if (fish?.target && bob && bobDef) {
    const [w, h] = bobDef.frame;
    // calm while waiting, dipping the moment it bites, splashing while reeling
    const col = fish.state === 'wait' ? 0 : fish.state === 'bite' ? 1 : 2;
    const bx = Math.round(fish.target.c * TILE + TILE / 2 - cx - w / 2);
    const by = Math.round(fish.target.r * TILE + TILE / 2 - cy - h / 2 + Math.sin(now * 4) * 1.5);
    ctx.drawImage(bob, col * w, 0, w, h, bx, by, w, h);
  }
}

/** Live frames for animated terrain (the sea), painted over the baked canvas. */
function drawAnimatedTerrain(cx, cy, season, now) {
  const { map } = state;
  if (!map.animatedTiles.length) return;
  const c0 = Math.floor(cx / TILE) - 1, r0 = Math.floor(cy / TILE) - 1;
  const c1 = c0 + Math.ceil(view.dunW / TILE) + 2, r1 = r0 + Math.ceil(view.dunH / TILE) + 2;
  for (const [c, r, name] of map.animatedTiles) {
    if (c < c0 || c > c1 || r < r0 || r > r1) continue;
    const key = map.terrainFor(name, season);
    const img = assets.images.get(key);
    const def = assets.manifest.sprites[key];
    if (!img || !def) continue;
    const f = Math.floor(now * (def.fps ?? 4)) % (def.cols ?? 1);
    ctx.drawImage(img, f * TILE, 0, TILE, TILE, c * TILE - cx, r * TILE - cy, TILE, TILE);
  }
}

function render() {
  const { map, player, time, camera, inv, invUI, chestUI, weather } = state;
  const now = performance.now() / 1000;
  const W = view.w, H = view.h;
  // Dunia yang terlihat, dalam piksel dunia. Dengan skala < 1 angkanya lebih
  // besar dari kanvas — itulah pandangan yang lebih luas. `DW/DH` dipakai blok
  // dunia; `W/H` (ukuran kanvas) dipakai UI setelah restore().
  const DW = view.dunW, DH = view.dunH;
  const shake = state.juice.shake;
  const cx = camera.ix + shake.x, cy = camera.iy + shake.y;
  const skala = view.skala ?? 1;
  renderer.clear(map.indoor ? '#241a12' : '#100c09'); // letterbox around small maps

  // --- DUNIA digambar dengan skala pandangan:
  //     `scale()` memperkecil gambar dunia, lalu `fillRect` menutup sisa kanvas
  //     dengan warna latar (tanpa itu, 25% kanan-bawah tidak pernah tergambar
  //     karena semua koordinat dunia hanya sampai DW x skala).
  // Semua kode dunia di blok ini memakai koordinat piksel dunia dan TIDAK perlu
  // dibagi skala. Ditutup dengan restore() sebelum HUD, panel, dan tombol — UI
  // sengaja tidak ikut mengecil, karena di ponsel justru teks dan tombol yang
  // harus tetap besar.
  ctx.save();
  if (skala !== 1) {
    ctx.scale(skala, skala);
    ctx.fillStyle = map.indoor ? '#241a12' : '#100c09';
    ctx.fillRect(0, 0, DW + 2, DH + 2);
  }

  // terrain, clipped so maps smaller than the viewport letterbox cleanly
  const tc = map.terrainCanvas(time.season);
  const sx = Math.max(0, cx), sy = Math.max(0, cy);
  const dx = sx - cx, dy = sy - cy;
  const sw = Math.min(map.w - sx, DW - dx), sh = Math.min(map.h - sy, DH - dy);
  if (sw > 0 && sh > 0) ctx.drawImage(tc, sx, sy, sw, sh, dx, dy, sw, sh);
  drawAnimatedTerrain(cx, cy, time.season, now);
  drawWaterLife(cx, cy, now);
  for (const d of map.decals) {
    const img = assets.images.get(d.sprite);
    const def = assets.manifest.sprites[d.sprite];
    if (img && def) ctx.drawImage(img, Math.round(d.x - def.frame[0] / 2 - cx), Math.round(d.y - def.frame[1] - cy));
  }

  const drawables = state.areaId === 'valley' ? drawSoil(cx, cy) : [];
  for (const o of map.objects) {
    if (o.x < cx - 160 || o.x > cx + DW + 160 || o.y < cy - 96 || o.y > cy + DH + 256) continue;
    drawables.push(o);
  }
  drawables.push(player, ...state.npcs, ...state.animals);
  // Warga yang sedang dihadapi (bisa diajak bicara) ditandai lebih terang.
  const dekat = interactTarget();
  const npcDekat = dekat?.kind === 'npc' ? dekat.npc : null;
  // Di dalam ruangan tidak ada serangga maupun ikan. Tanpa nilai cadangan ini,
  // perpustakaan melempar TypeError setiap frame karena `state.critters` null.
  const critters = state.critters?.split() ?? { ground: [], airDay: [], airNight: [] };
  for (const s of critters.ground) drawables.push({ y: s.y, critter: s });
  drawables.sort((a, b) => a.y - b.y);

  for (const d of drawables) {
    if (d.critter) { drawCritter(ctx, d.critter, cx, cy); continue; }
    if (d instanceof Character || d instanceof Animal) {
      d.draw(ctx, cx, cy);
      // Nama di atas kepala: digambar sesudah sprite-nya supaya tidak tertutup
      // pohon yang berdiri lebih ke depan.
      if (d !== player && typeof d.drawName === 'function') d.drawName(ctx, cx, cy, d === npcDekat);
      continue;
    }
    if (d.isCrop) {
      const def = state.farming.crops[d.soil.crop];
      const sp = assets.manifest.sprites[def.sprite];
      const img = assets.images.get(def.sprite);
      if (!img) continue;
      const [fw, fh] = sp.frame;
      ctx.drawImage(img, d.soil.stage * fw, 0, fw, fh, Math.round(d.x - cx - fw / 2), Math.round(d.y - cy - fh), fw, fh);
      continue;
    }
    const { def, img } = sprite(d.sprite);
    const [fw, fh] = def.frame;
    let idx = d.col ?? 0;
    if (d.seasonal && def.cols_season) idx = Math.max(0, def.cols_season.indexOf(time.season));
    if (d.sprite === 'pine') idx = time.season === 'winter' ? 1 : 0;
    // Semak punya varian musim dingin di kolom 3. Yang diganti hanya kolom yang
    // digambar, bukan `o.col`, supaya semak beri tetap semak beri saat dipetik.
    if (d.sprite === 'bush' && time.season === 'winter') idx = 2;
    if (d.animated && def.cols > 1) idx = Math.floor(now * (def.fps ?? 6)) % def.cols;
    // sheets may have several rows (furniture is 4x2)
    const cols = def.cols ?? 1;
    const sxi = (idx % cols) * fw, syi = Math.floor(idx / cols) * fh;
    const jitter = d.shake > 0 ? Math.round(Math.sin(d.shake * 60) * 2) : 0;
    ctx.drawImage(img, sxi, syi, fw, fh, Math.round(d.x - cx - fw / 2) + jitter, Math.round(d.y - cy - fh), fw, fh);
  }

  // Day fliers here: above the grass, the fences and the player's head, but
  // still under the dusk tint like everything else in the world.
  for (const c of critters.airDay) drawCritter(ctx, c, cx, cy);

  state.juice.drawSwing(ctx, player, cx, cy, itemDef);
  state.juice.drawParticles(ctx, cx, cy);
  state.juice.drawTexts(ctx, cx, cy, UI.fontBig);

  if (weather.particles.length) {
    const pimg = assets.images.get('particles');
    if (pimg) for (const p of weather.particles) {
      const i = weather.spriteIndex(p, time.season);
      ctx.drawImage(pimg, i * 16, 0, 16, 16, Math.round(p.x), Math.round(p.y), 16, 16);
    }
  }

  const ov = map.indoor ? null : nightTint(time.hourFloat);
  if (ov) {
    const { cv, strength } = darknessLayer(ov, cx, cy, now);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(cv, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (strength > 0.02) drawLampGlow(cx, cy, strength, now);
  }

  // Fireflies go on top of the night tint, not under it — see Critters.split.
  for (const c of critters.airNight) drawCritter(ctx, c, cx, cy);
  ctx.restore();   // selesai dunia: mulai dari sini semua UI 1:1 lagi

  // Tombol keluar di kanvas sudah DIHAPUS. Jalan keluarnya satu saja: tombol
  // power di kiri atas (ui/tombolKeluar.js), yang mengirim aksi 'menu' yang
  // sama dengan Esc.
  // `player.diamond` dibaca HUD untuk baris atas panel kanan; objek pemain
  // sendiri tidak menyimpannya (diamond milik progres belajar, bukan badan
  // pemain), jadi digabungkan di sini, sekali, tanpa mengubah Character.
  drawHud(ctx, { time, player: { ...player, diamond: state.diamond.jumlah }, inv, weather });

  // Tombol power disembunyikan selagi pertanyaan "Keluar?" tampil: ada dua jalan
  // keluar yang bisa ditekan bersamaan kalau tidak. Tombol ini elemen HTML,
  // jadi keadaannya disegarkan di sini — satu tempat, seperti `ringkas` di bawah.
  state.tombolKeluar?.saatTanya?.(Boolean(state.menu?.konfirmasiKeluar));
  state.fishingUI?.draw(ctx);
  if (!state.fishing?.active && !state.dialog.active && !state.pilihanUI?.open && !state.upgradeUI?.open && !state.fadeDir && !invUI.open && !chestUI.open && !state.shopUI?.open && !state.menu?.open && !state.ilmuUI?.open && !state.nilaiUI?.open) {
    const t = interactTarget();
    if (t) drawPrompt(ctx, `E  ${t.label}`);
  }
  state.dialog.draw(ctx);
  // Di layar sentuh, sembunyikan tombol yang tidak dipakai selagi layar modal
  // terbuka. Dicek di sini (bukan di tiap layar) supaya satu tempat saja yang
  // perlu tahu daftar layar modal.
  state.sentuh?.ringkas?.(Boolean(
    state.pilihanUI?.open || state.upgradeUI?.open || state.ilmuUI?.open
    || state.nilaiUI?.open || state.menu?.open || invUI?.open || chestUI?.open
    || state.shopUI?.open || state.dialog?.active || state.chatUI?.open,
  ));

  state.pilihanUI?.draw(ctx);
  state.upgradeUI?.draw(ctx);
  invUI.draw(ctx);
  chestUI.draw(ctx);
  state.shopUI?.draw(ctx);
  state.ilmuUI?.draw(ctx);
  state.nilaiUI?.draw(ctx);
  if (state.toast) drawToast(ctx, state.toast.msg);

  state.cheatUI?.draw(ctx, W, H);
  state.cheatConsole?.draw(ctx, W, H);
  state.chatUI?.draw(ctx);
  state.menu?.draw(ctx);

  if (state.fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${state.fade})`;
    ctx.fillRect(0, 0, W, H);
    if (state.fade > 0.55) {
      ctx.globalAlpha = Math.min(1, (state.fade - 0.55) / 0.45);
      text(ctx, time.dateText, W / 2, H / 2 - 10, { font: UI.fontTitle, align: 'center', color: UI.cream });
      ctx.globalAlpha = 1;
    }
  }
}

// Kait debug: `game.html?debug=1` menaruh state permainan di window supaya
// pengujian otomatis bisa memindahkan pemain tanpa menebak posisi. Tidak aktif
// pada pemakaian biasa.
if (modeDebug()) {
  window.__lk = state;
  // Kait uji: memanggil fungsi dalam yang tidak diekspor. Hanya ada di mode
  // debug, jadi tidak menambah permukaan apa pun di build biasa.
  Object.assign(window, {
    __lkTerapkan: () => { terapkanUpgrade(); saveGame(); },
    __lkSleep: () => doSleep(false),
  });

  // Kode debug (Ctrl+G gold, Ctrl+D diamond, …). Dipasang DI SINI, di dalam
  // blok ?debug, dan bukan di badan permainan: 1.000 diamond cukup untuk
  // menembus seluruh ekonomi, dan nilai ujian yang dibelanjakan dari hasil itu
  // tidak sah. tests/uji.mjs mengunci dua arah — harus ada di dalam blok ini,
  // dan tidak boleh ada pemanggilan di luarnya.
  state.cheat = pasangKodeDebug({
    state,
    toast: (msg) => showToast(msg, 4),
    terapkan: terapkanUpgrade,
    simpan: saveGame,
  });
  state.cheatUI = new CheatUI();
  // Baris perintah: F2 atau `/` membukanya. Ini jalan UTAMA, karena Ctrl+D dan
  // Ctrl+G adalah pintasan peramban dan bisa ditelan Chrome sebelum halaman
  // sempat mencegahnya.
  state.cheatConsole = new CheatConsole({
    onKetik: (baris) => {
      const hasil = state.cheat.ketik(baris);
      // `null` = baris tanpa garis miring. Baris ini SENGAJA tidak diteruskan ke
      // obrolan desa: obrolan punya kotaknya sendiri (input DOM) dan mati di
      // GitHub Pages, jadi meneruskan pesan ke sana hanya akan menghilangkannya.
      // Yang dikatakan terang: perintah diawali garis miring.
      return hasil ?? 'Awali dengan / — contoh: /gold 1000';
    },
  });
  window.addEventListener('keydown', (e) => {
    // Jangan rampas tombol saat pemain mengetik di kolom isian (kotak obrolan).
    // Tanpa ini, mengetik "/" di obrolan membuka baris perintah dan hurufnya
    // tidak pernah sampai ke kotak obrolan.
    const t = e.target;
    const diKolom = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    // Baris perintah lebih dulu: selama terbuka, SEMUA tombol miliknya — kalau
    // tidak, huruf yang diketik ikut menggerakkan pemain atau membuka menu.
    // stopImmediatePropagation (bukan stopPropagation): pendengar permainan ada
    // di simpul yang SAMA (window), dan stopPropagation tidak menghentikan
    // pendengar lain di simpul itu.
    if (state.cheatConsole.terbuka) {
      if (state.cheatConsole.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (diKolom) return;
    const kunci = e.key ?? '';
    if (e.code === 'F2' || (kunci === '/' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
      e.preventDefault();
      state.cheatConsole.buka(kunci === '/' ? '/' : '');
      return;
    }
    if (e.code === 'F1') {
      e.preventDefault();
      state.cheatUI.toggle();
    }
  }, { capture: true });
  // Kait uji: menjalankan satu perintah tanpa mengetik, dan membaca riwayatnya.
  window.__lkCheat = state.cheat;
  window.__lkKetik = (baris) => state.cheat.ketik(baris);
  setTimeout(() => {
    showToast('Mode debug: F2 atau / untuk perintah · F1 daftar · Ctrl+G/Ctrl+D bisa ditelan peramban', 8);
  }, 1500);
}

boot().catch((e) => { loadingEl.textContent = `Gagal memuat: ${e.message}`; console.error(e); });
