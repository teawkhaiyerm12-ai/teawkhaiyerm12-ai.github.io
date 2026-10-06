// หน้า "ทดสอบระบบ" ของเดโม — รันใน iframe เดียวกับหน้าอื่น ใช้โค้ดจริงที่ถูกรวมไว้ใน SHARED
// (summarize, dayReportRows, monthReportRows, toCsv, query/getDocs ของตัวจำลอง ฯลฯ)
// ข้อมูลอยู่ใน localStorage ของเบราว์เซอร์นี้เท่านั้น ไม่แตะ Firebase จริง
//
// classic script ไม่มี import — build ห่อด้วย (async function(){ ... })()

const view = document.getElementById("view");
const GiB = 1024 ** 3;
const shop = () => (fsLoad()["settings/shop"] || {}).name || "ร้านอาหาร";
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr, w) => {
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) if ((r -= w[i]) < 0) return arr[i];
  return arr[arr.length - 1];
};
const docsOf = (db, col) => Object.keys(db)
  .filter(k => k.startsWith(col + "/") && k.split("/").length === 2)
  .map(k => ({ id: k.split("/")[1], ...db[k] }));
const tsOf = o => (o.createdAt && o.createdAt.__ts) || 0;

/* ---------------- สร้างบิลทดสอบ ---------------- */
function generate(days, perDay) {
  const db = fsLoad();
  const menu = docsOf(db, "menu").filter(m => !m.soldout);
  const tables = docsOf(db, "tables").filter(t => t.active !== false);
  if (!menu.length || !tables.length) throw new Error("ต้องมีเมนูและโต๊ะก่อน (กดรีเซ็ตข้อมูลเดโม)");

  // ล้างชุดทดสอบเก่าก่อน ไม่ให้ซ้อนกัน
  for (const k of Object.keys(db)) if (k.startsWith("orders/t_")) delete db[k];

  // ความนิยมไม่เท่ากัน — จะได้มี "เมนูขายดี" ให้เห็นในกราฟ
  const weights = menu.map((_, i) => 1 / Math.pow(i + 1, 0.7)).sort(() => Math.random() - 0.5);
  const now = Date.now();
  let made = 0;
  const touched = new Set();

  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const n = Math.round(rnd(Math.round(perDay * 0.6), Math.round(perDay * 1.2)) * (weekend ? 1.3 : 1));
    for (let i = 0; i < n; i++) {
      const lunch = Math.random() < 0.55;
      const t = new Date(day);
      t.setHours(lunch ? rnd(11, 13) : rnd(17, 20), rnd(0, 59), rnd(0, 59));
      if (t.getTime() > now) continue;                       // วันนี้สร้างแค่ถึงเวลาปัจจุบัน
      const lines = [];
      for (let j = rnd(1, 4); j > 0; j--) {
        const m = pick(menu, weights);
        if (lines.some(l => l.menuId === m.id)) continue;
        lines.push({ menuId: m.id, name: m.name, price: m.price, qty: Math.random() < 0.8 ? 1 : 2 });
      }
      const fresh = now - t.getTime() < 25 * 60 * 1000;
      const status = Math.random() < 0.05 ? "cancelled" : fresh ? "new" : "done";
      const tb = tables[rnd(0, tables.length - 1)];
      db[`orders/t_${t.getTime().toString(36)}${i}`] = {
        token: tb.id, table: tb.no, items: lines,
        total: lines.reduce((a, l) => a + l.price * l.qty, 0),
        status, createdAt: { __ts: t.getTime() },
        ...(Math.random() < 0.03 ? { edited: true } : {}),
      };
      made++;
    }
    touched.add(dayKey(day));
  }

  // ยอดสรุปรายวัน — คำนวณด้วย summarize ตัวจริง แบบเดียวกับที่จอหลังร้านเขียนทุกวัน
  const orders = docsOf(db, "orders");
  for (const key of touched) {
    const list = orders.filter(o => dayKey(new Date(tsOf(o))) === key);
    db["stats/" + key] = { day: key, month: key.slice(0, 7), ...summarize(list), updatedAt: new Date().toISOString() };
  }
  fsSave(db);
  return made;
}

/* ---------------- อ่าน CSV กลับ (ทดสอบว่า Excel จะเห็นอะไร) ---------------- */
function parseCsv(text) {
  const t = text.replace(/^﻿/, "");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  row.push(f); rows.push(row);
  return rows;
}

/* ---------------- ชุดทดสอบ ---------------- */
function tests() {
  const T = [];
  const add = (name, run) => T.push({ name, run });
  const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ได้ ${a} ควรเป็น ${b}`); };

  add("เมนูผ่านกติกาฐานข้อมูล (ชื่อ ราคา รูป)", () => {
    const menu = docsOf(fsLoad(), "menu");
    if (!menu.length) throw new Error("ไม่มีเมนู");
    let bytes = 0;
    for (const m of menu) {
      if (typeof m.name !== "string" || !m.name || m.name.length > 60) throw new Error(`ชื่อผิด: ${m.id}`);
      if (typeof m.price !== "number" || m.price < 0 || m.price > 20000) throw new Error(`ราคาผิด: ${m.name}`);
      if (m.img != null && !(typeof m.img === "string" && m.img.length <= 60000 &&
          /^data:image\/(jpeg|webp);base64,/.test(m.img))) throw new Error(`รูปเกินเพดาน: ${m.name}`);
      if (m.nameMy != null && String(m.nameMy).length > 80) throw new Error(`ชื่อพม่ายาวเกิน: ${m.name}`);
      bytes += (m.img || "").length;
    }
    return `${menu.length} เมนู · รูปเฉลี่ย ${(bytes / menu.length / 1024).toFixed(1)} KB`;
  });

  add("บันทึกบิล (log) ครบทุกช่องทุกใบ", () => {
    const orders = docsOf(fsLoad(), "orders");
    if (!orders.length) throw new Error("ยังไม่มีบิล — กดสร้างบิลทดสอบก่อน");
    for (const o of orders) {
      if (!Number.isInteger(o.table) || o.table < 1 || o.table > 999) throw new Error(`เลขโต๊ะผิด: ${o.id}`);
      if (typeof o.token !== "string" || !o.token) throw new Error(`ไม่มี token: ${o.id}`);
      if (!tsOf(o)) throw new Error(`ไม่มีเวลา: ${o.id}`);
      if (!Array.isArray(o.items) || o.items.length > 30) throw new Error(`รายการผิด: ${o.id}`);
      for (const l of o.items) if (!l.menuId || !l.name || !(l.qty > 0) || typeof l.price !== "number")
        throw new Error(`บรรทัดในบิลผิด: ${o.id}`);
      const sum = o.items.reduce((a, l) => a + l.price * l.qty, 0);
      if (o.status !== "cancelled") eq(o.total, sum, `ยอดบิล ${o.id}`);
    }
    const st = s => orders.filter(o => o.status === s).length;
    return `${orders.length} ใบ · เสิร์ฟแล้ว ${st("done")} · รอ ${st("new")} · ยกเลิก ${st("cancelled")}`;
  });

  add("บิลชี้ไปที่โต๊ะและเมนูที่มีอยู่จริง (UID)", () => {
    const db = fsLoad();
    const orders = docsOf(db, "orders");
    let miss = 0;
    for (const o of orders) {
      if (!db["tables/" + o.token]) throw new Error(`บิล ${o.id} อ้างโต๊ะที่ไม่มี`);
      for (const l of o.items) if (!db["menu/" + l.menuId]) miss++;
    }
    return miss ? `⚠ ${miss} บรรทัดอ้างเมนูที่ถูกลบไปแล้ว (ยอดย้อนหลังยังอยู่ครบ)` : "ทุกบรรทัดตรงกับ UID เมนู";
  });

  add("ค้นบิลรายวันด้วย query เดียวกับจอหลังร้าน", async () => {
    const orders = docsOf(fsLoad(), "orders");
    const days = [...new Set(orders.map(o => dayKey(new Date(tsOf(o)))))].slice(-3);
    for (const k of days) {
      const { from, to } = dayRange(new Date(k + "T12:00:00"));
      const snap = await getDocs(query(collection(db, "orders"),
        where("createdAt", ">=", from), where("createdAt", "<", to), orderBy("createdAt", "desc")));
      eq(snap.size, orders.filter(o => dayKey(new Date(tsOf(o))) === k).length, `จำนวนบิลวันที่ ${k}`);
    }
    return `ตรง ${days.length} วัน`;
  });

  add("สถิติรายวัน = รวมจากบิลจริง (ไม่นับบิลยกเลิก)", () => {
    const db = fsLoad();
    const orders = docsOf(db, "orders"), stats = docsOf(db, "stats");
    if (!stats.length) throw new Error("ยังไม่มีสถิติ");
    for (const s of stats) {
      const live = orders.filter(o => dayKey(new Date(tsOf(o))) === s.day && o.status !== "cancelled");
      eq(s.bills, live.length, `จำนวนบิล ${s.day}`);
      eq(s.total, live.reduce((a, o) => a + o.total, 0), `ยอดขาย ${s.day}`);
      const qty = {};
      for (const o of live) for (const l of o.items) qty[l.menuId] = (qty[l.menuId] || 0) + l.qty;
      for (const [uid, v] of Object.entries(s.items || {})) eq(v.qty, qty[uid], `จำนวนขาย ${v.name} ${s.day}`);
    }
    const tot = stats.reduce((a, s) => a + s.total, 0);
    return `${stats.length} วัน · รวม ${baht(tot)} บาท`;
  });

  add("ยอดแยกตามเมนูรวมกัน = ยอดขายทั้งวัน", () => {
    for (const s of docsOf(fsLoad(), "stats"))
      eq(Object.values(s.items || {}).reduce((a, v) => a + v.amt, 0), s.total, `ยอดเมนูรวม ${s.day}`);
    return "ตรงทุกวัน";
  });

  add("ไฟล์ Excel รายวัน: บิลครบ สูตรชี้แถวถูก", () => {
    const orders = docsOf(fsLoad(), "orders").map(o => ({ ...o, createdAt: new Timestamp(tsOf(o)) }));
    const y = new Date(); y.setDate(y.getDate() - 1);
    const k = dayKey(y);
    const list = orders.filter(o => dayKey(o.createdAt.toDate()) === k);
    const live = list.filter(o => o.status !== "cancelled");
    if (!live.length) throw new Error(`เมื่อวาน (${k}) ไม่มีบิล`);
    const csv = toCsv(dayReportRows(k, shop(), list));
    if (csv.charCodeAt(0) !== 0xFEFF) throw new Error("ไม่มี BOM — Excel จะอ่านไทยเพี้ยน");
    const rows = parseCsv(csv);
    eq(rows[3][0], "เวลา", "หัวตาราง");
    const bills = rows.slice(4, 4 + live.length);
    eq(bills.reduce((a, r) => a + Number(r[5]), 0), live.reduce((a, o) => a + o.total, 0), "ผลรวมคอลัมน์ยอด");
    eq(rows[4 + live.length][5], `=SUM(F5:F${4 + live.length})`, "สูตรรวมทั้งวัน");
    return `${k}: ${live.length} บิล · ${rows.length} แถว`;
  });

  add("ไฟล์ Excel รายเดือน: ครบทุกวัน ยอดตรงสถิติ", () => {
    const stats = docsOf(fsLoad(), "stats");
    const mk = monthKey(new Date());
    const rowsIn = stats.filter(s => s.month === mk);
    if (!rowsIn.length) throw new Error("เดือนนี้ยังไม่มีสถิติ");
    const rows = parseCsv(toCsv(monthReportRows(mk, shop(), rowsIn)));
    const days = rows.slice(4, 4 + rowsIn.length);
    eq(days.length, rowsIn.length, "จำนวนวัน");
    eq(days.reduce((a, r) => a + Number(r[3]), 0), rowsIn.reduce((a, s) => a + s.total, 0), "ยอดรวมเดือน");
    eq(rows[4 + rowsIn.length][3], `=SUM(D5:D${4 + rowsIn.length})`, "สูตรรวมเดือน");
    return `${monthLabel(mk)}: ${rowsIn.length} วัน`;
  });

  add("อักขระพิเศษใน Excel (ลูกน้ำ ฟันหนู ขึ้นบรรทัด)", () => {
    const src = ["ข้าว, ไข่ดาว", 'เผ็ด "มาก"', "บรรทัด1\nบรรทัด2", "ပုစွန်"];
    const back = parseCsv(toCsv([src]))[0];
    src.forEach((v, i) => eq(back[i], v, `ช่องที่ ${i + 1}`));
    return "อ่านกลับได้ตรงทุกช่อง";
  });

  add("ปุ่มลบบิลเก่ากว่า 1 ปี เลือกเฉพาะบิลเก่า", async () => {
    const db0 = fsLoad();
    const old = Date.now() - 400 * 86400000;
    for (let i = 0; i < 3; i++)
      db0["orders/old_" + i] = { token: "x", table: 1, items: [], total: 0, status: "done", createdAt: { __ts: old + i } };
    fsSave(db0);
    try {
      const cut = new Date(); cut.setFullYear(cut.getFullYear() - 1);
      const snap = await getDocs(query(collection(db, "orders"),
        where("createdAt", "<", Timestamp.fromDate(cut)), orderBy("createdAt", "asc")));
      eq(snap.size, 3, "บิลที่จะถูกลบ");
      if (snap.docs.some(d => !d.id.startsWith("old_"))) throw new Error("เลือกบิลใหม่ไปด้วย");
      return "เลือกเฉพาะบิลอายุเกิน 1 ปี · บิลใหม่ไม่โดน";
    } finally {
      const db1 = fsLoad();
      for (let i = 0; i < 3; i++) delete db1["orders/old_" + i];
      fsSave(db1);
    }
  });

  add("ขนาดข้อมูลและโควตาฟรี (ข้อมูลประกอบ)", () => {
    const db = fsLoad();
    const orders = docsOf(db, "orders"), menu = docsOf(db, "menu");
    const avgOrder = orders.reduce((a, o) => a + JSON.stringify(o).length, 0) / Math.max(1, orders.length);
    const menuBytes = menu.reduce((a, m) => a + JSON.stringify(m).length, 0);
    const ceil = Math.round(10 * GiB / (1.2 * menuBytes * 30));
    const yearMB = avgOrder * 1.5 * 1000 * 365 / 1024 / 1024;   // ×1.5 = index + overhead ของ Firestore
    return `บิลละ ~${Math.round(avgOrder)} B · เมนูทั้งชุด ${Math.round(menuBytes / 1024)} KB · ` +
           `เพดานโหลดเมนู ~${baht(ceil)} บิล/วัน · 1,000 บิล/วัน × 1 ปี ≈ ${Math.round(yearMB)} MB จาก 1 GB`;
  });
  return T;
}

/* ---------------- หน้าจอ ---------------- */
function counts() {
  const db = fsLoad();
  return { orders: docsOf(db, "orders").length, stats: docsOf(db, "stats").length, menu: docsOf(db, "menu").length };
}

function logTable() {
  const orders = docsOf(fsLoad(), "orders").sort((a, b) => tsOf(b) - tsOf(a)).slice(0, 25);
  if (!orders.length) return `<div class="empty">ยังไม่มีบิล</div>`;
  const st = { new: "รอเสิร์ฟ", done: "เสิร์ฟแล้ว", cancelled: "ยกเลิก" };
  return `<div style="overflow-x:auto"><table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px">
    <tr style="text-align:left;color:var(--muted)"><th>วันที่ เวลา</th><th>โต๊ะ</th><th>รายการ</th><th style="text-align:right">ยอด</th><th>สถานะ</th></tr>
    ${orders.map(o => { const d = new Date(tsOf(o)); return `<tr style="border-top:1px solid var(--line)">
      <td style="white-space:nowrap;padding:6px 8px 6px 0">${dayKey(d)} ${hhmm(d)}</td><td>${o.table}</td>
      <td>${esc(o.items.map(l => `${l.name} x${l.qty}`).join(", "))}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${baht(o.total)}</td>
      <td>${st[o.status] || o.status}</td></tr>`; }).join("")}
  </table></div>`;
}

function render(results) {
  const c = counts();
  const pass = results ? results.filter(r => r.ok).length : 0;
  view.innerHTML = `
  <div class="page">
    <div class="phead"><div><h1>ทดสอบระบบ</h1>
      <p class="hint">สร้างบิลจำลองย้อนหลัง แล้วตรวจว่าบันทึกบิล สถิติ และไฟล์ Excel ถูกต้อง — ใช้โค้ดจริงของระบบ
      ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น ไม่แตะฐานข้อมูลจริง</p></div></div>

    <div class="kpis">
      <div class="kpi"><div class="k">เมนู</div><div class="v">${c.menu}</div></div>
      <div class="kpi"><div class="k">บิลทั้งหมด</div><div class="v">${baht(c.orders)}</div></div>
      <div class="kpi"><div class="k">วันที่มีสถิติ</div><div class="v">${c.stats}</div></div>
      <div class="kpi"><div class="k">ผลทดสอบ</div><div class="v">${results ? `${pass}/${results.length}` : "—"}</div></div>
    </div>

    <h2 class="sec">1. สร้างบิลทดสอบ</h2>
    <div class="card" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <label>ย้อนหลัง <input class="fld num" id="gDays" type="number" min="1" max="60" value="30" style="width:80px"> วัน</label>
      <label>เฉลี่ย <input class="fld num" id="gPer" type="number" min="5" max="300" value="80" style="width:90px"> บิล/วัน</label>
      <button class="btn" id="gen">สร้างบิลทดสอบ</button>
      <span class="hint" id="gMsg">สร้างใหม่ทับชุดเดิม · บิลที่สั่งเองจากหน้าลูกค้ายังอยู่</span>
    </div>

    <h2 class="sec">2. รันชุดทดสอบ</h2>
    <div class="card">
      <button class="btn" id="run">▶ รันทั้งหมด</button>
      ${results ? `<ol style="margin:14px 0 0;padding-left:22px;line-height:1.7">${results.map(r => `
        <li><b style="color:${r.ok ? "var(--ok,#15803d)" : "var(--chili,#b91c1c)"}">${r.ok ? "✓ ผ่าน" : "✗ ไม่ผ่าน"}</b>
          ${esc(r.name)}<br><span class="hint">${esc(r.detail)}</span></li>`).join("")}</ol>` : ""}
    </div>

    <h2 class="sec">3. ดาวน์โหลดไฟล์ Excel ตัวอย่าง</h2>
    <div class="card" style="display:flex;flex-wrap:wrap;gap:8px">
      <button class="btn ghost" data-x="today">⭳ บิลวันนี้</button>
      <button class="btn ghost" data-x="yday">⭳ บิลเมื่อวาน</button>
      <button class="btn ghost" data-x="month">⭳ ยอดรายเดือน (เดือนนี้)</button>
      <span class="hint">หรือไปที่แท็บ "ยอดขาย" ด้านบน เพื่อดูกราฟและปุ่มดาวน์โหลดของจริง</span>
    </div>

    <h2 class="sec">4. บันทึกบิลล่าสุด (log) 25 ใบ</h2>
    <div class="card">${logTable()}</div>
  </div>`;

  document.getElementById("gen").onclick = () => {
    const msg = document.getElementById("gMsg");
    try {
      const n = generate(+document.getElementById("gDays").value || 30, +document.getElementById("gPer").value || 80);
      render(); document.getElementById("gMsg").textContent = `สร้างแล้ว ${baht(n)} บิล`;
    } catch (e) { msg.textContent = e.message; }
  };
  document.getElementById("run").onclick = async () => {
    const out = [];
    for (const t of tests()) {
      try { out.push({ name: t.name, ok: true, detail: (await t.run()) || "" }); }
      catch (e) { out.push({ name: t.name, ok: false, detail: e.message }); }
    }
    window.__selftest = out;                 // ให้สคริปต์ภายนอกอ่านผลได้
    render(out);
  };
  view.querySelectorAll("[data-x]").forEach(b => b.onclick = () => {
    const db0 = fsLoad();
    const orders = docsOf(db0, "orders").map(o => ({ ...o, createdAt: new Timestamp(tsOf(o)) }));
    const day = new Date(); if (b.dataset.x === "yday") day.setDate(day.getDate() - 1);
    if (b.dataset.x === "month") {
      const mk = monthKey(new Date());
      return downloadCsv(`ยอดขาย-${mk}.csv`, monthReportRows(mk, shop(), docsOf(db0, "stats").filter(s => s.month === mk)));
    }
    const k = dayKey(day);
    downloadCsv(`บิล-${k}.csv`, dayReportRows(k, shop(), orders.filter(o => dayKey(o.createdAt.toDate()) === k)));
  });
}

render();
