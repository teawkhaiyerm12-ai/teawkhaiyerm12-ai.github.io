"""สร้างหน้าเทียบความคมชัดของรูปเมนู เปิดบนมือถือจริงได้

    python tools/make-quality-compare.py     # ได้ dist/quality-compare.html

ฝังรูปต้นฉบับไว้ในไฟล์ แล้วให้หน้าเว็บบีบรูปเองด้วย canvas
= encoder ตัวเดียวกับที่ระบบใช้จริง ตัวเลข KB ที่เห็นจึงเป็นของจริง ไม่ใช่ประมาณ
"""
import base64, io, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(ROOT, "tools", "sample-photos")
OUT = os.path.join(ROOT, "dist", "quality-compare.html")

# เลือก 6 จานที่ลักษณะภาพต่างกัน: น้ำ/แห้ง/ผัด/ทอด/ของหวาน
DISHES = [
    ("01.jpg", "ผัดขี้เมาเส้นใหญ่", 75),
    ("03.jpg", "มัสมั่นเนื้อ", 140),
    ("05.jpg", "ผัดไทยกุ้งสด", 90),
    ("10.jpg", "ข้าวกะเพราไก่ไข่ดาว", 65),
    ("16.jpg", "ข้าวผัดกุ้ง", 80),
    ("18.jpg", "แกงเขียวหวานไก่", 85),
]


def build():
    if not os.path.isdir(PHOTOS):
        sys.exit("ยังไม่มีรูปทดสอบ — รัน  python tools/fetch-sample-photos.py  ก่อน")

    def embed(fn):
        raw = open(os.path.join(PHOTOS, fn), "rb").read()
        return len(raw), "data:image/jpeg;base64," + base64.b64encode(raw).decode()

    # 6 จานที่เอาไปโชว์ในกรอบมือถือ
    src, total = [], 0
    for fn, name, price in DISHES:
        if not os.path.exists(os.path.join(PHOTOS, fn)):
            sys.exit("ไม่พบรูป " + fn)
        n, uri = embed(fn)
        total += n
        src.append({"name": name, "price": price, "uri": uri})

    # ทั้ง 20 ใบ ใช้คำนวณขนาดเฉลี่ยจริง — 6 ใบไม่พอ ค่าเฉลี่ยจะเพี้ยน
    allfiles = sorted(f for f in os.listdir(PHOTOS) if f.endswith(".jpg"))[:20]
    allsrc = []
    for fn in allfiles:
        n, uri = embed(fn)
        total += n
        allsrc.append(uri)

    html = open(os.path.join(ROOT, "tools", "quality-compare-shell.html"), encoding="utf-8").read()
    html = (html
            .replace("__PHOTOS__", json.dumps(src, ensure_ascii=False, separators=(",", ":")))
            .replace("__ALL__", json.dumps(allsrc, separators=(",", ":"))))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write(html)
    print("รูปต้นฉบับ %d ใบ รวม %.1f MB" % (len(src), total / 1024 / 1024))
    print("เขียน %s  (%.2f MB)" % (OUT, os.path.getsize(OUT) / 1024 / 1024))


if __name__ == "__main__":
    build()
