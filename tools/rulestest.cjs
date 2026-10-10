// ทดสอบ firestore.rules ด้วย Rules Test API ของ Google — จำลองผู้ใช้ (owner/staff/คนนอก)
// โดยไม่ต้องล็อกอินจริงและไม่แตะข้อมูลในฐานข้อมูล
//
//   firebase login
//   node tools/rulestest.cjs
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const cfg = fs.readFileSync(path.join(ROOT, "public", "assets", "config.js"), "utf8");
const PROJECT = cfg.match(/projectId:\s*"([^"]+)"/)[1];
const OWNER = cfg.match(/managers:\s*\["([^"]+)"/)[1];
const STAFF = cfg.match(/staff:\s*\["([^"]+)"/)[1];
const RULES = fs.readFileSync(process.env.RULES_FILE || path.join(ROOT, "firestore.rules"), "utf8");
const DOCS = "/databases/(default)/documents";

async function adminToken() {
  const auth = require(path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib", "auth.js"));
  const acct = auth.getGlobalDefaultAccount();
  return (await auth.getAccessToken(acct.tokens.refresh_token, [])).access_token;
}

const ROLES = { managers: [OWNER], staff: [STAFF] };
const mocks = (extra = []) => [
  { function: "exists", args: [{ exactValue: `${DOCS}/settings/roles` }], result: { value: true } },
  { function: "get", args: [{ exactValue: `${DOCS}/settings/roles` }], result: { value: { data: ROLES } } },
  ...extra,
];
const who = { owner: { uid: OWNER }, staff: { uid: STAFF }, stranger: { uid: "someone-else" }, anon: null };

const CASES = [];
const tc = (name, expect, user, method, p, { data, existing, extraMocks } = {}) => CASES.push({ name, tc: {
  expectation: expect,
  request: { ...(who[user] ? { auth: who[user] } : {}), method, path: `${DOCS}/${p}`,
             ...(data ? { resource: { data } } : {}), time: new Date().toISOString() },
  ...(existing ? { resource: { data: existing } } : {}),
  functionMocks: mocks(extraMocks),
} });

const bill = (status, extra = {}) => ({ token: "t1", table: 3, status, total: 90,
  items: [{ menuId: "m1", name: "ผัดไทย", price: 90, qty: 1 }], ...extra });

// บิล
tc("พนักงานกดเสิร์ฟบิลใหม่", "ALLOW", "staff", "update", "orders/o1", { existing: bill("new"), data: bill("done") });
tc("พนักงานกด 'ย้อนกลับ' บิลที่เสิร์ฟแล้ว", "ALLOW", "staff", "update", "orders/o1", { existing: bill("done"), data: bill("new") });
tc("พนักงานแก้รายการในบิลที่เสิร์ฟแล้ว (ต้องย้อนกลับก่อน)", "DENY", "staff", "update", "orders/o1",
   { existing: bill("done"), data: bill("done", { total: 10 }) });
tc("พนักงานแก้จำนวนในบิลที่ยังไม่เสิร์ฟ", "ALLOW", "staff", "update", "orders/o1",
   { existing: bill("new"), data: bill("new", { total: 180, edited: true }) });
tc("พนักงานยกเลิก แล้วเรียกคืนบิล", "ALLOW", "staff", "update", "orders/o1", { existing: bill("cancelled"), data: bill("new") });
tc("พนักงานลบบิล", "DENY", "staff", "delete", "orders/o1", { existing: bill("done") });
tc("เจ้าของลบบิล (ล้างบิลเก่า)", "ALLOW", "owner", "delete", "orders/o1", { existing: bill("done") });
tc("พนักงานอ่านบิลวันนี้", "ALLOW", "staff", "list", "orders/o1", { existing: bill("new") });
tc("คนที่ล็อกอินแต่ไม่มีสิทธิ์ อ่านบิล", "DENY", "stranger", "get", "orders/o1", { existing: bill("new") });

// เมนู
const dish = { name: "ผัดไทย", price: 90, cat: "เส้น", img: null, soldout: false, sort: 10 };
tc("เจ้าของแก้ราคาเมนู", "ALLOW", "owner", "update", "menu/m1", { existing: dish, data: { ...dish, price: 95 } });
tc("พนักงานแก้ราคาเมนู", "DENY", "staff", "update", "menu/m1", { existing: dish, data: { ...dish, price: 1 } });
tc("เจ้าของใส่รูปเกิน 60,000 ตัวอักษร", "DENY", "owner", "update", "menu/m1",
   { existing: dish, data: { ...dish, img: "data:image/webp;base64," + "A".repeat(60001) } });
tc("เจ้าของใส่ไฟล์ที่ไม่ใช่รูป", "DENY", "owner", "update", "menu/m1",
   { existing: dish, data: { ...dish, img: "data:text/html;base64,PHNjcmlwdD4=" } });
tc("เจ้าของใส่ชื่อพม่า", "ALLOW", "owner", "update", "menu/m1", { existing: dish, data: { ...dish, nameMy: "ပတ်ထိုင်း" } });

// ยอดขาย / ตั้งค่า / สิทธิ์
tc("พนักงานดูยอดย้อนหลัง", "DENY", "staff", "get", "stats/2026-10-01", { existing: { day: "2026-10-01", total: 1 } });
tc("เจ้าของดูยอดย้อนหลัง", "ALLOW", "owner", "get", "stats/2026-10-01", { existing: { day: "2026-10-01", total: 1 } });
tc("จอพนักงานเขียนยอดสรุปวันนี้", "ALLOW", "staff", "update", "stats/2026-10-10",
   { existing: { day: "2026-10-10" }, data: { day: "2026-10-10", total: 5 } });
tc("พนักงานแก้รายชื่อสิทธิ์ (ยกตัวเองเป็นเจ้าของ)", "DENY", "staff", "update", "settings/roles",
   { existing: ROLES, data: { managers: [OWNER, STAFF], staff: [] } });
tc("เจ้าของแก้รายชื่อสิทธิ์จากในแอป", "DENY", "owner", "update", "settings/roles", { existing: ROLES, data: ROLES });
tc("พนักงานแก้ชื่อร้าน", "DENY", "staff", "update", "settings/shop", { existing: { name: "a" }, data: { name: "b" } });
tc("ลูกค้า (ไม่ล็อกอิน) อ่านชื่อร้าน", "ALLOW", "anon", "get", "settings/shop", { existing: { name: "a" } });
tc("ลูกค้า (ไม่ล็อกอิน) ไล่ดูรายการโต๊ะทั้งหมด", "DENY", "anon", "list", "tables/t1", { existing: { no: 1 } });
tc("พนักงานเพิ่มโต๊ะ", "DENY", "staff", "create", "tables/t9", { data: { no: 9, active: true } });

(async () => {
  const token = await adminToken();
  const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: RULES }] },
                           testSuite: { testCases: CASES.map(c => c.tc) } }),
  });
  const body = await r.json();
  if (!r.ok) { console.error(JSON.stringify(body, null, 1).slice(0, 2000)); process.exit(1); }
  let fail = 0;
  body.testResults.forEach((res, i) => {
    const ok = res.state === "SUCCESS";
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  [${CASES[i].tc.expectation}] ${CASES[i].name}` +
      (ok ? "" : `  — ${(res.debugMessages || []).join(" | ")}`));
  });
  console.log(`\n${CASES.length - fail}/${CASES.length} ผ่าน`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("ERROR", e.message); process.exit(1); });
