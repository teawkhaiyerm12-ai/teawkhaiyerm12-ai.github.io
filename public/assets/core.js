// ============================================================
//  จุดเดียวที่ import Firebase SDK — ไฟล์อื่น import ต่อจากที่นี่
//  อยากอัปเวอร์ชัน SDK: แก้เลขเวอร์ชันใน 3 บรรทัด import ข้างล่าง
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence, connectAuthEmulator, updatePassword,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs,
  setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy,
  serverTimestamp, writeBatch, Timestamp, limit,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import {
  FIREBASE_CONFIG, RECAPTCHA_SITE_KEY, USE_EMULATOR,
  IMAGE_MAX_PX, IMAGE_QUALITY, IMAGE_MAX_BYTES, LOGIN_DOMAIN, LOGIN_ACCOUNTS, ROLE_UIDS,
} from "./config.js";

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (USE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
} else if (RECAPTCHA_SITE_KEY) {
  // โหลดเฉพาะตอนใช้จริง เพื่อไม่ให้ emulator ต้องมี debug token
  const m = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-app-check.js");
  m.initializeAppCheck(app, {
    provider: new m.ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, writeBatch, Timestamp, limit,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence, updatePassword,
};

/* ---------------- helper ทั่วไป ---------------- */
export const baht = n => Number(n || 0).toLocaleString("th-TH");
export const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const pad2 = n => String(n).padStart(2, "0");
export const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const monthKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const hhmm = d => d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "--:--";

export const TH_MONTH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
export const TH_DAY = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
export const monthLabel = k => { const [y, m] = k.split("-"); return `${TH_MONTH[+m - 1]} ${+y + 543}`; };

/* ---------------- ภาษาของ "หน้าหลังร้าน" ----------------
   หน้าลูกค้าเป็นภาษาไทยอย่างเดียว — คนไทยสแกนใช้ ไม่ต้องมีตัวเลือก
   ส่วนพนักงานหน้าร้านหลายคนเป็นคนพม่า เลยให้สลับภาษาได้เฉพาะจอหลังร้าน

   แปลเฉพาะที่พนักงานหน้าร้านเห็น: หน้าล็อกอิน + แถบบน + กระดานออเดอร์
   หน้าที่เป็นของผู้จัดการ (เมนู ยอดขาย โต๊ะ) ไม่ต้องแปล เพราะ staff เข้าไม่ได้อยู่แล้ว

   ponytail: ฝัง 2 ภาษาไว้ตรง ๆ ~30 ก้อน ไม่ใช้ i18n library
   ⚠️ คำแปลพม่าต้องให้เจ้าของภาษาตรวจก่อนส่งมอบ                              */
export const LANGS = [
  { id: "th", label: "ไทย" },
  { id: "my", label: "မြန်မာ" },
];
const LANG_KEY = "qr-order-lang";

const STRINGS = {
  th: {
    backoffice: "ระบบหลังร้าน",
    signout: "ออกจากระบบ",
    navOrders: "ออเดอร์", navMenu: "จัดการเมนู", navReport: "ยอดขาย", navTables: "โต๊ะ & QR",
    roleManager: "ผู้จัดการ", roleStaff: "พนักงานหน้าร้าน",

    loginSub: "ใส่รหัสผ่านของเจ้าของร้านหรือพนักงาน",
    email: "ชื่อผู้ใช้", password: "รหัสผ่าน", signin: "เข้าสู่ระบบ",
    noAccessTitle: "บัญชีนี้ยังไม่มีสิทธิ์เข้าระบบ",
    noAccessText: "แจ้งผู้จัดการร้านให้เพิ่มบัญชีนี้เข้าระบบก่อน",

    ordersTitle: "ออเดอร์วันนี้",
    ordersHint: "บิลที่ยังไม่กดเสิร์ฟ แก้จำนวนหรือเอารายการออกได้ เผื่อลูกค้าสั่งผิด — " +
                "พอกดเสิร์ฟแล้วบิลจะล็อก ถ้าต้องแก้ให้กดย้อนกลับก่อน",
    fNew: "รอเสิร์ฟ", fDone: "เสิร์ฟแล้ว", fCancelled: "ยกเลิก", fAll: "ทั้งหมด",
    waiting: "กำลังรอออเดอร์…",
    emptyNew: "ยังไม่มีบิลที่รอเสิร์ฟ", emptyOther: "ไม่มีบิลในหมวดนี้",
    table: "โต๊ะ", baht: "บาท", edited: "แก้ไขแล้ว",
    btnServed: "เสิร์ฟแล้ว", btnCancel: "ยกเลิกบิล", btnUndo: "ย้อนกลับ", btnRestore: "เรียกคืน",
    askRemoveLine: (n, t) => `เอา "${n}" ออกจากบิลโต๊ะ ${t}?`,
    askCancelBill: t => `ยกเลิกบิลโต๊ะ ${t} ทั้งใบ?`,
    allRemoved: "เอารายการออกหมดแล้ว บิลนี้ถูกยกเลิก",
    cantRestore: "บิลนี้ไม่เหลือรายการแล้ว เรียกคืนไม่ได้",
    loadFail: "โหลดออเดอร์ไม่ได้",
    newOrder: "ออเดอร์ใหม่",
    notInMenu: "ไม่มีในเมนู", priceNow: "ราคาเมนูจริง", sumMismatch: "รวมรายการได้",
    changePw: "เปลี่ยนรหัสผ่าน",
    newPw: "รหัสผ่านใหม่",
    pwTooShort: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว",
    pwChanged: "เปลี่ยนรหัสผ่านเรียบร้อย จดไว้ให้ดี",
    pwNeedRelogin: "เพื่อความปลอดภัย ต้องออกจากระบบแล้วเข้าใหม่ก่อนเปลี่ยนรหัสผ่าน",
  },
  my: {
    backoffice: "ဆိုင်တွင်းစနစ်",
    signout: "ထွက်မည်",
    navOrders: "မှာယူမှုများ", navMenu: "မီနူးစီမံ", navReport: "ရောင်းအား", navTables: "စားပွဲ & QR",
    roleManager: "မန်နေဂျာ", roleStaff: "ဆိုင်ဝန်ထမ်း",

    loginSub: "ဆိုင်ရှင် သို့မဟုတ် ဝန်ထမ်း စကားဝှက်ကို ထည့်ပါ",
    email: "အသုံးပြုသူအမည်", password: "စကားဝှက်", signin: "ဝင်မည်",
    noAccessTitle: "ဤအကောင့်တွင် ဝင်ခွင့် မရှိသေးပါ",
    noAccessText: "မန်နေဂျာကို ပြောပြီး ဤအကောင့်ကို ထည့်ခိုင်းပါ",

    ordersTitle: "ယနေ့ မှာယူမှုများ",
    ordersHint: "မပို့ရသေးသော ဘောက်ချာများကို အရေအတွက်ပြင်ခြင်း၊ ပစ္စည်းဖြုတ်ခြင်း ပြုလုပ်နိုင်သည် — " +
                "ပို့ပြီးပါက ဘောက်ချာ ပိတ်သွားမည် ပြင်လိုပါက ပြန်ဖွင့်ရန် နှိပ်ပါ",
    fNew: "မပို့ရသေး", fDone: "ပို့ပြီး", fCancelled: "ပယ်ဖျက်", fAll: "အားလုံး",
    waiting: "မှာယူမှု စောင့်နေသည်…",
    emptyNew: "မပို့ရသေးသော ဘောက်ချာ မရှိပါ", emptyOther: "ဤအမျိုးအစားတွင် ဘောက်ချာ မရှိပါ",
    table: "စားပွဲ", baht: "ဘတ်", edited: "ပြင်ပြီး",
    btnServed: "ပို့ပြီး", btnCancel: "ဘောက်ချာ ပယ်ဖျက်", btnUndo: "ပြန်ဖွင့်", btnRestore: "ပြန်ယူ",
    askRemoveLine: (n, t) => `စားပွဲ ${t} ၏ ဘောက်ချာမှ "${n}" ကို ဖြုတ်မလား?`,
    askCancelBill: t => `စားပွဲ ${t} ၏ ဘောက်ချာ တစ်ခုလုံး ပယ်ဖျက်မလား?`,
    allRemoved: "ပစ္စည်းအားလုံး ဖြုတ်ပြီးသဖြင့် ဤဘောက်ချာ ပယ်ဖျက်ပါပြီ",
    cantRestore: "ဤဘောက်ချာတွင် ပစ္စည်း မကျန်တော့သဖြင့် ပြန်မယူနိုင်ပါ",
    loadFail: "မှာယူမှုများ ဖတ်၍မရပါ",
    newOrder: "မှာယူမှုအသစ်",
    notInMenu: "မီနူးတွင် မရှိ", priceNow: "မီနူးဈေးနှုန်း", sumMismatch: "စုစုပေါင်း မှန်ကန်ချက်",
    changePw: "စကားဝှက် ပြောင်းမည်",
    newPw: "စကားဝှက် အသစ်",
    pwTooShort: "စကားဝှက်သည် အနည်းဆုံး ၈ လုံး ရှိရမည်",
    pwChanged: "စကားဝှက် ပြောင်းပြီးပါပြီ မှတ်ထားပါ",
    pwNeedRelogin: "လုံခြုံရေးအတွက် ထွက်ပြီး ပြန်ဝင်ပြီးမှ ပြောင်းနိုင်ပါသည်",
  },
};

let currentLang = "th";
try { if (STRINGS[localStorage.getItem(LANG_KEY)]) currentLang = localStorage.getItem(LANG_KEY); } catch (_) {}

export const getLang = () => currentLang;
export function setLang(id) {
  currentLang = STRINGS[id] ? id : "th";
  document.documentElement.lang = currentLang;
  try { localStorage.setItem(LANG_KEY, currentLang); } catch (_) {}
  return currentLang;
}
/** ข้อความหน้าหลังร้านตามภาษาที่พนักงานเลือก */
export const t = key => STRINGS[currentLang][key];

/** โหลดหน้าใหม่ — ตัว build ของเดโมจะ patch ให้ยิงไปที่ shell แทน */
export const reloadPage = () => location.reload();

/** จอหลังร้านเปิดค้างข้ามคืน: query "วันนี้" ถูกตั้งตอนโหลดหน้า เลยต้องโหลดใหม่หลังเที่ยงคืน
 *  ไม่งั้นเช้าวันใหม่จะไม่เห็นออเดอร์ใหม่ และยอดสรุปจะเขียนบิลเมื่อวานลงวันนี้ */
export function reloadAtMidnight() {
  const next = new Date(); next.setHours(24, 0, 5, 0);
  setTimeout(reloadPage, next - Date.now());
}

/* ---------------- แปลชื่อเมนูไทย → พม่า อัตโนมัติ ----------------
   ใช้เมื่อเจ้าของยังไม่ได้กรอกชื่อพม่าเอง — จอพนักงานจะได้ไม่ว่าง
   ponytail: คลังคำ + จับคำยาวสุดก่อน ไม่ใช้ API แปลภาษา (ต้องผูกบัตร และร้านไม่มีคนดูแล)
   ผลเป็นคำแปลคร่าว ๆ ทีละคำ — เจ้าของกรอกชื่อพม่าเองได้เสมอ และชื่อที่กรอกจะชนะ
   ⚠️ คำแปลชุดนี้ต้องให้คนพม่าตรวจ  [คำไทย, คำพม่า, 1 = เนื้อสัตว์/วัตถุดิบหลัก ยกไปไว้หน้า] */
const MY_WORDS = [
  ["เมนูใหม่", "ဟင်းလျာအသစ်"],
  ["ข้าวมันไก่", "ကြက်ဆီထမင်း"], ["ข้าวผัด", "ထမင်းကြော်"], ["ข้าวเหนียว", "ကောက်ညှင်း"],
  ["ข้าวต้ม", "ဆန်ပြုတ်"], ["ข้าวเปล่า", "ထမင်းဖြူ"], ["ข้าวสวย", "ထမင်းဖြူ"], ["ข้าวซอย", "ခေါက်ဆွဲ (ခေါဆွယ်)"],
  ["ข้าว", "ထမင်း"],
  ["ผัดไทย", "ပတ်ထိုင်း"], ["ผัดซีอิ๊ว", "ပဲငံပြာရည်ကြော်"], ["ผัดขี้เมา", "မူးယစ်ကြော်"],
  ["ต้มยำ", "တုံယမ်း"], ["ต้มข่า", "တုံခါ"],
  ["แกงเขียวหวาน", "အစိမ်းရောင်ဟင်း"], ["แกงแดง", "အနီရောင်ဟင်း"], ["แกงกะหรี่", "ကုလားဟင်း"],
  ["แกงคั่ว", "ခူဟင်း"], ["มัสมั่น", "မတ်စမန်ဟင်း"], ["พะแนง", "ပနန်ဟင်း"], ["แกง", "ဟင်း"],
  ["ส้มตำ", "သင်္ဘောသီးသုပ်"], ["ยำ", "သုပ်"],
  ["ก๋วยเตี๋ยว", "ခေါက်ဆွဲ"], ["เส้นใหญ่", "ခေါက်ဆွဲပြား"], ["เส้นเล็ก", "ခေါက်ဆွဲသေး"],
  ["บะหมี่", "ခေါက်ဆွဲဝါ"], ["วุ้นเส้น", "ကြာဆံ"],
  ["กะเพรา", "ကပေါ"], ["ผัดพริกแกง", "ဟင်းခတ်မှုန့်ကြော်"], ["พริกแกง", "ဟင်းခတ်မှုန့်"],
  ["ผัด", "ကြော်"], ["ทอด", "ကြော်"], ["ย่าง", "ကင်"], ["ปิ้ง", "ကင်"], ["ต้ม", "ပြုတ်"],
  ["ตุ๋น", "နှပ်"], ["นึ่ง", "ပေါင်း"], ["ราด", "ဆမ်း"],
  ["ปีกไก่", "ကြက်တောင်ပံ", 1], ["ไก่", "ကြက်သား", 1],
  ["หมูกรอบ", "ဝက်သားကြွပ်", 1], ["หมูสับ", "ဝက်သားနုပ်", 1], ["หมูแดง", "ဝက်သားနီ", 1], ["หมู", "ဝက်သား", 1],
  ["เนื้อ", "အမဲသား", 1], ["กุ้ง", "ပုစွန်", 1], ["ปลาหมึก", "ပြည်ကြီးငါး", 1], ["ปลา", "ငါး", 1],
  ["ทะเล", "ပင်လယ်စာ", 1], ["เป็ด", "ဘဲသား", 1], ["ปู", "ဂဏန်း", 1], ["เต้าหู้", "တို့ဟူး", 1],
  ["ทอดมัน", "ငါးဖယ်ကြော်"],
  ["ไข่ดาว", "ကြက်ဥကြော်"], ["ไข่เจียว", "ကြက်ဥမွှေကြော်"], ["ไข่", "ကြက်ဥ"],
  ["ผักบุ้ง", "ကန်စွန်းရွက်"], ["ผัก", "ဟင်းသီးဟင်းရွက်"], ["กระเทียม", "ကြက်သွန်ဖြူ"],
  ["พริกไทยดำ", "ငရုတ်ကောင်းနက်"], ["พริก", "ငရုတ်သီး"], ["น้ำปลา", "ငံပြာရည်"], ["ตะไคร้", "စပါးလင်"],
  ["ชาเย็น", "လက်ဖက်ရည်အေး"], ["ชา", "လက်ဖက်ရည်"], ["กาแฟ", "ကော်ဖီ"], ["โกโก้", "ကိုကိုး"],
  ["น้ำมะนาว", "သံပုရာရည်"], ["น้ำเปล่า", "ရေ"], ["น้ำแข็ง", "ရေခဲ"], ["โซดา", "ဆိုဒါ"],
  ["โค้ก", "ကိုကာကိုလာ"], ["เบียร์", "ဘီယာ"], ["น้ำ", "ရည်"],
  ["ลาบ", "လာ့ပ်"], ["ไทย", "ထိုင်း"], ["สด", "လတ်"], ["ข้น", "ပျစ်"], ["กรอบ", "ကြွပ်"],
  ["พิเศษ", "အထူး"], ["ธรรมดา", "ပုံမှန်"], ["ไม่เผ็ด", "မစပ်"], ["เผ็ด", "စပ်"],
  ["หวาน", "ချို"], ["เปรี้ยว", "ချဉ်"], ["เย็น", "အေး"], ["ร้อน", "ပူ"],
].sort((a, b) => b[0].length - a[0].length);

/** "ข้าวกะเพราไก่ไข่ดาว" → "ကြက်သား ထမင်း ကပေါ ကြက်ဥကြော်"  ไม่รู้จักสักคำ → "" */
export function autoMy(th) {
  const s = String(th || "").replace(/\s+/g, "");
  const main = [], rest = [];
  let i = 0, unknown = "", hit = false;
  const flush = () => { if (unknown) { rest.push(unknown); unknown = ""; } };
  while (i < s.length) {
    const w = MY_WORDS.find(([t]) => s.startsWith(t, i));
    if (!w) { unknown += s[i++]; continue; }
    flush(); hit = true;
    (w[2] ? main : rest).push(w[1]);
    i += w[0].length;
  }
  flush();
  return hit ? [...main, ...rest].join(" ") : "";
}

export const CATS = ["แนะนำ", "ข้าว", "เส้น", "ทานเล่น", "เครื่องดื่ม"];

/** ช่วงเวลาของทั้งวันตาม timezone เครื่อง ใช้ query ออเดอร์รายวัน */
export function dayRange(d = new Date()) {
  const from = new Date(d); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(to.getDate() + 1);
  return { from: Timestamp.fromDate(from), to: Timestamp.fromDate(to) };
}

/** Firestore ลองเชื่อมต่อใหม่ไปเรื่อย ๆ ไม่ยอม reject — หน้าลูกค้าจะค้างที่สปินเนอร์
 *  ถ้าเน็ตร้านล่ม เลยต้องมีนาฬิกาจับเวลาคุมไว้เอง */
export const withTimeout = (p, ms = 12000, msg = "เชื่อมต่อไม่ได้ ตรวจสอบสัญญาณอินเทอร์เน็ต") =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

let toastTimer = null;
export function toast(msg, kind = "ok") {
  let el = document.querySelector(".toast-bar");
  if (!el) { el = document.createElement("div"); el.className = "toast-bar"; document.body.appendChild(el); }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), kind === "err" ? 5000 : 2600);
}

/** แปลง error ของ Firebase เป็นข้อความไทยที่คนหน้าร้านอ่านรู้เรื่อง */
export function friendlyError(e) {
  const c = e?.code || "";
  if (c.includes("permission-denied")) return "ไม่มีสิทธิ์ทำรายการนี้";
  if (c.includes("unavailable") || c.includes("network")) return "เน็ตหลุด ลองใหม่อีกครั้ง";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "รหัสผ่านไม่ถูกต้อง";
  if (c.includes("too-many-requests")) return "ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่";
  // เจอตอนยังไม่ได้ใส่ค่า Firebase ลง config.js หรือใส่ผิด — ไม่ใช่ความผิดคนหน้าร้าน
  if (c.includes("api-key") || c.includes("invalid-api-key") || c.includes("configuration-not-found"))
    return "ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล แจ้งผู้ดูแลให้ตั้งค่า Firebase ก่อน";
  if (c.includes("unauthorized-domain"))
    return "โดเมนนี้ยังไม่ได้รับอนุญาต แจ้งผู้ดูแลให้เพิ่มใน Firebase > Authorized domains";
  return e?.message || "เกิดข้อผิดพลาด";
}

/* ---------------- ตั้งค่าร้าน (ชื่อ + ธีมสี) ---------------- */
export const DEFAULT_SHOP = "ร้านอาหาร";
export const PALETTES = [
  { id: "",      name: "ส้มอบอุ่น",   dot: "#C2410C" },
  { id: "red",   name: "แดงมงคล",    dot: "#B4232E" },
  { id: "green", name: "เขียวใบเตย", dot: "#0E6B4C" },
];
const SETTINGS_CACHE = "qr-order-settings";
export const settingsRef = doc(db, "settings", "shop");

export function applySettings(s) {
  const name = (s?.name || DEFAULT_SHOP).slice(0, 40);
  const pal = PALETTES.some(p => p.id === s?.palette) ? s.palette : "";
  document.querySelectorAll("[data-shopname]").forEach(el => el.textContent = name);
  if (pal) document.documentElement.setAttribute("data-palette", pal);
  else document.documentElement.removeAttribute("data-palette");
  document.title = name;
  try { localStorage.setItem(SETTINGS_CACHE, JSON.stringify({ name, palette: pal })); } catch (_) {}
  return { name, palette: pal };
}

/** อ่านค่าที่ cache ไว้มาทาก่อน จะได้ไม่เห็นชื่อ/สีเก่าแวบตอนโหลด */
export function applyCachedSettings() {
  try { return applySettings(JSON.parse(localStorage.getItem(SETTINGS_CACHE) || "null")); }
  catch (_) { return applySettings(null); }
}

export async function loadSettings() {
  applyCachedSettings();
  try {
    const snap = await getDoc(settingsRef);
    return applySettings(snap.exists() ? snap.data() : null);
  } catch (_) {
    return applyCachedSettings();          // เน็ตหลุดก็ยังแสดงของเดิมได้
  }
}

/* ---------------- ย่อรูปก่อนเก็บ ---------------- */
// ponytail: ฝัง data URI ใน Firestore แทน Cloud Storage เพราะ Storage ต้องผูกบัตรตั้งแต่ ก.พ. 2026
// ถ้าวันไหนยอมผูกบัตรแล้ว ให้เปลี่ยนมาอัปขึ้น Storage แล้วเก็บแค่ URL
export function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error("ไฟล์นี้ไม่ใช่รูปภาพ"));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(1, IMAGE_MAX_PX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * s));
      c.height = Math.max(1, Math.round(img.height * s));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      // WebP เล็กกว่า JPEG ประมาณครึ่งที่คุณภาพตาเปล่าเท่ากัน
      // Safari ก่อนเวอร์ชัน 14 encode WebP ไม่ได้ จะคืน data:image/png มาแทน — ตกไปใช้ JPEG
      const encode = q => {
        const w = c.toDataURL("image/webp", q);
        return w.startsWith("data:image/webp") ? w : c.toDataURL("image/jpeg", q);
      };
      let q = IMAGE_QUALITY, out = encode(q);
      // บีบซ้ำจนกว่าจะไม่เกินเพดาน ไม่งั้นกินโควตา egress ของ Firestore
      while (out.length > IMAGE_MAX_BYTES && q > 0.3) { q -= 0.1; out = encode(q); }
      if (out.length > IMAGE_MAX_BYTES) return reject(new Error("รูปใหญ่เกินไป ลองรูปอื่น"));
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("เปิดไฟล์รูปนี้ไม่ได้")); };
    img.src = url;
  });
}

export { LOGIN_ACCOUNTS };
/** ตัดโดเมนออกตอนโชว์บนหน้าจอ พนักงานจะได้เห็นแค่ชื่อผู้ใช้ */
export const userLabel = u => String(u?.email || "").replace(`@${LOGIN_DOMAIN}`, "");

/* ---------------- สิทธิ์และประตูหน้า admin ---------------- */
/** รอจน Firebase บอกสถานะล็อกอิน แล้วคืน user หรือ null */
export function currentUser() {
  return new Promise(res => {
    const stop = onAuthStateChanged(auth, u => { stop(); res(u); });
  });
}

export const roleLabel = r => t(r === "manager" ? "roleManager" : "roleStaff");

/**
 * อ่านว่า user คนนี้เป็นอะไร จาก doc settings/roles
 * คืน "manager" | "staff" | null (ไม่มีสิทธิ์)
 * ponytail: อ่าน 1 doc ต่อการเปิดหน้า — ถูกกว่าการฝังรายชื่อไว้สองที่แล้วลืมอัปเดตข้างใดข้างหนึ่ง
 */
export async function loadRole(user) {
  if (!user) return null;
  try {
    const ref = doc(db, "settings", "roles");
    const snap = await withTimeout(getDoc(ref), 10000);
    let d = snap.exists() ? snap.data() || {} : null;
    // ระบบใหม่ยังไม่มี doc roles: เจ้าของล็อกอินครั้งแรก = สร้างให้เลย (rules ยอมเฉพาะ uid เจ้าของ)
    if (!d && ROLE_UIDS.managers.includes(user.uid)) {
      await withTimeout(setDoc(ref, ROLE_UIDS), 10000);
      d = ROLE_UIDS;
    }
    if (!d) return null;
    if ((d.managers || []).includes(user.uid)) return "manager";
    if ((d.staff || []).includes(user.uid)) return "staff";
  } catch (_) { /* อ่านไม่ได้ = ไม่มีสิทธิ์ ปล่อยให้ rules เป็นคนตัดสินอยู่ดี */ }
  return null;
}

function noAccessScreen(user) {
  document.getElementById("chrome").innerHTML = "";
  const v = document.getElementById("view");
  if (v) v.innerHTML = `<div class="center-msg"><div class="box">
      <h1>${esc(t("noAccessTitle"))}</h1>
      <p>${esc(userLabel(user))}<br>${esc(t("noAccessText"))}</p>
      <p style="margin-top:18px"><button class="btn ghost" id="so">${esc(t("signout"))}</button></p>
    </div></div>`;
  document.getElementById("so")?.addEventListener("click", async () => {
    await signOut(auth); location.replace("/admin");
  });
}

/**
 * ใช้บนทุกหน้า admin ยกเว้นหน้า login
 * need = "staff" (ใครก็ได้ที่มีสิทธิ์) หรือ "manager" (เฉพาะผู้จัดการ)
 * คืน { user, role } หรือ null ถ้าไม่ผ่าน
 * นี่คือเรื่อง UX ล้วน — ด่านจริงอยู่ที่ firestore.rules
 */
export async function requireRole(need = "staff") {
  const u = await currentUser();
  if (!u) { location.replace("/admin?next=" + encodeURIComponent(location.pathname)); return null; }
  const role = await loadRole(u);
  if (!role) { noAccessScreen(u); return null; }
  if (need === "manager" && role !== "manager") { location.replace("/admin"); return null; }
  return { user: u, role };
}

const NAV = [
  ["/admin", "navOrders", "staff"],
  ["/admin/menu", "navMenu", "manager"],
  ["/admin/report", "navReport", "staff"],
  ["/admin/tables", "navTables", "manager"],
];

export function renderAdminChrome(active, user, role = "staff") {
  const host = document.getElementById("chrome");
  if (!host) return;
  // ตั้งตรงนี้ ไม่ใช่ตอนโหลด core.js — หน้าลูกค้า import ไฟล์เดียวกันและต้องเป็นไทยเสมอ
  document.documentElement.lang = currentLang;
  const visible = NAV.filter(([, , need]) => need === "staff" || role === "manager");
  host.innerHTML = `
    <div class="bar">
      <div class="brand"><span data-shopname>${esc(DEFAULT_SHOP)}</span> <i>${esc(t("backoffice"))}</i></div>
      <nav class="tabs">
        ${visible.map(([href, key]) =>
          `<a href="${href}"${href === active ? ' aria-current="page"' : ""}>${esc(t(key))}</a>`).join("")}
      </nav>
      <div class="who">
        <span class="mail">${esc(userLabel(user))} · ${esc(roleLabel(role))}</span>
        <span class="langsw" role="group" aria-label="ภาษา / ဘာသာစကား">
          ${LANGS.map(l => `<button data-lang="${l.id}" aria-pressed="${l.id === getLang()}">${esc(l.label)}</button>`).join("")}
        </span>
        <button class="btn ghost" id="signout">${esc(t("signout"))}</button>
      </div>
    </div>`;
  host.querySelector("#signout").onclick = async () => {
    await signOut(auth);
    location.replace("/admin");
  };
  host.querySelector(".langsw").onclick = e => {
    const b = e.target.closest("[data-lang]"); if (!b) return;
    setLang(b.dataset.lang);
    reloadPage();                       // วาดใหม่ทั้งหน้าให้ทุกข้อความเปลี่ยนพร้อมกัน
  };
  applyCachedSettings();
}
