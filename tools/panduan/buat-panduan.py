#!/usr/bin/env python3
"""Buat panduan siswa (PDF) dari tangkapan layar yang dihasilkan kode permainan.

Alur:
  1. tools/panduan/tangkap-layar.mjs  ->  docs/panduan/game-*.png + .json
  2. skrip ini menimpa "pita teks" di PNG dengan huruf SUNGGUHAN (DejaVu) pada
     posisi dan lebar yang sama, lalu menyusun PDF.

Kenapa dua langkah: font VT323/Press Start 2P hanya ada di peramban, jadi Node
menggambar pita sebagai penanda posisi. Huruf aslinya — termasuk huruf Arab pada
halaman kitab — dipasang di sini, sehingga aksen Arab tidak hilang di tengah
kata (Arabic Presentation Forms disusun berurutan sesuai bentuknya).

Jalankan:  /tmp/venvpdf/bin/python tools/panduan/buat-panduan.py
Butuh:     pip install reportlab pillow
"""
from __future__ import annotations

import json
import os
import re

from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image, KeepTogether, ListFlowable, ListItem,
                                PageBreak, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

AKAR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GAMBAR = os.path.join(AKAR, "docs", "panduan")
SIAP = os.path.join(GAMBAR, "siap")     # hasil berhuruf sungguhan (boleh dibuat ulang)
KELUAR = os.path.join(AKAR, "docs", "Panduan-Siswa-Lembah-Kenanga.pdf")

# Penyambung huruf Arab. PIL tidak melakukan shaping sendiri; tanpa ini ayat
# Al-Qur'an tampil terpisah-pisah per huruf. Keduanya pustaka kecil dan opsional:
# kalau tidak terpasang, tabel cadangan di bawah tetap dipakai.
try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    _ADA_RESHAPER = True
except ImportError:  # pragma: no cover - hanya untuk lingkungan tanpa pustaka
    _ADA_RESHAPER = False

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
DEJAVU = os.path.join(FONT_DIR, "DejaVuSans.ttf")
DEJAVU_BOLD = os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")

MERAH = HexColor("#8a2c1d")
COKLAT = HexColor("#3a2a2a")
KREM = HexColor("#f7efdc")
KREM2 = HexColor("#efe3c8")
HIJAU = HexColor("#4f7a2f")
BIRU = HexColor("#2f6a8c")

# --------------------------------------------------------------------- font PDF
pdfmetrics.registerFont(TTFont("Naskah", DEJAVU))
pdfmetrics.registerFont(TTFont("NaskahTebal", DEJAVU_BOLD))
pdfmetrics.registerFontFamily("Naskah", normal="Naskah", bold="NaskahTebal",
                              italic="Naskah", boldItalic="NaskahTebal")


# ------------------------------------------------------- teks di tangkapan layar
def _warna_teks(css: str) -> tuple[int, int, int]:
    """Warna pita teks -> warna huruf yang terbaca di atasnya."""
    css = str(css)
    if css.startswith("#"):
        h = css[1:]
    elif css.startswith("rgb"):
        bag = css[css.index("(") + 1:css.index(")")].split(",")
        return tuple(int(float(v)) for v in bag[:3])  # type: ignore[return-value]
    else:
        return (58, 42, 42)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        n = int(h[:6], 16)
    except ValueError:
        return (58, 42, 42)
    return ((n >> 16) & 255, (n >> 8) & 255, n & 255)


def _huruf_untuk(teks: str, ukuran: int):
    """Font untuk satu baris teks: Arab -> DejaVu, judul -> tebal."""
    arab = bool(re.search(r"[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]", teks))
    tebal = ukuran <= 12 and teks.isupper()
    jalur = DEJAVU_BOLD if (tebal and not arab) else DEJAVU
    return ImageFont.truetype(jalur, max(6, ukuran))


def _bentuk_arab(teks: str) -> str:
    """Bentuk sambung + urutan kanan-ke-kiri untuk PIL."""
    if _ADA_RESHAPER:
        try:
            return get_display(arabic_reshaper.reshape(teks))
        except Exception:
            pass
    return _bentuk_arab_manual(teks)


def _bentuk_arab_manual(teks: str) -> str:
    """Cadangan tanpa pustaka: bentuk sambung dasar, lalu urutan dibalik.

    PIL tidak melakukan shaping, jadi tanpa ini huruf Arab tampil terpisah
    (ﺍ ﻟ ﻘ ...). Di sini tiap huruf dipetakan ke bentuk awal/tengah/akhir dan
    urutannya dibalik, seperti yang sudah dilakukan alat repo ini untuk kitab.
    """
    # Tabel sederhana: [tunggal, awal, tengah, akhir, menyambung_ke_depan]
    tabel = {
        "ا": ("ﺍ", "ﺍ", "ﺎ", "ﺎ", False), "ب": ("ﺏ", "ﺑ", "ﺒ", "ﺐ", True),
        "ت": ("ﺕ", "ﺗ", "ﺘ", "ﺖ", True), "ث": ("ﺙ", "ﺛ", "ﺜ", "ﺚ", True),
        "ج": ("ﺝ", "ﺟ", "ﺠ", "ﺞ", True), "ح": ("ﺡ", "ﺣ", "ﺤ", "ﺢ", True),
        "خ": ("ﺥ", "ﺧ", "ﺨ", "ﺦ", True), "د": ("ﺩ", "ﺩ", "ﺪ", "ﺪ", False),
        "ذ": ("ﺫ", "ﺫ", "ﺬ", "ﺬ", False), "ر": ("ﺭ", "ﺭ", "ﺮ", "ﺮ", False),
        "ز": ("ﺯ", "ﺯ", "ﺰ", "ﺰ", False), "س": ("ﺱ", "ﺳ", "ﺴ", "ﺲ", True),
        "ش": ("ﺵ", "ﺷ", "ﺸ", "ﺶ", True), "ص": ("ﺹ", "ﺻ", "ﺼ", "ﺺ", True),
        "ض": ("ﺽ", "ﺿ", "ﻀ", "ﺾ", True), "ط": ("ﻁ", "ﻃ", "ﻄ", "ﻂ", True),
        "ظ": ("ﻅ", "ﻇ", "ﻈ", "ﻆ", True), "ع": ("ﻉ", "ﻋ", "ﻌ", "ﻊ", True),
        "غ": ("ﻍ", "ﻏ", "ﻐ", "ﻎ", True), "ف": ("ﻑ", "ﻓ", "ﻔ", "ﻒ", True),
        "ق": ("ﻕ", "ﻗ", "ﻘ", "ﻖ", True), "ك": ("ﻙ", "ﻛ", "ﻜ", "ﻚ", True),
        "ل": ("ﻝ", "ﻟ", "ﻠ", "ﻞ", True), "م": ("ﻡ", "ﻣ", "ﻤ", "ﻢ", True),
        "ن": ("ﻥ", "ﻧ", "ﻨ", "ﻦ", True), "ه": ("ﻩ", "ﻫ", "ﻬ", "ﻪ", True),
        "و": ("ﻭ", "ﻭ", "ﻮ", "ﻮ", False), "ي": ("ﻱ", "ﻳ", "ﻴ", "ﻲ", True),
        "ى": ("ﻯ", "ﻯ", "ﻰ", "ﻰ", False), "ة": ("ﺓ", "ﺓ", "ﺔ", "ﺔ", False),
        "ء": ("ء", "ء", "ء", "ء", False), "أ": ("ﺃ", "ﺃ", "ﺄ", "ﺄ", False),
        "إ": ("ﺇ", "ﺇ", "ﺈ", "ﺈ", False), "آ": ("ﺁ", "ﺁ", "ﺂ", "ﺂ", False),
        "ؤ": ("ﺅ", "ﺅ", "ﺆ", "ﺆ", False), "ئ": ("ﺉ", "ﺋ", "ﺌ", "ﺊ", True),
        "ً": ("ﹰ",) * 4 + (False,), "ٌ": ("ﹱ",) * 4 + (False,),
        "ٍ": ("ﹴ",) * 4 + (False,), "َ": ("ﹶ",) * 4 + (False,),
        "ُ": ("ﹸ",) * 4 + (False,), "ِ": ("ﹺ",) * 4 + (False,),
        "ّ": ("ﹼ",) * 4 + (False,), "ْ": ("ﹾ",) * 4 + (False,),
    }
    hasil = []
    for i, ch in enumerate(teks):
        if ch not in tabel:
            hasil.append(ch)
            continue
        tunggal, awal, tengah, akhir, sambung = tabel[ch]
        sebelum = teks[i - 1] if i > 0 else ""
        sesudah = teks[i + 1] if i + 1 < len(teks) else ""
        sambung_sebelum = sebelum in tabel and tabel[sebelum][4]
        sambung_sesudah = sesudah in tabel
        if sambung_sebelum and sambung_sesudah and sambung:
            hasil.append(tengah)
        elif sambung_sebelum:
            hasil.append(akhir)
        elif sambung_sesudah and sambung:
            hasil.append(awal)
        else:
            hasil.append(tunggal)
    return "".join(reversed(hasil))


def tulis_teks_di_gambar(jalur_png: str, jalur_keluar: str, meta: dict) -> str:
    """Hapus pita teks tiruan, lalu tulis huruf sungguhan di tempat yang sama.

    Berkas sumber TIDAK diubah: hasilnya ditulis ke `jalur_keluar`. Dengan
    begitu skrip ini boleh dijalankan berkali-kali — kalau sumbernya ditimpa,
    tulisan akan menumpuk di atas tulisan lama dan gambarnya menjadi rusak.
    """
    img = PILImage.open(jalur_png).convert("RGBA")
    draw = ImageDraw.Draw(img)
    for t in meta.get("teks", []):
        pita = t.get("pita") or {
            "x": t["x"], "y": t["y"], "w": max(4, t["lebar"]), "h": max(4, t["ukuran"]),
        }
        # Latar diambil dari piksel DI LUAR pita (kiri/atas), bukan dari dalam
        # pita: di dalam pita warnanya sudah pasti tinta.
        latar = _latar_sekitar(img, pita)
        if latar:
            draw.rectangle(
                [pita["x"] - 1, pita["y"] - 1, pita["x"] + pita["w"] + 1, pita["y"] + pita["h"] + 1],
                fill=latar,
            )
        teks = str(t["teks"])
        ukuran = max(7, int(round(t["ukuran"] * 0.9)))
        if re.search(r"[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]", teks):
            teks = _bentuk_arab(teks)
        _tempel_teks(img, teks, pita, t)

    img = img.convert("RGB")
    img.save(jalur_keluar)
    return jalur_keluar


def _tempel_teks(img, teks: str, pita: dict, t: dict) -> None:
    """Gambar teks ke lapisan terpisah, lalu sesuaikan lebarnya dengan pita.

    Lebar pita berasal dari `measureText` di permainan (font VT323). DejaVu
    lebih lebar, jadi teks digambar dulu apa adanya, lalu DIPERAS ke lebar pita.
    Hasilnya: baris tidak pernah menembus panel, dan rata tengah/kanan tetap di
    tempatnya — yang penting tata letaknya jujur, bukan bentuk hurufnya.
    """
    ukuran = max(7, int(round(t["ukuran"] * 0.9)))
    font = _huruf_untuk(t["teks"], ukuran)
    warna = _warna_teks(t.get("warna", "#3a2a2a"))
    kiri, atas, kanan, bawah = ImageDraw.Draw(img).textbbox((0, 0), teks, font=font)
    lebar_teks = max(1, kanan - kiri)
    tinggi_teks = max(1, bawah - atas)
    lapisan = PILImage.new("RGBA", (lebar_teks + 4, tinggi_teks + 6), (0, 0, 0, 0))
    ImageDraw.Draw(lapisan).text((2 - kiri, 1 - atas), teks, font=font, fill=warna)

    target_w = max(6, pita["w"])
    if lebar_teks > target_w:
        # Hanya DIPERAS kalau memang lebih lebar: menaruhnya utuh lebih mudah
        # dibaca, tetapi menembus panel membuat panduan terlihat rusak.
        lapisan = lapisan.resize((target_w + 4, lapisan.height), PILImage.LANCZOS)
    # Batas TINGGI juga perlu: baris permainan berjarak 18–22 px, sedangkan
    # DejaVu pada ukuran itu lebih tinggi. Tanpa batas ini, baris yang berdekatan
    # saling menimpa dan pembaca mengira tata letak game-nya rusak.
    maks_h = max(6, int(pita["h"] * 1.05))
    if lapisan.height > maks_h:
        skala = maks_h / lapisan.height
        lapisan = lapisan.resize((max(1, int(lapisan.width * skala)), maks_h), PILImage.LANCZOS)
    align = t.get("align", "left")
    if align == "center" and t.get("tengah") is not None:
        x = int(t["tengah"] - lapisan.width / 2)
    elif align == "right":
        # Rata kanan: ujung KANAN yang dijaga (bukan lebar pitanya), karena teks
        # pengganti yang lebih lebar tidak boleh melewati tepi panel.
        kanan = t.get("kanan")
        x = int((kanan if kanan is not None else pita["x"] + pita["w"]) - lapisan.width)
    else:
        x = int(pita["x"])
    y = int(pita["y"] - 2)
    img.alpha_composite(lapisan, (max(-4, x), max(-4, y)))


def _latar_sekitar(img, pita) -> tuple[int, int, int, int] | None:
    """Warna latar di sekitar pita, atau None kalau pikselnya tidak seragam."""
    x, y, w, h = pita["x"], pita["y"], pita["w"], pita["h"]
    calon = [(x - 3, y + h // 2), (x + w + 3, y + h // 2), (x + w // 2, y - 3), (x + w // 2, y + h + 3)]
    for cx, cy in calon:
        if 0 <= cx < img.width and 0 <= cy < img.height:
            r, g, b, _ = img.getpixel((cx, cy))
            # Latar yang masih memuat sisa tinta (gelap) dilewati.
            if (r + g + b) / 3 > 120:
                return (r, g, b, 255)
    return None


# Layar yang isinya cuma panel di tengah dunia yang diredupkan: dipangkas ke
# panelnya supaya tulisan di PDF tidak menjadi 5 pt. HUD dan menu TIDAK
# dipangkas — di situ seluruh layar memang informasinya.
PANGKAS = {
    "pilih-warga", "dialog", "rak", "baca", "ujian", "ujian-lulus", "ujian-gagal",
    "nilai", "papan-usaha", "papan-usaha-siap",
}


def pangkas_panel(jalur: str) -> None:
    """Pangkas tepi gelap di luar panel, sisakan 10 px sebagai bingkai."""
    img = PILImage.open(jalur).convert("RGB")
    px = img.load()
    w, h = img.size
    kiri, atas, kanan, bawah = w, h, 0, 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            # Panel kayu/krem jauh lebih terang daripada dunia yang diredupkan.
            if (r + g + b) / 3 > 95:
                kiri = min(kiri, x); kanan = max(kanan, x)
                atas = min(atas, y); bawah = max(bawah, y)
    if kanan <= kiri or bawah <= atas:
        return
    bingkai = 10
    img.crop((max(0, kiri - bingkai), max(0, atas - bingkai),
              min(w, kanan + bingkai), min(h, bawah + bingkai))).save(jalur)


def siapkan_gambar() -> dict[str, str]:
    """Salin tangkapan layar ke SIAP/ dengan huruf sungguhan. Sumber utuh."""
    hasil = {}
    os.makedirs(SIAP, exist_ok=True)
    for nama in sorted(os.listdir(GAMBAR)):
        if not nama.endswith(".png") or not nama.startswith("game-"):
            continue
        png = os.path.join(GAMBAR, nama)
        meta_jalur = png[:-4] + ".json"
        meta = json.load(open(meta_jalur)) if os.path.exists(meta_jalur) else {}
        kunci = nama[len("game-"):-4]
        keluar = tulis_teks_di_gambar(png, os.path.join(SIAP, nama), meta)
        if kunci in PANGKAS:
            pangkas_panel(keluar)
        hasil[kunci] = keluar
    return hasil


# ------------------------------------------------------------------- dokumen
styles = getSampleStyleSheet()

GAYA = {
    "judul": ParagraphStyle("judul", fontName="NaskahTebal", fontSize=30, leading=34,
                            textColor=MERAH, spaceAfter=2 * mm, alignment=TA_CENTER),
    "sub": ParagraphStyle("sub", fontName="Naskah", fontSize=13, leading=18,
                          textColor=COKLAT, alignment=TA_CENTER, spaceAfter=2 * mm),
    "h1": ParagraphStyle("h1", fontName="NaskahTebal", fontSize=17, leading=21,
                         textColor=MERAH, spaceBefore=5 * mm, spaceAfter=2 * mm,
                         keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName="NaskahTebal", fontSize=13, leading=17,
                         textColor=COKLAT, spaceBefore=3 * mm, spaceAfter=1 * mm,
                         keepWithNext=1),
    "isi": ParagraphStyle("isi", fontName="Naskah", fontSize=10.5, leading=15,
                          textColor=COKLAT, spaceAfter=1.6 * mm),
    "kecil": ParagraphStyle("kecil", fontName="Naskah", fontSize=8.5, leading=12,
                            textColor=HexColor("#5a4230")),
    "kutip": ParagraphStyle("kutip", fontName="Naskah", fontSize=9.5, leading=14,
                            textColor=HexColor("#3a2a2a"), leftIndent=6 * mm,
                            borderPadding=3, backColor=KREM2, spaceBefore=1 * mm,
                            spaceAfter=2 * mm),
    "kunci": ParagraphStyle("kunci", fontName="NaskahTebal", fontSize=11, leading=15,
                            textColor=BIRU, spaceAfter=1 * mm),
}


def P(teks: str, gaya: str = "isi") -> Paragraph:
    return Paragraph(teks, GAYA[gaya])


def langkah(nomor: int, judul: str, isi: list) -> list:
    """Satu langkah, judul + isi, tidak terpotong antar halaman.

    Nomornya TIDAK dipakai lagi: dulu penomoran berjalan terus antar bagian
    (Bagian 3 mulai dari "4."), dan pembaca mengira ada langkah yang hilang.
    Tiap bagian kini punya daftar sendiri yang tidak bernomor.
    """
    del nomor
    return [P(judul, "h2"), *isi]


def butir(daftar: list) -> ListFlowable:
    return ListFlowable(
        [ListItem(P(t), leftIndent=6 * mm, value="•") for t in daftar],
        bulletType="bullet", start="•", leftIndent=6 * mm, bulletFontName="Naskah",
    )


def gambar(nama: str, lebar_mm: float = 150, keterangan: str = "") -> list:
    jalur = GAMBAR_FINAL[nama]      # sudah berhuruf sungguhan (SIAP/)
    img = PILImage.open(jalur)
    rasio = img.height / img.width
    w = lebar_mm * mm
    isi = [Image(jalur, width=w, height=w * rasio)]
    if keterangan:
        isi.append(P(keterangan, "kecil"))
    isi.append(Spacer(1, 2 * mm))
    return [KeepTogether(isi)]


def kotak_tabel(baris: list[list[str]], lebar: list[float] | None = None) -> Table:
    data = [[P(sel, "isi") for sel in r] for r in baris]
    t = Table(data, colWidths=[w * mm for w in lebar] if lebar else None, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), KREM2),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, COKLAT),
        ("GRID", (0, 0), (-1, -1), 0.3, HexColor("#cbb894")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def kaki(canvas, doc):
    canvas.saveState()
    canvas.setFont("Naskah", 8)
    canvas.setFillColor(HexColor("#8a7358"))
    canvas.drawString(18 * mm, 10 * mm, "Panduan Siswa — Lembah Kenanga")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"halaman {doc.page}")
    canvas.setStrokeColor(HexColor("#d9c39a"))
    canvas.line(18 * mm, 13.5 * mm, A4[0] - 18 * mm, 13.5 * mm)
    canvas.restoreState()


def daftar_bab() -> list[list[str]]:
    """Tabel bab → warga pengajarnya, dibaca dari data permainan."""
    data = json.load(open(os.path.join(AKAR, "src", "data", "ilmu.json"), encoding="utf-8"))
    nama_npc = data.get("npcNama", {})
    ajar = data.get("keahlian", {}).get("ajar", {})
    kitab = {k["id"]: k for k in data.get("kitab", [])}
    baris = [["Kelas", "Bab", "Judul", "Cari ke"]]
    for kelas in ("X", "XI", "XII"):
        for npc, daftar in ajar.get(kelas, {}).items():
            for kid in daftar:
                k = kitab.get(kid, {})
                judul = (k.get("judul") or kid).split(" — ")[-1]
                nomor = (k.get("judul") or "").split(" — ")[0]
                baris.append([kelas, nomor, judul, nama_npc.get(npc, npc)])
    return baris


GAMBAR_FINAL: dict[str, str] = {}


def buat() -> None:
    GAMBAR_FINAL.update(siapkan_gambar())
    doc = SimpleDocTemplate(
        KELUAR, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
        title="Panduan Siswa — Lembah Kenanga", author="Lembah Kenanga",
        subject="Cara memainkan dan belajar di game Lembah Kenanga",
    )
    doc.kaki = kaki
    cerita: list = []

    # ---------------------------------------------------------------- sampul
    cerita += [
        Spacer(1, 14 * mm),
        P("PANDUAN SISWA", "judul"),
        P("LEMBAH KENANGA", "judul"),
        P("Belajar Al-Qur'an Hadis sambil bertani di desa", "sub"),
        Spacer(1, 4 * mm),
        kotak_tabel([
            ["Kalau kamu…", "Bacalah bagian"],
            ["Baru pertama kali membuka game", "Bagian 1 – 3"],
            ["Sudah bisa masuk game tapi bingung harus apa", "Bagian 4 – 6"],
            ["Sudah sampai di warga tapi bingung belajar apa", "Bagian 7 – 10"],
            ["Ingin tahu kenapa nilainya belum lulus", "Bagian 9"],
            ["Lupa cara melihat nilai", "Bagian 11"],
        ], [95, 60]),
        Spacer(1, 5 * mm),
        P("<b>Satu kalimat untuk diingat:</b> di desa ini kamu tidak bisa asal "
          "mencangkul atau memancing. Setiap alat bekerja hanya setelah kamu lulus "
          "ujian bab yang mengajarkannya. Jadi kalau alat terasa tidak berguna, "
          "artinya kamu belum bertemu warga yang benar — bukan game-nya rusak.", "kutip"),
        PageBreak(),
    ]

    # ------------------------------------------------- 1. rotasi otomatis HP
    cerita += [
        P("BAGIAN 1 — AKTIFKAN ROTASI OTOMATIS DI HP", "h1"),
        P("Game ini berbentuk mendatar (landscape). Di HP tegak, layar permainan "
          "diputar otomatis tetapi lebih sempit dan tombolnya menumpuk. Supaya "
          "nyaman, izinkan HP memutar layar sendiri:", "isi"),
        *langkah(1, "Buka pengaturan HP (ikon roda gigi)", [
            butir([
                "Android: tarik panel notifikasi dari atas, cari ikon <b>Rotasi otomatis</b> / "
                "<b>Auto-rotate</b>, lalu ketuk sampai aktif.",
                "iPhone: buka <b>Pengaturan → Layar & Kecerahan</b>, matikan "
                "<b>Kunci Orientasi Potret</b>. Di iPhone yang punya tombol aksi, "
                "pastikan tombol itu tidak mengunci rotasi.",
            ]),
        ]),
        *langkah(2, "Putar HP ke samping sebelum membuka game", [
            P("Buka game dalam posisi mendatar. Kalau game sudah terbuka dan layar tidak "
              "ikut berputar, tutup lalu buka lagi setelah HP diputar — lebih andal "
              "daripada menunggu.", "isi"),
        ]),
        *langkah(3, "Kalau layar tidak bisa dikunci ke samping", [
            P("Tetap bisa dimainkan: game memutar sendiri gambarannya di HP tegak. "
              "Kekurangannya hanya tampilan yang lebih kecil.", "isi"),
        ]),
        P("Batas akal: panduan ini tidak bisa menampilkan menu HP kamu, karena setiap "
          "merek berbeda. Nama menunya bisa <i>Rotasi otomatis</i>, <i>Auto-rotate</i>, "
          "atau <i>Putar layar otomatis</i>.", "kecil"),
    ]

    # ------------------------------------------------------ 2. daftar baru
    cerita += [
        P("BAGIAN 2 — DAFTAR KALAU BARU MULAI", "h1"),
        P("Buka alamat game yang diberikan gurumu. Halaman pertama berisi tiga hal: "
          "<b>MULAI BARU</b>, <b>LANJUTKAN</b>, dan menu penjelasan.", "isi"),
        *langkah(1, "Isi kolom di kotak MULAI BARU", [
            butir([
                "<b>Username</b> — namamu, tanpa spasi. Contoh: <i>Iqbal21</i>. Ini juga "
                "nama yang dilihat gurumu di daftar nilai, jadi jangan memakai nama teman.",
                "<b>Nama ladang</b> — bebas, dipakai di cerita pembuka.",
                "<b>Karakter</b> — pilih salah satu gambar.",
                "<b>Kelas</b> — X, XI, atau XII dan nomor rombel. <b>Ini menentukan soal "
                "yang muncul.</b> Salah pilih kelas berarti soalnya tidak sesuai "
                "pelajaranmu.",
                "<b>PIN</b> — 4–8 angka. <b>Tulis di buku</b>. PIN ini yang dipakai untuk "
                "LANJUTKAN kalau kamu main dari HP lain.",
            ]),
        ]),
        *langkah(2, "Tekan MULAI BARU dan tunggu sebentar", [
            P("Game memuat gambar dan cerita pembuka. Kalau muncul tulisan kuning, "
              "artinya ada yang belum diisi — bacalah, bukan diabaikan.", "isi"),
        ]),
        *langkah(3, "Sudah pernah main? Pakai LANJUTKAN, jangan MULAI BARU", [
            P("Isi <b>username</b> dan <b>PIN</b> lalu tekan LANJUTKAN. Menekan MULAI BARU "
              "dengan nama yang sama akan menghapus simpanan di HP itu.", "isi"),
        ]),
        P("Simpanan permainan hanya ada di HP yang kamu pakai. Kalau bermain di HP "
          "sekolah, jangan berharap simpananmu ada di HP rumah.", "kutip"),
    ]

    # --------------------------------------------------------- 3. layar penuh
    cerita += [
        P("BAGIAN 3 — MEMBUAT LAYAR PENUH", "h1"),
        P("Layar penuh menghilangkan alamat halaman dan tombol peramban supaya "
          "layarnya lega dan tombol tidak salah tekan.", "isi"),
        *langkah(4, "Temukan tombol layar penuh", [
            P("Saat pertama kali game terbuka, muncul ajakan memasang layar penuh. Kalau "
              "sudah hilang, buka menu (tombol <b>☰</b> atau tombol power di layar) → "
              "<b>Pengaturan</b> → <b>Layar penuh</b>.", "isi"),
            P("Di HP, memutar HP ke samping lalu menekan layar penuh biasanya paling "
              "nyaman. Di komputer, tekan <b>F11</b>.", "isi"),
        ]),
        *langkah(5, "Kalau tulisan terasa terlalu kecil atau terlalu besar", [
            P("Buka <b>Pengaturan → Pandangan</b>, lalu pilih <b>Normal</b>, <b>Luas</b>, "
              "atau <b>Sangat luas</b>. Pilihan ini hanya memperbesar pandangan dunia; "
              "tulisan dan tombol tetap besar.", "isi"),
        ]),
        P("Pengaturan yang mengubah tampilan disimpan di HP itu, jadi tidak perlu "
          "diatur ulang setiap masuk.", "kecil"),
    ]

    # --------------------------------------------- 4. tombol yang dipakai
    cerita += [
        P("BAGIAN 4 — TOMBOL YANG SERING DIPAKAI", "h1"),
        kotak_tabel([
            ["Tombol", "Gunanya"],
            ["W A S D", "Berjalan (di HP: tombol panah di kiri bawah)"],
            ["E", "Bicara, membuka, memakai, menjawab, menyiram"],
            ["Shift", "Berlari (memakai tenaga lebih cepat)"],
            ["1 – 9", "Memilih alat di bar bawah"],
            ["I", "Membuka tas"],
            ["C", "Makan"],
            ["Esc", "Menutup panel / membuka menu"],
            ["F", "Mengubah pandangan (zoom)"],
        ], [32, 120]),
        Spacer(1, 3 * mm),
        P("Di HP ada tombol panah di kiri dan tombol <b>E</b> di kanan. Kamu juga bisa "
          "mengetuk alat di bar bawah untuk memilihnya.", "isi"),
        butir([
            "<b>Esc</b> menutup panel yang sedang terbuka. Kalau tidak ada panel, Esc "
            "membuka menu (Pengaturan, Rekap Belajar, Simpan sekarang, Keluar).",
            "<b>E</b> melakukan hal yang tertulis di petunjuk bawah layar. Kalau bingung "
            "harus menekan apa, bacalah baris itu.",
            "<b>1–9</b> memilih alat. Alat yang tidak berguna akan berkata sendiri bahwa "
            "kamu belum lulus bab pembukanya (lihat Bagian 9).",
        ]),
        *gambar("hud", 165,
                "Layar permainan. Kiri atas: tanggal, jam, cuaca, dan tenaga (bar hijau). "
                "Kanan atas: diamond dan gold. Bawah: alat yang bisa dipakai."),
    ]

    # ------------------------------------ 5. di mana mencari info bab
    cerita += [
        P("BAGIAN 5 — DI MANA MENCARI INFO BAB (BAB 1, BAB 2, …)", "h1"),
        P("Ada DUA tempat, dan keduanya menjawab pertanyaan yang berbeda:", "isi"),
        kotak_tabel([
            ["Tempat", "Menjawab pertanyaan"],
            ["Rak di perpustakaan (di dalam desa)", "Apa isi bab ini? Siapa pengajarnya? "
             "Sudah kubaca atau belum? Nomor bab dan judulnya."],
            ["Warga (guru bab itu)", "Aku mau belajar bab ini. Aku mau mengulang bab ini. "
             "Kenapa belum boleh?"],
            ["Menu → Rekap Belajar → V", "Nilai dari bab yang sudah kukerjakan."],
        ], [55, 97]),
        Spacer(1, 3 * mm),
        *langkah(6, "Buka rak perpustakaan", [
            P("Masuk ke perpustakaan di desa, lalu hadapi raknya dan tekan <b>E</b>. "
              "Daftar bab kelasmu muncul dengan nomor, judul, dan keterangan "
              "<i>belum dibaca</i> / <i>✓ dibaca</i> / <i>LULUS</i> / jumlah soalnya.", "isi"),
            P("Di bagian bawah rak tertulis <b>Pengajar: nama warga</b> untuk bab yang "
              "sedang kamu sorot. Itulah orang yang harus kamu cari.", "isi"),
        ]),
        *gambar("rak", 165,
                "Rak perpustakaan: nomor bab, judul, status, jumlah soal, dan nama pengajarnya."),
        P("Kamu juga tidak perlu jauh-jauh: di layar warga, baris pilihan menyebut bab "
          "dan judulnya. Kalau baris itu tidak bisa dipilih, keterangannya menyebut "
          "bab mana yang harus diluluskan lebih dulu.", "isi"),
    ]

    # ------------------------------------------------ 6. cara bicara NPC
    cerita += [
        P("BAGIAN 6 — CARA BICARA DENGAN WARGA", "h1"),
        *langkah(1, "Dekati warga sampai namanya menyala", [
            P("Tiap warga punya nama di atas kepalanya. Kalau kamu sudah cukup dekat, "
              "namanya ditandai lebih terang dan muncul petunjuk di bawah layar.", "isi"),
        ]),
        *langkah(2, "Tekan E, lalu baca sapaan dan pilih", [
            P("Kotak pilihan muncul berisi: sapaan biasa, baris belajar tiap bab yang "
              "ia ajarkan (<i>“Aku ingin belajar Bab I: …”</i>), dan pertanyaan harian "
              "(<i>“Boleh aku bertanya soal Bab I?”</i>).", "isi"),
            P("Pakai <b>W/S</b> untuk memilih lalu <b>E</b>. Baris yang tidak bisa dipilih "
              "tetap ditampilkan beserta alasannya — misalnya <i>“Lulus dulu Bab I.”</i>", "isi"),
        ]),
        *langkah(3, "Pertanyaan harian menambah hati, bukan nilai", [
            P("Menjawab pertanyaan harian dengan tepat menambah satu hati. Soal itu dari "
              "bab kelasmu dan biasanya hanya sekali sehari per warga. Hati tidak "
              "menambah nilai — nilai hanya dari ujian bab.", "isi"),
        ]),
        *gambar("pilih-warga", 165,
                "Kotak pilihan setelah menekan E: sapaan, baris belajar per bab, dan "
                "pertanyaan harian. Baris yang belum boleh dipilih tetap terlihat alasannya."),
        *gambar("dialog", 165, "Dialog warga: siapa yang bicara, potret, dan hatinya."),
    ]

    # ------------------------------------- 7. memilih dan mengerjakan bab
    cerita += [
        P("BAGIAN 7 — MEMILIH BAB DAN MENGERJAKANNYA", "h1"),
        *langkah(1, "Baca babnya dulu di rak", [
            P("Di rak, sorot bab lalu tekan <b>E</b> untuk membaca. Halaman demi halaman "
              "dibuka dengan <b>E</b> juga; judulnya menyebut <i>bagian 1/3</i> kalau "
              "satu halaman panjang. Kamu tidak harus membaca dulu untuk mengerjakan "
              "ujian, tetapi soal-soalnya diambil dari isi bab itu.", "isi"),
        ]),
        *langkah(2, "Cari warga yang mengajar bab itu", [
            P("Nomor bab yang tertera di rak dan di kotak pilihan warga adalah penanda "
              "yang menyambungkan keduanya. Contoh: <i>Bab I</i> di kelas X diajarkan "
              "oleh Kang Dadang, jadi carilah Kang Dadang untuk mengerjakan Bab I.", "isi"),
        ]),
        *langkah(3, "Pilih baris belajarnya, lalu jawab soalnya", [
            butir([
                "Satu ujian berisi soal-soal dari bab itu, diambil acak dari bank soal.",
                "Pilih jawaban dengan <b>W/S</b>, lalu <b>E</b> untuk menjawab.",
                "Setelah dijawab, kamu langsung melihat benar atau salah beserta "
                "penjelasannya, lalu soal berikutnya.",
                "<b>Esc</b> kapan pun berarti berhenti — dan ujian yang ditinggalkan "
                "dihitung belum lulus.",
            ]),
        ]),
        *langkah(4, "Untuk papan usaha: hadapi papannya, tekan E", [
            P("Papan <b>Ragam Usaha</b> ada di desa. Pilih baris dengan <b>W/S</b>, beli "
              "dengan <b>E</b>, tutup dengan <b>Esc</b>. Baris yang belum bisa dibeli "
              "menyebut bab dan nama guru yang harus kamu temui lebih dulu.", "isi"),
        ]),
        *gambar("papan-usaha-siap", 150,
                "Papan Ragam Usaha saat syaratnya sudah terpenuhi: harga, bahan "
                "“Bahan 5/5”, dan keterangan boleh dibeli. Kolom kanan menyebut bab "
                "syaratnya; kalau belum lulus, yang ditulis adalah nama gurunya."),
        *langkah(9, "Santai saja, tidak ada batas waktu", [
            P("Satu ujian berisi 30 soal dan tidak dibatasi jam. Kerjakan sampai habis; "
              "kalau kehabisan waktu karena bel istirahat, tinggalkan saja — ujiannya "
              "tidak lulus dan bisa diulang.", "isi"),
        ]),
        *gambar("baca", 165, "Membaca satu bab di rak perpustakaan."),
        *gambar("ujian", 165,
                "Layar ujian: nomor soal, jumlah benar, batas lulus, dan pilihan jawaban."),
    ]

    # --------------------------------------------------- 8. aturan lulus
    cerita += [
        P("BAGIAN 8 — KAPAN DINYATAKAN LULUS", "h1"),
        P("<b>Lulus kalau benar 80% atau lebih.</b> Artinya dari 30 soal kamu harus benar "
          "sedikitnya 24. Salah 7 atau lebih berarti belum lulus.", "isi"),
        kotak_tabel([
            ["Benar", "Nilai", "Hasil"],
            ["30 dari 30", "100%", "Lulus"],
            ["27 dari 30", "90%", "Lulus"],
            ["24 dari 30", "80%", "Lulus (pas di batas)"],
            ["23 dari 30", "77%", "Belum lulus"],
            ["18 dari 30", "60%", "Belum lulus"],
        ], [32, 28, 92]),
        Spacer(1, 3 * mm),
        butir([
            "Jumlah soal bisa berbeda antar bab; yang dipakai selalu <b>persentase</b>, "
            "bukan jumlah soal.",
            "Yang <b>lulus</b> mendapat <b>+1 diamond</b> dan dikirim ke guru. Yang belum "
            "lulus <b>tidak dikirim</b>, jadi aman untuk dicoba lagi.",
            "Mengulang bab yang sudah lulus boleh, dan tetap mendapat +1 diamond.",
            "Bab dibuka berurutan. Kalau baris belajar belum bisa dipilih, keterangannya "
            "menyebut bab mana yang harus diluluskan lebih dulu.",
        ]),
        *gambar("ujian-lulus", 165, "Layar hasil: LULUS, nilai, dan hadiah diamond."),
        *gambar("ujian-gagal", 165,
                "Layar hasil: BELUM LULUS, nilai, batas 80%, dan pembahasan soal yang salah."),
    ]

    # ------------------------------- 8b. Ustadz Tasoro: remedial & pengayaan
    #
    # Ditulis TANPA tangkapan layar baru: gambar panduan berasal dari
    # tools/panduan/tangkap-layar.mjs yang butuh peramban, dan bagian ini harus
    # tetap bisa dibuat ulang di mesin tanpa peramban.
    cerita += [
        P("BAGIAN 8B — USTADZ TASORO: REMEDIAL DAN PENGAYAAN", "h1"),
        P("Ustadz Tasoro adalah guru mengaji keliling. Ia berpeci dan naik sepeda motor, "
          "dan <b>tidak tinggal di satu tempat</b>: ia memutari lembah lewat jalan desa, "
          "lalu berhenti 8–15 detik di <b>Balai Desa</b> dan <b>Perpustakaan</b>. Baru "
          "saat berhenti itu namanya menyala dan kamu bisa menekan E. Kalau ia sedang "
          "melaju, tunggu di salah satu dari dua tempat tadi — jangan dikejar.", "isi"),
        P("Yang ia berikan bukan ujian bab, melainkan dua jalur tambahan atas "
          "<b>lima bab pertama kelasmu</b>:", "isi"),
        kotak_tabel([
            ["Jalur", "Isi", "Untuk siapa"],
            ["Remedial", "50 soal (10 per bab, 5 bab)", "Mengulang pelajaran yang belum dikuasai"],
            ["Pengayaan", "50 soal (10 per bab, 5 bab)", "Soal nalar: membandingkan, menilai, menyimpulkan"],
        ], [26, 56, 70]),
        Spacer(1, 3 * mm),
        butir([
            "Tiap kelas (X, XI, XII) punya bank soalnya sendiri, 50 soal per jalur.",
            "Soalnya <b>diundi</b> dari bank itu setiap kali, jadi mengulang tidak "
            "menghafal urutan.",
            "Batas lulusnya sama: <b>80%</b> — 40 benar dari 50.",
            "Remedial boleh ditempuh kapan saja, <b>tanpa syarat sudah lulus bab apa pun</b>. "
            "Justru untuk murid yang belum lulus.",
        ]),
        P("Yang perlu kamu tahu sebelum menempuhnya — ini janji permainannya:", "h2"),
        butir([
            "Hasil remedial dan pengayaan <b>tidak menulis “lulus”</b> untuk bab mana pun, "
            "jadi tidak membuka alat dan tidak membuka peningkatan di papan Ragam Usaha.",
            "Keduanya <b>tidak masuk nilai sekolah</b>: angkanya tidak pernah ditulis di tab "
            "<b>Nilai</b> dan tidak mengubah nilai bab mana pun.",
            "Hanya <b>pengayaan</b> yang lulus yang memberi <b>+1 diamond</b>. Remedial tidak, "
            "karena remedial adalah latihan ulang, bukan prestasi baru.",
            "Layar hasilnya menyebut benar/salah <b>per bab</b>, supaya jelas bab mana yang "
            "harus kamu baca ulang. Itulah gunanya remedial.",
        ]),
        P("Hasilnya tetap sampai ke guru, tetapi di tempat yang berbeda dan dengan aturan "
          "yang berbeda — ini yang baru:", "h2"),
        kotak_tabel([
            ["Tempat", "Isi", "Kapan ditulis"],
            ["Tab Remedial", "Satu baris per percobaan remedial/pengayaan, "
             "lengkap dengan rincian per bab", "Setiap kali selesai, lulus maupun tidak"],
            ["Tab Rekap Nilai", "Satu baris per murid, nilai berjejer ke samping", "Otomatis setiap ada nilai baru"],
        ], [30, 74, 48]),
        Spacer(1, 3 * mm),
        P("Bedanya dengan ujian bab: tab <b>Nilai</b> hanya "
          "mencatat ujian bab yang <b>lulus</b> (80% ke atas), sedangkan tab "
          "<b>Remedial</b> mencatat <b>semua</b> hasil. "
          "Justru hasil yang belum lulus itu yang perlu diketahui gurumu sebelum remedial "
          "diulang. Di layar hasil kamu akan melihat terus terang apakah hasilnya sudah "
          "terkirim, masih ditahan karena jaringan, atau gagal.", "isi"),
        P("Ujian bab yang sesungguhnya tetap diberikan warga yang mengajar bab itu, seperti "
          "biasa. Tasoro tidak mengajar keahlian apa pun, jadi alat-alatmu tetap dibuka oleh "
          "warga lain.", "isi"),
    ]

    # ------------------------------------------ 9. kenapa alat tidak bekerja
    cerita += [
        P("BAGIAN 9 — KENAPA ALATKU TIDAK BEKERJA", "h1"),
        P("Ini yang paling sering membuat siswa bingung, dan jawabannya ada di aturan "
          "permainan: <b>alat baru berguna setelah bab pembukanya lulus.</b>", "isi"),
        kotak_tabel([
            ["Alat", "Guru", "Bab yang harus lulus dulu (kelas X)"],
            ["Mencangkul", "Kang Dadang", "Bab I — Al-Qur'an adalah Wahyu Allah"],
            ["Menyiram", "Dokter Ratna", "Bab II — Kebenaran Penurunan Al-Qur'an"],
            ["Menebang", "Bang Jaka", "Bab III — Kandungan Al-Qur'an"],
            ["Menambang", "Nenek Wulan", "Bab IV — Hadis dan Sunnah"],
            ["Memanen rumput", "Bu Sari", "Bab V — Unsur-unsur Hadis"],
            ["Memancing", "Bayu", "Bab VI — Hadis Shahih"],
        ], [30, 30, 92]),
        Spacer(1, 3 * mm),
        P("Untuk kelas XI dan XII aturannya sama, hanya babnya berbeda. Rak perpustakaan "
          "selalu menyebut pengajar bab yang kamu sorot, jadi kamu tidak perlu menghafal "
          "tabel di atas.", "isi"),
        *gambar("papan-usaha", 165,
                "Papan Ragam Usaha. Tiap baris menyebut bab dan nama guru yang harus "
                "ditemui sebelum bisa dibeli."),
    ]

    # --------------------------------------------------- 10. daftar bab
    cerita += [
        P("BAGIAN 10 — DAFTAR BAB DAN CARI KE SIAPA", "h1"),
        P("Tabel ini dibaca langsung dari data permainan, jadi sama persis dengan yang "
          "ada di rak. Kalau kamu mencari bab, cari <b>nomor bab</b> dan <b>nama warga</b>, "
          "bukan hanya judulnya.", "isi"),
    ]
    for kelas, judul_kelas in (("X", "Kelas X"), ("XI", "Kelas XI"), ("XII", "Kelas XII")):
        data = daftar_bab()
        baris = [r for r in data[1:] if r[0] == kelas]
        if not baris:
            continue
        cerita += [
            P(judul_kelas, "h2"),
            # Kepala tabel per kelas HANYA tiga kolom: "Kelas" sudah jadi judul
            # di atasnya. Sebelumnya kepala empat kolom dipakai untuk baris tiga
            # kolom, dan seluruh isinya bergeser satu kolom.
            kotak_tabel([["Bab", "Judul", "Cari ke"]] + [[r[1], r[2], r[3]] for r in baris],
                        [22, 100, 38]),
            Spacer(1, 3 * mm),
        ]
    cerita.append(PageBreak())

    # --------------------------------------- 11. melihat nilai
    cerita += [
        P("BAGIAN 11 — MELIHAT NILAI DAN MENGIRIM ULANG", "h1"),
        *langkah(7, "Buka Rekap Belajar", [
            P("Tekan <b>Esc</b> untuk membuka menu, pilih <b>Rekap Belajar</b>, lalu tekan "
              "<b>V</b>. Layar <b>Nilai &amp; Pengiriman</b> menampilkan tiap bab yang "
              "sudah dikerjakan beserta nilainya dan status kirimnya.", "isi"),
        ]),
        *langkah(8, "Membaca layar Nilai & Pengiriman", [
            P("Tiap baris berisi nomor bab, judulnya, nilai dalam persen, dan keterangan "
              "apakah nilainya sudah sampai ke guru. Yang belum lulus tidak punya nilai — "
              "memang tidak dikirim.", "isi"),
        ]),
        *langkah(9, "Kalau tertulis “belum terkirim”", [
            P("Itu berarti nilaimu baru tersimpan di HP, belum sampai ke guru. Pilih "
              "barisnya dengan <b>W/S</b> lalu tekan <b>E</b> untuk mengirim ulang. "
              "Lakukan saat ada sinyal.", "isi"),
        ]),
        *gambar("nilai", 165,
                "Layar Nilai & Pengiriman: daftar bab, nilai, dan status pengiriman ke guru."),
        P("Nilai yang belum lulus tidak muncul sebagai nilai — memang tidak dikirim. "
          "Kerjakan ulang babnya sampai lulus.", "kutip"),
    ]

    # ------------------------------------------ 12. hal kecil yang membantu
    cerita += [
        P("BAGIAN 12 — HAL KECIL YANG SERING MENOLONG", "h1"),
        butir([
            "<b>Tidur</b> di kasur untuk menyimpan dan memulai hari baru. Menu → "
            "<b>Simpan sekarang</b> juga bisa, tanpa menunggu malam.",
            "<b>Tenaga</b> (bar hijau) berkurang saat bekerja dan berlari. Habis = "
            "pingsan dan tidak bisa bekerja sampai besok.",
            "<b>Makan</b> dengan <b>C</b> memulihkan tenaga. Panen dan masak di dapur "
            "membuat makanan yang lebih mengenyangkan.",
            "<b>Papan Ragam Usaha</b> menjual peningkatan bangunan (uang + bahan + satu "
            "bab) dan kendaraan (diamond). Kendaraan pertama, Sepeda, harganya 10 "
            "diamond.",
            "<b>Diamond</b> hanya didapat dari ujian bab yang lulus (+1) dan mengulang "
            "bab yang sudah lulus (+1).",
            "<b>Alat yang levelnya sudah naik bisa ditingkatkan</b> dengan menekan "
            "<b>E</b> sambil memegangnya, atau <b>menghapusnya</b> dengan "
            "<b>Backspace</b>. Backspace memakai alat itu, jadi jangan ditekan kalau "
            "tidak bermaksud menghapus.",
            "Kalau game terasa “macet” setelah memakai mouse, klik sekali di layar "
            "permainan agar tombol papan ketik bekerja lagi.",
        ]),
        *gambar("menu", 150, "Menu: Pengaturan, Rekap Belajar, Simpan sekarang, Keluar."),
        Spacer(1, 4 * mm),
        P("Masih bingung? Sebutkan satu hal saja ke gurumu: <b>bab berapa</b> yang sedang "
          "kamu kerjakan dan <b>warga siapa</b> yang kamu temui. Dua keterangan itu cukup "
          "untuk menemukan masalahnya.", "kutip"),
    ]

    # ------------------------------------------ 13. untuk guru (lampiran)
    cerita.append(PageBreak())
    cerita += [
        P("LAMPIRAN UNTUK GURU — MEMERIKSA & MENGUJI SENDIRI", "h1"),
        P("Bagian ini bukan untuk siswa. Isinya cara memastikan tampilan yang dipakai "
          "siswa benar dan cara mencoba alur ujian tanpa bermain panjang.", "isi"),
        P("Buka game dengan tambahan <b>?debug=1</b> pada alamat (misalnya "
          "<i>game.html?debug=1</i>). Tanda ini tetap terbawa saat menekan “Main” dari "
          "halaman depan, dan hilang sendiri saat tab ditutup. Lalu tekan <b>F2</b> atau "
          "<b>/</b> dan ketik:", "isi"),
        kotak_tabel([
            ["Perintah", "Gunanya untuk menguji"],
            ["/gold 1000", "mencoba papan usaha tanpa mengumpulkan uang"],
            ["/diamond 1000", "membeli kendaraan"],
            ["/bahan 50", "bahan peningkatan bangunan"],
            ["/bab 1", "membuka satu bab berurutan"],
            ["/babsemua", "melihat layar setelah semua bab kelas lulus"],
            ["/tingkat 1", "mencoba efek peningkatan tanpa bahan"],
            ["/energi", "tenaga penuh"],
            ["/kendaraan", "memberi sepeda, motor, truk"],
            ["/jam 3 · /musim · /simpan", "memajukan waktu, ganti musim, simpan"],
        ], [40, 108]),
        Spacer(1, 3 * mm),
        P("Kenapa perintah ketik, bukan Ctrl+D/Ctrl+G: keduanya pintasan peramban "
          "(tandai halaman dan cari berikutnya), sehingga bisa “tidak jalan” di Chrome. "
          "Tekan <b>F1</b> untuk melihat daftar perintahnya di layar.", "kecil"),
        P("Baris perintahnya muncul di dasar layar. Cukup ketik <b>gold 1000</b> lalu "
          "<b>Enter</b> — garis miring di depan ditambahkan sendiri. <b>Esc</b> membatalkan, "
          "dan panah atas mengulang perintah sebelumnya.", "isi"),
        Spacer(1, 2 * mm),
        P("Perintah memeriksa data sebelum mengunggah ulang (dari folder repo):", "h2"),
        P("node tests/uji.mjs · node tools/periksa-data.mjs · "
          "node tools/uji-tata-letak.mjs · node tools/uji-sentuh.mjs", "kutip"),
        Spacer(1, 2 * mm),
        P("<b>Asal gambar — supaya tidak salah sangka.</b> Semua tangkapan layar "
          "dibuat dengan memanggil kode UI permainan yang sebenarnya dan menempelkan "
          "sprite asli dari assets/manifest.json: <i>node tools/panduan/tangkap-layar.mjs</i> "
          "lalu <i>python tools/panduan/buat-panduan.py</i>. Bedanya dengan layar asli: "
          "hurufnya diganti DejaVu (font VT323 hanya ada di peramban) dan huruf Arab "
          "pada halaman kitab disusun ulang oleh pustaka bidi, sehingga bentuknya tidak "
          "persis sama dengan di peramban. Tata letak, ukuran, dan posisinya nyata; "
          "bentuk hurufnya tidak. Kalau panel di src/ui/ berubah, jalankan ulang "
          "keduanya supaya panduan tidak menampilkan layar lama.", "kecil"),
    ]

    doc.build(cerita, onFirstPage=kaki, onLaterPages=kaki)
    print(f"PDF ditulis: {KELUAR}")


if __name__ == "__main__":
    buat()
