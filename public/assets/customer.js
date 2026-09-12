// หน้าลูกค้า — เปิดจากการสแกน QR ที่โต๊ะ ไม่ต้องล็อกอิน
// URL: /t/<token>  (token เป็น UUID สุ่ม ไม่ใช่เลขโต๊ะ)
import {
  db, collection, doc, getDoc, getDocs, addDoc, serverTimestamp,
  loadSettings, applyCachedSettings, baht, esc, CATS, toast, friendlyError, withTimeout,
} from "./core.js";

const app = document.getElementById("app");

function screenMsg(title, detail) {
  app.innerHTML = `<div class="center-msg"><div class="box">
    <h1>${esc(title)}</h1><p>${esc(detail)}</p></div></div>`;
}

/** token อยู่ใน path /t/<token>; รองรับ ?t= ไว้เผื่อทดสอบในเครื่อง */
function readToken() {
  const fromPath = decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || "");
  return fromPath || new URLSearchParams(location.search).get("t") || "";
}

const token = readToken();
applyCachedSettings();

if (!token) {
  screenMsg("ไม่พบเลขโต๊ะ", "กรุณาสแกน QR Code ที่ติดอยู่บนโต๊ะอีกครั้ง");
} else {
  start().catch(e => screenMsg("เปิดเมนูไม่ได้", friendlyError(e)));
}

async function start() {
  const [tableSnap] = await Promise.all([
    withTimeout(getDoc(doc(db, "tables", token))),
    loadSettings(),
  ]);

  if (!tableSnap.exists() || tableSnap.data().active === false) {
    return screenMsg("QR นี้ใช้ไม่ได้แล้ว", "เรียกพนักงานเพื่อขอ QR ใหม่ หรือสั่งที่เคาน์เตอร์ได้เลย");
  }
  const tableNo = tableSnap.data().no;

  // ponytail: อ่านเมนูทั้งคอลเลกชัน = 1 read ต่อ 1 เมนู ต่อลูกค้า 1 คน
  // ~30 เมนู x 300 คน/วัน = 9,000 reads จากโควตาฟรี 50,000 ยังเหลือเยอะ
  // ถ้าเมนูโตเกิน 60 รายการ ค่อยแยกรูปออกไปโหลดทีหลัง
  const menuSnap = await withTimeout(getDocs(collection(db, "menu")));
  const menu = menuSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name), "th"));

  if (!menu.length) return screenMsg("ยังไม่มีเมนู", "ทางร้านกำลังจัดเมนูอยู่ เรียกพนักงานได้เลย");

  render(tableNo, menu);
}

function render(tableNo, menu) {
  const cart = new Map();     // id -> qty
  let filter = null;
  let sending = false;

  const cats = CATS.filter(c => menu.some(m => m.cat === c));
  const other = menu.some(m => !cats.includes(m.cat));
  const OTHER = "__other__";
  const groups = other ? [...cats, OTHER] : cats;
  const inGroup = (m, g) => g === OTHER ? !cats.includes(m.cat) : m.cat === g;
  const groupLabel = g => g === OTHER ? "อื่น ๆ" : g;

  app.innerHTML = `
    <div class="cust">
      <header class="cust-head">
        <div class="cust-top">
          <div class="shop" data-shopname></div>
          <div class="tb"><span class="tbadge">โต๊ะ ${esc(tableNo)}</span><span>เลือกอาหารแล้วกดสั่ง</span></div>
        </div>
        <div class="chips" role="group" aria-label="หมวดอาหาร">
          <button class="chip" data-cat="" aria-pressed="${filter === null}">ทั้งหมด</button>
          ${groups.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === filter}">${esc(groupLabel(c))}</button>`).join("")}
        </div>
      </header>
      <div class="list"></div>
    </div>
    <div class="cartbar">
      <div class="inner">
        <div class="sumline"><span class="cnt"></span><b class="tot"></b></div>
        <button class="submit">ส่งออเดอร์ไปที่ครัว</button>
      </div>
    </div>`;

  applyCachedSettings();

  const $ = s => app.parentElement.querySelector(s);
  const list = app.querySelector(".list");
  const chips = app.querySelector(".chips");
  const bar = document.querySelector(".cartbar");
  const submit = bar.querySelector(".submit");

  chips.addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    filter = b.dataset.cat || null;
    chips.querySelectorAll(".chip").forEach(c =>
      c.setAttribute("aria-pressed", String((c.dataset.cat || null) === filter)));
    paintList();
  });

  function paintList() {
    const show = filter ? [filter] : groups;
    list.innerHTML = show.map(g => {
      const items = menu.filter(m => inGroup(m, g));
      if (!items.length) return "";
      return `<div class="sechead">${esc(groupLabel(g))}</div>` + items.map(m => {
        const q = cart.get(m.id) || 0;
        const sold = m.soldout === true;
        const pic = m.img ? `<img src="${m.img}" alt="" loading="lazy">` : esc(m.emoji || "🍽️");
        return `<div class="item ${sold ? "off" : ""} ${m.img ? "pic" : ""}">
          <div class="ph">${pic}</div>
          <div class="info">
            <div class="nm">${esc(m.name)}</div>
            ${sold ? `<div class="so">วันนี้หมด</div>` : `<div class="pr">${baht(m.price)} บาท</div>`}
          </div>
          ${sold ? "" : q === 0
            ? `<button class="add" data-add="${esc(m.id)}" aria-label="เพิ่ม ${esc(m.name)}">+</button>`
            : `<div class="stepper">
                 <button data-sub="${esc(m.id)}" aria-label="ลด ${esc(m.name)}">−</button>
                 <span class="q">${q}</span>
                 <button data-add="${esc(m.id)}" aria-label="เพิ่ม ${esc(m.name)}">+</button>
               </div>`}
        </div>`;
      }).join("");
    }).join("");
  }

  list.addEventListener("click", e => {
    const a = e.target.closest("[data-add]"), s = e.target.closest("[data-sub]");
    if (a) {
      const id = a.dataset.add;
      if (cart.size >= 30 && !cart.has(id)) return toast("สั่งได้สูงสุด 30 รายการต่อบิล", "err");
      cart.set(id, (cart.get(id) || 0) + 1);
    } else if (s) {
      const id = s.dataset.sub, q = (cart.get(id) || 0) - 1;
      q > 0 ? cart.set(id, q) : cart.delete(id);
    } else return;
    paintList(); paintCart();
  });

  const lines = () => [...cart.entries()].map(([id, qty]) => {
    const m = menu.find(x => x.id === id);
    return { menuId: id, name: String(m.name), price: Number(m.price), qty };
  });
  const sum = ls => ls.reduce((a, l) => a + l.price * l.qty, 0);

  function paintCart() {
    const ls = lines(), n = ls.reduce((a, l) => a + l.qty, 0);
    bar.classList.toggle("show", n > 0);
    bar.querySelector(".cnt").textContent = `${n} รายการ`;
    bar.querySelector(".tot").textContent = `${baht(sum(ls))} บาท`;
  }

  submit.addEventListener("click", async () => {
    if (sending) return;
    const ls = lines();
    if (!ls.length) return;
    const total = sum(ls);
    if (total > 20000) return toast("ยอดเกินที่ระบบรับได้ กรุณาแยกบิลหรือเรียกพนักงาน", "err");

    sending = true;
    submit.disabled = true;
    submit.textContent = "กำลังส่ง…";
    try {
      await addDoc(collection(db, "orders"), {
        token,
        table: tableNo,
        items: ls,
        total,
        status: "new",
        createdAt: serverTimestamp(),
      });
      cart.clear();
      paintList(); paintCart();
      done();
    } catch (e) {
      toast(friendlyError(e), "err");
    } finally {
      sending = false;
      submit.disabled = false;
      submit.textContent = "ส่งออเดอร์ไปที่ครัว";
    }
  });

  function done() {
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = `<div class="box">
      <div class="ic">✓</div>
      <h2>ส่งออเดอร์แล้ว</h2>
      <p>รายการขึ้นที่ครัวเรียบร้อย พนักงานกำลังจัดให้</p>
      <button class="btn ghost" style="width:100%">สั่งเพิ่ม</button>
    </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector("button").onclick = () => sheet.remove();
    setTimeout(() => sheet.isConnected && sheet.remove(), 6000);
  }

  paintList();
  paintCart();
}
