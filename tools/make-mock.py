"""สร้างระบบจำลองทั้งระบบไว้ทดสอบก่อนขึ้น Firebase จริง

    python tools/fetch-sample-photos.py      # ครั้งแรก: ดึงรูปอาหารทดสอบ
    python tools/make-mock.py
    cd mock && python -m http.server 8000
    # เปิด http://localhost:8000/

สร้างโฟลเดอร์ mock/ จาก public/ โดย:
  - คัดลอกหน้าเว็บและ asset ทั้งหมดมาแบบไม่แก้อะไร
  - แทรก importmap ให้ URL ของ Firebase SDK ชี้ไปที่ mock แทน gstatic
  - เขียน mock SDK ที่เก็บข้อมูลใน localStorage (realtime ข้ามแท็บได้จริง)
  - seed เมนู 20 รายการพร้อมรูป, โต๊ะ 8 โต๊ะ, บัญชี manager/staff

public/ ไม่ถูกแก้แม้แต่ไบต์เดียว — mock/ อยู่ใน .gitignore
ข้อจำกัด: ไม่ได้บังคับ firestore.rules (ต้องใช้ emulator ตัวจริงถึงจะทดสอบ rules ได้)
"""
import json, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public")
DST = os.path.join(ROOT, "mock")
PHOTOS = os.path.join(ROOT, "tools", "sample-photos")

SDK = "https://www.gstatic.com/firebasejs/11.0.0"
IMPORTMAP = """<script type="importmap">
{"imports":{
 "%(sdk)s/firebase-app.js":"/_sdk/app.js",
 "%(sdk)s/firebase-auth.js":"/_sdk/auth.js",
 "%(sdk)s/firebase-firestore.js":"/_sdk/firestore.js"
}}
</script>
""" % {"sdk": SDK}

MENU_TH = [
    ("แนะนำ", "มัสมั่นเนื้อ", 140, "အမဲသား မတ်စမန်ဟင်း"), ("แนะนำ", "ผัดไทยกุ้งสด", 90, "ပတ်ထိုင်း ပုစွန်ကြော်"),
    ("แนะนำ", "พะแนงไก่", 95, "ကြက်သား ပနန်ဟင်း"), ("แนะนำ", "ต้มข่าไก่", 75, "ကြက်သား တုမ်ခါ"),
    ("แนะนำ", "แกงเขียวหวานไก่", 85, "ကြက်သား အစိမ်းရောင်ဟင်း"), ("แนะนำ", "แกงคั่วกุ้ง", 130, "ပုစွန် ခူဟင်း"),
    ("ข้าว", "ข้าวกะเพราไก่ไข่ดาว", 65, "ကြက်သားကပေါ့ကြော် ထမင်း ကြက်ဥကြော်"), ("ข้าว", "ข้าวผัดกุ้ง", 80, "ပုစွန် ထမင်းကြော်"),
    ("ข้าว", "ข้าวผัดพริกแกงเนื้อ", 85, "အမဲသား ဟင်းခတ်မှုန့်ကြော် ထမင်း"), ("ข้าว", "ข้าวแกงกะหรี่หมู", 75, "ဝက်သား ကုလားဟင်း ထမင်း"),
    ("เส้น", "ผัดขี้เมาเส้นใหญ่", 75, "ခေါက်ဆွဲပြား မူးယစ်ကြော်"), ("เส้น", "ผัดซีอิ๊วหมู", 65, "ဝက်သား ပဲငံပြာရည်ကြော်"),
    ("เส้น", "ก๋วยเตี๋ยวต้มยำกุ้ง", 80, "ပုစွန် တုမ်ယမ် ခေါက်ဆွဲ"), ("เส้น", "ข้าวซอยไก่", 80, "ကြက်သား ခေါက်ဆွဲ (ခေါဆွယ်)"),
    ("เส้น", "ก๋วยเตี๋ยวเนื้อตุ๋นตะไคร้", 90, "အမဲသားနွေး စပါးလင် ခေါက်ဆွဲ"),
    ("ทานเล่น", "ปีกไก่ทอดน้ำปลา", 90, "ကြက်တောင်ပံကြော် ငါးငံပြာရည်"), ("ทานเล่น", "ทอดมันไก่", 70, "ကြက်သား ငါးဖယ်ကြော်"),
    ("ทานเล่น", "กุ้งผัดพริกไทยดำ", 120, "ပုစွန် ငရုတ်ကောင်းနက်ကြော်"), ("ทานเล่น", "ไก่ย่างแกงแดง", 85, "ကြက်ကင် အနီရောင်ဟင်း"),
    ("เครื่องดื่ม", "ชาเย็น", 35, "ထိုင်း လက်ဖက်ရည်အေး"),
]


def build():
    if not os.path.isdir(PHOTOS):
        raise SystemExit("ยังไม่มีรูปทดสอบ — รัน  python tools/fetch-sample-photos.py  ก่อน")

    if os.path.isdir(DST):
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)

    # รูปอาหาร
    photo_dir = os.path.join(DST, "photos")
    os.makedirs(photo_dir, exist_ok=True)
    files = sorted(f for f in os.listdir(PHOTOS) if f.endswith(".jpg"))[:20]
    for f in files:
        shutil.copy(os.path.join(PHOTOS, f), os.path.join(photo_dir, f))

    seed = [{"photo": files[i % len(files)], "cat": c, "name": n, "price": p}
            for i, (c, n, p, _my) in enumerate(MENU_TH)]
    os.makedirs(os.path.join(DST, "_sdk"), exist_ok=True)
    with open(os.path.join(DST, "_sdk", "seed.json"), "w", encoding="utf-8") as fh:
        json.dump(seed, fh, ensure_ascii=False, indent=1)

    # mock SDK
    for name, body in SDK_FILES.items():
        with open(os.path.join(DST, "_sdk", name), "w", encoding="utf-8") as fh:
            fh.write(body)

    # แทรก importmap + แถบบอกว่าเป็นโหมดจำลอง ลงทุกหน้า html
    n = 0
    for dirpath, _, filenames in os.walk(DST):
        for fn in filenames:
            if not fn.endswith(".html"):
                continue
            path = os.path.join(dirpath, fn)
            html = open(path, encoding="utf-8").read()
            html = html.replace("<head>", "<head>\n" + IMPORTMAP, 1)
            html = html.replace("</body>", '<script src="/_sdk/banner.js"></script>\n</body>', 1)
            open(path, "w", encoding="utf-8", newline="").write(html)
            n += 1

    with open(os.path.join(DST, "index.html"), "w", encoding="utf-8", newline="") as fh:
        fh.write(HOME)

    print(f"สร้าง mock/ เสร็จ — {n} หน้า, เมนู {len(seed)} รายการ, รูป {len(files)} ใบ")
    print("รัน: cd mock && python -m http.server 8000   แล้วเปิด http://localhost:8000/")


# ============================================================ mock SDK
APP_JS = """// mock ของ firebase-app.js
export function initializeApp(cfg) { return { name: "[MOCK]", options: cfg }; }
"""

AUTH_JS = """// mock ของ firebase-auth.js — บัญชีอยู่ใน localStorage
const KEY = "mock-auth-user";
const USERS = {
  "manager@demo.local": { uid: "u_manager", pw: "123456" },
  "staff@demo.local":   { uid: "u_staff",   pw: "123456" },
};
const listeners = new Set();
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const emit = () => { const u = read(); listeners.forEach(fn => fn(u)); };

export function getAuth() { return { get currentUser() { return read(); } }; }
export const browserLocalPersistence = "local";
export async function setPersistence() {}
export function connectAuthEmulator() {}

export async function signInWithEmailAndPassword(_auth, email, pw) {
  const rec = USERS[String(email).trim().toLowerCase()];
  if (!rec || rec.pw !== pw) {
    const e = new Error("อีเมลหรือรหัสผ่านไม่ถูกต้อง"); e.code = "auth/invalid-credential"; throw e;
  }
  const user = { uid: rec.uid, email: String(email).trim().toLowerCase() };
  localStorage.setItem(KEY, JSON.stringify(user));
  emit();
  return { user };
}
export async function signOut() { localStorage.removeItem(KEY); emit(); }
export function onAuthStateChanged(_auth, cb) {
  listeners.add(cb);
  setTimeout(() => cb(read()), 0);
  return () => listeners.delete(cb);
}
window.addEventListener("storage", e => { if (e.key === KEY) emit(); });
"""

FIRESTORE_JS = r"""// mock ของ firebase-firestore.js
// เก็บทุกอย่างใน localStorage คีย์เดียว แล้วใช้ event "storage" ทำ realtime ข้ามแท็บ
const KEY = "mock-firestore";
const BUMP = "mock-firestore-v";

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const save = db => {
  localStorage.setItem(KEY, JSON.stringify(db));
  localStorage.setItem(BUMP, String(Date.now()));   // ปลุกแท็บอื่น
  fire();
};

const subs = new Set();
const fire = () => subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
window.addEventListener("storage", e => { if (e.key === KEY || e.key === BUMP) fire(); });

const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
const clone = v => JSON.parse(JSON.stringify(v));

export class Timestamp {
  constructor(ms) { this.ms = ms; }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  static now() { return new Timestamp(Date.now()); }
  toDate() { return new Date(this.ms); }
  toJSON() { return { __ts: this.ms }; }
}
const reviveTs = v => (v && typeof v === "object" && "__ts" in v) ? new Timestamp(v.__ts) : v;
const reviveDoc = d => { const o = {}; for (const k in d) o[k] = reviveTs(d[k]); return o; };
const SERVER_TS = "__serverTimestamp__";
export function serverTimestamp() { return SERVER_TS; }
const resolveWrites = d => {
  const o = {};
  for (const k in d) o[k] = d[k] === SERVER_TS ? { __ts: Date.now() } : d[k];
  return o;
};

export function getFirestore() { return { mock: true }; }
export function connectFirestoreEmulator() {}

export function doc(dbOrRef, ...seg) {
  const base = typeof dbOrRef === "object" && dbOrRef.__path ? dbOrRef.__path : "";
  const path = [base, ...seg].filter(Boolean).join("/");
  return { __doc: true, __path: path, id: path.split("/").pop() };
}
export function collection(dbOrRef, ...seg) {
  const base = typeof dbOrRef === "object" && dbOrRef.__path ? dbOrRef.__path : "";
  const path = [base, ...seg].filter(Boolean).join("/");
  return { __col: true, __path: path, __filters: [], __order: null };
}
export function query(ref, ...ops) {
  const q = { ...ref, __filters: [...(ref.__filters || [])], __order: ref.__order };
  for (const op of ops) {
    if (op.type === "where") q.__filters.push(op);
    if (op.type === "order") q.__order = op;
  }
  return q;
}
export const where = (field, op, value) => ({ type: "where", field, op, value });
export const orderBy = (field, dir = "asc") => ({ type: "order", field, dir });

const cmp = (a, b) => {
  const av = a instanceof Timestamp ? a.ms : (a && a.__ts) ?? a;
  const bv = b instanceof Timestamp ? b.ms : (b && b.__ts) ?? b;
  return av < bv ? -1 : av > bv ? 1 : 0;
};
function match(data, f) {
  const v = data[f.field];
  const t = f.value instanceof Timestamp ? f.value : f.value;
  switch (f.op) {
    case "==": return cmp(v, t) === 0;
    case "!=": return cmp(v, t) !== 0;
    case ">":  return cmp(v, t) > 0;
    case ">=": return cmp(v, t) >= 0;
    case "<":  return cmp(v, t) < 0;
    case "<=": return cmp(v, t) <= 0;
    default:   return true;
  }
}
function readCollection(ref) {
  const db = load();
  const prefix = ref.__path + "/";
  let rows = Object.entries(db)
    .filter(([p]) => p.startsWith(prefix) && p.slice(prefix.length).indexOf("/") === -1)
    .map(([p, d]) => ({ id: p.split("/").pop(), data: reviveDoc(d) }));
  for (const f of (ref.__filters || [])) rows = rows.filter(r => match(r.data, f));
  if (ref.__order) {
    const { field, dir } = ref.__order;
    rows.sort((a, b) => cmp(a.data[field], b.data[field]) * (dir === "desc" ? -1 : 1));
  } else {
    rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  return rows;
}
// DocumentSnapshot ของ Firestore จริง exists เป็น "method" ไม่ใช่ property
const snapOf = row => ({
  id: row.id, exists: () => true, data: () => row.data,
  metadata: { fromCache: false, hasPendingWrites: false },
});

export async function getDoc(ref) {
  const db = load();
  const d = db[ref.__path];
  return d
    ? snapOf({ id: ref.id, data: reviveDoc(d) })
    : { id: ref.id, exists: () => false, data: () => undefined, metadata: {} };
}
export async function getDocs(ref) {
  const rows = readCollection(ref);
  return { docs: rows.map(snapOf), size: rows.length, empty: !rows.length, docChanges: () => [] };
}
export async function setDoc(ref, data, opts) {
  const db = load();
  db[ref.__path] = opts && opts.merge ? { ...(db[ref.__path] || {}), ...resolveWrites(data) } : resolveWrites(data);
  save(db);
}
export async function updateDoc(ref, data) {
  const db = load();
  if (!db[ref.__path]) throw Object.assign(new Error("ไม่พบเอกสาร"), { code: "not-found" });
  db[ref.__path] = { ...db[ref.__path], ...resolveWrites(data) };
  save(db);
}
export async function addDoc(ref, data) {
  const id = rid();
  const db = load();
  db[ref.__path + "/" + id] = resolveWrites(data);
  save(db);
  return doc({ __path: ref.__path }, id);
}
export async function deleteDoc(ref) { const db = load(); delete db[ref.__path]; save(db); }
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d, o) => ops.push(() => setDoc(r, d, o)),
    update: (r, d) => ops.push(() => updateDoc(r, d)),
    delete: r => ops.push(() => deleteDoc(r)),
    commit: async () => { for (const op of ops) await op(); },
  };
}
export function onSnapshot(ref, next, error) {
  const isDoc = !!ref.__doc;
  const push = async () => {
    try { next(isDoc ? await getDoc(ref) : await getDocs(ref)); }
    catch (e) { error && error(e); }
  };
  subs.add(push);
  push();
  return () => subs.delete(push);
}

/* ---------------- seed ครั้งแรก ---------------- */
const SEEDED = "mock-firestore-seeded";
async function seed() {
  if (localStorage.getItem(SEEDED)) return;
  localStorage.setItem(SEEDED, "1");
  const rows = await (await fetch("/_sdk/seed.json")).json();
  const db = load();

  db["settings/shop"] = { name: "ครัวบ้านสมทรง", palette: "" };
  db["settings/roles"] = { managers: ["u_manager"], staff: ["u_staff"] };

  for (let i = 1; i <= 8; i++) {
    db["tables/" + rid() + rid()] = { no: i, active: true, createdAt: new Date().toISOString() };
  }

  const shrink = async src => {
    const blob = await (await fetch(src)).blob();
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.62);
  };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    db["menu/" + rid()] = {
      name: r.name, price: r.price, cat: r.cat, sort: i * 10,
      emoji: "🍽️", img: await shrink("/photos/" + r.photo), soldout: false,
    };
  }
  save(db);
  console.log("[mock] seed เสร็จ:", rows.length, "เมนู");
}
await seed();
"""

BANNER_JS = """// แถบเตือนโหมดจำลอง + ปุ่มกรอกบัญชีทดสอบให้อัตโนมัติบนหน้าล็อกอิน
(function () {
  var ACCOUNTS = [
    { role: "ผู้จัดการ", email: "manager@demo.local", pw: "123456",
      note: "เข้าได้ทุกหน้า แก้เมนู ดูยอดรายเดือน" },
    { role: "พนักงานหน้าร้าน", email: "staff@demo.local", pw: "123456",
      note: "เห็นเฉพาะออเดอร์ + ยอดวันนี้" }
  ];

  function banner() {
    var b = document.createElement("div");
    b.textContent = "โหมดจำลอง — ข้อมูลอยู่ใน localStorage ของเบราว์เซอร์นี้ ไม่ได้ต่อ Firebase";
    b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#B4770B;color:#fff;" +
      "font:11px/1.9 system-ui,sans-serif;text-align:center;letter-spacing:.02em;pointer-events:none;opacity:.9";
    document.body.appendChild(b);
  }

  // หน้าล็อกอินเรนเดอร์ด้วย JS ทีหลัง เลยต้องรอมันโผล่ก่อน
  function watchLogin() {
    var tries = 0;
    var t = setInterval(function () {
      var form = document.getElementById("f");
      if (!form) { if (++tries > 60) clearInterval(t); return; }
      clearInterval(t);
      if (document.getElementById("mock-accounts")) return;

      var box = document.createElement("div");
      box.id = "mock-accounts";
      box.style.cssText = "margin-top:16px;border-top:1px dashed var(--line);padding-top:14px";
      box.innerHTML =
        '<div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:9px">' +
        'บัญชีทดสอบ (กดเพื่อกรอกให้)</div>' +
        ACCOUNTS.map(function (a, i) {
          return '<button type="button" data-fill="' + i + '" style="width:100%;text-align:left;' +
            'border:1px solid var(--line);border-radius:6px;background:var(--surface);' +
            'padding:9px 12px;margin-bottom:7px;line-height:1.55">' +
            '<b style="font-size:13.5px">' + a.role + '</b><br>' +
            '<span style="font-family:ui-monospace,monospace;font-size:12px;color:var(--accent-ink)">' +
            a.email + ' / ' + a.pw + '</span><br>' +
            '<span style="font-size:11.5px;color:var(--muted)">' + a.note + '</span></button>';
        }).join("");
      form.appendChild(box);

      box.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-fill]");
        if (!btn) return;
        var a = ACCOUNTS[+btn.dataset.fill];
        var em = document.getElementById("em"), pw = document.getElementById("pw");
        em.value = a.email; pw.value = a.pw;
        em.dispatchEvent(new Event("input", { bubbles: true }));
        pw.dispatchEvent(new Event("input", { bubbles: true }));
        form.querySelector('button[type="submit"]').focus();
      });
    }, 120);
  }

  window.addEventListener("DOMContentLoaded", function () { banner(); watchLogin(); });
})();
"""

HOME = """<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ระบบจำลอง — โต๊ะ QR</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/app.css">
<style>
 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}
 .grid a{display:block;text-decoration:none;color:inherit;background:var(--surface);border:1px solid var(--line);
   border-radius:8px;padding:18px 20px;box-shadow:var(--shadow)}
 .grid a:hover{border-color:var(--accent)}
 .grid b{display:block;font-family:"Bai Jamjuree",sans-serif;font-size:16px;margin-bottom:3px}
 .grid span{font-size:13.5px;color:var(--muted);line-height:1.6}
 .acc{font-family:"IBM Plex Mono",monospace;font-size:13px}
 .tk{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--muted);word-break:break-all}
</style></head>
<body>
<div class="page">
 <div class="phead"><div>
   <h1>ระบบจำลอง โต๊ะ QR</h1>
   <p class="hint">หน้าเว็บทุกหน้าคือไฟล์จริงจาก <code>public/</code> ไม่ได้แก้อะไร
     เปลี่ยนแค่ Firebase SDK เป็นตัวจำลองที่เก็บข้อมูลใน localStorage —
     <b>เปิดสองแท็บพร้อมกันแล้วสั่งอาหาร จะเห็นออเดอร์เด้งขึ้นจอหลังร้านจริง ๆ</b></p>
 </div></div>

 <h2 class="sec">บัญชีทดสอบ</h2>
 <div class="card">
  <table style="width:100%;border-collapse:collapse;font-size:14px">
   <tr><td style="padding:6px 0"><b>ผู้จัดการ</b></td>
       <td class="acc">manager@demo.local</td><td class="acc">123456</td>
       <td style="color:var(--muted);font-size:13px">เห็นทุกหน้า แก้เมนู ดูยอดรายเดือน</td></tr>
   <tr><td style="padding:6px 0"><b>พนักงานหน้าร้าน</b></td>
       <td class="acc">staff@demo.local</td><td class="acc">123456</td>
       <td style="color:var(--muted);font-size:13px">เห็นเฉพาะออเดอร์ + ยอดวันนี้</td></tr>
  </table>
 </div>

 <h2 class="sec">เปิดหน้าไหน</h2>
 <div class="grid">
  <a href="/admin/"><b>จอหลังร้าน</b><span>ล็อกอิน แล้วดูออเดอร์สด กดเสิร์ฟ แก้บิล</span></a>
  <a href="/admin/menu.html"><b>จัดการเมนู</b><span>เฉพาะผู้จัดการ — แก้ราคา อัปโหลดรูป ตั้งชื่อร้าน ธีมสี</span></a>
  <a href="/admin/report.html"><b>ยอดขาย</b><span>วันนี้ (ทุกคน) · รายเดือน (เฉพาะผู้จัดการ)</span></a>
  <a href="/admin/tables.html"><b>โต๊ะ &amp; QR</b><span>เฉพาะผู้จัดการ — เพิ่มโต๊ะ ปริ้น QR</span></a>
 </div>

 <h2 class="sec">หน้าลูกค้า (เหมือนสแกน QR)</h2>
 <div class="grid" id="tables"><span class="hint">กำลังโหลดโต๊ะ…</span></div>

 <h2 class="sec">รีเซ็ต</h2>
 <div class="card">
  <button class="btn ghost" id="reset">ล้างข้อมูลจำลองทั้งหมด แล้ว seed ใหม่</button>
  <p class="hint" style="margin:10px 0 0">ลบเมนู ออเดอร์ ยอดขาย และการล็อกอินทั้งหมดในเบราว์เซอร์นี้</p>
 </div>
</div>

<script type="module">
import "/_sdk/firestore.js";
const db = JSON.parse(localStorage.getItem("mock-firestore") || "{}");
const tables = Object.entries(db).filter(([p]) => p.startsWith("tables/"))
  .map(([p, d]) => ({ token: p.split("/")[1], no: d.no })).sort((a, b) => a.no - b.no);
document.getElementById("tables").innerHTML = tables.length
  ? tables.map(t => `<a href="/t/?t=${t.token}"><b>โต๊ะ ${t.no}</b>
      <span>เปิดหน้าเมนูของโต๊ะนี้</span><span class="tk">${t.token}</span></a>`).join("")
  : `<span class="hint">ยังไม่มีโต๊ะ — รีเฟรชอีกครั้งหลัง seed เสร็จ</span>`;
document.getElementById("reset").onclick = () => {
  ["mock-firestore", "mock-firestore-v", "mock-firestore-seeded", "mock-auth-user",
   "qr-order-settings"].forEach(k => localStorage.removeItem(k));
  location.reload();
};
</script>
<script src="/_sdk/banner.js"></script>
</body></html>
"""

SDK_FILES = {"app.js": APP_JS, "auth.js": AUTH_JS, "firestore.js": FIRESTORE_JS, "banner.js": BANNER_JS}

if __name__ == "__main__":
    build()
