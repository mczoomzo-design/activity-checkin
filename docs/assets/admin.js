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

function checkBase() {
  return location.href.split('#')[0].split('?')[0].replace(/index\.html$/, '') + 'check.html';
}

function checkUrl(token) {
  return checkBase() + '?t=' + encodeURIComponent(token);
}

/** ลิงก์รวม: ครูทุกห้องใช้ลิงก์เดียวกันแล้วเลือกห้องของตัวเอง */
function hubUrl(token) {
  return checkBase() + '?h=' + encodeURIComponent(token);
}

function roomName(id) {
  const r = (A.boot.classrooms || []).find((c) => c.id === id);
  return r ? r.name : '';
}

async function refreshBoot() {
  const boot = await API.call('admin.bootstrap');
  if (!boot || !Array.isArray(boot.classrooms)) {
    throw Object.assign(new Error('ข้อมูลเริ่มต้นจากเซิร์ฟเวอร์ไม่ครบ'), { raw: JSON.stringify(boot).slice(0, 200) });
  }
  A.boot = boot;
  const s = document.getElementById('schoolName');
  if (s) s.textContent = A.boot.schoolName || '';
}

/* ============================== Login ============================== */

function renderLogin() {
  clearInterval(A.timer);
  root.innerHTML = `<div class="login-split">
    <div class="login-brand">
      <div class="row" style="position:relative;z-index:1"><div class="brand-ic">${icon('check')}</div><b class="head-font" style="font-size:22px">เช็คชื่อกิจกรรม</b></div>
      <div style="position:relative;z-index:1"><h1>เช็คชื่อทุกกิจกรรม<br>จบในลิงก์เดียว</h1><p>สร้างกิจกรรม ส่งลิงก์ให้ครูที่ปรึกษา แล้วดูความคืบหน้าของทุกห้องแบบสด ๆ</p></div>
      <div class="deco-tiles" aria-hidden="true">
        <div>ม.4/1<i style="background:var(--ok)"></i></div><div>ม.4/2<i style="background:var(--accent)"></i></div>
        <div>ม.5/1<i style="background:var(--ok)"></i></div><div>ม.6/3<i style="background:var(--sky)"></i></div>
      </div>
    </div>
    <div class="login-form"><div class="login-card">
      <div><h2>ยินดีต้อนรับกลับมา</h2><p class="sub" style="margin-top:4px">เข้าสู่ระบบสำหรับแอดมินฝ่ายกิจกรรม</p></div>
      <div class="field"><label for="pw">รหัสผ่าน</label><input class="input" type="password" id="pw" autocomplete="current-password" style="min-height:50px"></div>
      <p class="error-text hidden" id="err"></p>
      <button class="btn primary block" id="go" style="min-height:50px">เข้าสู่ระบบ</button>
      <p class="help">ครูที่ปรึกษาไม่ต้องเข้าสู่ระบบ ใช้ลิงก์ที่แอดมินส่งให้ได้เลย</p>
    </div></div>
  </div>`;
  const pw = document.getElementById('pw');
  const err = document.getElementById('err');
  const go = async () => {
    if (!pw.value) { err.textContent = 'กรุณาใส่รหัสผ่าน'; err.classList.remove('hidden'); return; }
    const b = document.getElementById('go');
    b.disabled = true; b.textContent = 'กำลังตรวจสอบ…';
    try {
      const r = await API.call('admin.login', { password: pw.value }, '');
      if (!r || typeof r.token !== 'string' || r.token.length < 16) {
        throw Object.assign(new Error('เซิร์ฟเวอร์ไม่ได้ส่งรหัสเข้าใช้งานกลับมา'), { raw: JSON.stringify(r).slice(0, 200) });
      }
      store.set('adminToken', r.token);
      start();
    } catch (e) {
      err.textContent = e.message + (e.raw ? ' · ' + e.raw : ''); err.classList.remove('hidden');
      pw.classList.remove('err'); void pw.offsetWidth; pw.classList.add('err');
      b.disabled = false; b.textContent = 'เข้าสู่ระบบ';
    }
  };
  pw.focus();
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  pw.addEventListener('input', () => { err.classList.add('hidden'); pw.classList.remove('err'); });
  document.getElementById('go').onclick = go;
}

/* ============================== Shell & routing ============================== */

async function start() {
  const tok = store.get('adminToken');
  if (!tok || tok === 'undefined' || tok === 'null') { store.del('adminToken'); return renderLogin(); }
  loading(root);
  try {
    await refreshBoot();
  } catch (e) {
    if (e.code === 'AUTH') { store.del('adminToken'); return renderLogin(); }
    root.innerHTML = `<div class="login-wrap"><div class="card login center"><div style="color:var(--bad)">${icon('alert')}</div><h2>เชื่อมต่อระบบไม่สำเร็จ</h2><p class="sub">${esc(e.message)}</p>
      ${e.raw ? `<p class="small muted" style="word-break:break-all">ข้อมูลที่ได้รับ: ${esc(e.raw)}</p>` : ''}
      <div class="row" style="justify-content:center"><button class="btn" id="relog">เข้าสู่ระบบใหม่</button><button class="btn primary" onclick="start()">ลองใหม่</button></div></div></div>`;
    document.getElementById('relog').onclick = () => { store.del('adminToken'); renderLogin(); };
    return;
  }
  renderShell();
  window.onhashchange = route;
  route();
}

function renderShell() {
  root.innerHTML = `<div class="app" id="app">
    <aside class="sidebar">
      <div class="brand"><div class="brand-ic">${icon('check')}</div><div class="grow"><b>เช็คชื่อกิจกรรม</b><small id="schoolName">${esc(A.boot.schoolName || '')}</small></div></div>
      <nav class="nav col" style="gap:4px">
        <a href="#/today" data-nav="today">${icon('sun')} วันนี้</a>
        <a href="#/activities" data-nav="activities">${icon('cal')} กิจกรรม</a>
        <a href="#/students" data-nav="students">${icon('users')} นักเรียน / ห้อง</a>
        <a href="#/settings" data-nav="settings">${icon('settings')} ตั้งค่า</a>
      </nav>
      <div class="side-tip"><b>เคล็ดลับ</b>ส่งลิงก์รวมครั้งเดียวในกลุ่ม LINE ครู ใช้ได้ทุกวันทุกรอบของกิจกรรม</div>
      <div class="side-foot"><div class="avatar">${icon('user', 'sm')}</div><div class="grow"><div style="font-weight:600;font-size:13px">แอดมิน</div><button class="link-btn small" id="logout" style="color:var(--sub);font-weight:500">ออกจากระบบ</button></div></div>
    </aside>
    <div>
      <div class="topbar"><button class="icon-btn" id="menuBtn" aria-label="เมนู">${icon('menu')}</button>เช็คชื่อกิจกรรม</div>
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
  const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const section = parts[0] === 'activity' ? 'activities' : parts[0];
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === section));
  window.scrollTo(0, 0);
  const alive = () => nav === A.nav;
  // เล่นแอนิเมชันตอนเนื้อหาของหน้าใหม่ถูกวาด (ครั้งแรกหลังโหลด)
  main.classList.remove('enter');
  const mo = new MutationObserver(() => {
    if (main.querySelector('.loading-block')) return;
    mo.disconnect();
    if (!alive()) return;
    void main.offsetWidth; main.classList.add('enter');
    // วาดซ้ำตอนรีเฟรชอัตโนมัติไม่ต้องเล่นซ้ำ
    setTimeout(() => main.classList.remove('enter'), 700);
  });
  mo.observe(main, { childList: true });
  if (parts[0] === 'today') return pageToday(main, alive);
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

/* ============================== Room tiles (ใช้ร่วมหลายหน้า) ============================== */

const TILE_PILL = {
  done: `<span class="pill ok">${icon('check', 'sm')} เช็คแล้ว</span>`,
  pending: '<span class="pill warn">รอเช็ค</span>',
  missed: '<span class="pill bad">ไม่ได้เช็ค</span>',
  unlocked: `<span class="pill sky">${icon('unlock', 'sm')} เปิดย้อนหลัง</span>`,
  'empty-room': '<span class="pill">ไม่มีรายชื่อ</span>',
  upcoming: '<span class="pill">ยังไม่เปิด</span>',
};

function tileHtml(r, status, i, extra = '') {
  return `<button class="tile ${status}" data-room="${r.id}" style="--i:${i}">
    <span class="tt"><b>${esc(r.name)}</b><i class="dot"></i></span>
    <small>${esc(r.advisor) || 'ยังไม่ระบุครูที่ปรึกษา'}</small>
    ${TILE_PILL[status] || ''}${extra}
  </button>`;
}

/** สถานะของห้องในรอบที่เลือก จากข้อมูล activity.links */
function roomStatus(D, r, idx, closedNow, unlockFor) {
  const sess = D.activity.sessions[idx];
  if (!r.student_count) return 'empty-room';
  if (r.progress[idx]) return 'done';
  if (unlockFor(r.id, sess.id)) return 'unlocked';
  if (closedNow(sess)) return 'missed';
  if (sess.date > D.today || (sess.date === D.today && D.now < sess.open_time)) return 'upcoming';
  return 'pending';
}

/** เลือกรอบที่ควรดูตอนนี้: เปิดอยู่ > ถัดไปของวันนี้ > ล่าสุดที่ผ่านมา */
function pickCurrentSession(ss, today, now) {
  return ss.find((s) => s.date === today && now >= s.open_time && now <= s.close_time)
    || ss.find((s) => s.date === today && now < s.open_time)
    || ss.filter((s) => s.date <= today).pop() || ss[0];
}

/* ============================== Today ============================== */

async function pageToday(main, alive) {
  loading(main);
  let list;
  try { list = await API.call('activity.list'); } catch (e) { return apiErr(e); }
  if (!alive()) return;
  const now = nowHm();
  const live = list.filter((a) => a.status !== 'closed' && a.today_sessions.length);
  const openNow = (a) => a.today_sessions.some((s) => now >= s.open_time && now <= s.close_time);
  const focus = live.find(openNow) || live.find((a) => a.today_sessions.some((s) => now < s.open_time)) || live[0];
  let D = null;
  if (focus) {
    try { D = await API.call('activity.links', { id: focus.id }); } catch (e) { return apiErr(e); }
    if (!alive()) return;
  }
  const today = (D && D.today) || A.boot.today;

  function draw() {
    const head = `<div class="page-head">
        <div class="grow"><div class="crumb">${thDateLong(today)}</div><h1>${greeting()}</h1></div>
        <a class="btn primary" href="#/activity/new">${icon('plus', 'sm')} สร้างกิจกรรม</a>
      </div>`;
    if (!D) {
      const next = list.filter((a) => a.status !== 'closed' && a.dates.some((d) => d > today)).sort((a, b) => a.dates.find((d) => d > today).localeCompare(b.dates.find((d) => d > today)))[0];
      main.innerHTML = head + `
        <div class="hero"><span class="live-pill off">${icon('sun', 'sm')} วันนี้ไม่มีรอบเช็คชื่อ</span>
          <h2>${next ? 'กิจกรรมถัดไป: ' + esc(next.name) : 'ยังไม่มีกิจกรรมที่กำลังจะมาถึง'}</h2>
          <p class="muted">${next ? dateRangeText(next.dates) : 'สร้างกิจกรรมใหม่ แล้วส่งลิงก์ให้ครูที่ปรึกษาเช็คชื่อได้เลย'}</p>
          <div class="row wrap">${next ? `<a class="btn accent" href="#/activity/${next.id}/links">${icon('link', 'sm')} เตรียมลิงก์ให้ครู</a>` : `<a class="btn accent" href="#/activity/new">${icon('plus', 'sm')} สร้างกิจกรรม</a>`}<a class="btn on-deep" href="#/activities">ดูกิจกรรมทั้งหมด</a></div>
        </div>
        ${!A.boot.classrooms.length ? `<div class="notice warn">${icon('info', 'sm')}<span>ยังไม่มีห้องเรียนและรายชื่อนักเรียน เริ่มที่ <a href="#/students"><b>นักเรียน / ห้อง</b></a> เพื่อนำเข้าจาก Excel</span></div>` : ''}`;
      return;
    }
    const act = D.activity;
    const ss = act.sessions;
    const sess = pickCurrentSession(ss.filter((s) => s.date === today).length ? ss.filter((s) => s.date === today) : ss, today, D.now);
    const idx = ss.findIndex((s) => s.id === sess.id);
    const closedNow = (s) => (s.date < D.today || (s.date === D.today && D.now > s.close_time)) && !act.allow_late_edit;
    const unlockFor = (rid, sid) => (D.unlocks || []).find((u) => u.classroom_id === rid && (u.session_id === sid || u.session_id === 'ALL'));
    const st = D.rooms.map((r) => roomStatus(D, r, idx, closedNow, unlockFor));
    const withKids = D.rooms.filter((r) => r.student_count);
    const doneN = st.filter((x) => x === 'done').length;
    const waiting = D.rooms.filter((r, i) => ['pending', 'missed', 'unlocked'].includes(st[i]));
    const isOpen = D.now >= sess.open_time && D.now <= sess.close_time && sess.date === D.today;
    const isWait = sess.date === D.today && D.now < sess.open_time;
    const mins = isOpen ? (Number(sess.close_time.slice(0, 2)) * 60 + Number(sess.close_time.slice(3))) - (Number(D.now.slice(0, 2)) * 60 + Number(D.now.slice(3))) : 0;
    const others = live.filter((a) => a.id !== act.id);
    const remindText = (r) => `ห้อง ${r.name}${r.advisor ? ' (' + r.advisor + ')' : ''} ยังไม่ได้เช็คชื่อ "${act.name}" รอบ${sess.label} (${sess.open_time}–${sess.close_time} น.)\n${checkUrl(r.token)}${act.require_pin ? '\nPIN: ' + r.pin : ''}`;
    main.innerHTML = head + `
      <div class="today-grid">
        <div class="hero">
          <div class="row wrap">
            <span class="live-pill ${isOpen ? '' : isWait ? 'wait' : 'off'}">${isOpen ? '<i class="live-dot"></i> กำลังเปิดเช็ค' : isWait ? icon('clock', 'sm') + ' เปิด ' + sess.open_time + ' น.' : icon('lock', 'sm') + ' ปิดแล้ว'} · รอบ${esc(sess.label)}</span>
            <span class="grow"></span>
            ${isOpen ? `<span style="color:var(--accent);font-weight:600;font-size:13px">ปิดใน ${mins >= 60 ? Math.floor(mins / 60) + ' ชม. ' : ''}${mins % 60} นาที</span>` : `<span class="muted small">${sess.open_time}–${sess.close_time} น.</span>`}
          </div>
          <h2>${esc(act.name)}</h2>
          <div class="row" style="align-items:baseline;gap:10px"><span class="big" id="heroNum">0</span><span class="muted" style="font-size:18px">/ ${withKids.length} ห้องเช็คแล้ว</span></div>
          <div class="bar"><i id="heroBar"></i></div>
          <div class="row wrap">
            <button class="btn accent" id="copyHub">${icon('send', 'sm')} ส่งลิงก์รวมให้ครู</button>
            <a class="btn on-deep" href="#/activity/${act.id}/links">ดูทุกห้อง ${icon('arrowRight', 'sm')}</a>
          </div>
        </div>
        <div class="card stack" style="gap:4px">
          <div class="row" style="margin-bottom:6px"><h2 class="grow">${waiting.length ? 'ยังไม่เช็ค ' + waiting.length + ' ห้อง' : 'เช็คครบทุกห้องแล้ว'}</h2>
            ${waiting.length ? `<button class="btn sm" id="remindAll" style="background:var(--accent-bg);color:var(--accent);border-color:transparent">${icon('bell', 'sm')} เตือนทั้งหมด</button>` : ''}</div>
          ${waiting.length ? waiting.slice(0, 6).map((r) => `<div class="pending-item">
              <span class="av ${closedNow(sess) ? 'bad' : ''}">${esc(r.name.replace(/^[^\d]*/, '') || r.name)}</span>
              <div class="grow"><b class="head-font" style="font-weight:600">${esc(r.name)}</b><div class="small sub">${esc(r.advisor) || 'ยังไม่ระบุครู'}</div></div>
              <button class="icon-btn" data-remind="${r.id}" title="คัดลอกข้อความเตือนครู">${icon('copy', 'sm')}</button>
            </div>`).join('') + (waiting.length > 6 ? `<a class="small" href="#/activity/${act.id}/links" style="padding-top:8px">ดูอีก ${waiting.length - 6} ห้อง ${icon('arrowRight', 'sm')}</a>` : '')
            : `<div class="empty" style="padding:24px 0">${icon('checks')}<p>ทุกห้องเช็คชื่อรอบนี้เรียบร้อย</p></div>`}
        </div>
      </div>
      <div class="card stack">
        <div class="row wrap"><h2 class="grow">ทุกห้อง · รอบ${esc(sess.label)} ${thDate(sess.date)}</h2>
          <span class="legend"><i style="background:var(--ok)"></i> เช็คแล้ว ${doneN}</span>
          <span class="legend"><i style="background:${closedNow(sess) ? 'var(--bad)' : 'var(--warn)'}"></i> ${closedNow(sess) ? 'ไม่ได้เช็ค' : 'รอเช็ค'} ${waiting.length}</span></div>
        <div class="tiles stagger">${D.rooms.map((r, i) => tileHtml(r, st[i], i)).join('')}</div>
      </div>
      ${others.length ? `<div class="stack" style="gap:12px"><h2>กิจกรรมอื่นวันนี้</h2><div class="act-list">${others.map(actCard).join('')}</div></div>` : ''}`;
    requestAnimationFrame(() => {
      countUp(document.getElementById('heroNum'), doneN, 700);
      const b = document.getElementById('heroBar'); if (b) b.style.width = (withKids.length ? doneN / withKids.length * 100 : 0) + '%';
    });
    main.querySelector('#copyHub').onclick = () => copyText(`ลิงก์เช็คชื่อ: ${act.name}\n${dateRangeText(act.dates)}\nครูที่ปรึกษากดลิงก์ แล้วเลือกห้องของตัวเองได้เลย\n${hubUrl(D.hub)}`);
    main.querySelectorAll('[data-remind]').forEach((b) => { b.onclick = () => copyText(remindText(D.rooms.find((r) => r.id === b.dataset.remind))); });
    const ra = main.querySelector('#remindAll');
    if (ra) ra.onclick = () => copyText(`ห้องที่ยังไม่ได้เช็คชื่อ "${act.name}" รอบ${sess.label}: ${waiting.map((r) => r.name).join(', ')}\nกรุณาเช็คชื่อที่ลิงก์นี้ (เลือกห้องของตัวเอง)\n${hubUrl(D.hub)}`);
    main.querySelectorAll('.tile[data-room]').forEach((t) => { t.onclick = () => { location.hash = '#/activity/' + act.id + '/links'; }; });
  }
  draw();
  A.timer = setInterval(async () => {
    if (document.hidden || !focus) return;
    try { const d = await API.call('activity.links', { id: focus.id }); if (!alive()) return; D = d; draw(); } catch (e) { /* ลองใหม่รอบหน้า */ }
  }, 60000);
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
  let D; let ss = []; let selDate; let selSid;
  async function fetchData(silent) {
    try {
      const d = await API.call('activity.links', { id });
      if (!alive()) return false;
      D = d;
      // รีเฟรชแล้วรอบอาจเปลี่ยน (มีคนแก้กิจกรรม) ต้องใช้รายการรอบชุดใหม่ให้ตรงกับ progress
      ss = D.activity.sessions;
      if (!ss.some((s) => s.id === selSid)) pickSession();
      return true;
    } catch (e) { if (!silent) apiErr(e); return false; }
  }
  function pickSession() {
    const pick = ss.find((s) => s.date === D.today && D.now >= s.open_time && D.now <= s.close_time)
      || ss.find((s) => s.date === D.today && D.now < s.open_time)
      || ss.filter((s) => s.date <= D.today).pop() || ss[0];
    selDate = pick && pick.date; selSid = pick && pick.id;
  }
  if (!(await fetchData())) return;

  /** รอบนี้ปิดสำหรับครูแล้ว (หมดเวลา และกิจกรรมไม่ได้เปิดให้แก้ย้อนหลังทุกห้อง) */
  function closedNow(s) {
    const past = s.date < D.today || (s.date === D.today && D.now > s.close_time);
    return past && !D.activity.allow_late_edit && D.activity.status !== 'closed';
  }
  /** การเปิดย้อนหลังที่ยังใช้ได้ของห้องสำหรับรอบนี้ (เลือกอันที่นานที่สุด) */
  function unlockFor(roomId, sessId) {
    return (D.unlocks || []).filter((u) => u.classroom_id === roomId && (u.session_id === sessId || u.session_id === 'ALL'))
      .sort((a, b) => b.until.localeCompare(a.until))[0];
  }
  function untilText(u) { return (u.slice(0, 10) === D.today ? 'วันนี้ ' : thDate(u.slice(0, 10)) + ' ') + u.slice(11, 16) + ' น.'; }

  function unlockModal(r) {
    const sess = ss.find((s) => s.id === selSid);
    const pending = ss.filter((s, i) => closedNow(s) && !r.progress[i]).length;
    const plusHour = new Date(Date.now() + 3600000);
    const hh = String(plusHour.getHours()).padStart(2, '0') + ':' + String(plusHour.getMinutes()).padStart(2, '0');
    const m = openModal(`
      <div class="modal-head"><div class="badge-ic sky">${icon('unlock')}</div><div class="grow"><h2>เปิดให้ห้อง ${esc(r.name)} เช็คย้อนหลัง</h2><p class="sub small">${esc(D.activity.name)}${r.advisor ? ' · ' + esc(r.advisor) : ''}</p></div><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div id="uForm" class="stack">
        <div class="col opts"><span class="label">เปิดรอบไหน</span>
          <label class="check"><input type="radio" name="uScope" value="one" checked> เฉพาะรอบนี้: ${esc(sess.label)} ${thDate(sess.date, false, true)} (${sess.open_time}–${sess.close_time})</label>
          <label class="check"><input type="radio" name="uScope" value="ALL"> ทุกรอบที่หมดเวลาแล้วของห้องนี้ <span class="muted small">(ค้างเช็ค ${pending} รอบ)</span></label>
        </div>
        <div class="col opts"><span class="label">เปิดให้ถึงเมื่อไหร่</span>
          <label class="check"><input type="radio" name="uDur" value="hour" checked> 1 ชั่วโมง <span class="muted small">(ถึงประมาณ ${hh} น.)</span></label>
          <label class="check"><input type="radio" name="uDur" value="today"> ถึงสิ้นวันนี้ <span class="muted small">(23:59 น.)</span></label>
          <label class="check"><input type="radio" name="uDur" value="date"> ถึงวันที่ <input class="input" type="date" id="uDate" min="${D.today}" value="${D.today}" style="width:auto;min-height:32px;padding:4px 8px"></label>
        </div>
        <p class="help">ครูใช้ลิงก์เดิมได้เลย ทั้งลิงก์รวมและลิงก์ของห้อง เมื่อถึงเวลาที่กำหนด ระบบจะปิดให้เอง</p>
      </div>
      <div class="modal-foot" id="uFoot"><button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="uGo">${icon('unlock', 'sm')} เปิดให้เช็ค</button></div>`);
    m.el.querySelector('#uDate').addEventListener('change', () => { m.el.querySelector('input[name="uDur"][value="date"]').checked = true; });
    m.el.querySelector('#uGo').focus();
    m.el.querySelector('#uGo').onclick = async () => {
      const scope = m.el.querySelector('input[name="uScope"]:checked').value;
      const duration = m.el.querySelector('input[name="uDur"]:checked').value;
      const btn = m.el.querySelector('#uGo'); btn.disabled = true;
      try {
        const res = await API.call('unlock.create', { activityId: D.activity.id, classroomId: r.id, sessionId: scope === 'ALL' ? 'ALL' : sess.id, duration, date: m.el.querySelector('#uDate').value });
        await fetchData(true); draw();
        const what = scope === 'ALL' ? 'ทุกรอบที่ค้างอยู่' : `รอบ${sess.label} ${thDate(sess.date)}`;
        const msg = `ห้อง ${r.name}: เปิดให้เช็คชื่อ "${D.activity.name}" ${what} ย้อนหลังได้ถึง ${untilText(res.until)}\n${hubUrl(D.hub)}`;
        m.el.querySelector('#uForm').innerHTML = `<div class="notice">${icon('check', 'sm')}<span>เปิดให้ห้อง ${esc(r.name)} เช็ค${esc(what)}ย้อนหลังได้ถึง <b>${esc(untilText(res.until))}</b> แล้ว</span></div>
          <p class="sub small">ส่งข้อความนี้แจ้งครูได้เลย:</p><textarea class="input" readonly rows="3">${esc(msg)}</textarea>`;
        m.el.querySelector('#uFoot').innerHTML = '<button class="btn" id="uCopy">' + icon('copy', 'sm') + ' คัดลอกข้อความ</button><button class="btn primary" id="uDone">เสร็จ</button>';
        m.el.querySelector('#uCopy').onclick = () => copyText(msg);
        m.el.querySelector('#uDone').onclick = m.close;
      } catch (e) { apiErr(e); btn.disabled = false; }
    };
  }

  function draw() {
    const act = D.activity;
    const dates = [...new Set(ss.map((s) => s.date))];
    const idx = ss.findIndex((s) => s.id === selSid);
    const sess = ss[idx];
    const withKids = D.rooms.filter((r) => r.student_count).length;
    const status = (r, i) => roomStatus(D, r, i, closedNow, unlockFor);
    const st = sess ? D.rooms.map((r) => status(r, idx)) : [];
    const done = st.filter((x) => x === 'done').length;
    const missed = D.rooms.filter((r, i) => st[i] === 'missed' || st[i] === 'unlocked');
    const pending = D.rooms.filter((r, i) => st[i] === 'pending');
    const roundChip = (s) => {
      const i = ss.indexOf(s);
      const n = D.rooms.filter((r) => r.student_count && r.progress[i]).length;
      const future = s.date > D.today || (s.date === D.today && D.now < s.open_time);
      const cls = future ? '' : n >= withKids && withKids ? 'ok' : closedNow(s) ? 'bad' : 'pri';
      return `<button class="round ${s.id === selSid ? 'on' : ''}" data-sid="${s.id}"><b>${esc(s.label)}</b><small class="${cls}">${future ? s.open_time : n + '/' + withKids}</small></button>`;
    };
    main.innerHTML = `
      <div class="page-head">
        <div class="grow"><div class="crumb"><a href="#/activities">กิจกรรม</a>  ›  ติดตามการเช็คชื่อ</div><h1>${esc(act.name)}</h1></div>
        <a class="btn" href="#/activity/${act.id}/edit">${icon('edit', 'sm')} แก้ไขกิจกรรม</a>
        <a class="btn" href="#/activity/${act.id}/report">${icon('chart', 'sm')} รายงาน</a>
      </div>
      ${act.status === 'closed' ? `<div class="notice warn">${icon('lock', 'sm')}<span>กิจกรรมนี้ปิดแล้ว ครูเปิดลิงก์ดูได้แต่เช็คชื่อไม่ได้</span></div>` : ''}
      ${D.rooms.length ? `<div class="stack" style="gap:10px">
        <div class="hub-bar">
          <span class="icon-box accent">${icon('link', 'lg')}</span>
          <div class="grow" style="min-width:200px"><h3 class="head-font" style="font-size:17px">ลิงก์เดียวสำหรับทุกห้อง</h3><div class="url">${esc(hubUrl(D.hub))}</div></div>
          <button class="btn" id="hubQr">${icon('qr', 'sm')} QR Code</button>
          <a class="btn" href="${hubUrl(D.hub)}" target="_blank" rel="noopener">${icon('external', 'sm')} เปิดดู</a>
          <button class="btn accent" id="hubCopy">${icon('copy', 'sm')} คัดลอกข้อความส่ง LINE</button>
        </div>
        <div class="row wrap" style="gap:8px 16px">
          ${act.require_pin
            ? `<span class="small" style="color:var(--pri)">${icon('lock', 'sm')} เปิด PIN อยู่: ครูแต่ละห้องต้องใส่ PIN ของห้องตัวเอง (กดที่การ์ดห้องเพื่อดู PIN)</span>`
            : `<span class="small" style="color:var(--warn)">${icon('info', 'sm')} ใครมีลิงก์นี้เช็คชื่อได้ทุกห้อง · เปิด "ต้องใส่ PIN" ได้ใน<a href="#/activity/${act.id}/edit">หน้าแก้ไขกิจกรรม</a></span>`}
          <span class="grow"></span>
          <button class="link-btn small" id="copyAll">${icon('copy', 'sm')} คัดลอกลิงก์แยกทุกห้อง</button>
          <button class="link-btn small" id="exportLinks">${icon('xls', 'sm')} ส่งออกลิงก์ Excel</button>
          <button class="link-btn small" id="hubReset" style="color:var(--sub)">${icon('refresh', 'sm')} สร้างลิงก์รวมใหม่</button>
        </div>
      </div>` : `<div class="card empty">${icon('door')}<h2>ยังไม่มีห้องเป้าหมาย</h2><p style="margin-top:6px"><a href="#/students">เพิ่มห้องเรียน</a> หรือ <a href="#/activity/${act.id}/edit">แก้ไขห้องที่ต้องเช็คชื่อ</a></p></div>`}
      ${D.rooms.length && ss.length ? `
      <div class="card" style="padding:18px 22px">
        <div class="rounds" id="rounds">${dates.map((d) => `<div class="day"><span>${thDate(d, false, true)}${d === D.today ? ' · วันนี้' : ''}</span><div class="chips">${ss.filter((s) => s.date === d).map(roundChip).join('')}</div></div>`).join('')}</div>
      </div>
      <div class="track-grid">
        <div class="card stack">
          <div class="row wrap"><h2 class="grow">${thDate(sess.date, false, true)} · รอบ${esc(sess.label)} <span class="sub" style="font-family:var(--font);font-size:14px;font-weight:400">${sess.open_time}–${sess.close_time} น.${closedNow(sess) ? ' (หมดเวลาแล้ว)' : ''}</span></h2>
            <span class="pill ${done >= withKids && withKids ? 'ok' : 'warn'}">เช็คแล้ว ${done}/${withKids} ห้อง</span>
            <button class="btn sm ghost" id="reload">${icon('refresh', 'sm')} รีเฟรช</button></div>
          <div class="tiles stagger" id="tiles">${D.rooms.map((r, i) => {
            const p = r.progress[idx];
            const extra = p ? `<span class="meta-line">มา ${(p.tally.P || 0) + (p.tally.T || 0)} · ขาด ${p.tally.A || 0}${p.tally.L ? ' · ลา ' + p.tally.L : ''} · ${esc(p.at.slice(11, 16))} น.</span>` : '';
            return tileHtml(r, st[i], i, extra);
          }).join('')}</div>
          <p class="help">กดที่การ์ดห้องเพื่อคัดลอกลิงก์ ดู QR / PIN เช็คแทนครู หรือเปิดให้เช็คย้อนหลัง · รีเฟรชอัตโนมัติทุก 1 นาที</p>
        </div>
        <div class="card stack" style="gap:10px">
          ${missed.length ? `<h2>ไม่ได้เช็ค ${missed.length} ห้อง</h2><p class="sub small">เปิดให้ครูห้องนั้นกลับมาเช็คย้อนหลังได้ ห้องอื่นยังปิดอยู่</p>
            ${missed.map((r) => { const un = unlockFor(r.id, sess.id); return `<div class="miss-item" data-room="${r.id}">
              <div class="grow"><b class="head-font" style="font-size:16px;font-weight:600">${esc(r.name)}</b><div class="small sub">${esc(r.advisor) || 'ยังไม่ระบุครู'}</div></div>
              ${un ? `<div class="col" style="align-items:flex-end;gap:2px"><span class="pill sky">${icon('unlock', 'sm')} ถึง ${esc(untilText(un.until))}</span><button class="link-btn small" data-act="revoke" data-uid="${un.id}" style="color:var(--bad)">ยกเลิก</button></div>`
                : `<button class="btn sm sky" data-act="unlock">${icon('unlock', 'sm')} เปิดย้อนหลัง</button>`}
            </div>`; }).join('')}`
          : pending.length ? `<h2>รอเช็ค ${pending.length} ห้อง</h2><p class="sub small">คัดลอกข้อความเตือนแล้วส่งให้ครูได้เลย</p>
            ${pending.slice(0, 8).map((r) => `<div class="miss-item" data-room="${r.id}"><div class="grow"><b class="head-font" style="font-size:16px;font-weight:600">${esc(r.name)}</b><div class="small sub">${esc(r.advisor) || 'ยังไม่ระบุครู'}</div></div><button class="icon-btn" data-act="copy" title="คัดลอกลิงก์ห้องนี้">${icon('copy', 'sm')}</button></div>`).join('')}
            ${pending.length > 8 ? `<p class="small sub">และอีก ${pending.length - 8} ห้อง</p>` : ''}`
          : `<div class="empty" style="padding:28px 0">${icon('checks')}<h2>${withKids ? 'เช็คครบทุกห้องแล้ว' : 'ยังไม่มีห้องที่มีรายชื่อ'}</h2></div>`}
        </div>
      </div>` : ''}`;
    bind();
  }

  function linkText(r) {
    return `${r.name}${r.advisor ? ' (' + r.advisor + ')' : ''}\n${checkUrl(r.token)}${D.activity.require_pin ? '\nPIN: ' + r.pin : ''}`;
  }

  /** กดการ์ดห้อง: รายละเอียด + ทุกอย่างที่ทำกับห้องนั้นได้ */
  function roomModal(r) {
    const idx = ss.findIndex((s) => s.id === selSid);
    const sess = ss[idx];
    const st = roomStatus(D, r, idx, closedNow, unlockFor);
    const p = r.progress[idx];
    const un = unlockFor(r.id, sess.id);
    const canUnlock = closedNow(sess) && !un && r.student_count;
    const m = openModal(`
      <div class="modal-head"><div class="badge-ic">${icon('door')}</div><div class="grow"><h2>ห้อง ${esc(r.name)}</h2><p class="sub small">${esc(r.advisor) || 'ยังไม่ระบุครูที่ปรึกษา'}${r.advisor_contact ? ' · ' + esc(r.advisor_contact) : ''} · ${r.student_count} คน</p></div><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="card tight" style="background:var(--bg);box-shadow:none">
        <div class="row wrap"><span class="grow"><b>รอบ${esc(sess.label)} ${thDate(sess.date, false, true)}</b> <span class="sub small">${sess.open_time}–${sess.close_time} น.</span></span>${TILE_PILL[st] || ''}</div>
        ${p ? `<div class="row wrap small sub" style="margin-top:8px;gap:8px">${Object.keys(p.tally).map((k) => `<span class="mark ${k}">${esc(A.boot.statusDefs[k] ? A.boot.statusDefs[k].label : k)} ${p.tally[k]}</span>`).join('')}<span>บันทึก ${esc(p.at.slice(11, 16))} น.</span></div>` : ''}
        ${un ? `<div class="row small" style="margin-top:8px"><span style="color:var(--sky)">${icon('unlock', 'sm')} เปิดให้เช็คย้อนหลังถึง ${esc(untilText(un.until))}</span><button class="link-btn small" id="rRevoke" style="color:var(--bad)">ยกเลิกการเปิด</button></div>` : ''}
      </div>
      ${D.activity.require_pin ? `<div class="row"><span class="sub">PIN ของห้องนี้</span><b class="head-font" style="font-size:24px;letter-spacing:6px">${esc(r.pin)}</b></div>` : ''}
      <div class="copy-field"><input class="input" readonly value="${esc(checkUrl(r.token))}"><button class="btn" id="rCopy">${icon('copy', 'sm')} คัดลอก</button></div>
      <div class="row wrap" style="gap:8px">
        ${canUnlock ? `<button class="btn sky" id="rUnlock">${icon('unlock', 'sm')} ${p ? 'เปิดให้แก้ไขย้อนหลัง' : 'เปิดให้เช็คย้อนหลัง'}</button>` : ''}
        <a class="btn" href="${checkUrl(r.token)}" target="_blank" rel="noopener">${icon('external', 'sm')} เช็คแทนครู</a>
        <button class="btn" id="rQr">${icon('qr', 'sm')} QR Code</button>
        <span class="grow"></span>
        <button class="btn ghost danger" id="rReset">${icon('refresh', 'sm')} สร้างลิงก์ใหม่</button>
      </div>`);
    const q = (s) => m.el.querySelector(s);
    q('#rCopy').onclick = () => copyText(linkText(r));
    q('#rQr').onclick = () => { m.close(); showQr({ title: 'QR Code ห้อง ' + r.name, sub: D.activity.name + (r.advisor ? ' · ' + r.advisor : ''), url: checkUrl(r.token), pin: D.activity.require_pin ? r.pin : '', copy: linkText(r), file: 'QR_' + r.name.replace(/\//g, '-') }); };
    if (q('#rUnlock')) q('#rUnlock').onclick = () => { m.close(); unlockModal(r); };
    if (q('#rRevoke')) q('#rRevoke').onclick = async () => { m.close(); await revoke(r, un.id); };
    q('#rReset').onclick = async () => {
      m.close();
      if (!(await confirmBox('สร้างลิงก์ใหม่?', `ลิงก์เดิมของห้อง <b>${esc(r.name)}</b> จะใช้ไม่ได้ทันที ต้องส่งลิงก์ใหม่ให้ครูอีกครั้ง (ข้อมูลการเช็คชื่อไม่หาย)`, { okText: 'สร้างลิงก์ใหม่', danger: true }))) return;
      try {
        const res = await API.call('link.reset', { activityId: D.activity.id, classroomId: r.id });
        r.token = res.token; r.pin = res.pin;
        draw(); toast('สร้างลิงก์ใหม่แล้ว', 'ok');
      } catch (e) { apiErr(e); }
    };
  }

  async function revoke(r, uid) {
    const u = (D.unlocks || []).find((x) => x.id === uid);
    const what = u && u.session_id === 'ALL' ? 'ทุกรอบที่เปิดไว้' : 'รอบนี้';
    if (!(await confirmBox('ยกเลิกการเปิดย้อนหลัง?', `ห้อง <b>${esc(r.name)}</b> จะเช็คชื่อ${what}ไม่ได้อีก (ข้อมูลที่เช็คไปแล้วไม่หาย)`, { okText: 'ยกเลิกการเปิด', danger: true }))) return;
    try {
      await API.call('unlock.revoke', { id: uid });
      await fetchData(true); draw(); toast('ยกเลิกแล้ว', 'ok');
    } catch (e) { apiErr(e); }
  }

  function bind() {
    const q = (s) => main.querySelector(s);
    if (q('#rounds')) q('#rounds').onclick = (e) => {
      const b = e.target.closest('[data-sid]'); if (!b || b.dataset.sid === selSid) return;
      selSid = b.dataset.sid; selDate = ss.find((s) => s.id === selSid).date; draw();
    };
    if (q('#reload')) q('#reload').onclick = async () => { if (await fetchData()) { draw(); toast('อัปเดตแล้ว'); } };
    const hubText = () => `ลิงก์เช็คชื่อ: ${D.activity.name}\n${dateRangeText(D.activity.dates)}\nครูที่ปรึกษากดลิงก์ แล้วเลือกห้องของตัวเองได้เลย\n${hubUrl(D.hub)}`;
    if (q('#hubCopy')) {
      q('#hubCopy').onclick = () => copyText(hubText());
      q('#hubQr').onclick = () => showQr({ title: 'QR Code ลิงก์รวมทุกห้อง', sub: D.activity.name, url: hubUrl(D.hub), copy: hubText(), file: 'QR_ทุกห้อง' });
      q('#hubReset').onclick = async () => {
        if (!(await confirmBox('สร้างลิงก์รวมใหม่?', 'ลิงก์รวมเดิมจะใช้ไม่ได้ทันที ต้องส่งลิงก์ใหม่ให้ครูอีกครั้ง (ลิงก์แยกรายห้องและข้อมูลการเช็คชื่อไม่เปลี่ยน)', { okText: 'สร้างลิงก์ใหม่', danger: true }))) return;
        try {
          const res = await API.call('link.reset', { activityId: D.activity.id, classroomId: 'ALL' });
          D.hub = res.token;
          draw(); toast('สร้างลิงก์รวมใหม่แล้ว', 'ok');
        } catch (e) { apiErr(e); }
      };
      q('#copyAll').onclick = () => {
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
    }
    main.querySelectorAll('#tiles .tile[data-room]').forEach((t) => { t.onclick = () => roomModal(D.rooms.find((r) => r.id === t.dataset.room)); });
    main.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const r = D.rooms.find((x) => x.id === b.closest('[data-room]').dataset.room);
      const act = b.dataset.act;
      if (act === 'copy') copyText(linkText(r));
      if (act === 'unlock') unlockModal(r);
      if (act === 'revoke') revoke(r, b.dataset.uid);
    }));
  }

  function showQr({ title, sub, url, pin, copy, file }) {
    const m = openModal(`
      <div class="modal-head"><div class="badge-ic">${icon('qr')}</div><div class="grow"><h2>${esc(title)}</h2><p class="sub small">${esc(sub)}</p></div><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="qr-box" id="qr"></div>
      ${pin ? `<p class="center">PIN: <b style="font-size:20px;letter-spacing:4px">${esc(pin)}</b></p>` : ''}
      <div class="copy-field"><input class="input" readonly value="${esc(url)}"><button class="btn" id="cp">${icon('copy', 'sm')} คัดลอก</button></div>
      <div class="modal-foot"><button class="btn" id="dl">${icon('download', 'sm')} บันทึกรูป QR</button><button class="btn primary" data-close>ปิด</button></div>`);
    const box = m.el.querySelector('#qr');
    if (window.QRCode) new QRCode(box, { text: url, width: 440, height: 440, correctLevel: QRCode.CorrectLevel.M });
    else box.innerHTML = '<p class="sub">โหลดตัวสร้าง QR ไม่สำเร็จ</p>';
    m.el.querySelector('#cp').onclick = () => copyText(copy);
    m.el.querySelector('#dl').onclick = () => {
      const img = box.querySelector('img'); const cv = box.querySelector('canvas');
      const src = cv ? cv.toDataURL('image/png') : img && img.src;
      if (!src) return;
      const a = document.createElement('a'); a.href = src; a.download = file + '.png'; a.click();
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
    const used = { 'สรุป': 1, 'ทุกห้อง': 1 };
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
