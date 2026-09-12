// สรุปยอดขายรายวันเก็บเป็น doc ละวัน (stats/2026-09-09)
//
// ทำไมต้องมี: Firestore ไม่มี GROUP BY — ถ้า dashboard รายเดือนไปไล่อ่านออเดอร์ดิบ
// จะกินโควตาอ่านหลักหมื่นต่อการเปิดหนึ่งครั้ง แบบนี้อ่านแค่ 30 doc ต่อเดือน
//
// ponytail: คำนวณใหม่ทั้งวันแล้ว set ทับ ไม่ใช้ increment
// เพราะ increment จะเพี้ยนเมื่อบิลถูกยกเลิกหรือแก้ทีหลัง ส่วน set ทับถูกเสมอ
// (ต้นทุน 1 write ต่อการเปลี่ยนแปลง ~600 writes/วัน จากโควตา 20,000)
import { db, doc, setDoc, dayKey, monthKey } from "./core.js";

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
