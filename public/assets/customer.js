// หน้าลูกค้า — เปิดจากการสแกน QR ที่โต๊ะ ไม่ต้องล็อกอิน
// URL: /t/<token>  (token เป็น UUID สุ่ม ไม่ใช่เลขโต๊ะ)
import {
  db, collection, doc, getDoc, getDocs, addDoc, serverTimestamp,
  loadSettings, applyCachedSettings, baht, esc, CATS, toast, friendlyError, withTimeout,
  optionsRef, groupsFor, optText,
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
  const [tableSnap, , optSnap] = await Promise.all([
    withTimeout(getDoc(doc(db, "tables", token))),
    loadSettings(),
    withTimeout(getDoc(optionsRef)).catch(() => null),   // ไม่มีคลังตัวเลือก = ทุกเมนูไม่มีตัวเลือก
  ]);
  const lib = (optSnap && optSnap.exists() && optSnap.data().groups) || [];

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

  render(tableNo, menu, lib);
}

function render(tableNo, menu, lib) {
  // ตะกร้าเป็นรายการบรรทัด ไม่ใช่ id -> qty: จานเดียวกันแต่ตัวเลือก/หมายเหตุต่างกัน = คนละบรรทัด
  const cart = [];            // { key, menuId, name, nameMy, base, opts: [{g,n,p}], note, qty }
  let filter = null;
  let sending = false;

  const cats = CATS.filter(c => menu.some(m => m.cat === c));
  const other = menu.some(m => !cats.includes(m.cat));
  const OTHER = "__other__";
  const groups = other ? [...cats, OTHER] : cats;
  const inGroup = (m, g) => g === OTHER ? !cats.includes(m.cat) : m.cat === g;
  const groupLabel = g => g === OTHER ? "อื่น ๆ" : g;
  const hasOpts = m => groupsFor(m, lib).length > 0;
  const unit = l => l.base + l.opts.reduce((a, o) => a + o.p, 0);
  const qtyOf = id => cart.filter(l => l.menuId === id).reduce((a, l) => a + l.qty, 0);
  const plain = id => cart.find(l => l.menuId === id && !l.opts.length && !l.note);

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
        <button class="sumline" id="viewcart" type="button"><span class="cnt"></span><b class="tot"></b></button>
        <button class="submit">ส่งออเดอร์ไปที่ครัว</button>
      </div>
    </div>`;

  applyCachedSettings();

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
        const sold = m.soldout === true;
        const q = qtyOf(m.id), pl = plain(m.id);
        const pic = m.img ? `<img src="${m.img}" alt="" loading="lazy">` : esc(m.emoji || "🍽️");
        // เมนูมีตัวเลือก: + เปิดหน้าเลือก / ไม่มีตัวเลือก: + ใส่ตะกร้าเลย (แตะรูปหรือชื่อเพื่อใส่หมายเหตุได้)
        const ctl = sold ? "" : (hasOpts(m) || !pl)
          ? `${q ? `<span class="inbag">×${q}</span>` : ""}<button class="add" data-add="${esc(m.id)}" aria-label="เพิ่ม ${esc(m.name)}">+</button>`
          : `<div class="stepper">
               <button data-sub="${esc(m.id)}" aria-label="ลด ${esc(m.name)}">−</button>
               <span class="q">${pl.qty}</span>
               <button data-add="${esc(m.id)}" aria-label="เพิ่ม ${esc(m.name)}">+</button>
             </div>`;
        return `<div class="item ${sold ? "off" : ""} ${m.img ? "pic" : ""}">
          <div class="ph" data-open="${sold ? "" : esc(m.id)}">${pic}</div>
          <div class="info" data-open="${sold ? "" : esc(m.id)}">
            <div class="nm">${esc(m.name)}</div>
            ${sold ? `<div class="so">วันนี้หมด</div>`
                   : `<div class="pr">${baht(m.price)} บาท</div>${hasOpts(m) ? `<div class="hasopt">มีตัวเลือก</div>` : ""}`}
          </div>
          <div class="ctl">${ctl}</div>
        </div>`;
      }).join("");
    }).join("");
  }

  function addLine(m, opts = [], note = "", qty = 1) {
    const key = [m.id, ...opts.map(o => o.g + ":" + o.n), note].join("|");
    const hit = cart.find(l => l.key === key);
    if (hit) hit.qty += qty;
    else {
      if (cart.length >= 30) { toast("สั่งได้สูงสุด 30 รายการต่อบิล", "err"); return false; }
      cart.push({ key, menuId: m.id, name: String(m.name), nameMy: m.nameMy ? String(m.nameMy) : "",
                  base: Number(m.price), opts, note, qty });
    }
    return true;
  }

  list.addEventListener("click", e => {
    const a = e.target.closest("[data-add]"), s = e.target.closest("[data-sub]"),
          o = e.target.closest("[data-open]");
    if (a) {
      const m = menu.find(x => x.id === a.dataset.add);
      if (hasOpts(m)) return openItem(m);
      addLine(m);
    } else if (s) {
      const l = plain(s.dataset.sub);
      if (l && --l.qty <= 0) cart.splice(cart.indexOf(l), 1);
    } else if (o && o.dataset.open) {
      return openItem(menu.find(x => x.id === o.dataset.open));
    } else return;
    paintList(); paintCart();
  });

  /* ---------- หน้าต่างเลือกตัวเลือก + หมายเหตุ ---------- */
  function openItem(m) {
    const gs = groupsFor(m, lib);
    let qty = 1;
    const sh = document.createElement("div");
    sh.className = "optsheet";
    sh.innerHTML = `<div class="panel" role="dialog" aria-label="${esc(m.name)}">
      <div class="oh">
        ${m.img ? `<img src="${m.img}" alt="">` : ""}
        <div><div class="onm">${esc(m.name)}</div><div class="opr">${baht(m.price)} บาท</div></div>
        <button class="x" aria-label="ปิด">✕</button>
      </div>
      <div class="obody">
        ${gs.map(g => `<fieldset class="og" data-g="${esc(g.id)}">
          <legend>${esc(g.name)} <span>${g.type === "one" ? (g.required ? "เลือก 1 อย่าง · จำเป็น" : "เลือก 1 อย่าง") : "เลือกได้หลายอย่าง"}</span></legend>
          ${g.choices.map((c, i) => `<label class="oc">
            <input type="${g.type === "one" ? "radio" : "checkbox"}" name="g_${esc(g.id)}" value="${i}">
            <span class="cn">${esc(c.name)}</span>
            <span class="cp">${Number(c.price) ? "+" + baht(c.price) : ""}</span>
          </label>`).join("")}
        </fieldset>`).join("")}
        <label class="onote">หมายเหตุถึงร้าน
          <textarea maxlength="100" rows="2" placeholder="เช่น ไม่ใส่ผัก ไม่เผ็ด แยกน้ำ"></textarea></label>
      </div>
      <div class="ofoot">
        <div class="stepper"><button data-q="-1" aria-label="ลด">−</button><span class="q">1</span><button data-q="1" aria-label="เพิ่ม">+</button></div>
        <button class="btn oadd"></button>
      </div>
    </div>`;
    document.body.appendChild(sh);
    const close = () => sh.remove();
    const picked = () => gs.flatMap(g => [...sh.querySelectorAll(`[data-g="${g.id}"] input:checked`)]
      .map(inp => { const c = g.choices[+inp.value]; return { g: g.name, n: c.name, p: Number(c.price) || 0 }; }));
    const paint = () => {
      const u = Number(m.price) + picked().reduce((a, o) => a + o.p, 0);
      sh.querySelector(".q").textContent = qty;
      sh.querySelector(".oadd").textContent = `ใส่ตะกร้า · ${baht(u * qty)} บาท`;
    };
    sh.addEventListener("change", e => {
      e.target.closest(".og")?.classList.remove("need");
      paint();
    });
    // กลุ่ม "เลือก 1 อย่าง" ที่ไม่บังคับ: แตะอันที่เลือกอยู่ซ้ำ = ยกเลิก (radio ปกติยกเลิกไม่ได้)
    sh.addEventListener("pointerdown", e => {
      const r = e.target.closest(".oc")?.querySelector("input[type=radio]");
      if (r) r.dataset.was = r.checked ? "1" : "";
    });
    sh.addEventListener("click", e => {
      const r = e.target.closest(".oc")?.querySelector("input[type=radio]");
      const g = r && gs.find(x => `g_${x.id}` === r.name);
      if (r && e.target === r && r.dataset.was && g && !g.required) { r.checked = false; r.dataset.was = ""; paint(); }
      if (e.target === sh || e.target.closest(".x")) return close();
      const q = e.target.closest("[data-q]");
      if (q) { qty = Math.max(1, Math.min(20, qty + +q.dataset.q)); paint(); }
      if (e.target.closest(".oadd")) {
        const miss = gs.find(g => g.required && !sh.querySelector(`[data-g="${g.id}"] input:checked`));
        if (miss) {
          const box = sh.querySelector(`[data-g="${miss.id}"]`);
          box.classList.add("need");
          box.scrollIntoView({ block: "center", behavior: "smooth" });
          return toast(`กรุณาเลือก${miss.name}`, "err");
        }
        const note = sh.querySelector("textarea").value.trim().slice(0, 100);
        if (addLine(m, picked(), note, qty)) { close(); paintList(); paintCart(); }
      }
    });
    paint();
  }

  /* ---------- ตะกร้า: ดู/แก้ก่อนส่ง ---------- */
  function openCart() {
    const sh = document.createElement("div");
    sh.className = "optsheet";
    const paint = () => {
      if (!cart.length) return sh.remove();
      sh.innerHTML = `<div class="panel" role="dialog" aria-label="ตะกร้า">
        <div class="oh"><div><div class="onm">ตะกร้า · โต๊ะ ${esc(tableNo)}</div></div><button class="x" aria-label="ปิด">✕</button></div>
        <div class="obody">${cart.map((l, i) => `<div class="cl">
          <div class="cli"><div class="cln">${esc(l.name)}</div>
            ${l.opts.length ? `<div class="clo">${esc(optText(l))}</div>` : ""}
            ${l.note ? `<div class="clnote">📝 ${esc(l.note)}</div>` : ""}
            <div class="clp">${baht(unit(l) * l.qty)} บาท</div></div>
          <div class="stepper"><button data-cq="${i}:-1" aria-label="ลด">−</button><span class="q">${l.qty}</span><button data-cq="${i}:1" aria-label="เพิ่ม">+</button></div>
        </div>`).join("")}</div>
        <div class="ofoot"><b class="otot">${baht(sum())} บาท</b><button class="btn oadd" data-send>ส่งออเดอร์ไปที่ครัว</button></div>
      </div>`;
    };
    sh.addEventListener("click", e => {
      if (e.target === sh || e.target.closest(".x")) return sh.remove();
      const q = e.target.closest("[data-cq]");
      if (q) {
        const [i, d] = q.dataset.cq.split(":").map(Number);
        cart[i].qty += d;
        if (cart[i].qty <= 0) cart.splice(i, 1);
        paint(); paintList(); paintCart();
      }
      if (e.target.closest("[data-send]")) { sh.remove(); send(); }
    });
    document.body.appendChild(sh);
    paint();
  }

  const sum = () => cart.reduce((a, l) => a + unit(l) * l.qty, 0);

  function paintCart() {
    const n = cart.reduce((a, l) => a + l.qty, 0);
    bar.classList.toggle("show", n > 0);
    bar.querySelector(".cnt").textContent = `${n} รายการ · ดูตะกร้า`;
    bar.querySelector(".tot").textContent = `${baht(sum())} บาท`;
  }
  bar.querySelector("#viewcart").onclick = openCart;
  submit.addEventListener("click", send);

  async function send() {
    if (sending || !cart.length) return;
    const total = sum();
    if (total > 20000) return toast("ยอดเกินที่ระบบรับได้ กรุณาแยกบิลหรือเรียกพนักงาน", "err");
    // nameMy snapshot ลงบิลด้วย จอพนักงานจะได้ไม่ต้องไปอ่าน collection menu (มีรูป กิน egress)
    const items = cart.map(l => ({
      menuId: l.menuId, name: l.name, ...(l.nameMy ? { nameMy: l.nameMy } : {}),
      price: unit(l), qty: l.qty,
      ...(l.opts.length ? { opts: l.opts } : {}), ...(l.note ? { note: l.note } : {}),
    }));

    sending = true;
    submit.disabled = true;
    submit.textContent = "กำลังส่ง…";
    try {
      await addDoc(collection(db, "orders"), {
        token,
        table: tableNo,
        items,
        total,
        status: "new",
        createdAt: serverTimestamp(),
      });
      cart.length = 0;
      paintList(); paintCart();
      done();
    } catch (e) {
      toast(friendlyError(e), "err");
    } finally {
      sending = false;
      submit.disabled = false;
      submit.textContent = "ส่งออเดอร์ไปที่ครัว";
    }
  }

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
