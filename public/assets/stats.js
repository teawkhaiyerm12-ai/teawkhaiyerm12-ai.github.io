// สรุปยอดขายรายวันเก็บเป็น doc ละวัน (stats/2026-09-09)
//
// ทำไมต้องมี: Firestore ไม่มี GROUP BY — ถ้า dashboard รายเดือนไปไล่อ่านออเดอร์ดิบ
// จะกินโควตาอ่านหลักหมื่นต่อการเปิดหนึ่งครั้ง แบบนี้อ่านแค่ 30 doc ต่อเดือน
//
// ponytail: คำนวณใหม่ทั้งวันแล้ว set ทับ ไม่ใช้ increment
// เพราะ increment จะเพี้ยนเมื่อบิลถูกยกเลิกหรือแก้ทีหลัง ส่วน set ทับถูกเสมอ
// (ต้นทุน 1 write ต่อการเปลี่ยนแปลง ~600 writes/วัน จากโควตา 20,000)
import { db, doc, setDoc, dayKey, monthKey, hhmm, monthLabel, TH_DAY } from "./core.js";

let timer = null;

// items คีย์ด้วย menuId (UID ของเมนู) ไม่ใช่ชื่อ
// ผู้จัดการแก้ชื่อเมนูตอนไหนก็ได้ ยอดสะสมของเมนูนั้นต้องไม่แตกเป็นสองก้อน
// เก็บ name ล่าสุดไว้ในตัวเรคคอร์ดเพื่อเอาไปแสดง ไม่ต้อง join กลับไปที่ collection menu
export function summarize(orders) {
  const live = orders.filter(o => (o.status || "new") !== "cancelled");
  const items = {};
  for (const o of live) {
    for (const l of (o.items || [])) {
      const key = l.menuId || "unknown";
      const r = items[key] || (items[key] = { name: l.name, qty: 0, amt: 0 });
      r.name = l.name;
      r.qty += l.qty;
      r.amt += l.qty * l.price;
    }
  }
  return {
    bills: live.length,
    total: live.reduce((a, o) => a + (o.total || 0), 0),
    items,
  };
}

/** เรียกได้บ่อยเท่าไหร่ก็ได้ — รวบให้เหลือ write เดียวทุก 3 วินาที */
export function writeStats(orders, when = new Date()) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const day = dayKey(when);
    try {
      await setDoc(doc(db, "stats", day), {
        day,
        month: monthKey(when),
        ...summarize(orders),
        updatedAt: new Date().toISOString(),
      });
    } catch (_) {
      // เขียนสรุปไม่สำเร็จไม่ควรทำให้หน้าจอครัวพัง — รอบหน้าจะเขียนทับให้ถูกเอง
    }
  }, 3000);
}

/* ---------------- แถวของไฟล์ Excel (CSV) ----------------
   อยู่ที่นี่ ไม่ใช่ในหน้า report — หน้าทดสอบระบบเรียกตัวเดียวกันได้ จะได้ทดสอบของจริง */

/** รวมยอดตามเมนูจาก stats หลายวัน (คีย์ด้วย menuId — เปลี่ยนชื่อกลางเดือนยังเป็นก้อนเดียว) */
export function rankFromStats(rows) {
  const agg = {};
  for (const r of rows) for (const [uid, v] of Object.entries(r.items || {})) {
    const a = agg[uid] || (agg[uid] = { name: v.name || uid, qty: 0, amt: 0 });
    if (v.name) a.name = v.name;
    a.qty += v.qty; a.amt += v.amt;
  }
  return Object.entries(agg).sort((a, b) => b[1].amt - a[1].amt);
}

/** บิลรายใบของวันหนึ่ง + สรุปตามเมนู — ใช้ทั้ง "ยอดวันนี้" และ "บิลย้อนหลังรายวัน" */
export function dayReportRows(day, shop, orders) {
  const at = o => o.at || o.createdAt?.toDate?.() || null;
  const live = orders.filter(o => (o.status || "new") !== "cancelled")
    .sort((a, b) => (at(a) || 0) - (at(b) || 0));
  const rank = Object.entries(summarize(orders).items).sort((a, b) => b[1].amt - a[1].amt);
  const bFirst = 5, bLast = 4 + live.length, bTotal = bLast + 1, bCount = bLast + 2;
  const mHdr = bLast + 4, mFirst = mHdr + 1, mLast = mHdr + rank.length, mTotal = mLast + 1;
  return [
    ["รายงานยอดขายรายวัน", shop],
    ["วันที่", day],
    [],
    ["เวลา", "โต๊ะ", "สถานะ", "รายการ", "จำนวนชิ้น", "ยอด (บาท)"],
    ...live.map(o => [
      hhmm(at(o)), o.table, o.status === "done" ? "เสิร์ฟแล้ว" : "รอเสิร์ฟ",
      (o.items || []).map(l => `${l.name} x${l.qty}`).join(" + "),
      (o.items || []).reduce((a, l) => a + l.qty, 0), o.total,
    ]),
    ["รวมทั้งวัน", "", "", "", `=SUM(E${bFirst}:E${bLast})`, `=SUM(F${bFirst}:F${bLast})`],
    ["จำนวนบิล", `=COUNT(F${bFirst}:F${bLast})`],
    ["เฉลี่ยต่อบิล (บาท)", `=F${bTotal}/B${bCount}`],
    [],
    ["รหัสเมนู (UID)", "เมนู", "จำนวนที่ขาย", "ยอดเงิน (บาท)", "สัดส่วนยอดขาย (%)"],
    ...rank.map(([uid, r], i) => [uid, r.name, r.qty, r.amt, `=D${mFirst + i}/$D$${mTotal}*100`]),
    ["รวม", "", `=SUM(C${mFirst}:C${mLast})`, `=SUM(D${mFirst}:D${mLast})`, `=SUM(E${mFirst}:E${mLast})`],
  ];
}

/** ยอดรายวันทั้งเดือน + สรุปตามเมนู จาก stats ของเดือนนั้น */
export function monthReportRows(month, shop, rows) {
  rows = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const rankAll = rankFromStats(rows);
  const bills = rows.reduce((a, r) => a + (r.bills || 0), 0);
  const dFirst = 5, dLast = 4 + rows.length, dTotal = dLast + 1;
  const mHdr = dLast + 5, mFirst = mHdr + 1, mLast = mHdr + rankAll.length, mTotal = mLast + 1;
  return [
    ["รายงานยอดขายรายเดือน", shop],
    ["เดือน", monthLabel(month)],
    [],
    ["วันที่", "วัน", "จำนวนบิล", "ยอดขาย (บาท)", "เฉลี่ยต่อบิล (บาท)"],
    ...rows.map((r, i) => [
      r.day, TH_DAY[new Date(r.day + "T12:00:00").getDay()], r.bills, r.total,
      r.bills ? `=D${dFirst + i}/C${dFirst + i}` : "",
    ]),
    ["รวมทั้งเดือน", "", `=SUM(C${dFirst}:C${dLast})`, `=SUM(D${dFirst}:D${dLast})`,
      bills ? `=D${dTotal}/C${dTotal}` : ""],
    ["เฉลี่ยต่อวัน", "", `=AVERAGE(C${dFirst}:C${dLast})`, `=AVERAGE(D${dFirst}:D${dLast})`],
    ["ยอดขายสูงสุดในหนึ่งวัน", "", "", `=MAX(D${dFirst}:D${dLast})`],
    [],
    ["รหัสเมนู (UID)", "เมนู", "จำนวนที่ขาย", "ยอดเงิน (บาท)", "สัดส่วนยอดขาย (%)"],
    ...rankAll.map(([uid, r], i) => [uid, r.name, r.qty, r.amt, `=D${mFirst + i}/$D$${mTotal}*100`]),
    ["รวม", "", `=SUM(C${mFirst}:C${mLast})`, `=SUM(D${mFirst}:D${mLast})`, `=SUM(E${mFirst}:E${mLast})`],
  ];
}
