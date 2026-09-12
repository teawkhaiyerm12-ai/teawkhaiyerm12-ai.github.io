// /admin/tables — สร้างโต๊ะ + gen QR สำหรับปริ้นแปะโต๊ะ
import {
  db, collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot,
  requireRole, renderAdminChrome, loadSettings, applyCachedSettings,
  esc, toast, friendlyError,
} from "./core.js";

const view = document.getElementById("view");
applyCachedSettings();

const who = await requireRole("manager");     // หน้านี้เฉพาะผู้จัดการ
if (who) init(who.user, who.role);

/* URL ใน QR ใช้รูปแบบ /t/?t=<token>
   GitHub Pages ไม่มี rewrite แบบ Firebase Hosting เลยใช้ path /t/<token> ตรง ๆ ไม่ได้
   รูปแบบนี้ทำงานได้ทั้งสอง host และหน้าลูกค้ารองรับอยู่แล้ว
   ponytail: เลือกรูปแบบเดียวใช้ทุกที่ ดีกว่าแยกตาม host แล้วลืมอัปเดตข้างใดข้างหนึ่ง */
export const tableUrl = token =>
  `${location.origin}${location.pathname.replace(/\/admin\/.*$/, "")}/t/?t=${encodeURIComponent(token)}`;

// token ต้องเดาไม่ได้ ห้ามใช้เลขโต๊ะ ไม่งั้นใครก็เปิดเมนูโต๊ะอื่นได้จากการเดา URL
const newToken = () =>
  (crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)));

function init(user, role) {
  renderAdminChrome("/admin/tables", user, role);
  loadSettings();

  let tables = [];

  view.innerHTML = `
    <div class="page">
      <div class="phead">
        <div><h1>โต๊ะ &amp; QR</h1>
          <p class="hint">แต่ละโต๊ะมี QR ของตัวเอง สแกนแล้วเปิดเมนูของโต๊ะนั้น —
            ปริ้นแล้วเคลือบกันน้ำก่อนแปะ. <b>token เปลี่ยนไม่ได้หลังปริ้น</b> ตั้งโต๊ะให้ครบเผื่อขยายก่อน</p></div>
        <div class="tools noprint">
          <input class="fld num" id="tno" type="number" min="1" max="999" placeholder="เลขโต๊ะ" style="width:110px">
          <button class="btn" id="addt">+ เพิ่มโต๊ะ</button>
          <button class="btn ghost" id="print">🖨 ปริ้น QR ทั้งหมด</button>
        </div>
      </div>
      <div id="list"><p class="loading">กำลังโหลดโต๊ะ…</p></div>
    </div>`;

  const list = document.getElementById("list");
  const tno = document.getElementById("tno");

  onSnapshot(collection(db, "tables"), snap => {
    tables = snap.docs.map(d => ({ token: d.id, ...d.data() }))
      .sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
    paint();
  }, err => { list.innerHTML = `<div class="empty">${esc(friendlyError(err))}</div>`; });

  function paint() {
    if (!tables.length) {
      list.innerHTML = `<div class="empty">ยังไม่มีโต๊ะ — ใส่เลขโต๊ะแล้วกดเพิ่มโต๊ะ</div>`;
      return;
    }
    list.innerHTML = `<div class="qrgrid">${tables.map(t => `
      <div class="qrcard">
        <div class="qi" id="qr-${esc(t.token)}"></div>
        <div class="lbl">โต๊ะ ${esc(t.no)}</div>
        <div class="sc">${t.active === false ? "" : "สแกนเพื่อสั่งอาหาร"}</div>
        ${t.active === false ? `<div class="off">ปิดใช้งานอยู่</div>` : ""}
        <div class="tk">${esc(tableUrl(t.token))}</div>
        <div class="noprint" style="margin-top:9px;display:flex;gap:6px;justify-content:center">
          <button class="btn ghost" data-toggle="${esc(t.token)}">${t.active === false ? "เปิดใช้" : "ปิดใช้"}</button>
          <button class="btn ghost danger" data-del="${esc(t.token)}">ลบ</button>
        </div>
      </div>`).join("")}</div>`;

    for (const t of tables) {
      const box = document.getElementById(`qr-${t.token}`);
      if (!box) continue;
      if (typeof QRCode === "undefined") { box.textContent = "โหลดตัวสร้าง QR ไม่สำเร็จ"; continue; }
      new QRCode(box, {
        text: tableUrl(t.token),
        width: 140, height: 140,
        colorDark: "#211610", colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M,
      });
    }
  }

  document.getElementById("addt").onclick = async () => {
    const no = parseInt(tno.value, 10);
    if (!Number.isInteger(no) || no < 1 || no > 999) return toast("ใส่เลขโต๊ะ 1–999", "err");
    if (tables.some(t => t.no === no) && !confirm(`มีโต๊ะ ${no} อยู่แล้ว จะเพิ่มอีกใบไหม`)) return;
    try {
      await setDoc(doc(db, "tables", newToken()), { no, active: true, createdAt: new Date().toISOString() });
      tno.value = "";
      toast(`เพิ่มโต๊ะ ${no} แล้ว`);
    } catch (e) { toast(friendlyError(e), "err"); }
  };

  tno.onkeydown = e => { if (e.key === "Enter") document.getElementById("addt").click(); };
  document.getElementById("print").onclick = () => window.print();

  list.onclick = async e => {
    const tg = e.target.closest("[data-toggle]"), del = e.target.closest("[data-del]");
    try {
      if (tg) {
        const t = tables.find(x => x.token === tg.dataset.toggle);
        await updateDoc(doc(db, "tables", t.token), { active: t.active === false });
      } else if (del) {
        const t = tables.find(x => x.token === del.dataset.del);
        if (!confirm(`ลบโต๊ะ ${t.no}? QR ที่ปริ้นไปแล้วจะใช้ไม่ได้ทันที`)) return;
        await deleteDoc(doc(db, "tables", t.token));
        toast(`ลบโต๊ะ ${t.no} แล้ว`);
      }
    } catch (err) { toast(friendlyError(err), "err"); }
  };
}
