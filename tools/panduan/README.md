# Tangkapan layar untuk panduan siswa

`docs/panduan/game-*.png` **dihasilkan dari kode permainan yang sebenarnya**
(`src/ui/*.js` + `src/render/*.js` + sprite di `assets/`), bukan digambar tangan.
Kalau tampilan panel berubah, gambar-gambarnya harus dibuat ulang:

```sh
node tools/panduan/tangkap-layar.mjs        # 12 PNG + JSON posisi teks
python tools/panduan/buat-panduan.py        # menyusun docs/Panduan-Siswa-*.pdf
```

Skrip Python butuh: `pip install reportlab pillow arabic-reshaper python-bidi`.

## Kenapa ada dua langkah

Di lingkungan ini tidak ada peramban. Jadi Canvas 2D ditirukan
(`tools/panduan/kanvas.mjs`) di atas PNG sungguhan: `drawImage` memotong bingkai
sprite sesuai `assets/manifest.json`, dan `fillText` menggambar pita tipis pada
posisi & lebar hasil `measureText`, sambil **mencatat** teks aslinya ke
`game-<nama>.json`.

Skrip Python lalu:

1. menghapus pita itu dan menulis huruf sungguhan (DejaVu) pada posisi yang
   sama — diperas ke lebar pita supaya tidak menembus panel, dan disesuaikan
   supaya rata tengah/kanan tetap di tempatnya;
2. menyusun huruf Arab dengan `arabic-reshaper` + `python-bidi` (tanpa itu ayat
   Al-Qur'an tampil terpisah-pisah);
3. memangkas tepi gelap di sekitar panel untuk layar yang isinya cuma panel,
   supaya tulisan tidak menjadi 5 pt di kertas;
4. menyusun PDF-nya.

## Yang nyata dan yang tidak

- **Nyata:** ukuran dan posisi panel, sprite, tata letak tiap baris, isi teks
  (diambil dari `src/data/ilmu.json` dan sistem yang sama dengan permainan),
  nama guru per bab, dan aturan lulus (dibaca dari `BATAS_LULUS`).
- **Tidak persis:** bentuk hurufnya. VT323/Press Start 2P hanya ada di
  peramban, jadi dipakai DejaVu; teks judul sedikit lebih lebar. Karena itu
  pita judul memakai jarak huruf yang dilebihkan, dan skrip PDF mengikuti
  lebar pita.

Berkas hasil `siap/` adalah versi berhuruf sungguhan yang dipakai PDF. Sumber
`game-*.png` tidak pernah ditimpa, jadi skrip boleh dijalankan berkali-kali.
