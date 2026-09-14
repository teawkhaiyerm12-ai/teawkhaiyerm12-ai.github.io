// /admin — หน้าล็อกอิน + กระดานออเดอร์สด
import {
  auth, db, collection, doc, query, where, orderBy, onSnapshot, updateDoc, deleteDoc,
  signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence,
  currentUser, loadRole, renderAdminChrome, loadSettings, applyCachedSettings,
  t, setLang, getLang, LANGS, toEmail, userLabel,
  baht, esc, hhmm, dayKey, dayRange, toast, friendlyError,
} from "./core.js";
import { writeStats } from "./stats.js";

const view = document.getElementById("view");
let myNames = {};          // menuId -> ชื่อพม่า อ่านจาก settings/menuNames
applyCachedSettings();

const user = await currentUser();
if (!user) login();
else {
  const role = await loadRole(user);
  role ? board(user, role) : noAccess(user);
}

function noAccess(u) {
  document.getElementById("chrome").innerHTML = "";
  view.innerHTML = `<div class="center-msg"><div class="box">
      <h1>${esc(t("noAccessTitle"))}</h1>
      <p>${esc(userLabel(u))}<br>${esc(t("noAccessText"))}</p>
      <p style="margin-top:18px"><button class="btn ghost" id="so">${esc(t("signout"))}</button></p>
    </div></div>`;
  document.getElementById("so").onclick = async () => { await signOut(auth); location.reload(); };
}

/* ---------------- login ---------------- */
function login() {
  document.documentElement.lang = getLang();
  document.getElementById("chrome").innerHTML = "";
  view.innerHTML = `
    <div class="loginwrap"><form class="loginbox" id="f">
      <h1 data-shopname>${esc(t("backoffice"))}</h1>
      <p class="sub">${esc(t("loginSub"))}</p>
      <div class="langsw login" role="group" aria-label="ภาษา">
        ${LANGS.map(l => `<button type="button" data-lang="${l.id}" aria-pressed="${l.id === getLang()}">${esc(l.label)}</button>`).join("")}
      </div>
      <label for="em">${esc(t("email"))}</label>
      <input class="fld" id="em" type="text" inputmode="email" autocapitalize="none"
             autocomplete="username" spellcheck="false" required>
      <label for="pw">${esc(t("password"))}</label>
      <input class="fld" id="pw" type="password" autocomplete="current-password" required>
      <button class="btn" type="submit">${esc(t("signin"))}</button>
      <div class="err" id="er"></div>
    </form></div>`;
  applyCachedSettings();

  view.querySelector(".langsw").onclick = e => {
    const b = e.target.closest("[data-lang]"); if (!b) return;
    setLang(b.dataset.lang); login();
  };

  const f = document.getElementById("f"), er = document.getElementById("er");
  const em = document.getElementById("em"), pw = document.getElementById("pw");
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = f.querySelector("button");
    btn.disabled = true; er.textContent = "";
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInWithEmailAndPassword(auth, toEmail(em.value), pw.value);
      const next = new URLSearchParams(location.search).get("next");
      if (next && next.startsWith("/admin")) return location.replace(next);
      const role = await loadRole(cred.user);
      role ? board(cred.user, role) : noAccess(cred.user);
    } catch (err) {
      er.textContent = friendlyError(err);
    } finally {
      btn.disabled = false;
    }
  };
}

/* ---------------- กระดานออเดอร์ ---------------- */
function board(user, role) {
  renderAdminChrome("/admin", user, role);
  loadSettings();

  let orders = [];
  let filter = "new";
  let seen = new Set();
  let firstLoad = true;

  view.innerHTML = `
    <div class="page">
      <div class="phead">
        <div>
          <h1>${esc(t("ordersTitle"))}</h1>
          <p class="hint">${esc(t("ordersHint"))}</p>
        </div>
        <div class="tools filters" id="filters">
          <button data-f="new" aria-pressed="true">${esc(t("fNew"))}</button>
          <button data-f="done" aria-pressed="false">${esc(t("fDone"))}</button>
          <button data-f="cancelled" aria-pressed="false">${esc(t("fCancelled"))}</button>
          <button data-f="all" aria-pressed="false">${esc(t("fAll"))}</button>
        </div>
      </div>
      <div id="board"><p class="loading">${esc(t("waiting"))}</p></div>
    </div>`;

  const boardEl = document.getElementById("board");
  const filtersEl = document.getElementById("filters");

  filtersEl.onclick = e => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f;
    filtersEl.querySelectorAll("[data-f]").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.f === filter)));
    paint();
  };

  const { from, to } = dayRange();
  const q = query(collection(db, "orders"),
    where("createdAt", ">=", from), where("createdAt", "<", to), orderBy("createdAt", "desc"));

  // ชื่อพม่าอ่านสดจาก doc เดียว — เจ้าของกรอกเพิ่มทีหลัง บิลที่ค้างอยู่ก็เปลี่ยนตามทันที
  onSnapshot(doc(db, "settings", "menuNames"), s => {
    myNames = (s.exists() && s.data()) || {};
    if (getLang() === "my") paint();
  }, () => {});

  onSnapshot(q, snap => {
    orders = snap.docs.map(d => {
      const v = d.data();
      return { id: d.id, ...v, at: v.createdAt?.toDate?.() || null };
    });
    // เสียงเตือนเฉพาะบิลใหม่จริง ๆ ไม่ใช่ตอนเปิดหน้าครั้งแรก
    const fresh = orders.filter(o => o.status === "new" && !seen.has(o.id));
    orders.forEach(o => seen.add(o.id));
    if (!firstLoad && fresh.length) { beep(); document.title = `(${countNew()}) ${t("newOrder")}`; }
    firstLoad = false;
    paint();
    // สรุปยอดจากข้อมูลที่ server ยืนยันแล้ว ไม่ใช่จากตัวแปรก่อนกดปุ่ม
    writeStats(orders);
  }, err => {
    boardEl.innerHTML = `<div class="empty">${esc(t("loadFail"))} — ${esc(friendlyError(err))}</div>`;
  });

  const countNew = () => orders.filter(o => o.status === "new").length;

  function paint() {
    const rows = filter === "all" ? orders : orders.filter(o => (o.status || "new") === filter);
    filtersEl.querySelector('[data-f="new"]').textContent =
      countNew() ? `${t("fNew")} (${countNew()})` : t("fNew");

    if (!rows.length) {
      boardEl.innerHTML = `<div class="empty">${
        filter === "new" ? t("emptyNew") : t("emptyOther")}</div>`;
      return;
    }
    boardEl.innerHTML = `<div class="ordergrid">${rows.map(card).join("")}</div>`;
  }

  function card(o) {
    const open = (o.status || "new") === "new";
    return `<div class="ticket ${o.status === "done" ? "done" : ""} ${o.status === "cancelled" ? "cancelled" : ""}">
      <div class="th">
        <span class="tno">${esc(t("table"))} ${esc(o.table)}${o.edited ? `<i class="ed">${esc(t("edited"))}</i>` : ""}</span>
        <span class="tt">${hhmm(o.at)}</span>
      </div>
      <ul>${(o.items || []).map((l, i) => `<li>
        <span class="ln">${lineName(l)}</span>
        ${open ? `<span class="qed">
            <button data-dec="${o.id}:${i}" aria-label="ลด ${esc(l.name)}">−</button>
            <span class="q">${l.qty}</span>
            <button data-inc="${o.id}:${i}" aria-label="เพิ่ม ${esc(l.name)}">+</button>
            <button class="rmline" data-rml="${o.id}:${i}" aria-label="เอา ${esc(l.name)} ออก">✕</button>
          </span>` : `<b>×${l.qty}</b>`}
      </li>`).join("")}</ul>
      <div class="tf">
        <span class="sum num">${baht(o.total)} ${esc(t("baht"))}</span>
        <span class="acts">${open
          ? `<button class="btn ghost danger" data-cancel="${o.id}">${esc(t("btnCancel"))}</button>
             <button class="btn" data-done="${o.id}">${esc(t("btnServed"))}</button>`
          : `<button class="btn ghost" data-undo="${o.id}">${esc(o.status === "cancelled" ? t("btnRestore") : t("btnUndo"))}</button>`
        }</span>
      </div>
    </div>`;
  }

  boardEl.onclick = async e => {
    const hit = k => e.target.closest(`[data-${k}]`);
    const inc = hit("inc"), dec = hit("dec"), rml = hit("rml"),
          d = hit("done"), u = hit("undo"), c = hit("cancel");
    const el = inc || dec || rml || d || u || c;
    if (!el) return;

    try {
      if (inc || dec || rml) {
        const raw = inc ? inc.dataset.inc : dec ? dec.dataset.dec : rml.dataset.rml;
        const [oid, idx] = raw.split(":");
        const o = orders.find(x => x.id === oid), i = +idx;
        if (!o || (o.status || "new") !== "new" || !o.items?.[i]) return;

        const items = o.items.map(l => ({ ...l }));
        if (inc) items[i].qty++;
        else if (dec) { if (--items[i].qty <= 0) items.splice(i, 1); }
        else {
          if (!confirm(t("askRemoveLine")(dishName(o.items[i]), o.table))) return;
          items.splice(i, 1);
        }
        const total = items.reduce((a, l) => a + l.price * l.qty, 0);
        await updateDoc(doc(db, "orders", o.id), items.length
          ? { items, total, edited: true }
          : { items, total: 0, edited: true, status: "cancelled" });
        if (!items.length) toast(t("allRemoved"));
      }
      else if (d) { await updateDoc(doc(db, "orders", d.dataset.done), { status: "done" }); }
      else if (c) {
        const o = orders.find(x => x.id === c.dataset.cancel);
        if (!confirm(t("askCancelBill")(o.table))) return;
        await updateDoc(doc(db, "orders", o.id), { status: "cancelled" });
      }
      else if (u) {
        const o = orders.find(x => x.id === u.dataset.undo);
        if (!o.items?.length) return toast(t("cantRestore"), "err");
        await updateDoc(doc(db, "orders", o.id), { status: "new" });
      }
      document.title = t("backoffice");
    } catch (err) {
      toast(friendlyError(err), "err");
    }
  };
}

// โหมดพม่า: ชื่อพม่าตัวใหญ่ ชื่อไทยตัวเล็กข้างล่าง ไว้อ่านทวนกับลูกค้า
// บิลเก่าหรือเมนูที่ยังไม่ได้กรอกชื่อพม่า ใช้ชื่อไทยแทน
const nameMyOf = l => myNames[l.menuId] || l.nameMy || "";
const dishName = l => (getLang() === "my" && nameMyOf(l)) || l.name;
const lineName = l => getLang() === "my" && nameMyOf(l)
  ? `<span lang="my">${esc(nameMyOf(l))}</span><small>${esc(l.name)}</small>`
  : esc(l.name);

// เสียงเตือนสั้น ๆ ด้วย WebAudio จะได้ไม่ต้องโหลดไฟล์เสียง
let ac = null;
function beep() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.3);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.32);
  } catch (_) { /* เสียงเป็นของแถม ไม่มีก็ไม่เป็นไร */ }
}
