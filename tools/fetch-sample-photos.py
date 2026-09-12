"""ดาวน์โหลดรูปอาหารไทยจริง 20 รูปไว้ทดสอบการบีบรูปและวัดโควตา

    python tools/fetch-sample-photos.py

รูปมาจาก TheMealDB (ฟรีสำหรับการพัฒนา/ทดสอบ) เก็บไว้ที่ tools/sample-photos/
ไม่ถูก commit เข้า repo (อยู่ใน .gitignore) — ร้านจริงต้องใช้รูปของร้านเอง
"""
import json, os, ssl, urllib.request

ssl._create_default_https_context = ssl._create_unverified_context
OUT = os.path.join(os.path.dirname(__file__), "sample-photos")
AREAS = ["Thai", "Vietnamese", "Chinese", "Japanese", "Malaysian"]
WANT = 20


def api(url):
    return json.loads(urllib.request.urlopen(url, timeout=25).read().decode())


def main():
    seen, pick = set(), []
    for area in AREAS:
        if len(pick) >= WANT:
            break
        data = api(f"https://www.themealdb.com/api/json/v1/1/filter.php?a={area}")
        for m in (data.get("meals") or []):
            if m["strMeal"] in seen:
                continue
            seen.add(m["strMeal"])
            pick.append((m["strMeal"], m["strMealThumb"]))
            if len(pick) >= WANT:
                break

    os.makedirs(OUT, exist_ok=True)
    index, total = [], 0
    for i, (name, url) in enumerate(pick, 1):
        path = os.path.join(OUT, f"{i:02d}.jpg")
        urllib.request.urlretrieve(url, path)
        size = os.path.getsize(path)
        total += size
        index.append({"file": f"{i:02d}.jpg", "name": name, "bytes": size})
        print(f"{i:02d}  {size/1024:7.0f} KB  {name}")

    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

    print(f"\nรวม {len(index)} รูป  {total/1024/1024:.1f} MB  เฉลี่ย {total/len(index)/1024:.0f} KB/รูป")
    print("เปิด tools/menu-preview.html แล้วกดปุ่ม 'โหลดรูปอาหารไทยจริง 20 รูป'")


if __name__ == "__main__":
    main()
