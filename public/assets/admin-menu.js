// /admin/menu — ตั้งค่าร้าน + จัดการเมนู (ชื่อ ราคา รูป หมวด ของหมด)
import {
  db, collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot,
  settingsRef, applySettings, applyCachedSettings, requireRole, renderAdminChrome,
  shrinkImage, baht, esc, CATS, PALETTES, DEFAULT_SHOP, toast, friendlyError, autoMy,
  optionsRef, DEFAULT_OPTIONS,
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
        <div><h1>ตัวเลือกเสริม</h1>
          <p class="hint">ชุดตัวเลือกที่ลูกค้ากดเลือกได้ตอนสั่ง เช่น น้ำ/แห้ง เส้น พิเศษ ท็อปปิ้ง —
            ตั้งครั้งเดียวที่นี่ แล้วไปติ๊กที่แต่ละเมนูว่าใช้ชุดไหน (ช่อง "ตัวเลือก" ใต้ชื่อเมนู)<br>
            <b>เลือก 1 อย่าง</b> = ลูกค้าต้องเลือกอันเดียว (เช่น น้ำ/แห้ง) ·
            <b>เลือกได้หลายอย่าง</b> = ติ๊กได้หลายอัน (เช่น ท็อปปิ้ง) · ราคา 0 = ไม่บวกเพิ่ม</p></div>
      </div>
      <div id="optlib"><p class="loading">กำลังโหลด…</p></div>

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

  /* ---------- คลังตัวเลือกเสริม ---------- */
  // ponytail: เซฟทั้งก้อนทับ doc เดียว (คลังเล็ก ไม่เกินไม่กี่ KB) — ไม่ต้องจัดการ merge รายช่อง
  const optEl = document.getElementById("optlib");
  let lib = [], libExists = null, libDirty = false, libTimer = null;
  const newId = () => "g" + Math.random().toString(36).slice(2, 8);

  onSnapshot(optionsRef, snap => {
    libExists = snap.exists();
    if (libDirty) return;                // กำลังพิมพ์ค้าง อย่าเขียนทับ
    lib = (libExists && snap.data().groups) || [];
    paintLib(); paint();
  }, err => { optEl.innerHTML = `<div class="empty">${esc(friendlyError(err))}</div>`; });

  function saveLib(delay = 700) {
    libDirty = true;
    clearTimeout(libTimer);
    libTimer = setTimeout(async () => {
      try { await setDoc(optionsRef, { groups: lib }); }
      catch (e) { toast(friendlyError(e), "err"); }
      libDirty = false;
      paint();
    }, delay);
  }

  function paintLib() {
    if (libExists === false && !lib.length) {
      optEl.innerHTML = `<div class="card">
        <p class="hint" style="margin:0 0 12px">ยังไม่มีตัวเลือกเสริม — กดปุ่มนี้เพื่อใส่ชุดตามที่ร้านแจ้งไว้
          (ขนาดพิเศษ · น้ำซุป · เส้น · ท็อปปิ้ง · เพิ่มไข่ดาว · ข้าวขาหมู) แล้วแก้ชื่อ/ราคาได้ทีหลัง</p>
        <button class="btn" id="optseed">ใส่ตัวเลือกตามที่ร้านขอ</button>
        <button class="btn ghost" id="optadd">+ สร้างกลุ่มเอง</button></div>`;
      return;
    }
    optEl.innerHTML = `<div class="optlib">${lib.map((g, gi) => `
      <div class="card og-card" data-gi="${gi}">
        <div class="og-head">
          <input class="fld" data-gname="${gi}" value="${esc(g.name)}" maxlength="30" aria-label="ชื่อกลุ่ม">
          <select class="fld" data-gtype="${gi}" aria-label="แบบการเลือก">
            <option value="one" ${g.type === "one" ? "selected" : ""}>เลือก 1 อย่าง</option>
            <option value="many" ${g.type !== "one" ? "selected" : ""}>เลือกได้หลายอย่าง</option>
          </select>
          ${g.type === "one" ? `<label class="sw"><input type="checkbox" data-greq="${gi}" ${g.required ? "checked" : ""}>บังคับเลือก</label>` : ""}
          <button class="del" data-gdel="${gi}" aria-label="ลบกลุ่ม ${esc(g.name)}">✕</button>
        </div>
        ${g.choices.map((c, ci) => `<div class="og-row">
          <input class="fld" data-cname="${gi}:${ci}" value="${esc(c.name)}" maxlength="30" aria-label="ชื่อตัวเลือก">
          <span class="plus">+</span>
          <input class="fld num" type="number" min="0" step="5" data-cprice="${gi}:${ci}" value="${Number(c.price) || 0}" aria-label="ราคาเพิ่ม">
          <span class="hint">บาท</span>
          <button class="del" data-cdel="${gi}:${ci}" aria-label="ลบตัวเลือก ${esc(c.name)}">✕</button>
        </div>`).join("")}
        <button class="btn ghost" data-cadd="${gi}">+ เพิ่มตัวเลือก</button>
      </div>`).join("")}</div>
      <button class="btn ghost" id="optadd" style="margin-top:10px">+ เพิ่มกลุ่มตัวเลือก</button>`;
  }

  optEl.oninput = e => {
    const t = e.target, d = t.dataset;
    if (d.gname !== undefined) lib[+d.gname].name = t.value.trim().slice(0, 30) || "กลุ่มใหม่";
    else if (d.cname !== undefined) { const [g, c] = d.cname.split(":").map(Number); lib[g].choices[c].name = t.value.trim().slice(0, 30) || "ตัวเลือก"; }
    else if (d.cprice !== undefined) { const [g, c] = d.cprice.split(":").map(Number); lib[g].choices[c].price = Math.max(0, Number(t.value) || 0); }
    else return;
    saveLib();
  };
  optEl.onchange = e => {
    const t = e.target, d = t.dataset;
    if (d.gtype !== undefined) { const g = lib[+d.gtype]; g.type = t.value; if (g.type !== "one") g.required = false; }
    else if (d.greq !== undefined) lib[+d.greq].required = t.checked;
    else return;
    paintLib(); saveLib(0);
  };
  optEl.onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (b.id === "optseed") { lib = JSON.parse(JSON.stringify(DEFAULT_OPTIONS)); }
    else if (b.id === "optadd") { lib.push({ id: newId(), name: "กลุ่มใหม่", type: "many", required: false, choices: [{ name: "ตัวเลือก", price: 0 }] }); }
    else if (d.cadd !== undefined) { lib[+d.cadd].choices.push({ name: "ตัวเลือก", price: 0 }); }
    else if (d.cdel !== undefined) {
      const [g, c] = d.cdel.split(":").map(Number);
      if (lib[g].choices.length <= 1) return toast("กลุ่มต้องมีอย่างน้อย 1 ตัวเลือก — ถ้าไม่ใช้แล้วให้ลบทั้งกลุ่ม", "err");
      lib[g].choices.splice(c, 1);
    }
    else if (d.gdel !== undefined) {
      const g = lib[+d.gdel];
      if (!confirm(`ลบกลุ่ม "${g.name}"? เมนูที่ใช้กลุ่มนี้จะไม่มีตัวเลือกนี้อีก (บิลเก่าไม่กระทบ)`)) return;
      lib.splice(+d.gdel, 1);
    }
    else return;
    paintLib(); saveLib(0);
  };

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
                 placeholder="${esc(autoMy(m.name) ? "แปลอัตโนมัติ: " + autoMy(m.name) : "ชื่อภาษาพม่า (โชว์บนจอพนักงาน)")}" aria-label="ชื่อภาษาพม่า" maxlength="80">
          <div class="uid" title="รหัสเมนู (UID) — ใช้อ้างอิงในรายงาน ไม่เปลี่ยนแม้แก้ชื่อหรือราคา">
            UID <code>${esc(m.id)}</code></div>
          ${lib.length ? `<div class="optpick"><span>ตัวเลือก:</span>${lib.map(g => `<label>
            <input type="checkbox" data-opt="${esc(m.id)}" value="${esc(g.id)}" ${(m.opts || []).includes(g.id) ? "checked" : ""}>
            ${esc(g.name)}</label>`).join("")}</div>` : ""}
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

  const patchTimers = new Map(), myTimers = new Map();
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
    if (t.dataset.namemy !== undefined) {
      const id = t.dataset.namemy, v = t.value.trim().slice(0, 80);
      patch(id, { nameMy: v }, 700);
      // ponytail: ลบเมนูแล้ว key ค้างใน doc นี้ได้ ไม่เป็นไร — ไม่มีบิลไหนอ้าง id นั้นอีก
      clearTimeout(myTimers.get(id));
      myTimers.set(id, setTimeout(() =>
        setDoc(doc(db, "settings", "menuNames"), { [id]: v }, { merge: true })
          .catch(e => toast(friendlyError(e), "err")), 700));
    }
    else if (t.dataset.price !== undefined) patch(t.dataset.price, { price: Math.max(0, Number(t.value) || 0) }, 700);
  };
  mlist.onchange = async e => {
    const t = e.target;
    if (t.dataset.soldout !== undefined) return patch(t.dataset.soldout, { soldout: t.checked });
    if (t.dataset.cat !== undefined) return patch(t.dataset.cat, { cat: t.value });
    if (t.dataset.opt !== undefined) {
      const id = t.dataset.opt;
      const opts = [...mlist.querySelectorAll(`[data-opt="${CSS.escape(id)}"]:checked`)].map(x => x.value);
      return patch(id, { opts });
    }
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
        await seedMenu(Math.max(0, ...menu.map(m => m.sort ?? 0)) + 10, !libExists);
        toast("ใส่เมนูตัวอย่างแล้ว แก้ชื่อกับราคาให้ตรงกับร้านได้เลย");
      }
    } catch (err) { toast(friendlyError(err), "err"); }
  };
}

/* เมนูตัวอย่าง 20 รายการพร้อมรูปและชื่อพม่า (public/sample/ — สร้างโดย tools/make-artifact.py)
   ตั้งใจให้ลองระบบแล้วแก้ทับหรือลบทิ้ง ไม่ใช่ใช้จริงทั้งชุด */
const toDataUri = blob => new Promise((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(blob);
});

async function seedMenu(startSort, needOptions) {
  // baseURI ไม่ใช่ location — เดโมรันใน iframe srcdoc ที่ location เป็น about:srcdoc
  const base = new URL("../sample/", document.baseURI);
  const list = await (await fetch(new URL("menu.json", base))).json();
  const names = {};
  let sort = startSort;
  for (const m of list) {
    const img = await toDataUri(await (await fetch(new URL(m.img, base))).blob());
    const ref = await addDoc(collection(db, "menu"), {
      name: m.name, nameMy: m.nameMy, price: m.price, cat: m.cat, opts: m.opts || [],
      emoji: "🍽️", img, soldout: false, sort,
    });
    names[ref.id] = m.nameMy;
    sort += 10;
  }
  await setDoc(doc(db, "settings", "menuNames"), names, { merge: true });
  // เมนูตัวอย่างอ้างกลุ่ม size/soup/noodle/... — ถ้ายังไม่มีคลังตัวเลือก ใส่ชุดเริ่มต้นให้ด้วย
  if (needOptions) await setDoc(optionsRef, { groups: DEFAULT_OPTIONS });
}
