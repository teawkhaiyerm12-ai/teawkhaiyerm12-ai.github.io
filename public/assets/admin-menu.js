// /admin/menu — ตั้งค่าร้าน + จัดการเมนู (ชื่อ ราคา รูป หมวด ของหมด)
import {
  db, collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  settingsRef, applySettings, applyCachedSettings, requireRole, renderAdminChrome,
  shrinkImage, baht, esc, CATS, PALETTES, DEFAULT_SHOP, toast, friendlyError,
} from "./core.js";

const view = document.getElementById("view");
applyCachedSettings();

const who = await requireRole("manager");     // หน้านี้เฉพาะผู้จัดการ
if (who) init(who.user, who.role);

function init(user, role) {
  renderAdminChrome("/admin/menu", user, role);

  let menu = [];
  let settings = { name: DEFAULT_SHOP, palette: "" };

  view.innerHTML = `
    <div class="page">
      <div class="phead">
        <div><h1>ข้อมูลร้าน</h1>
          <p class="hint">ชื่อนี้ขึ้นทั้งหน้าเมนูที่ลูกค้าเห็น แถบหลังร้าน และหัวไฟล์รายงาน</p></div>
      </div>
      <div class="card shoprow">
        <label for="shopname">ชื่อร้าน</label>
        <input class="fld" id="shopname" maxlength="40" placeholder="${esc(DEFAULT_SHOP)}" autocomplete="off">
        <div class="palrow"><span style="font-size:13.5px;font-weight:600">ธีมสี</span>
          ${PALETTES.map(p => `<button class="pal" data-pal="${p.id}" style="--p:${p.dot}" aria-pressed="false">${esc(p.name)}</button>`).join("")}
        </div>
      </div>

      <div class="phead" style="margin-top:34px">
        <div><h1>จัดการเมนู</h1>
          <p class="hint">แก้ชื่อ แก้ราคา ปิดสวิตช์เมื่อของหมด — หน้าลูกค้าเปลี่ยนตามทันที<br>
            <b>ใส่รูปอาหาร:</b> กดที่ช่องรูปแล้วเลือกไฟล์ หรือลากรูปมาวางบนช่อง (ระบบย่อรูปให้อัตโนมัติ)<br>
            <b>UID ใต้ชื่อเมนู</b> คือรหัสประจำเมนูที่ระบบสร้างให้เอง ใช้อ้างอิงในรายงานและไฟล์ Excel
            ไม่เปลี่ยนแม้จะแก้ชื่อหรือราคา</p></div>
        <div class="tools"><span class="hint" id="count"></span></div>
      </div>
      <div id="mlist"><p class="loading">กำลังโหลดเมนู…</p></div>
      <div class="addbar" id="addbar">
        ${CATS.map(c => `<button class="btn ghost" data-new="${esc(c)}">+ เพิ่มใน ${esc(c)}</button>`).join("")}
        <button class="btn ghost" id="seed" style="margin-left:auto">ใส่เมนูตัวอย่าง</button>
      </div>
    </div>`;

  const mlist = document.getElementById("mlist");
  const nameInput = document.getElementById("shopname");
  const countEl = document.getElementById("count");

  /* ---------- ตั้งค่าร้าน ---------- */
  // ระหว่างที่ชื่อร้านยังพิมพ์ค้างอยู่ ห้าม snapshot มาเขียนทับช่อง
  // (เช็ค focus อย่างเดียวไม่พอ — กดปุ่มธีมทีเดียว focus ก็ออกจากช่องแล้ว ชื่อที่พิมพ์จะหาย)
  let nameDirty = false;

  onSnapshot(settingsRef, snap => {
    settings = snap.exists() ? snap.data() : { name: DEFAULT_SHOP, palette: "" };
    const applied = applySettings(nameDirty ? { ...settings, name: nameInput.value.trim() || DEFAULT_SHOP } : settings);
    if (!nameDirty) nameInput.value = applied.name;
    document.querySelectorAll(".pal").forEach(b =>
      b.setAttribute("aria-pressed", String(b.dataset.pal === settings.palette)));
  });

  let nameTimer = null;
  nameInput.oninput = () => {
    nameDirty = true;
    applySettings({ ...settings, name: nameInput.value.trim() || DEFAULT_SHOP });
    clearTimeout(nameTimer);
    nameTimer = setTimeout(async () => {
      await save({ name: nameInput.value.trim().slice(0, 40) || DEFAULT_SHOP });
      nameDirty = false;
    }, 700);
  };
  document.querySelector(".palrow").onclick = e => {
    const b = e.target.closest("[data-pal]"); if (!b) return;
    save({ palette: b.dataset.pal });
  };
  // ส่งเฉพาะ field ที่แก้ (merge) ไม่งั้นการเซฟสองอย่างพร้อมกันจะทับกันเอง
  async function save(patch) {
    try { await setDoc(settingsRef, patch, { merge: true }); }
    catch (e) { toast(friendlyError(e), "err"); }
  }

  /* ---------- เมนู ---------- */
  onSnapshot(collection(db, "menu"), snap => {
    menu = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name), "th"));
    paint();
  }, err => { mlist.innerHTML = `<div class="empty">${esc(friendlyError(err))}</div>`; });

  function paint() {
    const withPic = menu.filter(m => m.img).length;
    countEl.textContent = menu.length ? `${menu.length} เมนู · ใส่รูปแล้ว ${withPic}` : "";
    if (!menu.length) {
      mlist.innerHTML = `<div class="empty">ยังไม่มีเมนู — กดปุ่มข้างล่างเพื่อเพิ่ม หรือใส่เมนูตัวอย่างก่อนก็ได้</div>`;
      return;
    }
    mlist.innerHTML = menu.map(m => `
      <div class="mrow" data-id="${esc(m.id)}">
        <label class="tile ${m.img ? "has" : ""}" data-tile="${esc(m.id)}" title="ใส่รูป ${esc(m.name)}">
          ${m.img ? `<img src="${m.img}" alt="">` : esc(m.emoji || "🍽️")}
          <input type="file" accept="image/*" data-pic="${esc(m.id)}" aria-label="ใส่รูป ${esc(m.name)}">
          ${m.img
            ? `<button class="rm" data-rmpic="${esc(m.id)}" aria-label="เอารูปออก">✕</button>`
            : `<span class="cam">ใส่รูป</span>`}
        </label>
        <div class="names">
          <input class="fld" value="${esc(m.name)}" data-name="${esc(m.id)}" aria-label="ชื่อเมนู" maxlength="60">
          <input class="fld my" lang="my" value="${esc(m.nameMy || "")}" data-namemy="${esc(m.id)}"
                 placeholder="ชื่อภาษาพม่า (โชว์บนจอพนักงาน)" aria-label="ชื่อภาษาพม่า" maxlength="80">
          <div class="uid" title="รหัสเมนู (UID) — ใช้อ้างอิงในรายงาน ไม่เปลี่ยนแม้แก้ชื่อหรือราคา">
            UID <code>${esc(m.id)}</code></div>
        </div>
        <input class="fld num" type="number" min="0" step="5" value="${Number(m.price) || 0}"
               data-price="${esc(m.id)}" aria-label="ราคา">
        <select class="fld" data-cat="${esc(m.id)}" aria-label="หมวด">
          ${CATS.map(c => `<option${c === m.cat ? " selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
        <label class="sw"><input type="checkbox" data-soldout="${esc(m.id)}" ${m.soldout ? "checked" : ""}>ของหมด</label>
        <button class="del" data-del="${esc(m.id)}" aria-label="ลบ ${esc(m.name)}">✕</button>
      </div>`).join("");

    mlist.querySelectorAll("[data-tile]").forEach(tile => {
      tile.addEventListener("dragover", e => { e.preventDefault(); tile.classList.add("drop"); });
      tile.addEventListener("dragleave", () => tile.classList.remove("drop"));
      tile.addEventListener("drop", e => {
        e.preventDefault(); tile.classList.remove("drop");
        const f = e.dataTransfer.files[0];
        if (f) setPic(tile.dataset.tile, f);
      });
    });
  }

  const patchTimers = new Map();
  function patch(id, data, delay = 0) {
    clearTimeout(patchTimers.get(id));
    patchTimers.set(id, setTimeout(async () => {
      try { await updateDoc(doc(db, "menu", id), data); }
      catch (e) { toast(friendlyError(e), "err"); }
    }, delay));
  }

  mlist.oninput = e => {
    const t = e.target;
    if (t.dataset.name !== undefined) patch(t.dataset.name, { name: t.value.trim().slice(0, 60) || "เมนูใหม่" }, 700);
    if (t.dataset.namemy !== undefined) patch(t.dataset.namemy, { nameMy: t.value.trim().slice(0, 80) }, 700);
    else if (t.dataset.price !== undefined) patch(t.dataset.price, { price: Math.max(0, Number(t.value) || 0) }, 700);
  };
  mlist.onchange = async e => {
    const t = e.target;
    if (t.dataset.soldout !== undefined) return patch(t.dataset.soldout, { soldout: t.checked });
    if (t.dataset.cat !== undefined) return patch(t.dataset.cat, { cat: t.value });
    const f = t.closest("[data-pic]");
    if (f && f.files[0]) setPic(f.dataset.pic, f.files[0]);
  };
  mlist.onclick = async e => {
    const rm = e.target.closest("[data-rmpic]"), del = e.target.closest("[data-del]");
    try {
      if (rm) { e.preventDefault(); await updateDoc(doc(db, "menu", rm.dataset.rmpic), { img: null }); }
      else if (del) {
        const m = menu.find(x => x.id === del.dataset.del);
        if (!confirm(`ลบ "${m.name}" ออกจากเมนู?`)) return;
        await deleteDoc(doc(db, "menu", m.id));
      }
    } catch (err) { toast(friendlyError(err), "err"); }
  };

  async function setPic(id, file) {
    try {
      const img = await shrinkImage(file);
      await updateDoc(doc(db, "menu", id), { img });
      toast(`ใส่รูปแล้ว (${Math.round(img.length / 1024)} KB)`);
    } catch (e) { toast(e.message || friendlyError(e), "err"); }
  }

  document.getElementById("addbar").onclick = async e => {
    const n = e.target.closest("[data-new]"), seed = e.target.closest("#seed");
    try {
      if (n) {
        await addDoc(collection(db, "menu"), {
          name: "เมนูใหม่", price: 50, cat: n.dataset.new, emoji: "🍽️",
          img: null, soldout: false, sort: (Math.max(0, ...menu.map(m => m.sort ?? 0)) + 10),
        });
      } else if (seed) {
        if (menu.length && !confirm("มีเมนูอยู่แล้ว จะเพิ่มเมนูตัวอย่างต่อท้ายไหม")) return;
        await seedMenu(Math.max(0, ...menu.map(m => m.sort ?? 0)) + 10);
        toast("ใส่เมนูตัวอย่างแล้ว แก้ชื่อกับราคาให้ตรงกับร้านได้เลย");
      }
    } catch (err) { toast(friendlyError(err), "err"); }
  };
}

/* เมนูตั้งต้นสำหรับร้านเปิดใหม่ — ตั้งใจให้แก้ทับ ไม่ใช่ใช้จริงทั้งชุด */
const SAMPLE = [
  ["แนะนำ", "ข้าวกะเพราหมูสับไข่ดาว", 65, "🍳"],
  ["แนะนำ", "ต้มยำกุ้งน้ำข้น", 150, "🦐"],
  ["แนะนำ", "ผัดไทยกุ้งสด", 90, "🍜"],
  ["ข้าว", "ข้าวผัดกุ้ง", 80, "🍤"],
  ["ข้าว", "ข้าวหมูกรอบ", 70, "🥓"],
  ["ข้าว", "ข้าวมันไก่", 60, "🍗"],
  ["ข้าว", "ข้าวเปล่า", 15, "🍚"],
  ["เส้น", "ก๋วยเตี๋ยวต้มยำหมู", 60, "🍲"],
  ["เส้น", "ราดหน้าหมูหมัก", 65, "🍛"],
  ["ทานเล่น", "ปีกไก่ทอดน้ำปลา", 90, "🍗"],
  ["ทานเล่น", "ไข่เจียวหมูสับ", 45, "🍳"],
  ["เครื่องดื่ม", "ชาเย็น", 35, "🧋"],
  ["เครื่องดื่ม", "น้ำมะนาวโซดา", 45, "🍋"],
  ["เครื่องดื่ม", "น้ำเปล่า", 15, "💧"],
];

async function seedMenu(startSort) {
  let sort = startSort;
  for (const [cat, name, price, emoji] of SAMPLE) {
    await addDoc(collection(db, "menu"), { name, price, cat, emoji, img: null, soldout: false, sort });
    sort += 10;
  }
}
