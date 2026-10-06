// /admin/report — ยอดขายวันนี้ (สด) + ยอดขายรายเดือน (จาก stats)
import {
  db, collection, doc, deleteDoc, query, where, orderBy, onSnapshot, getDocs, Timestamp,
  requireRole, renderAdminChrome, loadSettings, applyCachedSettings,
  auth, updatePassword, t,
  baht, esc, hhmm, dayKey, monthKey, monthLabel, dayRange, pad2,
  TH_MONTH, TH_DAY, toast, friendlyError, DEFAULT_SHOP,
} from "./core.js";
import { summarize, rankFromStats, dayReportRows, monthReportRows } from "./stats.js";
import { downloadCsv } from "./csv.js";

const view = document.getElementById("view");
applyCachedSettings();

const who = await requireRole("staff");
if (who) init(who.user, who.role);

function shopName() {
  return document.querySelector("[data-shopname]")?.textContent || DEFAULT_SHOP;
}

function init(user, role) {
  renderAdminChrome("/admin/report", user, role);
  loadSettings();

  let tab = "today";
  let todayOrders = [];

  view.innerHTML = `
    <div class="page">
      <div class="phead">
        <div><h1>ยอดขาย</h1>
          <p class="hint">${role === "manager"
            ? "ยอดวันนี้อัปเดตสดจากออเดอร์ ส่วนรายเดือนอ่านจากยอดสรุปรายวันที่ระบบบันทึกไว้"
            : "พนักงานหน้าร้านดูได้เฉพาะยอดของวันนี้ ยอดย้อนหลังอยู่ที่ผู้จัดการ"}</p></div>
        <div class="tools filters" id="tabs">
          <button data-t="today" aria-pressed="true">วันนี้</button>
          ${role === "manager" ? `<button data-t="month" aria-pressed="false">รายเดือน</button>` : ""}
        </div>
      </div>
      <div id="body"><p class="loading">กำลังโหลด…</p></div>
      <h2 class="sec" style="margin-top:40px">บัญชีของฉัน</h2>
      <div class="card">
        <p class="hint" style="margin:0 0 12px">
          เปลี่ยนได้เฉพาะรหัสผ่านของบัญชีที่กำลังใช้อยู่ (<b>${esc(user.email || "")}</b>)<br>
          อยากเปลี่ยนรหัสของอีกบัญชี ให้ออกจากระบบแล้วเข้าด้วยบัญชีนั้นก่อน
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <input class="fld" id="newpw" type="password" autocomplete="new-password"
                 placeholder="${esc(t("newPw"))}" style="max-width:240px">
          <button class="btn ghost" id="chpw">${esc(t("changePw"))}</button>
          <span class="hint" id="pwMsg"></span>
        </div>
      </div>

      ${role === "manager" ? `
      <h2 class="sec" style="margin-top:40px">ดูแลข้อมูล</h2>
      <div class="card">
        <p class="hint" style="margin:0 0 12px">
          ระบบเก็บบิลรายใบไว้ <b>1 ปี</b> ตามที่ตกลงไว้ ยอดสรุปรายวันเก็บถาวรไม่ถูกลบ
          — กดปุ่มนี้ปีละครั้งเพื่อล้างบิลเก่าออก ยอดขายย้อนหลังยังอยู่ครบ<br>
          ก่อนล้าง ควรกดดาวน์โหลด Excel ของเดือนที่จะลบเก็บไว้ก่อน
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px">
          <span style="font-size:13.5px;font-weight:600">บิลรายใบย้อนหลัง</span>
          <input class="fld" id="logday" type="date" style="max-width:180px">
          <button class="btn ghost" id="csvday">⭳ ดาวน์โหลดบิลวันนั้น</button>
          <span class="hint" id="logMsg"></span>
        </div>
        <button class="btn ghost danger" id="purge">ลบบิลที่เก่ากว่า 1 ปี</button>
        <span class="hint" id="purgeMsg" style="margin-left:10px"></span>
      </div>` : ""}
    </div>`;

  const body = document.getElementById("body");
  const tabsEl = document.getElementById("tabs");
  tabsEl.onclick = e => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    tab = b.dataset.t;
    tabsEl.querySelectorAll("[data-t]").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.t === tab)));
    tab === "today" ? paintToday() : paintMonth();
  };

  /* ---------------- วันนี้ ---------------- */
  const { from, to } = dayRange();
  onSnapshot(
    query(collection(db, "orders"),
      where("createdAt", ">=", from), where("createdAt", "<", to), orderBy("createdAt", "desc")),
    snap => {
      todayOrders = snap.docs.map(d => {
        const v = d.data();
        return { id: d.id, ...v, at: v.createdAt?.toDate?.() || null };
      });
      if (tab === "today") paintToday();
    },
    err => { if (tab === "today") body.innerHTML = `<div class="empty">${esc(friendlyError(err))}</div>`; }
  );

  function paintToday() {
    const live = todayOrders.filter(o => (o.status || "new") !== "cancelled");
    const s = summarize(todayOrders);
    const rank = Object.entries(s.items).sort((a, b) => b[1].amt - a[1].amt);
    const max = rank.length ? rank[0][1].amt : 1;
    const avg = s.bills ? Math.round(s.total / s.bills) : 0;

    body.innerHTML = `
      <div class="phead" style="margin-bottom:14px">
        <div><h2 class="sec" style="margin:0">${esc(dayKey(new Date()))}</h2></div>
        <div class="tools"><button class="btn ghost" id="csv">⭳ ดาวน์โหลดยอดวันนี้</button></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="k">ยอดขายรวม</div><div class="v">${baht(s.total)}</div><div class="s">บาท</div></div>
        <div class="kpi"><div class="k">จำนวนบิล</div><div class="v">${baht(s.bills)}</div><div class="s">บิล</div></div>
        <div class="kpi"><div class="k">เฉลี่ยต่อบิล</div><div class="v">${baht(avg)}</div><div class="s">บาท</div></div>
        <div class="kpi"><div class="k">เมนูขายดี</div>
          <div class="v" style="font-size:19px">${rank.length ? esc(rank[0][1].name) : "—"}</div>
          <div class="s">${rank.length ? rank[0][1].qty + " จาน" : "ยังไม่มีข้อมูล"}</div></div>
      </div>
      <h2 class="sec">อันดับเมนูตามยอดเงิน</h2>
      ${rank.length ? `<div class="bars">${rank.map(([, r]) => `
        <div class="bar"><span class="nm" title="${esc(r.name)}">${esc(r.name)}</span>
          <span class="track"><span class="fill" style="width:${Math.max(4, r.amt / max * 100)}%"></span></span>
          <span class="amt">${baht(r.amt)} · ${baht(r.qty)}</span></div>`).join("")}</div>`
        : `<div class="empty">วันนี้ยังไม่มียอดขาย</div>`}`;

    document.getElementById("csv").onclick = () => {
      if (!live.length) return toast("วันนี้ยังไม่มีออเดอร์", "err");
      downloadCsv(`ยอดขาย-${dayKey(new Date())}.csv`, dayReportRows(dayKey(new Date()), shopName(), todayOrders));
    };
  }

  /* ---------------- รายเดือน ---------------- */
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push(monthKey(d));
  }
  let picked = months[0];
  const cache = new Map();

  async function loadMonth(key) {
    if (cache.has(key)) return cache.get(key);
    const snap = await getDocs(query(collection(db, "stats"), where("month", "==", key)));
    const rows = snap.docs.map(d => d.data()).sort((a, b) => a.day.localeCompare(b.day));
    cache.set(key, rows);
    return rows;
  }

  async function paintMonth() {
    body.innerHTML = `<p class="loading">กำลังโหลดยอดรายเดือน…</p>`;
    let rows, prevRows;
    try {
      const prevKey = months[months.indexOf(picked) + 1] || null;
      [rows, prevRows] = await Promise.all([loadMonth(picked), prevKey ? loadMonth(prevKey) : []]);
    } catch (e) {
      body.innerHTML = `<div class="empty">${esc(friendlyError(e))}</div>`;
      return;
    }

    const total = rows.reduce((a, r) => a + (r.total || 0), 0);
    const bills = rows.reduce((a, r) => a + (r.bills || 0), 0);
    const avgDay = rows.length ? Math.round(total / rows.length) : 0;
    const peak = Math.max(1, ...rows.map(r => r.total || 0));
    const best = [...rows].sort((a, b) => (b.total || 0) - (a.total || 0))[0];

    // เทียบเดือนก่อนแบบวันต่อวัน ไม่งั้นเดือนที่ยังไม่จบจะดูตกเสมอ
    const prevSame = prevRows.slice(0, rows.length).reduce((a, r) => a + (r.total || 0), 0);
    const pct = prevSame ? Math.round((total - prevSame) / prevSame * 100) : 0;
    const cls = pct > 1 ? "up" : pct < -1 ? "down" : "flat";

    const rankAll = rankFromStats(rows);
    const rank = rankAll.slice(0, 8);
    const rankMax = rank.length ? rank[0][1].amt : 1;
    const today = dayKey(new Date());

    body.innerHTML = `
      <div class="phead" style="margin-bottom:14px">
        <div><h2 class="sec" style="margin:0">${esc(monthLabel(picked))}</h2></div>
        <div class="tools">
          <select class="fld" id="mpick" style="width:auto" aria-label="เลือกเดือน">
            ${months.map(k => `<option value="${k}"${k === picked ? " selected" : ""}>${esc(monthLabel(k))}</option>`).join("")}
          </select>
          <button class="btn ghost" id="csvm">⭳ ดาวน์โหลดยอดเดือนนี้</button>
        </div>
      </div>
      ${!rows.length ? `<div class="empty">เดือนนี้ยังไม่มียอดขายที่บันทึกไว้</div>` : `
      <div class="kpis">
        <div class="kpi"><div class="k">ยอดขายทั้งเดือน</div><div class="v">${baht(total)}</div>
          <div class="s">บาท ${prevSame ? `<span class="delta ${cls}">${pct > 0 ? "+" : ""}${pct}%</span>` : ""}</div></div>
        <div class="kpi"><div class="k">จำนวนบิล</div><div class="v">${baht(bills)}</div>
          <div class="s">บิล · ${rows.length} วัน</div></div>
        <div class="kpi"><div class="k">เฉลี่ยต่อวัน</div><div class="v">${baht(avgDay)}</div><div class="s">บาท</div></div>
        <div class="kpi"><div class="k">วันที่ขายดีสุด</div>
          <div class="v" style="font-size:20px">${best ? esc(thDate(best.day)) : "—"}</div>
          <div class="s">${best ? baht(best.total) + " บาท" : "—"}</div></div>
      </div>

      <div class="chart">
        <div class="cap"><h4>ยอดขายรายวัน</h4><span>สูงสุด ${baht(peak)} บาท</span></div>
        <div class="cols">${rows.map(r => {
          const d = new Date(r.day + "T12:00:00");
          const we = [0, 5, 6].includes(d.getDay());
          return `<div class="col ${we ? "we" : ""} ${r.day === today ? "today" : ""}">
            <span class="tip">${esc(thDate(r.day))} (${TH_DAY[d.getDay()].slice(0, 2)}) · ${baht(r.total)} บาท · ${baht(r.bills)} บิล</span>
            <i style="height:${Math.max(1.5, (r.total || 0) / peak * 100)}%"></i></div>`;
        }).join("")}</div>
        <div class="xax">${rows.map(r => {
          const n = +r.day.slice(-2);
          return `<span>${n % 5 === 0 || n === 1 ? n : ""}</span>`;
        }).join("")}</div>
        <div class="lgd">
          <span><b style="background:var(--accent)"></b>จันทร์–พฤหัส</span>
          <span><b style="background:var(--accent-ink);opacity:.75"></b>ศุกร์–อาทิตย์</span>
          <span><b style="background:var(--amber)"></b>วันนี้</span>
          <span>ชี้ที่แท่งเพื่อดูตัวเลข</span>
        </div>
      </div>

      <h2 class="sec">เมนูทำเงินสูงสุดของเดือน</h2>
      ${rank.length ? `<div class="bars">${rank.map(([, r]) => `
        <div class="bar"><span class="nm" title="${esc(r.name)}">${esc(r.name)}</span>
          <span class="track"><span class="fill" style="width:${Math.max(4, r.amt / rankMax * 100)}%"></span></span>
          <span class="amt">${baht(r.amt)} · ${baht(r.qty)}</span></div>`).join("")}</div>`
        : `<div class="empty">ยังไม่มีข้อมูลเมนู</div>`}`}`;

    document.getElementById("mpick").onchange = e => { picked = e.target.value; paintMonth(); };
    document.getElementById("csvm").onclick = () => {
      if (!rows.length) return toast("เดือนนี้ยังไม่มียอดขาย", "err");
      downloadCsv(`ยอดขาย-${picked}.csv`, monthReportRows(picked, shopName(), rows));
    };
  }

  /* ---------------- เปลี่ยนรหัสผ่านตัวเอง ----------------
     ระบบส่งมอบแบบไม่มีคนดูแลต่อ เจ้าของร้านต้องเปลี่ยนรหัสเองได้เวลาพนักงานลาออก
     โดยไม่ต้องเข้า Firebase Console */
  document.getElementById("chpw").onclick = async () => {
    const box = document.getElementById("newpw"), msg = document.getElementById("pwMsg");
    const pw = box.value;
    if (pw.length < 8) { msg.textContent = t("pwTooShort"); return; }
    try {
      await updatePassword(auth.currentUser, pw);
      box.value = "";
      msg.textContent = t("pwChanged");
    } catch (e) {
      msg.textContent = String(e?.code || "").includes("requires-recent-login")
        ? t("pwNeedRelogin") : friendlyError(e);
    }
  };

  const thDate = key => `${+key.slice(-2)} ${TH_MONTH[+key.slice(5, 7) - 1]}`;

  /* ---------------- บิลรายใบย้อนหลังรายวัน ----------------
     ยอดสรุปเก็บถาวร แต่บิลรายใบอยู่แค่ 1 ปี — ปุ่มนี้ไว้เก็บ log ก่อนล้าง
     อ่านทีละวัน (≤ ~1,000 reads) ไม่ทำรายเดือน: 30 วันพร้อมกันจะกินโควตาอ่านทั้งวัน */
  const dayIn = document.getElementById("logday");
  if (dayIn) {
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    dayIn.value = dayKey(yest);
    dayIn.max = dayKey(new Date());
    const logMsg = document.getElementById("logMsg");
    document.getElementById("csvday").onclick = async () => {
      if (!dayIn.value) return;
      logMsg.textContent = "กำลังโหลด…";
      try {
        const { from, to } = dayRange(new Date(dayIn.value + "T12:00:00"));
        const snap = await getDocs(query(collection(db, "orders"),
          where("createdAt", ">=", from), where("createdAt", "<", to), orderBy("createdAt", "asc")));
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!orders.some(o => (o.status || "new") !== "cancelled")) {
          logMsg.textContent = "วันนั้นไม่มีบิล"; return;
        }
        downloadCsv(`บิล-${dayIn.value}.csv`, dayReportRows(dayIn.value, shopName(), orders));
        logMsg.textContent = `${orders.length} ใบ`;
      } catch (e) { logMsg.textContent = friendlyError(e); }
    };
  }

  /* ---------------- ล้างบิลเก่ากว่า 1 ปี ----------------
     ไม่มี cron และไม่มีคนดูแลระบบต่อ เลยทำเป็นปุ่มให้เจ้าของร้านกดเองปีละครั้ง
     ลบทีละ 300 ใบต่อการกด กัน quota writes รายวันหมดในรอบเดียว */
  const purgeBtn = document.getElementById("purge");
  if (purgeBtn) {
    const msg = document.getElementById("purgeMsg");
    purgeBtn.onclick = async () => {
      const cut = new Date(); cut.setFullYear(cut.getFullYear() - 1);
      if (!confirm(`ลบบิลที่เก่ากว่า ${dayKey(cut)} ทั้งหมด?\n` +
                   `ยอดสรุปรายวันและรายเดือนยังอยู่ครบ ลบแล้วกู้คืนไม่ได้`)) return;
      purgeBtn.disabled = true;
      msg.textContent = "กำลังตรวจ…";
      try {
        const snap = await getDocs(query(collection(db, "orders"),
          where("createdAt", "<", Timestamp.fromDate(cut)), orderBy("createdAt", "asc")));
        const docs = snap.docs.slice(0, 300);
        if (!docs.length) { msg.textContent = "ไม่มีบิลเก่าให้ลบแล้ว"; return; }
        for (let i = 0; i < docs.length; i++) {
          await deleteDoc(doc(db, "orders", docs[i].id));
          if (i % 25 === 0) msg.textContent = `ลบแล้ว ${i}/${docs.length}…`;
        }
        msg.textContent = snap.size > docs.length
          ? `ลบไปแล้ว ${docs.length} ใบ ยังเหลือ ${snap.size - docs.length} ใบ — กดซ้ำได้อีก`
          : `ลบครบแล้ว ${docs.length} ใบ`;
      } catch (e) {
        msg.textContent = friendlyError(e);
      } finally {
        purgeBtn.disabled = false;
      }
    };
  }

  paintToday();
}
