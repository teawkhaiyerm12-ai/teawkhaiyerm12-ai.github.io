"""เทียบรูปเมนูบนมือถือ: ของเดิม (320px q0.62 JPEG) vs ใหม่ (240px q0.55 WebP)

    python tools/make-mobile-compare.py    -> dist/mobile-compare.png

วาดแถวเมนูแบบเดียวกับหน้าลูกค้าที่ scale 2x (= จอ retina)
รูปถูก encode จริงด้วย Pillow แล้ว decode กลับมาย่อเท่าที่แสดงจริง (82px CSS)
"""
import io, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(ROOT, "tools", "sample-photos")
OUT = os.path.join(ROOT, "dist", "mobile-compare.png")

S = 2                      # retina scale
THUMB = 82 * S             # หน้าลูกค้าแสดงรูปที่ 82 CSS px
COLW = 380 * S
PAD = 14 * S
GAP = 26 * S

DISHES = [("01.jpg", "ผัดขี้เมาเส้นใหญ่", 75), ("05.jpg", "ผัดไทยกุ้งสด", 90),
          ("10.jpg", "ข้าวกะเพราไก่ไข่ดาว", 65), ("18.jpg", "แกงเขียวหวานไก่", 85)]
SETS = [("ของเดิม", 320, 62, "JPEG"), ("บีบใหม่", 240, 55, "WEBP")]

BG, CARD, LINE, INK, MUTED, ACCENT = "#12100D", "#1C1812", "#332A20", "#F2E9DE", "#9C8C7B", "#FB923C"
F = lambda p, b=False: ImageFont.truetype(
    r"C:\Windows\Fonts\leelaw" + ("db" if b else "ui") + ".ttf", p * S)


def encode(path, px, q, fmt):
    im = Image.open(path).convert("RGB")
    s = min(1, px / max(im.size))
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, fmt, quality=q, **({"optimize": True} if fmt == "JPEG" else {}))
    raw = b.getvalue()
    return raw, Image.open(io.BytesIO(raw)).convert("RGB")


def square(im, n):
    """crop กลางเป็นสี่เหลี่ยมจัตุรัสแล้วย่อ — เหมือน object-fit:cover ในหน้าลูกค้า"""
    k = min(im.size)
    im = im.crop(((im.width - k) // 2, (im.height - k) // 2,
                  (im.width + k) // 2, (im.height + k) // 2))
    return im.resize((n, n), Image.LANCZOS)


def build():
    rows = []
    for fn, name, price in DISHES:
        cells = []
        for _, px, q, fmt in SETS:
            raw, im = encode(os.path.join(PHOTOS, fn), px, q, fmt)
            cells.append((square(im, THUMB), len(raw)))
        rows.append((name, price, cells))

    head = 62 * S
    rowh = THUMB + PAD * 2 + 1
    W = COLW * 2 + GAP + PAD * 2
    H = head + rowh * len(rows) + 54 * S
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    for i, (label, px, q, fmt) in enumerate(SETS):
        x = PAD + i * (COLW + GAP)
        avg = sum(r[2][i][1] for r in rows) / len(rows)
        d.text((x, 8 * S), label, font=F(17, True), fill=ACCENT if i else INK)
        d.text((x, 32 * S), f"{px}px  q0.{q}  {fmt.lower()}  ~{avg/1024:.1f} KB/รูป",
               font=F(12), fill=MUTED)

    y = head
    for name, price, cells in rows:
        for i, (thumb, nbytes) in enumerate(cells):
            x = PAD + i * (COLW + GAP)
            d.rounded_rectangle([x, y, x + COLW, y + rowh - 1], 10 * S, fill=CARD, outline=LINE)
            img.paste(thumb, (x + PAD, y + PAD))
            tx = x + PAD + THUMB + 12 * S
            d.text((tx, y + PAD + 22 * S), name, font=F(15, True), fill=INK)
            d.text((tx, y + PAD + 48 * S), f"{price} บาท", font=F(13, True), fill=ACCENT)
            d.text((tx, y + PAD + 78 * S), f"{nbytes/1024:.1f} KB", font=F(11), fill=MUTED)
            d.ellipse([x + COLW - 40 * S, y + rowh // 2 - 15 * S,
                       x + COLW - 10 * S, y + rowh // 2 + 15 * S], fill=ACCENT)
            d.text((x + COLW - 29 * S, y + rowh // 2 - 13 * S), "+", font=F(16, True), fill="#1C1006")
        y += rowh

    d.text((PAD, y + 14 * S),
           "ภาพนี้ขยาย 2 เท่าจากที่เห็นบนมือถือจริง (รูปในเมนูกว้าง 82px) — "
           "ถ้าเทียบที่ขนาดจริงจะต่างกันน้อยกว่านี้อีก",
           font=F(11), fill=MUTED)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT)
    print("wrote", OUT, img.size)


ZOOM_OUT = os.path.join(ROOT, "dist", "mobile-compare-zoom.png")


def build_zoom(fn="10.jpg", name="ข้าวกะเพราไก่ไข่ดาว", n=520):
    """ขยายเต็มความละเอียดที่เก็บจริง — จุดที่ต่างกันจะเห็นตรงนี้ ไม่ใช่ในเมนู"""
    cells = []
    for label, px, q, fmt in SETS:
        raw, im = encode(os.path.join(PHOTOS, fn), px, q, fmt)
        cells.append((label, px, q, fmt, square(im, n), len(raw)))

    head, foot = 82, 46
    W = n * 2 + 3 * 18
    img = Image.new("RGB", (W, head + n + foot), BG)
    d = ImageDraw.Draw(img)
    d.text((18, 12), name + " — ขยายเต็มความละเอียดที่ระบบเก็บไว้", font=F(15, True), fill=INK)
    for i, (label, px, q, fmt, im, nbytes) in enumerate(cells):
        x = 18 + i * (n + 18)
        d.text((x, 40), f"{label}  {px}px q0.{q} {fmt.lower()}  {nbytes/1024:.1f} KB",
               font=F(12), fill=ACCENT if i else MUTED)
        img.paste(im, (x, head))
    d.text((18, head + n + 14),
           "ลูกค้าเห็นรูปนี้กว้าง 82px ในเมนู — ขนาดนี้คือซูมประมาณ 6 เท่า",
           font=F(11), fill=MUTED)
    img.save(ZOOM_OUT)
    print("wrote", ZOOM_OUT, img.size)


if __name__ == "__main__":
    build()
    build_zoom()
