// สร้างไฟล์ตารางที่ Excel เปิดได้ตรง ๆ
//
// - ต้องมี BOM (﻿) นำหน้า ไม่งั้น Excel อ่านภาษาไทยเป็นตัวขยะ
// - ตัวเลขเขียนดิบ ไม่ใส่ลูกน้ำคั่นหลัก จะได้เอาไป SUM ต่อได้
// - สูตรใช้เฉพาะฟังก์ชันอาร์กิวเมนต์เดียว (SUM/AVERAGE/MAX/COUNT) กับ + - * /
//   จะได้ไม่มีลูกน้ำในสูตร เครื่องที่ตั้ง list separator เป็น ; ก็เปิดได้
export function toCsv(rows) {
  const cell = v => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
