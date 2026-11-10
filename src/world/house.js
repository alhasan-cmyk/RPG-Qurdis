// Interior of a house. Two of them use this file:
//
//   buildHouse()      — rumah pemain. Kamar mungil: tempat tidur, peti, dan
//                       meja. Dibangun ulang setiap kali dipanggil, jadi isinya
//                       selalu sama.
//   buildLibrary()    — Perpustakaan Desa. Bangunan tersendiri di sebelah
//                       rumah pemain, dengan rak buku di sepanjang dinding.
//
// Kenapa perpustakaan pindah ke dalam rumah, bukan rak yang menempel di dinding
// Balai Desa seperti dulu: rak di pinggir jalan terbaca seperti papan iklan
// yang kebetulan bisa ditekan E. Murid berjalan melewatinya tanpa sadar itu
// tempat belajar. Pintu yang harus dimasuki memberi jeda dan suasana — persis
// yang diminta: "perpustakaan ada dalam rumah".
import { GameMap, TILE } from './map.js';

const T = (n) => n * TILE;
// furniture sheet order: bed table chair wardrobe tv rug lamp chest
const FURN = { bed: 0, table: 1, chair: 2, wardrobe: 3, tv: 4, rug: 5, lamp: 6, chest: 7 };

export function buildHouse() {
  const map = new GameMap({ id: 'house', cols: 18, rows: 11, base: 'wood_floor' });
  map.indoor = true;

  const obj = (sprite, c, r, extra = {}) => {
    const o = { sprite, x: T(c) + TILE / 2, y: T(r) + TILE, ...extra };
    map.objects.push(o);
    return o;
  };

  // back wall (the sprite is 32x64, so one object covers rows 0 and 1)
  for (let c = 0; c < map.cols; c++) {
    obj('wall', c, 1, { kind: 'wall' });
    map.setSolid(c, 0);
    map.setSolid(c, 1);
  }
  for (let r = 0; r < map.rows; r++) { map.setSolid(0, r); map.setSolid(map.cols - 1, r); }
  for (let c = 0; c < map.cols; c++) map.setSolid(c, map.rows - 1);

  // --- along the back wall: bed, chest, TV, wardrobe, lamp
  obj('furniture', 2, 4, { kind: 'bed', col: FURN.bed });
  map.block(2, 4, 2, 3);
  map.bed = { c: 2, r: 4 };

  obj('furniture', 5, 4, { kind: 'chest', col: FURN.chest });
  map.setSolid(5, 4);
  map.chest = { c: 5, r: 4 };

  obj('furniture', 9, 4, { kind: 'tv', col: FURN.tv });
  map.setSolid(9, 4);

  obj('furniture', 12, 4, { kind: 'decor', col: FURN.wardrobe });
  map.block(12, 4, 1, 2);

  obj('furniture', 15, 4, { kind: 'decor', col: FURN.lamp });
  map.setSolid(15, 4);

  // --- living area: a rug under a table flanked by two chairs
  obj('furniture', 8, 9, { kind: 'decor', col: FURN.rug });
  obj('furniture', 6, 8, { kind: 'decor', col: FURN.chair });
  map.setSolid(6, 8);
  obj('furniture', 8, 8, { kind: 'decor', col: FURN.table });
  map.setSolid(8, 8);
  obj('furniture', 10, 8, { kind: 'decor', col: FURN.chair });
  map.setSolid(10, 8);
  obj('furniture', 15, 8, { kind: 'decor', col: FURN.table });
  map.setSolid(15, 8);

  // --- door back out to the farm, bottom centre
  const doorC = 13, doorR = map.rows - 1;
  map.setSolid(doorC, doorR, 0);
  map.portals.push({ c0: doorC, r0: doorR, c1: doorC, r1: doorR, to: 'valley', entry: 'houseDoor' });
  map.entries = { fromFarm: { c: doorC, r: doorR - 1, dir: 'up' } };
  map.spawn = { x: T(doorC) + TILE / 2, y: T(doorR) };
  return map;
}

/**
 * Perpustakaan Desa — 20x13 tile, ruangan yang sengaja lebih lapang dari rumah.
 *
 * Denahnya sederhana dan itu disengaja: begitu murid masuk, ia harus langsung
 * tahu ke mana. Tiga rak di dinding utara, satu di dinding timur, satu meja baca
 * di tengah. Tidak ada lorong bercabang, tidak ada jebakan furnitur.
 *
 * Rak yang ditekan E membuka layar yang SAMA dengan rak di rumah pemain
 * (`ilmuUI.bukaRak`), jadi merapikan rak di sini bukan sekadar dekorasi: satu
 * fungsi, beberapa pintu masuk.
 */
export function buildLibrary() {
  const map = new GameMap({ id: 'library', cols: 20, rows: 13, base: 'wood_floor' });
  map.indoor = true;

  const obj = (sprite, c, r, extra = {}) => {
    const o = { sprite, x: T(c) + TILE / 2, y: T(r) + TILE, ...extra };
    map.objects.push(o);
    return o;
  };

  // dinding: satu baris di utara, tiga sisi sisanya diberi solid tanpa sprite
  for (let c = 0; c < map.cols; c++) {
    obj('wall', c, 1, { kind: 'wall' });
    map.setSolid(c, 0);
    map.setSolid(c, 1);
  }
  for (let r = 0; r < map.rows; r++) { map.setSolid(0, r); map.setSolid(map.cols - 1, r); }
  for (let c = 0; c < map.cols; c++) map.setSolid(c, map.rows - 1);

  // rak buku di dinding utara. `shelf: true` menandai objek yang bisa dibaca;
  // main.js mencari tanda ini, bukan nama sprite-nya, supaya rak baru cukup
  // ditambahkan di sini.
  map.rak = [];
  for (const c of [4, 8, 12, 16]) {
    obj('bookshelf', c, 2, { kind: 'shelf' });
    map.setSolid(c, 2);
    map.rak.push({ c, r: 2 });
  }

  // rak di dinding timur, menghadap barat
  for (const r of [5, 8]) {
    obj('bookshelf', map.cols - 2, r, { kind: 'shelf' });
    map.setSolid(map.cols - 2, r);
    map.rak.push({ c: map.cols - 2, r });
  }

  // meja baca di tengah: dua meja panjang dan empat kursi
  for (const [c, r] of [[8, 8], [9, 8], [10, 8], [11, 8]]) {
    obj('furniture', c, r, { kind: 'decor', col: FURN.table });
    map.setSolid(c, r);
  }
  for (const [c, r] of [[8, 7], [11, 7], [8, 9], [11, 9]]) {
    obj('furniture', c, r, { kind: 'decor', col: FURN.chair });
    map.setSolid(c, r);
  }
  // lampu di dua sudut, supaya ruangan tidak terasa gelap di malam hari
  for (const c of [3, 16]) obj('furniture', c, 9, { kind: 'decor', col: FURN.lamp });

  // pintu keluar di tengah bawah, tepat di depan rak — dari pintu ke rak
  // terdekat hanya empat langkah
  const doorC = 9, doorR = map.rows - 1;
  map.setSolid(doorC, doorR, 0);
  map.portals.push({ c0: doorC, r0: doorR, c1: doorC, r1: doorR, to: 'valley', entry: 'libraryDoor' });
  map.entries = { fromFarm: { c: doorC, r: doorR - 1, dir: 'up' } };
  map.spawn = { x: T(doorC) + TILE / 2, y: T(doorR) };
  return map;
}
