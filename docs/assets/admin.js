/* หน้าแอดมิน: เข้าสู่ระบบ, โครงหน้า, กิจกรรม, ลิงก์ครู, รายงาน, ตั้งค่า */

const A = { boot: null, nav: 0, timer: null };
const root = document.getElementById('root');

const STATUS_ORDER = ['P', 'A', 'L', 'T', 'S'];
const TEMPLATES = {
  once: { name: 'เช็คครั้งเดียว', slots: [{ label: 'เช็คชื่อ', open: '07:30', close: '16:30' }] },
  two: { name: 'เช้า – เย็น', slots: [{ label: 'เช้า', open: '07:30', close: '08:30' }, { label: 'เย็น', open: '15:30', close: '16:30' }] },
  three: { name: 'เช้า – กลางวัน – เย็น', slots: [{ label: 'เช้า', open: '07:30', close: '08:30' }, { label: 'กลางวัน', open: '12:30', close: '13:15' }, { label: 'เย็น', open: '15:30', close: '16:30' }] },
  custom: { name: 'กำหนดเอง', slots: null },
};

function apiErr(e) {
  if (e && e.code === 'AUTH') {
    store.del('adminToken');
    toast('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่', 'bad');
    renderLogin();
    return;
  }
  toast(e.message || String(e), 'bad');
}

function loading(el, text = 'กำลังโหลด…') {
  el.innerHTML = `<div class="loading-block"><div class="spinner"></div>${esc(text)}</div>`;
}

function checkUrl(token) {
  const base = location.href.split('#')[0].split('?')[0].replace(/index\.html$/, '');
  return base + 'check.html?t=' + encodeURIComponent(token);
}

function roomName(id) {
  const r = (A.boot.classrooms || []).find((c) => c.id === id);
  return r ? r.name : '';
}

async function refreshBoot() {
  A.boot = await API.call('admin.bootstrap');
  const s = document.getElementById('schoolName');
  if (s) s.textContent = A.boot.schoolName || '';
}

/* ============================== Login ============================== */

function renderLogin() {
  clearInterval(A.timer);
  root.innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="row"><div class="brand-ic">${icon('checklist')}</div><div><h2>ระบบเช็คชื่อกิจกรรม</h2><p class="sub small">สำหรับแอดมินฝ่ายกิจกรรม</p></div></div>
    <div class="field"><label for="pw">รหัสผ่านแอดมิน</label><input class="input" type="password" id="pw" autocomplete="current-password"></div>
    <p class="error-text hidden" id="err"></p>
    <button class="btn primary block" id="go">เข้าสู่ระบบ</button>
    <p class="help">ครูที่ปรึกษาไม่ต้องเข้าสู่ระบบ ให้ใช้ลิงก์เช็คชื่อที่ได้รับจากแอดมิน</p>
  </div></div>`;
  const pw = document.getElementById('pw');
  const err = document.getElementById('err');
  const go = async () => {
    if (!pw.value) { err.textContent = 'กรุณาใส่รหัสผ่าน'; err.classList.remove('hidden'); return; }
    const b = document.getElementById('go');
    b.disabled = true; b.textContent = 'กำลังตรวจสอบ…';
    try {
      const r = await API.call('admin.login', { password: pw.value }, '');
      store.set('adminToken', r.token);
      start();
    } catch (e) {
      err.textContent = e.message; err.classList.remove('hidden');
      b.disabled = false; b.textContent = 'เข้าสู่ระบบ';
    }
  };
  pw.focus();
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  pw.addEventListener('input', () => err.classList.add('hidden'));
  document.getElementById('go').onclick = go;
}

/* ============================== Shell & routing ============================== */

async function start() {
  if (!store.get('adminToken')) return renderLogin();
  loading(root);
  try {
    await refreshBoot();
  } catch (e) {
    if (e.code === 'AUTH') return renderLogin();
    root.innerHTML = `<div class="login-wrap"><div class="card login center"><div style="color:var(--bad)">${icon('alert')}</div><h2>เชื่อมต่อระบบไม่สำเร็จ</h2><p class="sub">${esc(e.message)}</p><button class="btn primary" onclick="start()">ลองใหม่</button></div></div>`;
    return;
  }
  renderShell();
  window.onhashchange = route;
  route();
}

function renderShell() {
  root.innerHTML = `<div class="app" id="app">
    <aside class="sidebar">
      <div class="brand"><div class="brand-ic">${icon('checklist')}</div><div class="grow"><b>เช็คชื่อกิจกรรม</b><small id="schoolName">${esc(A.boot.schoolName || '')}</small></div></div>
      <nav class="nav col" style="gap:4px">
        <a href="#/activities" data-nav="activities">${icon('cal')} กิจกรรม</a>
        <a href="#/students" data-nav="students">${icon('users')} นักเรียน / ห้องเรียน</a>
        <a href="#/settings" data-nav="settings">${icon('settings')} ตั้งค่า</a>
      </nav>
      <div class="side-foot"><div class="avatar">${icon('user', 'sm')}</div><div class="grow"><div style="color:#fff;font-size:13px">แอดมิน</div><button class="link-btn small" id="logout" style="color:var(--side-muted)">ออกจากระบบ</button></div></div>
    </aside>
    <div>
      <div class="topbar"><button class="icon-btn" id="menuBtn" aria-label="เมนู">${icon('menu')}</button><b>เช็คชื่อกิจกรรม</b></div>
      <main class="main" id="main"></main>
    </div>
  </div>`;
  document.getElementById('logout').onclick = async () => {
    try { await API.call('admin.logout'); } catch (e) { /* ignore */ }
    store.del('adminToken');
    renderLogin();
  };
  const app = document.getElementById('app');
  document.getElementById('menuBtn').onclick = (e) => { e.stopPropagation(); app.classList.toggle('nav-open'); };
  document.addEventListener('click', (e) => { if (app.classList.contains('nav-open') && !e.target.closest('.sidebar')) app.classList.remove('nav-open'); });
}

function route() {
  clearInterval(A.timer);
  const nav = ++A.nav;
  const main = document.getElementById('main');
  if (!main) return;
  document.getElementById('app').classList.remove('nav-open');
  const parts = (location.hash.replace(/^#\/?/, '') || 'activities').split('/');
  const section = parts[0] === 'activity' ? 'activities' : parts[0];
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === section));
  window.scrollTo(0, 0);
  const alive = () => nav === A.nav;
  if (parts[0] === 'activity') {
    if (parts[1] === 'new') return pageActivityEdit(main, null, alive);
    if (parts[2] === 'edit') return pageActivityEdit(main, parts[1], alive);
    if (parts[2] === 'links') return pageLinks(main, parts[1], alive);
    if (parts[2] === 'report') return pageReport(main, parts[1], alive);
  }
  if (parts[0] === 'students') return pageStudents(main, parts[1], alive);
  if (parts[0] === 'settings') return pageSettings(main, alive);
  return pageActivities(main, alive);
}

/* ============================== Activities list ============================== */

async function pageActivities(main, alive) {
  loading(main);
  let list;
  try { list = await API.call('activity.list'); } catch (e) { return apiErr(e); }
  if (!alive()) return;
  const rooms = A.boot.classrooms;
  const students = rooms.reduce((n, c) => n + c.student_count, 0);
  const todayActs = list.filter((a) => a.today_sessions.length && a.status !== 'closed');
  main.innerHTML = `
    <div class="page-head">
      <div class="grow"><div class="crumb">${esc(A.boot.schoolName || '')}</div><h1>กิจกรรมทั้งหมด</h1></div>
      <a class="btn primary" href="#/activity/new">${icon('plus', 'sm')} สร้างกิจกรรม</a>
    </div>
    <div class="stats">
      <div class="stat"><div class="sub small">กิจกรรม</div><div class="v" style="color:var(--pri)">${list.length}</div><div class="muted small">เปิดอยู่ ${list.filter((a) => a.status !== 'closed').length}</div></div>
      <div class="stat"><div class="sub small">ห้องเรียน</div><div class="v">${rooms.length}</div><div class="muted small">ไม่มีรายชื่อ ${rooms.filter((c) => !c.student_count).length} ห้อง</div></div>
      <div class="stat"><div class="sub small">นักเรียนทั้งหมด</div><div class="v">${students.toLocaleString()}</div><div class="muted small">คน</div></div>
      <div class="stat"><div class="sub small">วันนี้</div><div class="v" style="color:var(--ok)">${todayActs.length}</div><div class="muted small">กิจกรรมที่มีรอบเช็คชื่อ</div></div>
    </div>
    ${!rooms.length ? `<div class="notice warn">${icon('info', 'sm')}<span>ยังไม่มีข้อมูลห้องเรียนและนักเรียน เริ่มจาก <a href="#/students"><b>นักเรียน / ห้องเรียน</b></a> เพื่อเพิ่มรายชื่อหรือนำเข้าจาก Excel</span></div>` : ''}
    ${!list.length ? `<div class="card empty">${icon('cal')}<h2>ยังไม่มีกิจกรรม</h2><p style="margin:6px 0 14px">สร้างกิจกรรมแรก เช่น วันภาษาไทย หรือ กีฬาสี แล้วส่งลิงก์ให้ครูที่ปรึกษาเช็คชื่อ</p><a class="btn primary" href="#/activity/new">${icon('plus', 'sm')} สร้างกิจกรรม</a></div>` : `
    <div class="act-list">${list.map(actCard).join('')}</div>`}`;
}

function actCard(a) {
  const today = a.today_sessions;
  return `<div class="card act-card">
    <div class="row" style="align-items:flex-start">
      <div class="grow"><h2>${esc(a.name)}</h2>${a.description ? `<p class="sub small" style="margin-top:2px">${esc(a.description)}</p>` : ''}</div>
      ${a.status === 'closed' ? '<span class="pill">ปิดแล้ว</span>' : today.length ? '<span class="pill ok">วันนี้มีเช็คชื่อ</span>' : ''}
    </div>
    <div class="meta">
      <span>${icon('cal', 'sm')} ${dateRangeText(a.dates)}</span>
      <span>${icon('clock', 'sm')} ${a.slots.length} รอบ/วัน · รวม ${a.session_count} ครั้ง</span>
      <span>${icon('door', 'sm')} ${a.room_count} ห้อง</span>
    </div>
    ${today.length ? `<div class="col" style="gap:8px">${today.map((s) => `
      <div><div class="row small"><span class="grow">${esc(s.label)} <span class="muted" style="margin-left:6px">${s.open_time}–${s.close_time}</span></span><b>${s.checked}/${a.room_count} ห้อง</b></div>
      <div class="progress" style="margin-top:4px"><i style="width:${a.room_count ? Math.round(s.checked / a.room_count * 100) : 0}%"></i></div></div>`).join('')}</div>` : ''}
    <div class="row wrap" style="gap:8px;margin-top:auto">
      <a class="btn sm primary" href="#/activity/${a.id}/links">${icon('link', 'sm')} ลิงก์ครู & ติดตาม</a>
      <a class="btn sm" href="#/activity/${a.id}/report">${icon('chart', 'sm')} รายงาน</a>
      <a class="btn sm ghost" href="#/activity/${a.id}/edit">${icon('edit', 'sm')} แก้ไข</a>
    </div>
  </div>`;
}

/* ============================== Activity editor ============================== */

function datesBetween(a, b) {
  const out = [];
  if (!a || !b) return out;
  let d = parseYmd(a); const end = parseYmd(b);
  while (d <= end && out.length < 62) { out.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return out;
}

async function pageActivityEdit(main, id, alive) {
  loading(main);
  let act = null;
  if (id) {
    try { act = await API.call('activity.get', { id }); } catch (e) { return apiErr(e); }
    if (!alive()) return;
  }
  const today = A.boot.today;
  const F = act ? {
    name: act.name, description: act.description,
    template: Object.keys(TEMPLATES).find((k) => TEMPLATES[k].slots && JSON.stringify(TEMPLATES[k].slots) === JSON.stringify(act.slots)) || 'custom',
    start: act.dates[0], end: act.dates[act.dates.length - 1], dates: new Set(act.dates),
    slots: act.slots.map((s) => Object.assign({}, s)),
    tmode: act.targets === 'ALL' ? 'ALL' : act.targets.grades ? 'grades' : 'rooms',
    grades: (act.targets && act.targets.grades) || [], rooms: (act.targets && act.targets.rooms) || [],
    statuses: act.statuses, pass_threshold: act.pass_threshold, allow_late_edit: act.allow_late_edit,
    require_pin: act.require_pin, status: act.status,
  } : {
    name: '', description: '', template: 'once', start: today, end: today, dates: new Set([today]),
    slots: TEMPLATES.once.slots.map((s) => Object.assign({}, s)), tmode: 'ALL', grades: [], rooms: [],
    statuses: ['P', 'A', 'L'], pass_threshold: 80, allow_late_edit: false, require_pin: false, status: 'active',
  };
  const grades = [...new Set(A.boot.classrooms.map((c) => c.grade))];

  function draw() {
    const range = datesBetween(F.start, F.end);
    const total = [...F.dates].filter((d) => range.includes(d)).length * F.slots.length;
    main.innerHTML = `
      <div class="page-head">
        <div class="grow"><div class="crumb"><a href="#/activities">กิจกรรม</a>  ›  ${act ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมใหม่'}</div><h1>${act ? esc(act.name) : 'สร้างกิจกรรมใหม่'}</h1></div>
        ${act ? `<button class="btn danger" id="del">${icon('trash', 'sm')} ลบ</button>` : ''}
        <button class="btn primary" id="save">${icon('check', 'sm')} บันทึกกิจกรรม</button>
      </div>
      <div class="card stack">
        <h2>ข้อมูลกิจกรรม</h2>
        <div class="field"><label>ชื่อกิจกรรม *</label><input class="input" data-f="name" value="${esc(F.name)}" placeholder="กีฬาสีภายใน ประจำปี 2569" maxlength="150"></div>
        <div class="field"><label>รายละเอียด</label><input class="input" data-f="description" value="${esc(F.description)}" placeholder="สถานที่ หรือรายละเอียดอื่น ๆ (ไม่บังคับ)" maxlength="1000"></div>
      </div>
      <div class="card stack">
        <div class="row"><h2 class="grow">วันและรอบเช็คชื่อ</h2><span class="pill pri">${F.dates.size ? [...F.dates].filter((d) => range.includes(d)).length : 0} วัน × ${F.slots.length} รอบ = ${total} ครั้ง</span></div>
        <div class="grid3">
          <div class="field"><label>วันเริ่ม</label><input class="input" type="date" data-f="start" value="${F.start}"></div>
          <div class="field"><label>วันสิ้นสุด</label><input class="input" type="date" data-f="end" value="${F.end}" min="${F.start}"></div>
          <div class="field"><label>รูปแบบการเช็คชื่อ</label><select class="input" id="tpl">${Object.keys(TEMPLATES).map((k) => `<option value="${k}" ${F.template === k ? 'selected' : ''}>${TEMPLATES[k].name}</option>`).join('')}</select></div>
        </div>
        ${range.length > 1 ? `<div class="col"><span class="label">วันที่เช็คชื่อ <span class="muted">(กดเพื่อเอาวันที่ไม่จัดกิจกรรมออก)</span></span>
          <div class="date-chips" id="chips">${range.map((d) => { const wd = parseYmd(d).getDay(); return `<button class="date-chip ${F.dates.has(d) ? 'on' : ''} ${wd === 0 || wd === 6 ? 'weekend' : ''}" data-d="${d}">${thDate(d, false, true)}</button>`; }).join('')}</div></div>` : ''}
        ${range.length > 60 ? '<p class="error-text">กิจกรรมยาวได้ไม่เกิน 60 วัน</p>' : ''}
        <div class="col"><span class="label">รอบเช็คชื่อในแต่ละวัน</span>
          <div class="col" id="slots" style="gap:6px">${F.slots.map((s, i) => `
            <div class="slot-row" data-i="${i}">
              <input class="input" data-s="label" value="${esc(s.label)}" placeholder="ชื่อรอบ เช่น เช้า" maxlength="40">
              <input class="input" type="time" data-s="open" value="${s.open}" title="เวลาเปิดเช็คชื่อ">
              <input class="input" type="time" data-s="close" value="${s.close}" title="เวลาปิดเช็คชื่อ">
              <button class="icon-btn danger" data-rm="${i}" aria-label="ลบรอบ" ${F.slots.length < 2 ? 'disabled' : ''}>${icon('trash', 'sm')}</button>
            </div>`).join('')}</div>
          <div><button class="link-btn" id="addSlot">${icon('plus', 'sm')} เพิ่มรอบ</button></div>
          <p class="help">ครูจะเช็คชื่อได้เฉพาะช่วงเวลาเปิด–ปิดของแต่ละรอบ (เวลาประเทศไทย)</p>
        </div>
      </div>
      <div class="card stack">
        <h2>ห้องที่ต้องเช็คชื่อ</h2>
        <div class="row wrap" style="gap:20px">
          ${[['ALL', 'ทุกห้อง'], ['grades', 'เลือกระดับชั้น'], ['rooms', 'เลือกห้อง']].map(([v, l]) => `<label class="check"><input type="radio" name="tmode" value="${v}" ${F.tmode === v ? 'checked' : ''}> ${l}</label>`).join('')}
        </div>
        ${!A.boot.classrooms.length ? `<div class="notice warn">${icon('info', 'sm')}<span>ยังไม่มีห้องเรียน — เพิ่มห้องและรายชื่อนักเรียนที่เมนู นักเรียน / ห้องเรียน ก่อนส่งลิงก์ให้ครู</span></div>` : ''}
        ${F.tmode === 'grades' ? `<div class="check-grid" id="grades">${grades.map((g) => `<label class="check"><input type="checkbox" value="${esc(g)}" ${F.grades.includes(g) ? 'checked' : ''}> ${esc(g)}</label>`).join('')}</div>` : ''}
        ${F.tmode === 'rooms' ? `<div class="check-grid" id="rooms">${A.boot.classrooms.map((c) => `<label class="check"><input type="checkbox" value="${c.id}" ${F.rooms.includes(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div>` : ''}
      </div>
      <div class="card stack">
        <h2>การเช็คชื่อและเกณฑ์</h2>
        <div class="col"><span class="label">สถานะที่ใช้เช็ค</span>
          <div class="row wrap" id="statuses" style="gap:18px">${STATUS_ORDER.map((k) => `<label class="check"><input type="checkbox" value="${k}" ${F.statuses.includes(k) ? 'checked' : ''} ${k === 'P' ? 'disabled' : ''}> <span class="mark ${k}" style="width:auto;padding:0 8px">${esc(A.boot.statusDefs[k].label)}</span></label>`).join('')}</div>
          <p class="help">"มา" และ "สาย" นับว่าเข้าร่วม</p>
        </div>
        <div class="grid3">
          <div class="field"><label>เกณฑ์ผ่าน (% ของจำนวนครั้ง)</label><input class="input" type="number" min="0" max="100" data-f="pass_threshold" value="${F.pass_threshold}"></div>
        </div>
        <label class="check"><input type="checkbox" data-c="allow_late_edit" ${F.allow_late_edit ? 'checked' : ''}> ให้ครูแก้ไข/เช็คย้อนหลังได้หลังหมดเวลา</label>
        <label class="check"><input type="checkbox" data-c="require_pin" ${F.require_pin ? 'checked' : ''}> ต้องใส่ PIN 4 หลักก่อนเช็คชื่อ (ป้องกันลิงก์หลุด)</label>
        ${act ? `<label class="check"><input type="checkbox" data-c="closed" ${F.status === 'closed' ? 'checked' : ''}> ปิดกิจกรรม (ครูเช็คชื่อไม่ได้แล้ว)</label>` : ''}
      </div>
      <div class="row"><span class="grow"></span>${act ? `<a class="btn" href="#/activity/${act.id}/links">ไปหน้าลิงก์ครู</a>` : ''}<button class="btn primary" id="save2">${icon('check', 'sm')} บันทึกกิจกรรม</button></div>`;
    bind();
  }

  function syncInputs() {
    main.querySelectorAll('[data-f]').forEach((el) => { F[el.dataset.f] = el.value; });
    main.querySelectorAll('.slot-row').forEach((r) => {
      const s = F.slots[r.dataset.i];
      r.querySelectorAll('[data-s]').forEach((el) => { s[el.dataset.s] = el.value; });
    });
    main.querySelectorAll('[data-c]').forEach((el) => {
      if (el.dataset.c === 'closed') F.status = el.checked ? 'closed' : 'active';
      else F[el.dataset.c] = el.checked;
    });
    F.statuses = STATUS_ORDER.filter((k) => k === 'P' || (main.querySelector(`#statuses input[value="${k}"]`) || {}).checked);
    const g = main.querySelector('#grades'); if (g) F.grades = [...g.querySelectorAll('input:checked')].map((i) => i.value);
    const r = main.querySelector('#rooms'); if (r) F.rooms = [...r.querySelectorAll('input:checked')].map((i) => i.value);
  }

  function bind() {
    const onRange = () => {
      syncInputs();
      if (F.end < F.start) F.end = F.start;
      F.dates = new Set(datesBetween(F.start, F.end));
      draw();
    };
    main.querySelector('[data-f="start"]').addEventListener('change', onRange);
    main.querySelector('[data-f="end"]').addEventListener('change', onRange);
    main.querySelector('#tpl').addEventListener('change', (e) => {
      syncInputs();
      F.template = e.target.value;
      if (TEMPLATES[F.template].slots) F.slots = TEMPLATES[F.template].slots.map((s) => Object.assign({}, s));
      draw();
    });
    const chips = main.querySelector('#chips');
    if (chips) chips.addEventListener('click', (e) => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      syncInputs();
      if (F.dates.has(b.dataset.d)) F.dates.delete(b.dataset.d); else F.dates.add(b.dataset.d);
      draw();
    });
    main.querySelector('#slots').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      syncInputs(); F.slots.splice(Number(b.dataset.rm), 1); F.template = 'custom'; draw();
    });
    main.querySelector('#slots').addEventListener('input', () => { F.template = 'custom'; main.querySelector('#tpl').value = 'custom'; });
    main.querySelector('#addSlot').onclick = () => {
      syncInputs();
      const last = F.slots[F.slots.length - 1];
      F.slots.push({ label: 'รอบที่ ' + (F.slots.length + 1), open: last ? last.close : '08:00', close: last ? last.close : '09:00' });
      F.template = 'custom'; draw();
    };
    main.querySelectorAll('input[name="tmode"]').forEach((r) => r.addEventListener('change', () => { syncInputs(); F.tmode = r.value; draw(); }));
    main.querySelector('#save').onclick = save;
    main.querySelector('#save2').onclick = save;
    const del = main.querySelector('#del');
    if (del) del.onclick = async () => {
      if (!(await confirmBox('ลบกิจกรรมนี้?', `ข้อมูลการเช็คชื่อทั้งหมดของ <b>${esc(act.name)}</b> จะถูกลบด้วย และกู้คืนไม่ได้`, { okText: 'ลบกิจกรรม', danger: true }))) return;
      try { await API.call('activity.delete', { id: act.id }); toast('ลบกิจกรรมแล้ว', 'ok'); location.hash = '#/activities'; } catch (e) { apiErr(e); }
    };
  }

  async function save() {
    syncInputs();
    const range = datesBetween(F.start, F.end);
    const dates = range.filter((d) => F.dates.has(d));
    if (!F.name.trim()) { toast('กรุณากรอกชื่อกิจกรรม', 'bad'); main.querySelector('[data-f="name"]').focus(); return; }
    if (!dates.length) return toast('กรุณาเลือกวันที่อย่างน้อย 1 วัน', 'bad');
    for (const s of F.slots) {
      if (!s.label.trim()) return toast('กรุณาตั้งชื่อรอบให้ครบ', 'bad');
      if (!s.open || !s.close || s.open >= s.close) return toast(`เวลาของรอบ "${s.label}" ไม่ถูกต้อง (เวลาเปิดต้องก่อนเวลาปิด)`, 'bad');
    }
    if (new Set(F.slots.map((s) => s.label.trim())).size !== F.slots.length) return toast('ชื่อรอบต้องไม่ซ้ำกัน', 'bad');
    if (F.tmode === 'grades' && !F.grades.length) return toast('กรุณาเลือกระดับชั้นอย่างน้อย 1 ระดับ', 'bad');
    if (F.tmode === 'rooms' && !F.rooms.length) return toast('กรุณาเลือกห้องอย่างน้อย 1 ห้อง', 'bad');
    if (act) {
      const removed = act.sessions.filter((s) => !(dates.includes(s.date) && F.slots.some((x) => x.label.trim() === s.label)));
      if (removed.length && !(await confirmBox('รอบเช็คชื่อบางรอบจะถูกลบ', `มี ${removed.length} รอบที่ไม่อยู่ในการตั้งค่าใหม่ ข้อมูลการเช็คชื่อของรอบเหล่านั้น (ถ้ามี) จะถูกลบ`, { okText: 'บันทึกต่อ', danger: true }))) return;
    }
    const payload = {
      id: act && act.id, name: F.name, description: F.description, dates,
      slots: F.slots.map((s) => ({ label: s.label.trim(), open: s.open, close: s.close })),
      targets: F.tmode === 'grades' ? { grades: F.grades } : F.tmode === 'rooms' ? { rooms: F.rooms } : 'ALL',
      statuses: F.statuses, pass_threshold: Number(F.pass_threshold) || 0,
      allow_late_edit: F.allow_late_edit, require_pin: F.require_pin, status: F.status,
    };
    const btns = main.querySelectorAll('#save, #save2');
    btns.forEach((b) => { b.disabled = true; });
    try {
      const saved = await API.call('activity.save', payload);
      toast('บันทึกกิจกรรมแล้ว', 'ok');
      location.hash = '#/activity/' + saved.id + '/links';
    } catch (e) {
      apiErr(e);
      btns.forEach((b) => { b.disabled = false; });
    }
  }

  draw();
}

/* ============================== Links & progress ============================== */

async function pageLinks(main, id, alive) {
  loading(main);
  let D; let selDate; let selSid;
  async function fetchData(silent) {
    try {
      const d = await API.call('activity.links', { id });
      if (!alive()) return false;
      D = d;
      return true;
    } catch (e) { if (!silent) apiErr(e); return false; }
  }
  if (!(await fetchData())) return;
  const ss = D.activity.sessions;
  const pick = ss.find((s) => s.date === D.today && D.now >= s.open_time && D.now <= s.close_time)
    || ss.find((s) => s.date === D.today && D.now < s.open_time)
    || ss.filter((s) => s.date <= D.today).pop() || ss[0];
  if (pick) { selDate = pick.date; selSid = pick.id; }

  function draw() {
    const act = D.activity;
    const dates = [...new Set(ss.map((s) => s.date))];
    const day = ss.filter((s) => s.date === selDate);
    const idx = ss.findIndex((s) => s.id === selSid);
    const sess = ss[idx];
    const done = D.rooms.filter((r) => r.progress[idx]).length;
    main.innerHTML = `
      <div class="page-head">
        <div class="grow"><div class="crumb"><a href="#/activities">กิจกรรม</a>  ›  ลิงก์ครูที่ปรึกษา</div><h1>${esc(act.name)}</h1></div>
        <a class="btn" href="#/activity/${act.id}/edit">${icon('edit', 'sm')} แก้ไข</a>
        <a class="btn" href="#/activity/${act.id}/report">${icon('chart', 'sm')} รายงาน</a>
      </div>
      ${act.status === 'closed' ? `<div class="notice warn">${icon('lock', 'sm')}<span>กิจกรรมนี้ปิดแล้ว ครูเปิดลิงก์ดูได้แต่เช็คชื่อไม่ได้</span></div>` : ''}
      <div class="card stack">
        <div class="row wrap">
          <div class="grow"><h2>ส่งลิงก์ให้ครูที่ปรึกษา</h2><p class="sub small">ลิงก์เดียวต่อห้อง ใช้ได้ทุกวันและทุกรอบของกิจกรรมนี้${act.require_pin ? ' · ต้องใส่ PIN' : ''}</p></div>
          <button class="btn" id="exportLinks">${icon('xls', 'sm')} ส่งออก Excel</button>
          <button class="btn primary" id="copyAll">${icon('copy', 'sm')} คัดลอกลิงก์ทุกห้อง</button>
        </div>
        ${!D.rooms.length ? `<div class="empty">ยังไม่มีห้องเป้าหมาย <a href="#/students">เพิ่มห้องเรียน</a> หรือ <a href="#/activity/${act.id}/edit">แก้ไขห้องที่ต้องเช็คชื่อ</a></div>` : ''}
      </div>
      ${D.rooms.length && ss.length ? `<div class="card stack">
        <div class="row wrap"><h2 class="grow">ติดตามการเช็คชื่อ</h2><span class="pill ${done === D.rooms.length ? 'ok' : 'warn'}">เช็คแล้ว ${done}/${D.rooms.length} ห้อง</span><button class="btn sm ghost" id="reload">${icon('refresh', 'sm')} รีเฟรช</button></div>
        ${dates.length > 1 ? `<div class="seg" id="dates">${dates.map((x) => `<button data-date="${x}" class="${x === selDate ? 'on' : ''}">${thDate(x, false, true)}${x === D.today ? '<small>วันนี้</small>' : ''}</button>`).join('')}</div>` : ''}
        ${day.length > 1 ? `<div class="seg" id="slots">${day.map((s) => `<button data-sid="${s.id}" class="${s.id === selSid ? 'on' : ''}">${esc(s.label)}<small>${s.open_time}–${s.close_time}</small></button>`).join('')}</div>` : `<p class="sub small">${thDate(sess.date, true, true)} · ${esc(sess.label)} ${sess.open_time}–${sess.close_time} น.</p>`}
        <div class="table-wrap"><table class="t">
          <thead><tr><th>ห้อง</th><th>ครูที่ปรึกษา</th><th>นักเรียน</th><th>สถานะรอบนี้</th>${act.require_pin ? '<th>PIN</th>' : ''}<th></th></tr></thead>
          <tbody>${D.rooms.map((r) => {
            const p = r.progress[idx];
            const t = p ? p.tally : {};
            return `<tr data-room="${r.id}">
              <td><b>${esc(r.name)}</b></td>
              <td class="sub">${esc(r.advisor) || '<span class="muted">—</span>'}</td>
              <td class="sub">${r.student_count}</td>
              <td>${p ? `<span class="pill ok">${icon('check', 'sm')} เช็คแล้ว</span> <span class="small sub nowrap">มา ${(t.P || 0) + (t.T || 0)} · ขาด ${t.A || 0}${t.L ? ' · ลา ' + t.L : ''}${t.S ? ' · ป่วย ' + t.S : ''}</span> <span class="small muted nowrap">${esc(p.at.slice(11, 16))} น.</span>` : r.student_count ? '<span class="pill warn">รอเช็ค</span>' : '<span class="pill">ไม่มีรายชื่อ</span>'}</td>
              ${act.require_pin ? `<td><code>${esc(r.pin)}</code></td>` : ''}
              <td class="actions">
                <button class="icon-btn" data-act="copy" title="คัดลอกลิงก์">${icon('copy', 'sm')}</button>
                <button class="icon-btn" data-act="qr" title="QR Code">${icon('qr', 'sm')}</button>
                <a class="icon-btn" href="${checkUrl(r.token)}" target="_blank" rel="noopener" title="เปิดหน้าเช็คชื่อ (แอดมินแก้ไขได้ทุกรอบ)">${icon('external', 'sm')}</a>
                <button class="icon-btn danger" data-act="reset" title="สร้างลิงก์ใหม่ (ลิงก์เดิมใช้ไม่ได้)">${icon('refresh', 'sm')}</button>
              </td></tr>`;
          }).join('')}</tbody></table></div>
        <p class="help">หน้านี้รีเฟรชอัตโนมัติทุก 1 นาที · กดไอคอน ${icon('external', 'sm')} เพื่อเช็คชื่อแทนครู (แอดมินแก้ไขได้ทุกรอบแม้หมดเวลา)</p>
      </div>` : ''}`;
    bind();
  }

  function linkText(r) {
    return `${r.name}${r.advisor ? ' (' + r.advisor + ')' : ''}\n${checkUrl(r.token)}${D.activity.require_pin ? '\nPIN: ' + r.pin : ''}`;
  }

  function bind() {
    const q = (s) => main.querySelector(s);
    if (q('#dates')) q('#dates').onclick = (e) => {
      const b = e.target.closest('[data-date]'); if (!b) return;
      selDate = b.dataset.date;
      const day = ss.filter((s) => s.date === selDate);
      selSid = (day.find((s) => s.date === D.today && D.now >= s.open_time && D.now <= s.close_time) || day[0]).id;
      draw();
    };
    if (q('#slots')) q('#slots').onclick = (e) => { const b = e.target.closest('[data-sid]'); if (b) { selSid = b.dataset.sid; draw(); } };
    if (q('#reload')) q('#reload').onclick = async () => { if (await fetchData()) { draw(); toast('อัปเดตแล้ว'); } };
    q('#copyAll').onclick = () => {
      if (!D.rooms.length) return;
      const text = `ลิงก์เช็คชื่อ: ${D.activity.name}\n${dateRangeText(D.activity.dates)}\n\n` + D.rooms.map(linkText).join('\n\n');
      copyText(text);
    };
    q('#exportLinks').onclick = () => {
      if (!window.XLSX) return toast('กำลังโหลดตัวสร้างไฟล์ Excel ลองใหม่อีกครั้ง', 'bad');
      const rows = [['ห้อง', 'ครูที่ปรึกษา', 'ติดต่อ', 'จำนวนนักเรียน', 'ลิงก์เช็คชื่อ'].concat(D.activity.require_pin ? ['PIN'] : [])]
        .concat(D.rooms.map((r) => [r.name, r.advisor, r.advisor_contact, r.student_count, checkUrl(r.token)].concat(D.activity.require_pin ? [r.pin] : [])));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 70 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, ws, 'ลิงก์');
      XLSX.writeFile(wb, `ลิงก์เช็คชื่อ_${D.activity.name}.xlsx`);
    };
    main.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const r = D.rooms.find((x) => x.id === b.closest('tr').dataset.room);
      const act = b.dataset.act;
      if (act === 'copy') copyText(linkText(r));
      if (act === 'qr') showQr(r);
      if (act === 'reset') {
        if (!(await confirmBox('สร้างลิงก์ใหม่?', `ลิงก์เดิมของห้อง <b>${esc(r.name)}</b> จะใช้ไม่ได้ทันที ต้องส่งลิงก์ใหม่ให้ครูอีกครั้ง (ข้อมูลการเช็คชื่อไม่หาย)`, { okText: 'สร้างลิงก์ใหม่', danger: true }))) return;
        try {
          const res = await API.call('link.reset', { activityId: D.activity.id, classroomId: r.id });
          r.token = res.token; r.pin = res.pin;
          draw(); toast('สร้างลิงก์ใหม่แล้ว', 'ok');
        } catch (e) { apiErr(e); }
      }
    }));
  }

  function showQr(r) {
    const url = checkUrl(r.token);
    const m = openModal(`
      <div class="modal-head"><div class="badge-ic">${icon('qr')}</div><div class="grow"><h2>QR Code ห้อง ${esc(r.name)}</h2><p class="sub small">${esc(D.activity.name)}${r.advisor ? ' · ' + esc(r.advisor) : ''}</p></div><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="qr-box" id="qr"></div>
      ${D.activity.require_pin ? `<p class="center">PIN: <b style="font-size:20px;letter-spacing:4px">${esc(r.pin)}</b></p>` : ''}
      <div class="copy-field"><input class="input" readonly value="${esc(url)}"><button class="btn" id="cp">${icon('copy', 'sm')} คัดลอก</button></div>
      <div class="modal-foot"><button class="btn" id="dl">${icon('download', 'sm')} บันทึกรูป QR</button><button class="btn primary" data-close>ปิด</button></div>`);
    const box = m.el.querySelector('#qr');
    if (window.QRCode) new QRCode(box, { text: url, width: 440, height: 440, correctLevel: QRCode.CorrectLevel.M });
    else box.innerHTML = '<p class="sub">โหลดตัวสร้าง QR ไม่สำเร็จ</p>';
    m.el.querySelector('#cp').onclick = () => copyText(linkText(r));
    m.el.querySelector('#dl').onclick = () => {
      const img = box.querySelector('img'); const cv = box.querySelector('canvas');
      const src = cv ? cv.toDataURL('image/png') : img && img.src;
      if (!src) return;
      const a = document.createElement('a'); a.href = src; a.download = `QR_${r.name.replace(/\//g, '-')}.png`; a.click();
    };
  }

  draw();
  A.timer = setInterval(async () => {
    if (document.hidden || document.querySelector('.modal-back')) return;
    if (await fetchData(true)) draw();
  }, 60000);
}

/* ============================== Report ============================== */

async function pageReport(main, id, alive) {
  loading(main, 'กำลังรวบรวมรายงาน…');
  let R;
  try { R = await API.call('activity.report', { id }); } catch (e) { return apiErr(e); }
  if (!alive()) return;
  const act = R.activity;
  const defs = R.statusDefs;
  const ss = act.sessions;
  const total = ss.length;
  const present = (k) => !!(defs[k] && defs[k].present);
  let sel = 'all';

  R.rooms.forEach((room) => {
    room.students.forEach((st) => {
      st.count = {}; act.statuses.forEach((k) => { st.count[k] = 0; });
      st.blank = 0;
      st.marks.forEach((m) => { if (m) st.count[m] = (st.count[m] || 0) + 1; else st.blank++; });
      st.present = st.marks.filter(present).length;
      st.pct = total ? Math.round(st.present / total * 1000) / 10 : 0;
      st.pass = st.pct >= act.pass_threshold;
    });
    room.checkedCount = room.checked.filter(Boolean).length;
    room.avg = room.students.length ? Math.round(room.students.reduce((n, s) => n + s.pct, 0) / room.students.length * 10) / 10 : 0;
    room.passCount = room.students.filter((s) => s.pass).length;
  });

  function sessHead(s) { return `${thDate(s.date)}${act.slots.length > 1 ? ' ' + s.label : ''}`; }

  function draw() {
    const allStudents = R.rooms.reduce((n, r) => n + r.students.length, 0);
    const allPass = R.rooms.reduce((n, r) => n + r.passCount, 0);
    const room = R.rooms.find((r) => r.id === sel);
    main.innerHTML = `
      <div class="page-head">
        <div class="grow"><div class="crumb"><a href="#/activities">กิจกรรม</a>  ›  รายงาน</div><h1>${esc(act.name)}</h1></div>
        <a class="btn" href="#/activity/${act.id}/links">${icon('link', 'sm')} ลิงก์ครู</a>
        <button class="btn primary" id="xlsx">${icon('download', 'sm')} ส่งออก Excel</button>
      </div>
      <div class="stats">
        <div class="stat"><div class="sub small">จำนวนครั้งที่เช็ค</div><div class="v" style="color:var(--pri)">${total}</div><div class="muted small">${dateRangeText(act.dates)}</div></div>
        <div class="stat"><div class="sub small">นักเรียน</div><div class="v">${allStudents.toLocaleString()}</div><div class="muted small">${R.rooms.length} ห้อง</div></div>
        <div class="stat"><div class="sub small">ผ่านเกณฑ์ ${act.pass_threshold}%</div><div class="v" style="color:var(--ok)">${allPass.toLocaleString()}</div><div class="muted small">ไม่ผ่าน ${(allStudents - allPass).toLocaleString()} คน</div></div>
        <div class="stat"><div class="sub small">ห้องที่เช็คครบทุกรอบ</div><div class="v">${R.rooms.filter((r) => r.checkedCount === total).length}/${R.rooms.length}</div><div class="muted small">ห้อง</div></div>
      </div>
      <div class="card stack">
        <div class="row wrap"><h2 class="grow">${room ? 'รายชื่อห้อง ' + esc(room.name) : 'สรุปรายห้อง'}</h2>
          <select class="input" id="sel" style="width:auto">${['<option value="all">ทุกห้อง (สรุป)</option>'].concat(R.rooms.map((r) => `<option value="${r.id}" ${sel === r.id ? 'selected' : ''}>${esc(r.name)}</option>`)).join('')}</select>
        </div>
        ${room ? roomTable(room) : summaryTable()}
      </div>`;
    main.querySelector('#sel').onchange = (e) => { sel = e.target.value; draw(); };
    main.querySelector('#xlsx').onclick = exportXlsx;
    main.querySelectorAll('[data-room]').forEach((tr) => tr.addEventListener('click', () => { sel = tr.dataset.room; draw(); }));
  }

  function summaryTable() {
    if (!R.rooms.length) return '<div class="empty">ไม่มีห้องเป้าหมาย</div>';
    return `<div class="table-wrap"><table class="t">
      <thead><tr><th>ห้อง</th><th>ครูที่ปรึกษา</th><th>นักเรียน</th><th>เช็คแล้ว (รอบ)</th><th>เข้าร่วมเฉลี่ย</th><th>ผ่านเกณฑ์</th><th>ไม่ผ่าน</th></tr></thead>
      <tbody>${R.rooms.map((r) => `<tr data-room="${r.id}" style="cursor:pointer">
        <td><b>${esc(r.name)}</b></td><td class="sub">${esc(r.advisor) || '—'}</td><td>${r.students.length}</td>
        <td>${r.checkedCount === total ? `<span class="pill ok">${r.checkedCount}/${total}</span>` : `<span class="pill warn">${r.checkedCount}/${total}</span>`}</td>
        <td>${r.avg}%</td><td style="color:var(--ok)">${r.passCount}</td><td style="color:${r.students.length - r.passCount ? 'var(--bad)' : 'inherit'}">${r.students.length - r.passCount}</td></tr>`).join('')}</tbody></table></div>
      <p class="help">กดที่แถวเพื่อดูรายชื่อของห้องนั้น</p>`;
  }

  function roomTable(room) {
    if (!room.students.length) return '<div class="empty">ห้องนี้ไม่มีรายชื่อนักเรียน</div>';
    return `<div class="table-wrap"><table class="t compact">
      <thead><tr><th>เลขที่</th><th>ชื่อ – นามสกุล</th>${ss.map((s, i) => `<th class="center" title="${esc(s.label)} ${s.open_time}–${s.close_time}">${esc(sessHead(s))}${room.checked[i] ? '' : '<br><span class="muted">ยังไม่เช็ค</span>'}</th>`).join('')}
      ${act.statuses.map((k) => `<th class="center">${esc(defs[k].label)}</th>`).join('')}<th class="center">%</th><th>ผล</th></tr></thead>
      <tbody>${room.students.map((st) => `<tr>
        <td class="sub">${esc(st.number)}</td><td class="nowrap">${esc(st.name)}</td>
        ${st.marks.map((m) => `<td class="center">${m ? `<span class="mark ${m}">${esc(defs[m].label)}</span>` : '<span class="mark none">–</span>'}</td>`).join('')}
        ${act.statuses.map((k) => `<td class="center">${st.count[k] || 0}</td>`).join('')}
        <td class="center"><b>${st.pct}</b></td>
        <td>${st.pass ? '<span class="pill ok">ผ่าน</span>' : '<span class="pill bad">ไม่ผ่าน</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function exportXlsx() {
    if (!window.XLSX) return toast('กำลังโหลดตัวสร้างไฟล์ Excel ลองใหม่อีกครั้ง', 'bad');
    const wb = XLSX.utils.book_new();
    const sum = [['ห้อง', 'ครูที่ปรึกษา', 'จำนวนนักเรียน', 'เช็คแล้ว (รอบ)', 'จำนวนรอบทั้งหมด', 'เข้าร่วมเฉลี่ย (%)', 'ผ่านเกณฑ์', 'ไม่ผ่าน']]
      .concat(R.rooms.map((r) => [r.name, r.advisor, r.students.length, r.checkedCount, total, r.avg, r.passCount, r.students.length - r.passCount]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'สรุป');
    const head = ['ห้อง', 'เลขที่', 'เลขประจำตัว', 'ชื่อ – นามสกุล'].concat(ss.map(sessHead), act.statuses.map((k) => defs[k].label), ['เข้าร่วม (%)', 'ผล']);
    const all = [head];
    const used = {};
    R.rooms.forEach((r) => {
      const rows = r.students.map((st) => [r.name, Number(st.number) || st.number, st.student_code, st.name]
        .concat(st.marks.map((m) => (m ? defs[m].label : '')), act.statuses.map((k) => st.count[k] || 0), [st.pct, st.pass ? 'ผ่าน' : 'ไม่ผ่าน']));
      all.push(...rows);
      let name = r.name.replace(/[\\/?*[\]:]/g, '-').slice(0, 28) || 'ห้อง';
      while (used[name]) name += '_';
      used[name] = 1;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head].concat(rows)), name);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(all), 'ทุกห้อง');
    XLSX.writeFile(wb, `รายงาน_${act.name}.xlsx`);
  }

  draw();
}

/* ============================== Settings ============================== */

function pageSettings(main) {
  main.innerHTML = `
    <div class="page-head"><div class="grow"><div class="crumb">ระบบ</div><h1>ตั้งค่า</h1></div></div>
    <div class="card stack" style="max-width:640px">
      <h2>ข้อมูลโรงเรียน</h2>
      <div class="field"><label>ชื่อโรงเรียน</label><input class="input" id="school" value="${esc(A.boot.schoolName)}" maxlength="120"></div>
      <div><button class="btn primary" id="saveSchool">บันทึก</button></div>
    </div>
    <div class="card stack" style="max-width:640px">
      <h2>เปลี่ยนรหัสผ่านแอดมิน</h2>
      <div class="field"><label>รหัสผ่านเดิม</label><input class="input" type="password" id="pw0" autocomplete="current-password"></div>
      <div class="grid2">
        <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label><input class="input" type="password" id="pw1" autocomplete="new-password"></div>
        <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input class="input" type="password" id="pw2" autocomplete="new-password"></div>
      </div>
      <div><button class="btn primary" id="savePw">เปลี่ยนรหัสผ่าน</button></div>
    </div>
    <div class="card stack" style="max-width:640px">
      <h2>ฐานข้อมูล</h2>
      <p class="sub">ข้อมูลทั้งหมดเก็บใน Google Sheets ของบัญชีผู้ติดตั้ง เปิดดูหรือสำรองข้อมูลได้โดยตรง (ไม่ควรแก้ไขหัวตาราง)</p>
      ${A.boot.sheetUrl ? `<div><a class="btn" href="${esc(A.boot.sheetUrl)}" target="_blank" rel="noopener">${icon('external', 'sm')} เปิด Google Sheets</a></div>` : ''}
      <p class="help">API: ${esc(window.APP_CONFIG.API_URL)}</p>
    </div>`;
  main.querySelector('#saveSchool').onclick = async () => {
    try {
      await API.call('settings.save', { schoolName: main.querySelector('#school').value });
      await refreshBoot(); toast('บันทึกแล้ว', 'ok');
    } catch (e) { apiErr(e); }
  };
  main.querySelector('#savePw').onclick = async () => {
    const [a, b, c] = ['#pw0', '#pw1', '#pw2'].map((s) => main.querySelector(s).value);
    if (b.length < 6) return toast('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร', 'bad');
    if (b !== c) return toast('ยืนยันรหัสผ่านไม่ตรงกัน', 'bad');
    try {
      await API.call('admin.changePassword', { oldPassword: a, newPassword: b });
      ['#pw0', '#pw1', '#pw2'].forEach((s) => { main.querySelector(s).value = ''; });
      toast('เปลี่ยนรหัสผ่านแล้ว', 'ok');
    } catch (e) { apiErr(e); }
  };
}

window.addEventListener('DOMContentLoaded', start);
