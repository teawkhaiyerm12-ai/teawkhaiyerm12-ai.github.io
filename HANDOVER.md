# โต๊ะ QR — Engineering Handover

> เอกสารส่งต่อสำหรับ dev ที่จะรับงานไปทำต่อ
> อ่าน `README.md` ก่อนถ้าต้องการขั้นตอน deploy — ไฟล์นี้เน้น **ทำไมถึงออกแบบแบบนี้** และ **จุดที่จะกัดถ้าไม่รู้**
>
> comment ในโค้ดเป็นภาษาไทยทั้งหมด เอกสารนี้ใช้ภาษาเดียวกันเพื่อให้ต่อเนื่องกัน
> สถานะ: โค้ดหลักเสร็จ ยังไม่เคยรันกับ Firebase project จริง (ดูหัวข้อ 9)

---

## 1. ระบบนี้คืออะไร

ระบบสั่งอาหารผ่าน QR สำหรับร้านอาหารเล็ก **1 สาขา** ประมาณ 20 โต๊ะ / 300 บิลต่อวัน

- **ลูกค้า** ไม่ล็อกอิน สแกน QR ที่โต๊ะ → `/t/<token>` → เห็นเมนู+ราคา → กดสั่ง
- **Admin** ล็อกอิน → เห็นออเดอร์สด แก้บิล จัดการเมนู ดูยอดขาย ปริ้น QR

ข้อจำกัดสำคัญที่กำหนดทุกการตัดสินใจ: **ต้องอยู่บนแผน Firebase Spark ที่ไม่ผูกบัตร**
เพราะระบบจะถูกส่งมอบให้เจ้าของร้าน ซึ่งไม่ควรมีความเสี่ยงเรื่องบิลบานปลาย

---

## 2. Decision log

### 2.1 ทำไมเป็น static HTML ไม่ใช่ Next.js

เอกสารออกแบบรอบแรกเลือก Next.js + Supabase ภายหลังเปลี่ยนเป็น static + Firebase เพราะ:

- Firebase Hosting รันได้แค่ static — Next.js ที่มี SSR ต้อง Cloud Functions ซึ่ง **ต้องอัป Blaze**
- ทุก data path เป็น client-side Firestore อยู่แล้ว ไม่มีอะไรต้องรันฝั่ง server
- ไม่มี build step = ไม่มี toolchain ให้เน่า เจ้าของร้านหรือ dev คนถัดไปเปิดไฟล์แก้ได้ทันที
- deploy = `git push` จบ

**ราคาที่จ่าย:** ไม่มี component system, ไม่มี type checking, DOM สร้างด้วย template string
ถ้าโตเกิน ~10 หน้าเมื่อไหร่ ควรย้ายไป Vite + framework แต่ตอนนี้มี 5 หน้า

### 2.2 ทำไม Firestore ไม่ใช่ Postgres

เอกสารออกแบบเดิมเลือก Postgres เพราะรายงานคือ `GROUP BY` บรรทัดเดียว
ผู้ใช้เลือก Firebase เพราะต้องการฟรี 100% ผลคือต้องยอมแลก:

| เสียไป | ชดเชยด้วย |
|---|---|
| ไม่มี `GROUP BY` | pre-aggregate ลง `stats/{YYYY-MM-DD}` (ดู 5.3) |
| ไม่มี transaction ข้าม doc แบบ SQL | ไม่จำเป็น — 1 บิล = 1 doc เดียว |
| ไม่มี foreign key | ยอมรับ orphan ได้ ข้อมูลไม่ critical |
| validate ราคาฝั่ง server ไม่ได้ (rules วนลูป array ไม่ได้) | ตรวจที่จอหลังร้าน + เก็บเงินที่เคาน์เตอร์ (ดู 6.6) |

### 2.3 ทำไมรูปเมนูเป็น data URI ใน Firestore

**ตั้งแต่ 3 ก.พ. 2026 Cloud Storage for Firebase ถูกถอดออกจากแผน Spark**
สร้าง bucket ต้องมี billing account ผูก แม้ใช้ไม่ถึงโควตาฟรี → ขัดกับข้อจำกัดหลัก

จึงเก็บรูปเป็น `data:image/jpeg;base64,...` ใน field `img` ของ `menu/{id}`
`shrinkImage()` ใน `core.js` บีบจนไม่เกิน `IMAGE_MAX_BYTES` (40 KB) โดยวนลด JPEG quality

**นี่คือ constraint ที่แท้จริงของระบบ** ดูหัวข้อ 7

---

## 3. Repo map

```
firebase.json          Hosting config — จุดสำคัญคือ rewrite /t/** → /t/index.html
                       และ cleanUrls: true (ทำให้ /admin/menu.html เข้าถึงได้ที่ /admin/menu)
firestore.rules        ด่านความปลอดภัยตัวจริง — เปลี่ยนอะไรต้อง deploy แยกจาก hosting
.firebaserc            project id
.github/workflows/deploy.yml   push main → firebase deploy hosting + rules

public/assets/
  config.js       ค่าคอนฟิกทั้งหมด จุดเดียวที่ต้องแก้ตอนย้าย environment
  core.js         ★ จุดเดียวในระบบที่ import Firebase SDK — ไฟล์อื่น import ต่อจากที่นี่
                  รวม helper: baht/esc/dayKey/withTimeout/toast/friendlyError
                  + settings (ชื่อร้าน+ธีม) + shrinkImage + requireAdmin + renderAdminChrome
  app.css         ธีมสี 3 ชุด × light/dark + ทุก component
  customer.js     หน้าลูกค้า
  admin-orders.js ล็อกอิน + กระดานออเดอร์
  admin-menu.js   ตั้งค่าร้าน + CRUD เมนู
  admin-report.js ยอดวันนี้ + รายเดือน + export
  admin-tables.js โต๊ะ + QR
  stats.js        สรุปยอดรายวัน
  csv.js          สร้าง CSV ที่ผูกสูตร Excel
```

**กฎที่ต้องรักษา:** ห้ามให้ไฟล์อื่น import จาก gstatic ตรง ๆ ให้ผ่าน `core.js` เท่านั้น
อัปเวอร์ชัน SDK = แก้ 3 บรรทัดบนสุดของ `core.js` ที่เดียว

---

## 4. Data model

```
settings/shop              { name: string, palette: "" | "red" | "green" }
menu/{autoId}              { name, price:number, cat, sort:number,
                             emoji, img: dataURI|null, soldout: boolean }
tables/{token}             { no:int, active:boolean, createdAt: ISO string }
orders/{autoId}            { token, table:int, items: Line[], total:number,
                             status: "new"|"done"|"cancelled",
                             createdAt: Timestamp, edited?: boolean }
stats/{YYYY-MM-DD}         { day, month, total, bills,
                             items: { [name]: { qty, amt } }, updatedAt }

Line = { menuId, name, price, qty }
```

### Invariant ที่ห้ามพัง

1. **`Line.price` คือราคา ณ ตอนสั่ง** ห้าม join กลับไปอ่าน `menu` ตอนทำรายงาน
   ไม่งั้นขึ้นราคาวันนี้แล้วยอดขายเดือนที่แล้วเปลี่ยนตาม

2. **`tables` doc id คือ token** ไม่ใช่เลขโต๊ะ — เลขโต๊ะอยู่ใน field `no`
   token คือความลับตัวเดียวที่กันคนนอกเปิดเมนู ต้อง `crypto.randomUUID()` เท่านั้น
   **QR ที่ปริ้นไปแล้วเปลี่ยน token ไม่ได้** ลบ doc = QR ใบนั้นตายทันที

3. **status machine**
   ```
   new ──(เสิร์ฟแล้ว)──> done ──(ย้อนกลับ)──> new
    │                                          
    ├──(ยกเลิกบิล)──> cancelled ──(เรียกคืน)──> new
    │
    └──(ลบรายการจนหมด)──> cancelled   [items = [], total = 0 → เรียกคืนไม่ได้]
   ```
   - แก้ items ได้เฉพาะตอน `new` — บังคับทั้งใน UI และใน rules
   - `cancelled` ไม่ถูกนับใน `summarize()` ทุกกรณี

4. **`stats/{day}` เป็น derived data เสมอ** สร้างใหม่จาก orders ของวันนั้นได้ตลอด
   ถ้าเพี้ยนให้ลบทิ้งแล้วเปิดหน้า `/admin` ของวันนั้นใหม่ ระบบจะเขียนทับให้

---

## 5. Data flow

### 5.1 ลูกค้าสั่งอาหาร

```
scan QR → GET /t/<token>
  ↓ firebase.json rewrite → /t/index.html
customer.js:
  readToken()                     path segment ที่ 2 (fallback ?t= สำหรับ dev)
  getDoc(tables/<token>)          + withTimeout 12s
    ├ ไม่มี / active=false → screenMsg("QR นี้ใช้ไม่ได้แล้ว")
    └ มี → tableNo
  getDocs(menu)                   อ่านทั้งคอลเลกชัน sort ฝั่ง client
  render → cart อยู่ใน Map ในหน่วยความจำ ไม่แตะ DB
  submit → addDoc(orders, {...status:'new', createdAt: serverTimestamp()})
```

### 5.2 จอหลังร้าน

```
admin-orders.js:
  currentUser()  → null → login()  |  user → board()
  onSnapshot(orders where createdAt in [วันนี้) orderBy desc)
    → paint()
    → writeStats(orders)          debounce 3s
  ปุ่มแก้ → updateDoc → snapshot กลับมา → paint + writeStats อีกรอบ
```

**เจตนา:** ทุก mutation ไปทาง Firestore แล้วรอ snapshot กลับมา ไม่มี optimistic local state
ทำให้หลายเครื่อง (แคชเชียร์ + ครัว) เห็นตรงกันเสมอ

### 5.3 รายงาน

- **วันนี้** — subscribe orders ของวันนี้ตรง ๆ แล้ว `summarize()` ฝั่ง client
- **รายเดือน** — `getDocs(stats where month == "YYYY-MM")` ได้ ≤31 doc
  เทียบเดือนก่อนอีก 1 query, cache ใน `Map` ต่อการโหลดหน้า

**ห้ามเปลี่ยนหน้ารายเดือนไปอ่าน orders ดิบ** จะกลายเป็นหลักหมื่น reads ต่อการเปิดหนึ่งครั้ง

---

## 6. Security model

### 6.1 หลักการ

`apiKey` และโค้ด JS ทั้งหมดเปิดอ่านได้ — ถือว่าปกติสำหรับ Firebase
ด่านจริงมี 2 ชั้นเท่านั้น: **Firestore Security Rules** และ **App Check**
โค้ดฝั่ง client (`requireAdmin()`) เป็นเรื่อง UX ล้วน ไม่นับเป็นความปลอดภัย

### 6.2 Admin allowlist — ข้อที่พลาดกันบ่อยที่สุด

```
function isAdmin() {
  return request.auth != null
      && request.auth.uid in ['PASTE_UID_OWNER'];
}
```

ถ้าเขียนแค่ `request.auth != null` ใครก็เรียก `createUserWithEmailAndPassword`
ด้วย apiKey ที่อ่านจากหน้าเว็บ สมัครบัญชีเอง แล้วกลายเป็น admin ทันที
ระบบนี้จึง **ไม่มีหน้าสมัครสมาชิก** และบัญชีสร้างจาก Firebase Console เท่านั้น

เพิ่มพนักงาน = เติม uid ในอาร์เรย์ แล้ว `firebase deploy --only firestore:rules`
ถ้าพนักงานเปลี่ยนบ่อยจนทนไม่ไหว ค่อยย้ายไป custom claims (ต้องรัน Admin SDK สคริปต์ ไม่ต้องใช้ Blaze)

### 6.3 `get` vs `list` บน `tables`

```
allow get:  if true;      // เปิดได้ถ้ารู้ token
allow list: if isAdmin(); // ไล่ดูทั้งคอลเลกชันไม่ได้
```

นี่คือกลไกที่ทำให้ token เป็นความลับได้จริง ถ้าเปิด `list` คนนอกดึงรายชื่อ token ทั้งร้านได้ในคำสั่งเดียว

### 6.4 ลูกค้าเขียนได้ แต่อ่านไม่ได้

```
allow create: if isValidNewOrder();
allow get, list, delete: if isAdmin();
allow update: if isAdmin() && resource.data.status != 'done';
```

Firestore แยก `create`/`read`/`update` คนละบรรทัดได้ → "สั่งได้ แต่ดูออเดอร์คนอื่นไม่ได้ แม้แต่ของตัวเอง"
`status != 'done'` ทำให้บิลที่ปิดแล้วแก้ไม่ได้แม้ยิงตรงผ่าน console

### 6.5 การ validate ออเดอร์

`isValidNewOrder()` เช็ค: token มีจริง (`exists()` = 1 read/บิล) · `keys().hasOnly` + `hasAll`
· `status == 'new'` · `createdAt == request.time` · เพดาน items 1–30 · total ≤ 20000

`createdAt == request.time` **บังคับให้ client ต้องส่ง `serverTimestamp()`**
ส่ง `new Date()` มาจะถูกปฏิเสธทันที — กันปลอมเวลาให้รายงานเพี้ยน

### 6.6 ช่องที่ยังเปิดอยู่โดยตั้งใจ: ราคา

rules วนลูป array ไม่ได้ จึงตรวจ `items[].price` ทีละรายการไม่ได้
ปัจจุบันรับความเสี่ยงนี้เพราะ **เก็บเงินที่เคาน์เตอร์** ราคาที่ลูกค้าแก้ไม่ทำให้จ่ายน้อยลง แค่ทำรายงานเพี้ยน

ถ้าวันไหนรับเงินออนไลน์ ต้องเปลี่ยนเป็น:
แยก `orders/{id}/lines/{lineId}` เป็น doc ละรายการ + doc `public/priceIndex`
แล้ว rules ใช้ `get(priceIndex).data[lineId]` เทียบราคาต่อ doc ได้ (1 read ต่อรายการ)

### 6.7 App Check

ยังไม่ได้เปิด (`RECAPTCHA_SITE_KEY = ""`) **ต้องเปิดก่อนเปิดร้านจริง**
เป็นด่านเดียวที่กันสคริปต์ยิง `addDoc(orders)` รัว ๆ จากนอกเว็บ — rules กัน rate ไม่ได้

---

## 7. Quota economics — ข้อจำกัดที่แท้จริง

| | Spark ให้ฟรี | ประมาณการที่ 300 บิล/วัน |
|---|---|---|
| document reads | 50,000/วัน | ~9,000 |
| document writes | 20,000/วัน | ~600 |
| stored data | 1 GiB | ~50 MB/ปี |
| **network egress** | **10 GiB/เดือน** | **~4 GB** |
| Hosting transfer | 360 MB/วัน | ~75 MB |

**egress คือตัวที่ตึงสุด ไม่ใช่ reads** เพราะรูปเมนูเป็น data URI ลูกค้าทุกคนโหลดทั้งเมนู

```
รูป 30 KB × 15 เมนู × 300 คน × 30 วัน ≈ 4.0 GB   ✓
รูป 100 KB × 15 เมนู × 300 คน × 30 วัน ≈ 13.5 GB  ✗ เกิน
```

`IMAGE_MAX_BYTES` ใน `config.js` คือคันเร่งตัวนี้ ถ้าเมนูโตเกิน ~40 รายการต้องลด `IMAGE_MAX_PX` ลง
หรือย้ายรูปไป Cloud Storage (ต้องผูกบัตร แต่ Always Free 5 GB ทำให้บิลยังเป็น 0)

---

## 8. กับดักที่เจอมาแล้ว

1. **Firestore ไม่ยอม reject** — SDK retry ต่อเนื่องเวลาเน็ตหลุดหรือ project ผิด
   หน้าลูกค้าจะค้างที่สปินเนอร์ตลอดกาล → มี `withTimeout()` ใน `core.js` ครอบทุก query ฝั่งลูกค้า
   **เจอตอนทดสอบด้วย config ปลอม ถ้าไม่ทดสอบจะไม่รู้**

2. **`increment()` เพี้ยน** ถ้าใช้กับ stats — บิลถูกยกเลิกหรือแก้ทีหลังแล้วตัวเลขไม่ย้อน
   `stats.js` จึงคำนวณใหม่ทั้งวันแล้ว `set` ทับ (debounce 3s) — idempotent เสมอ

3. **`cleanUrls: true` + rewrite** — `/t/**` rewrite ต้องมา ไม่งั้น `/t/<token>` จะ 404
   ตอนพัฒนาโดยเสิร์ฟไฟล์นิ่งธรรมดา (ไม่ใช้ emulator) ต้องใช้ `/t/?t=<token>` แทน

4. **ES module + template literal ใน import ไม่ได้** — `import x from \`${VER}/...\`` เป็น syntax error
   เวอร์ชัน SDK จึง hardcode 3 บรรทัดใน `core.js`

5. **สูตรใน CSV ห้ามมีลูกน้ำ** — เครื่องที่ตั้ง list separator เป็น `;` จะพัง
   ใช้เฉพาะฟังก์ชันอาร์กิวเมนต์เดียว (`SUM`/`AVERAGE`/`MAX`/`COUNT`) กับ `+ - * /`
   และต้องมี BOM `﻿` นำหน้าไม่งั้น Excel อ่านภาษาไทยเป็นตัวขยะ

6. **`onSnapshot` ต้องมี error callback เสมอ** ไม่งั้น permission-denied จะเงียบ
   ทุกจุดใน repo นี้ส่ง error handler ครบแล้ว

7. **XSS** — ทุกค่าที่มาจาก Firestore ผ่าน `esc()` ก่อนใส่ template string
   ข้อมูลใน DB มาจากลูกค้าที่ไม่ล็อกอิน ถือเป็น untrusted input

---

## 9. สถานะการทดสอบ

**ทดสอบแล้ว (static server + Firebase config ปลอม)**

- syntax ผ่านทั้ง 8 module
- `/admin` โหลด SDK จาก gstatic สำเร็จ ขึ้นฟอร์มล็อกอิน ไม่มี console error
- `/admin/menu` ไม่ล็อกอิน → redirect `/admin?next=...` ถูกต้อง
- `/t/` ไม่มี token → "ไม่พบเลขโต๊ะ"
- `/t/?t=มั่ว` → timeout 12s แล้วขึ้นข้อความ ไม่ค้างสปินเนอร์

**ยังไม่ได้ทดสอบ (ต้องมี Firebase project จริง)**

- ล็อกอิน / allowlist uid
- realtime ออเดอร์ข้ามเครื่อง
- security rules ทุกข้อ
- อัปโหลดรูป → Firestore round-trip
- `stats` write + รายงานรายเดือน
- App Check enforcement
- `/t/<token>` ผ่าน rewrite จริง

**สิ่งแรกที่ต้องทำหลังมี project:** ไล่ตารางทดสอบเจาะระบบใน `README.md`
ทุกข้อต้องได้ `permission-denied` ยกเว้นข้อสุดท้าย

---

## 10. Backlog

**ก่อนเปิดร้าน**
- ใส่ค่าใน `.firebaserc`, `firestore.rules`, `config.js`
- เปิด App Check แล้ว Enforce กับ Firestore
- ไล่ตารางทดสอบเจาะระบบ
- ทดสอบสแกน QR จากมือถือจริงทั้ง iOS และ Android

**ที่ตัดออกโดยตั้งใจ** (เพิ่มทีหลังได้ไม่ต้องรื้อ schema)
จ่ายเงินออนไลน์ · จอครัวแยก · ลูกค้าดูสถานะออเดอร์ · stock · หลายสาขา (`branch_id`) · สะสมแต้ม · โลโก้ร้าน

**หนี้เทคนิคที่รู้ตัว** (มี comment `ponytail:` กำกับในโค้ด)

| ทำง่ายไว้ | เพดาน | อัปเกรดเมื่อ |
|---|---|---|
| รูปเป็น data URI ใน Firestore | egress 10 GiB/เดือน | เมนู >40 รายการ หรือยอมผูกบัตร → Cloud Storage |
| หน้าลูกค้าอ่าน `menu` ทั้งคอลเลกชัน | 1 read/เมนู/คน | เมนู >60 รายการ → แยกรูปไป lazy load |
| `stats` set ทับทั้งวัน | 1 write/การเปลี่ยนแปลง | ไม่ต้องอัปเกรด — เป็นการเลือกที่ถูกแล้ว |
| ตรวจราคาที่ client | ปลอมราคาได้ | รับเงินออนไลน์ → แยก line เป็น doc (ดู 6.6) |
| admin allowlist ใน rules | ต้อง deploy เมื่อเปลี่ยนคน | พนักงานเปลี่ยนบ่อย → custom claims |
| ไม่มี automated test | — | มีคนที่ 2 เข้ามาแก้โค้ด → `@firebase/rules-unit-testing` |

---

## 11. คำศัพท์ในโค้ดและ UI

| ไทย | ความหมาย |
|---|---|
| โต๊ะ / เลขโต๊ะ | table / table number (`tables.no`) |
| บิล / ออเดอร์ | order document |
| รอเสิร์ฟ / เสิร์ฟแล้ว / ยกเลิก | `new` / `done` / `cancelled` |
| ของหมด | `soldout` — ยังโชว์ในเมนูแต่กดสั่งไม่ได้ |
| จอหลังร้าน / ระบบหลังร้าน | admin dashboard |
| ยอดขาย | sales / revenue |
| เมนูขายดี | best-selling items (เรียงตาม `amt` ไม่ใช่ `qty`) |
