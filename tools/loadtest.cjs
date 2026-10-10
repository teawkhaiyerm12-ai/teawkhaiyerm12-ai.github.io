// ทดสอบกับ Firebase จริง: ลูกค้าหลายคนสั่งพร้อมกัน + ยิงข้อมูลผิด ๆ ใส่ rules
//
//   firebase login              (ครั้งแรก)
//   node tools/loadtest.cjs 20  (จำนวนลูกค้าพร้อมกัน, ค่าเริ่มต้น 20)
//
// สร้างโต๊ะทดสอบ zz_loadtest_* ชั่วคราว ลูกค้ายิงผ่าน REST แบบไม่ล็อกอิน (เหมือนมือถือจริง
// rules จริงทำงานเต็ม) เสร็จแล้วลบโต๊ะและบิลทดสอบทิ้งหมด — ไม่แตะข้อมูลอื่นของร้าน
// สิทธิ์ admin ใช้ตอนสร้าง/ลบของทดสอบเท่านั้น ยืมจาก firebase login ในเครื่อง
const path = require("path");
const fs = require("fs");

const cfg = fs.readFileSync(path.join(__dirname, "..", "public", "assets", "config.js"), "utf8");
const KEY = cfg.match(/apiKey:\s*"([^"]+)"/)[1];
const PROJECT = cfg.match(/projectId:\s*"([^"]+)"/)[1];
const N = +process.argv[2] || 20;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const NAME = p => `projects/${PROJECT}/databases/(default)/documents/${p}`;

async function adminToken() {
  const lib = path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib");
  const auth = require(path.join(lib, "auth.js"));
  const acct = auth.getGlobalDefaultAccount();
  if (!acct) throw new Error("ยังไม่ได้ firebase login");
  const t = await auth.getAccessToken(acct.tokens.refresh_token, []);
  return t.access_token;
}

// ---- แปลงค่า JS <-> Firestore REST ----
const enc = v => Number.isInteger(v) ? { integerValue: String(v) }
  : typeof v === "number" ? { doubleValue: v }
  : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "string" ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
  : v === null ? { nullValue: null }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
const dec = f => "integerValue" in f ? +f.integerValue : "doubleValue" in f ? f.doubleValue
  : "stringValue" in f ? f.stringValue : "booleanValue" in f ? f.booleanValue
  : "nullValue" in f ? null
  : "arrayValue" in f ? (f.arrayValue.values || []).map(dec)
  : "mapValue" in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]))
  : f;

async function call(url, opt = {}, bearer) {
  const t0 = Date.now();
  const r = await fetch(url, {
    ...opt,
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body, ms: Date.now() - t0 };
}
const anonGet = p => call(`${BASE}/${p}?key=${KEY}`);
const anonList = p => call(`${BASE}/${p}?key=${KEY}&pageSize=300`);

/** สร้างบิลแบบเดียวกับหน้าลูกค้า: createdAt = เวลาฝั่ง server (serverTimestamp) */
function createOrder(id, order, bearer) {
  return call(`${BASE}:commit` + (bearer ? "" : `?key=${KEY}`), {
    method: "POST",
    body: JSON.stringify({ writes: [{
      update: { name: NAME(`orders/${id}`), fields: enc(order).mapValue.fields },
      updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { exists: false },
    }] }),
  }, bearer);
}

const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))];

(async () => {
  const report = { project: PROJECT, customers: N, checks: [] };
  const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${detail}`); };
  const admin = await adminToken();
  const created = [];

  // ---- เตรียมโต๊ะทดสอบ ----
  const T_ON = "zz_loadtest_on", T_OFF = "zz_loadtest_off";
  for (const [id, no, active] of [[T_ON, 99, true], [T_OFF, 98, false]]) {
    const r = await call(`${BASE}/tables?documentId=${id}`, { method: "POST",
      body: JSON.stringify({ fields: enc({ no, active, createdAt: new Date().toISOString() }).mapValue.fields }) }, admin);
    if (r.status !== 200 && r.status !== 409) throw new Error("สร้างโต๊ะทดสอบไม่ได้: " + JSON.stringify(r.body));
  }

  try {
    const menuRes = await anonList("menu");
    const menu = (menuRes.body.documents || []).map(d => ({ id: d.name.split("/").pop(), ...dec({ mapValue: { fields: d.fields } }) }));
    const pickable = menu.length ? menu : [{ id: "zz_fake1", name: "ทดสอบ", price: 50 }];
    const menuBytes = JSON.stringify(menuRes.body).length;
    report.menu = { items: menu.length, bytes: menuBytes };

    // ---- A. ลูกค้า N คนเปิดเมนูแล้วสั่งพร้อมกัน ----
    const customer = async i => {
      const t0 = Date.now();
      const [tb, shop, m] = await Promise.all([anonGet(`tables/${T_ON}`), anonGet("settings/shop"), anonList("menu")]);
      const openMs = Date.now() - t0;
      if (tb.status !== 200 || m.status !== 200) return { ok: false, err: `เปิดเมนูไม่ได้ ${tb.status}/${m.status}` };
      const lines = [];
      for (let k = 1 + (i % 3); k > 0; k--) {
        const it = pickable[(i * 7 + k * 3) % pickable.length];
        if (!lines.some(l => l.menuId === it.id)) lines.push({ menuId: it.id, name: it.name, price: it.price, qty: 1 + (k % 2) });
      }
      const id = `zz_lt_${Date.now().toString(36)}_${i}`;
      const r = await createOrder(id, { token: T_ON, table: 99, items: lines, status: "new",
        total: lines.reduce((a, l) => a + l.price * l.qty, 0) });
      if (r.status === 200) created.push(id);
      return { ok: r.status === 200, openMs, orderMs: r.ms, reads: 2 + (m.body.documents || []).length,
               err: r.status === 200 ? "" : JSON.stringify(r.body.error && r.body.error.message) };
    };
    const t0 = Date.now();
    const res = await Promise.all(Array.from({ length: N }, (_, i) => customer(i)));
    const wall = Date.now() - t0;
    const ok = res.filter(r => r.ok);
    check(`ลูกค้า ${N} คนสั่งพร้อมกัน`, ok.length === N,
      `สำเร็จ ${ok.length}/${N} · ใช้เวลารวม ${wall} ms` + (ok.length < N ? ` · ${res.find(r => !r.ok).err}` : ""));
    const openT = ok.map(r => r.openMs), ordT = ok.map(r => r.orderMs);
    report.latency = { openMenuP50: pct(openT, .5), openMenuP95: pct(openT, .95), orderP50: pct(ordT, .5), orderP95: pct(ordT, .95) };
    check("ความเร็วเปิดเมนู / ส่งออเดอร์ (p95)", pct(openT, .95) < 3000 && pct(ordT, .95) < 3000,
      `เปิดเมนู p50 ${pct(openT, .5)} ms · p95 ${pct(openT, .95)} ms · ส่งบิล p50 ${pct(ordT, .5)} ms · p95 ${pct(ordT, .95)} ms`);

    // ทุกบิลต้องได้เวลาจาก server และไม่ซ้ำ id
    const back = await Promise.all(created.map(id => call(`${BASE}/orders/${id}`, {}, admin)));
    const tsOk = back.every(b => b.status === 200 && b.body.fields.createdAt && b.body.fields.createdAt.timestampValue);
    check("บิลทุกใบบันทึกครบ เวลาเป็นของ server", tsOk && new Set(created).size === created.length,
      `อ่านกลับ ${back.filter(b => b.status === 200).length}/${created.length} ใบ`);

    // ---- B. rules: ข้อมูลผิด ๆ ต้องโดนปฏิเสธ ----
    const it = pickable[0];
    const good = () => ({ token: T_ON, table: 99, items: [{ menuId: it.id, name: it.name, price: it.price, qty: 1 }], status: "new", total: it.price });
    const deny = async (name, mutate, expect = 403) => {
      const o = good(); mutate(o);
      const id = `zz_lt_bad_${Math.random().toString(36).slice(2, 8)}`;
      const r = await createOrder(id, o);
      if (r.status === 200) created.push(id);
      check(name, r.status === expect, `ได้ HTTP ${r.status} (ควรเป็น ${expect})`);
    };
    await deny("ปลอมเลขโต๊ะ (QR โต๊ะ 99 แต่ส่งโต๊ะ 5)", o => { o.table = 5; });
    await deny("สั่งจากโต๊ะที่ปิดใช้", o => { o.token = T_OFF; o.table = 98; });
    await deny("สั่งด้วย token ที่ไม่มีอยู่จริง", o => { o.token = "no_such_table"; });
    await deny("ส่งสถานะ 'เสิร์ฟแล้ว' มาเอง", o => { o.status = "done"; });
    await deny("แอบใส่ field เพิ่ม", o => { o.discount = 100; });
    await deny("ยอดเป็น 0", o => { o.total = 0; });
    await deny("ยอดเกิน 20,000", o => { o.total = 20001; });
    await deny("รายการเกิน 30", o => { o.items = Array.from({ length: 31 }, () => o.items[0]); });
    await deny("ราคาปลอม (ราคา 1 บาท) — rules กันไม่ได้ จอหลังร้านต้องเตือน", o => { o.items[0].price = 1; o.total = 1; }, 200);

    const rd = await anonList("orders");
    check("คนนอกอ่านบิลไม่ได้", rd.status === 403, `HTTP ${rd.status}`);
    const up = created[0] && await call(`${BASE}/orders/${created[0]}?key=${KEY}&updateMask.fieldPaths=status`,
      { method: "PATCH", body: JSON.stringify({ fields: { status: { stringValue: "done" } } }) });
    check("คนนอกแก้บิลไม่ได้", up && up.status === 403, `HTTP ${up && up.status}`);
    const mw = await call(`${BASE}/menu?key=${KEY}`, { method: "POST", body: JSON.stringify({ fields: enc({ name: "x", price: 1 }).mapValue.fields }) });
    check("คนนอกเพิ่ม/แก้เมนูไม่ได้", mw.status === 403, `HTTP ${mw.status}`);
    const rl = await anonGet("settings/roles");
    check("คนนอกอ่านรายชื่อสิทธิ์ไม่ได้", rl.status === 403, `HTTP ${rl.status}`);

    // ---- C. โควตาต่อ 1 ลูกค้า (วัดจริง) ----
    report.perCustomer = { reads: ok[0] && ok[0].reads, writes: 1, menuKB: Math.round(menuBytes / 1024) };
  } finally {
    // ---- เก็บกวาด ----
    const del = [...created.map(id => `orders/${id}`), `tables/${T_ON}`, `tables/${T_OFF}`];
    const r = await Promise.all(del.map(p => call(`${BASE}/${p}`, { method: "DELETE" }, admin)));
    report.cleanup = `${r.filter(x => x.status === 200).length}/${del.length}`;
    console.log("cleanup", report.cleanup);
    fs.writeFileSync(path.join(__dirname, "..", "dist", "loadtest-report.json"), JSON.stringify(report, null, 1));
  }
})().catch(e => { console.error("ERROR", e.message); process.exit(1); });
