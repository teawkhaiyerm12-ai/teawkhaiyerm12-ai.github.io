"""รวมทั้งระบบเป็นไฟล์ HTML ไฟล์เดียว สำหรับเปิดดู/ส่งต่อโดยไม่ต้องรัน server

    python tools/fetch-sample-photos.py    # ครั้งแรก
    python tools/make-artifact.py          # ได้ dist/qr-order-demo.html

หลักการ:
  - โมดูลจริงจาก public/assets/ ถูกตัด import/export ออกแล้วรวมเป็น inline script
    (ห้ามใช้ ES module จาก data:/blob: URL — CSP ของ artifact บล็อกทิ้งทั้งหมด)
  - Firebase SDK ถูกแทนด้วยตัวจำลองที่เก็บข้อมูลใน localStorage
  - แต่ละหน้าเปิดใน <iframe srcdoc> เพื่อให้โค้ดรันใหม่ทุกครั้งที่สลับหน้า
    และเพื่อจำลองความกว้างจอจริง (มือถือ/แท็บเล็ต) ให้ media query ทำงาน
  - รูปอาหารย่อด้วยค่าเดียวกับระบบจริงแล้วฝังเป็น data URI

public/ ไม่ถูกแก้ — การแก้ path/redirect ทั้งหมดเกิดตอน build เท่านั้น
"""
import base64, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "public", "assets")
PHOTOS = os.path.join(ROOT, "tools", "sample-photos")
SHELL = os.path.join(ROOT, "tools", "artifact-shell.html")
OUT = os.path.join(ROOT, "dist", "qr-order-demo.html")

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


def read(name):
    with open(os.path.join(ASSETS, name), encoding="utf-8") as f:
        return f.read()


def sub(text, pairs, label):
    """แทนที่แบบบังคับให้เจอ — โค้ดต้นทางเปลี่ยนแล้ว build ต้องพัง ดีกว่าเงียบแล้วได้ของเสีย"""
    for a, b in pairs:
        if a not in text:
            sys.exit("[%s] หาไม่เจอ: %s" % (label, a[:70]))
        text = text.replace(a, b)
    return text


# ---------------------------------------------------------------- Firebase จำลอง
MOCK_APP = 'function initializeApp(c){return{name:"[MOCK]",options:c}}'

MOCK_AUTH = r"""
var AKEY = "mock-auth-user";
var USERS = { "admin12@qrmenu.local": { uid: "u_manager", pw: "admin12" },
              "user12@qrmenu.local":  { uid: "u_staff",   pw: "user12" } };
var ALIST = new Set();
function authRead(){ try { return JSON.parse(localStorage.getItem(AKEY) || "null"); } catch (e) { return null; } }
function authEmit(){ var u = authRead(); ALIST.forEach(function (f) { f(u); }); }
function getAuth(){ return { get currentUser(){ return authRead(); } }; }
var browserLocalPersistence = "local";
async function setPersistence(){}
function connectAuthEmulator(){}
async function signInWithEmailAndPassword(_a, email, pw){
  var r = USERS[String(email).trim().toLowerCase()];
  if (!r || r.pw !== pw) { var e = new Error("อีเมลหรือรหัสผ่านไม่ถูกต้อง"); e.code = "auth/invalid-credential"; throw e; }
  var u = { uid: r.uid, email: String(email).trim().toLowerCase() };
  localStorage.setItem(AKEY, JSON.stringify(u)); authEmit(); return { user: u };
}
async function signOut(){ localStorage.removeItem(AKEY); authEmit(); }
function onAuthStateChanged(_a, cb){ ALIST.add(cb); setTimeout(function(){ cb(authRead()); }, 0);
  return function(){ ALIST.delete(cb); }; }
addEventListener("storage", function (e) { if (e.key === AKEY) authEmit(); });
"""

MOCK_FS = r"""
var FKEY = "mock-firestore", BUMP = "mock-firestore-v";
function fsLoad(){ try { return JSON.parse(localStorage.getItem(FKEY) || "{}"); } catch (e) { return {}; } }
function fsSave(db){ localStorage.setItem(FKEY, JSON.stringify(db));
  localStorage.setItem(BUMP, String(Date.now())); fsFire(); }
var fsSubs = new Set();
function fsFire(){ fsSubs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
addEventListener("storage", function (e) { if (e.key === FKEY || e.key === BUMP) fsFire(); });
function fsRid(){ return Math.random().toString(36).slice(2,12) + Math.random().toString(36).slice(2,12); }

class Timestamp {
  constructor(ms){ this.ms = ms; }
  static fromDate(d){ return new Timestamp(d.getTime()); }
  static now(){ return new Timestamp(Date.now()); }
  toDate(){ return new Date(this.ms); }
  toJSON(){ return { __ts: this.ms }; }
}
function fsRev(v){ return (v && typeof v === "object" && "__ts" in v) ? new Timestamp(v.__ts) : v; }
function fsRevDoc(d){ var o = {}; for (var k in d) o[k] = fsRev(d[k]); return o; }
var SERVER_TS = "__serverTimestamp__";
function serverTimestamp(){ return SERVER_TS; }
function fsResolve(d){ var o = {}; for (var k in d) o[k] = d[k] === SERVER_TS ? { __ts: Date.now() } : d[k]; return o; }

function getFirestore(){ return { mock: true }; }
function connectFirestoreEmulator(){}
function doc(b){ var seg = [].slice.call(arguments, 1);
  var p = [(b && b.__path) || ""].concat(seg).filter(Boolean).join("/");
  return { __doc: true, __path: p, id: p.split("/").pop() }; }
function collection(b){ var seg = [].slice.call(arguments, 1);
  var p = [(b && b.__path) || ""].concat(seg).filter(Boolean).join("/");
  return { __col: true, __path: p, __filters: [], __order: null }; }
function query(r){ var ops = [].slice.call(arguments, 1);
  var q = Object.assign({}, r, { __filters: (r.__filters || []).slice(), __order: r.__order });
  ops.forEach(function (o) { if (o.type === "where") q.__filters.push(o); if (o.type === "order") q.__order = o; });
  return q; }
function where(field, op, value){ return { type: "where", field: field, op: op, value: value }; }
function orderBy(field, dir){ return { type: "order", field: field, dir: dir || "asc" }; }

function fsNum(v){ return v instanceof Timestamp ? v.ms : (v && v.__ts != null ? v.__ts : v); }
function fsCmp(a, b){ var x = fsNum(a), y = fsNum(b); return x < y ? -1 : x > y ? 1 : 0; }
function fsMatch(d, f){ var v = d[f.field];
  switch (f.op) {
    case "==": return fsCmp(v, f.value) === 0;
    case "!=": return fsCmp(v, f.value) !== 0;
    case ">":  return fsCmp(v, f.value) > 0;
    case ">=": return fsCmp(v, f.value) >= 0;
    case "<":  return fsCmp(v, f.value) < 0;
    case "<=": return fsCmp(v, f.value) <= 0;
    default:   return true;
  } }
function fsReadCol(ref){
  var db = fsLoad(), pre = ref.__path + "/";
  var rows = Object.keys(db)
    .filter(function (p) { return p.indexOf(pre) === 0 && p.slice(pre.length).indexOf("/") === -1; })
    .map(function (p) { return { id: p.split("/").pop(), data: fsRevDoc(db[p]) }; });
  (ref.__filters || []).forEach(function (f) {
    rows = rows.filter(function (r) { return fsMatch(r.data, f); }); });
  if (ref.__order) {
    var f2 = ref.__order;
    rows.sort(function (a, b) { return fsCmp(a.data[f2.field], b.data[f2.field]) * (f2.dir === "desc" ? -1 : 1); });
  } else {
    rows.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  }
  return rows;
}
function fsSnap(r){ return { id: r.id, exists: function(){ return true; }, data: function(){ return r.data; },
  metadata: { fromCache: false, hasPendingWrites: false } }; }
async function getDoc(ref){ var db = fsLoad(), d = db[ref.__path];
  return d ? fsSnap({ id: ref.id, data: fsRevDoc(d) })
           : { id: ref.id, exists: function(){ return false; }, data: function(){}, metadata: {} }; }
async function getDocs(ref){ var rows = fsReadCol(ref);
  return { docs: rows.map(fsSnap), size: rows.length, empty: !rows.length, docChanges: function(){ return []; } }; }
async function setDoc(ref, data, o){ var db = fsLoad();
  db[ref.__path] = (o && o.merge) ? Object.assign({}, db[ref.__path] || {}, fsResolve(data)) : fsResolve(data);
  fsSave(db); }
async function updateDoc(ref, data){ var db = fsLoad();
  if (!db[ref.__path]) { var e = new Error("ไม่พบเอกสาร"); e.code = "not-found"; throw e; }
  db[ref.__path] = Object.assign({}, db[ref.__path], fsResolve(data)); fsSave(db); }
async function addDoc(ref, data){ var id = fsRid(), db = fsLoad();
  db[ref.__path + "/" + id] = fsResolve(data); fsSave(db); return doc({ __path: ref.__path }, id); }
async function deleteDoc(ref){ var db = fsLoad(); delete db[ref.__path]; fsSave(db); }
function writeBatch(){ var ops = []; return {
  set: function (r, d, o) { ops.push(function () { return setDoc(r, d, o); }); },
  update: function (r, d) { ops.push(function () { return updateDoc(r, d); }); },
  delete: function (r) { ops.push(function () { return deleteDoc(r); }); },
  commit: async function () { for (var i = 0; i < ops.length; i++) await ops[i](); } }; }
function onSnapshot(ref, next, err){
  var isDoc = !!ref.__doc;
  var push = async function () {
    try { next(isDoc ? await getDoc(ref) : await getDocs(ref)); } catch (e) { if (err) err(e); } };
  fsSubs.add(push); push();
  return function () { fsSubs.delete(push); };
}
"""

ESM_IMPORT = re.compile(
    r'^[ \t]*import\s*(?:\{[\s\S]*?\}|[\w*\s,]+)?\s*from\s*["\'][^"\']*["\']\s*;?[ \t]*$'
    r'|^[ \t]*import\s+["\'][^"\']*["\']\s*;?[ \t]*$', re.M)
ESM_EXPORT_BLOCK = re.compile(r'^[ \t]*export\s*\{[\s\S]*?\}\s*;?[ \t]*$', re.M)


def to_classic(js):
    """ตัด import/export ออกให้รันเป็น script ธรรมดาได้
       CSP ของ artifact ไม่ยอมให้โหลด module จาก data: URL — เหลือทางเดียวคือ inline"""
    js = ESM_IMPORT.sub("", js)
    js = ESM_EXPORT_BLOCK.sub("", js)
    js = re.sub(r'^([ \t]*)export\s+(const|let|var|function|async\s+function|class)\s',
                lambda m: m.group(1) + m.group(2) + " ", js, flags=re.M)
    left = re.search(r'^[ \t]*(import|export)\s', js, re.M)
    if left:
        sys.exit("ยังเหลือ %s ที่ตัดไม่ออก: %s" % (left.group(1), js[left.start():left.start() + 90]))
    return js


def build():
    if not os.path.isdir(PHOTOS):
        sys.exit("ยังไม่มีรูปทดสอบ — รัน  python tools/fetch-sample-photos.py  ก่อน")

    from PIL import Image

    cfg = read("config.js")
    max_px = int(re.search(r"IMAGE_MAX_PX\s*=\s*(\d+)", cfg).group(1))
    quality = float(re.search(r"IMAGE_QUALITY\s*=\s*([\d.]+)", cfg).group(1))

    files = sorted(f for f in os.listdir(PHOTOS) if f.endswith(".jpg"))[:20]
    imgs, total = [], 0
    for fn in files:
        im = Image.open(os.path.join(PHOTOS, fn)).convert("RGB")
        s = min(1, max_px / max(im.size))
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=int(quality * 100))
        raw = buf.getvalue()
        total += len(raw)
        imgs.append("data:image/webp;base64," + base64.b64encode(raw).decode())
    print("รูป %d ใบ  รวม %.0f KB  เฉลี่ย %.1f KB" % (len(imgs), total / 1024, total / len(imgs) / 1024))

    core = sub(read("core.js"), [
        ('location.replace("/admin?next=" + encodeURIComponent(location.pathname))', '__nav("/admin")'),
        ('await signOut(auth);\n    location.replace("/admin");', 'await signOut(auth); __nav("/admin");'),
        ('if (need === "manager" && role !== "manager") { location.replace("/admin"); return null; }',
         'if (need === "manager" && role !== "manager") { __nav("/admin"); return null; }'),
        ('await signOut(auth); location.replace("/admin");', 'await signOut(auth); __nav("/admin");'),
    ], "core.js")
    # App Check ไม่มีในโหมดจำลอง และ dynamic import ก็โดน CSP บล็อกอยู่ดี
    core = re.sub(r'\} else if \(RECAPTCHA_SITE_KEY\) \{[\s\S]*?\n\}', "}", core, count=1)

    customer = sub(read("customer.js"), [
        ('const fromPath = decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || "");',
         'const fromPath = window.__TOKEN__ || "";'),
    ], "customer.js")

    orders = sub(read("admin-orders.js"), [
        ('if (next && next.startsWith("/admin")) return location.replace(next);',
         'if (next && next.startsWith("/admin")) return __nav(next);'),
        ('await signOut(auth); location.reload();', 'await signOut(auth); __nav("/admin");'),
    ], "admin-orders.js")

    tables = sub(read("admin-tables.js"), [
        ("`${location.origin}${location.pathname.replace(/\/admin\/.*$/, \"\")}/t/?t=${encodeURIComponent(token)}`",
         "`${window.__ORIGIN__}/t/?t=${encodeURIComponent(token)}`"),
    ], "admin-tables.js")

    shared = "\n".join([MOCK_APP, MOCK_AUTH, MOCK_FS] +
                       [to_classic(x) for x in [cfg, core, read("stats.js"), read("csv.js")]])

    pages = {
        "customer": to_classic(customer),
        "admin-orders": to_classic(orders),
        "admin-menu": to_classic(read("admin-menu.js")),
        "admin-report": to_classic(read("admin-report.js")),
        "admin-tables": to_classic(tables),
    }

    seed = {"menu": [{"cat": c, "name": n, "nameMy": my, "price": p, "img": imgs[i % len(imgs)]}
                     for i, (c, n, p, my) in enumerate(MENU_TH)],
            "tables": list(range(1, 9))}

    with open(SHELL, encoding="utf-8") as f:
        html = f.read()
    html = (html
            .replace("__SHARED__", json.dumps(shared, ensure_ascii=False))
            .replace("__PAGES__", json.dumps(pages, ensure_ascii=False, separators=(",", ":")))
            .replace("__APPCSS__", json.dumps(read("app.css"), ensure_ascii=False))
            .replace("__SEED__", json.dumps(seed, ensure_ascii=False, separators=(",", ":"))))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write(html)
    print("เขียน %s  (%.2f MB)" % (OUT, os.path.getsize(OUT) / 1024 / 1024))

    # สำเนาขึ้น GitHub Pages ที่ /demo/ — shell ไม่มี doctype (artifact ใส่ให้) ต้องเติมเอง ไม่งั้นเป็น quirks mode
    HEAD = ('<!doctype html>\n<html lang="th">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<meta name="robots" content="noindex">\n')
    pub = os.path.join(ROOT, "public", "demo", "index.html")
    os.makedirs(os.path.dirname(pub), exist_ok=True)
    with open(pub, "w", encoding="utf-8", newline="") as f:
        f.write(HEAD + html)
    print("เขียน %s" % pub)


if __name__ == "__main__":
    build()
