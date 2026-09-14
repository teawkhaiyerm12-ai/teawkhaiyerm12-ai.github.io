// ============================================================
//  ไฟล์เดียวที่ต้องแก้ตอนขึ้นระบบจริง
//  ค่าพวกนี้ไม่ใช่ความลับ — Firebase ออกแบบมาให้เปิดเผยได้
//  ความปลอดภัยอยู่ที่ firestore.rules กับ App Check
// ============================================================

// Firebase Console > Project settings > General > Your apps > Web app > Config
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCJiZr7Nu9HrNzIy9YfVadICh1_0OkRfnY",
  authDomain: "qr-menu-1234c.firebaseapp.com",
  projectId: "qr-menu-1234c",
  storageBucket: "qr-menu-1234c.firebasestorage.app",
  messagingSenderId: "2987114356",
  appId: "1:2987114356:web:caa491545a781702753621",
  // ponytail: measurementId ตัดออก ระบบไม่ได้ใช้ Analytics (ไม่ต้องมี cookie banner)
};

// Firebase Console > App Check > Apps > reCAPTCHA v3 site key
// เว้นว่างไว้ = ไม่เปิด App Check (ใช้ตอนพัฒนาได้ แต่ก่อนเปิดร้านจริงต้องใส่)
export const RECAPTCHA_SITE_KEY = "";

// ตอนพัฒนาในเครื่อง ตั้ง true แล้วรัน `firebase emulators:start`
// จะได้ไม่ไปยิงฐานข้อมูลจริง
export const USE_EMULATOR = false;

// รูปเมนูเก็บเป็น data URI ใน Firestore (ไม่ใช้ Cloud Storage ที่ต้องผูกบัตร)
//
// ค่าพวกนี้ตั้งจากการวัดรูปอาหารจริง 20 รูป (tools/make-mobile-compare.py):
//   240px q0.55 webp -> เฉลี่ย 10.5 KB/รูป  เมนู 20 รายการ = 288 KB  รับได้ ~1,010 บิล/วัน
//   320px q0.62 jpeg -> เฉลี่ย 19.8 KB/รูป  เมนู 20 รายการ = 506 KB  รับได้ ~576 บิล/วัน
//   420px q0.75 jpeg -> เฉลี่ย 54.7 KB/รูป  ชนเพดาน ระบบต้องลดคุณภาพเอง เหลือ ~265 บิล/วัน
//
// รูปแสดงในเมนูที่ 82px — 240px ยังเหลือเผื่อจอ 3x (246px) พอดี
// ที่ขนาดจริงบนมือถือแยกไม่ออกจาก 320px ต้องซูม 6 เท่าถึงจะเห็นต่าง
// อยากได้รูปคมขึ้นแลกกับโควตา: ดูตารางเทียบใน README หัวข้อ "เรื่องโควตา"
export const IMAGE_MAX_PX = 240;
export const IMAGE_QUALITY = 0.55;
export const IMAGE_MAX_BYTES = 40 * 1024;

// พนักงานพิมพ์แค่ชื่อผู้ใช้ (เช่น admin12) ระบบเติมโดเมนนี้ให้เอง
// Firebase Auth รับเฉพาะ email format แต่ไม่ได้ส่งเมลยืนยัน โดเมนปลอมจึงใช้ได้
// ผลข้างเคียง: กด "ลืมรหัสผ่าน" ทางอีเมลไม่ได้ ต้องรีเซ็ตที่ Firebase Console
export const LOGIN_DOMAIN = "qrmenu.local";
