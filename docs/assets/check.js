/* หน้าเช็คชื่อของครูที่ปรึกษา: check.html?t=<ลิงก์ห้อง> หรือ check.html?h=<ลิงก์รวมทุกห้อง> */
(function () {
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';
  const hub = params.get('h') || '';
  const pinKey = 'pin_' + token;
  const hubUrl = hub ? 'check.html?h=' + encodeURIComponent(hub) : '';

  const S = {
    data: null,
    date: null,
    sessionId: null,
    marks: {},   // sessionId -> { studentId: {s, n} }
    dirty: {},   // sessionId -> true
    saving: false,
    justSaved: false,
  };

  /* ---------- เปลี่ยนหน้าแบบเลื่อน (เข้า = ไปทางซ้าย, ย้อนกลับ = ไปทางขวา) ---------- */
  function go(url, back) {
    try { sessionStorage.setItem('navDir', back ? 'back' : 'fwd'); } catch (e) { /* ignore */ }
    app.classList.remove('enter-right', 'enter-left');
    app.classList.add(back ? 'leave-right' : 'leave-left');
    setTimeout(() => { location.href = url; }, 200);
  }
  function playEnter() {
    let dir = '';
    try { dir = sessionStorage.getItem('navDir') || ''; sessionStorage.removeItem('navDir'); } catch (e) { /* ignore */ }
    if (dir) app.classList.add(dir === 'back' ? 'enter-left' : 'enter-right');
  }
  window.addEventListener('pageshow', (e) => { if (e.persisted) app.classList.remove('leave-left', 'leave-right'); });
  app.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-back]');
    if (!a) return;
    e.preventDefault();
    if (!leaveOk()) return;
    S.dirty = {};
    go(a.getAttribute('href'), true);
  });

  if (!token && hub) return loadHub();
  if (!token) return fatal('ไม่พบรหัสลิงก์', 'กรุณาเปิดจากลิงก์ที่ได้รับจากแอดมินฝ่ายกิจกรรม');

  load();

  /* ============================== ลิงก์รวม: เลือกห้อง ============================== */
  async function loadHub() {
    let H;
    try {
      H = await API.call('hub.get', { token: hub });
    } catch (e) {
      if (e.code === 'LINK') return fatal('ลิงก์ใช้งานไม่ได้', e.message);
      return fatal('โหลดข้อมูลไม่สำเร็จ', e.message, true);
    }
    document.title = 'เลือกห้อง · ' + H.activity.name;
    const lastKey = 'hubroom_' + hub;
    const s = H.session;
    const stateText = !s ? '' : s.state === 'open' ? `เปิดเช็คถึง ${s.close_time} น.` : s.state === 'upcoming' ? `เปิด ${s.date === H.today ? s.open_time + ' น.' : thDate(s.date)}` : s.state === 'late' ? 'เลยเวลา · แก้ไขได้' : 'ปิดแล้ว';
    const done = H.rooms.filter((r) => r.checked_at).length;
    const pct = H.rooms.length ? Math.round(done / H.rooms.length * 100) : 0;
    const status = (r) => !s ? '' : r.checked_at ? 'done' : s.state === 'closed' ? 'missed' : 'pending';
    const pill = (st) => st === 'done' ? `<span class="pill ok">${icon('check', 'sm')} เช็คแล้ว</span>` : st === 'pending' ? '<span class="pill warn">รอเช็ค</span>' : st === 'missed' ? '<span class="pill bad">ไม่ได้เช็ค</span>' : '';
    const tile = (r, i) => `<button class="tile ${status(r)}" data-name="${esc(r.name)}" style="--i:${i}">
        <span class="tt"><b>${esc(r.name)}</b><i class="dot"></i></span>
        <small>${esc(r.advisor) || '&nbsp;'}</small>${pill(status(r))}
      </button>`;
    const last = H.rooms.find((r) => r.name === store.get(lastKey));

    app.innerHTML = `
      <div class="t-head">
        <div class="act">${esc(H.schoolName || '')}${H.schoolName ? ' · ' : ''}${dateRangeText(H.activity.dates)}</div>
        <div class="room">${esc(H.activity.name)}</div>
        ${s ? `<div class="chips"><span class="state-pill ${s.state}">${s.state === 'open' ? '<i class="live-dot"></i>' : icon('clock', 'sm')} รอบ${esc(s.label)} · ${stateText}</span></div>
        <div class="head-bar"><div class="row"><span>ห้องที่เช็คแล้วรอบนี้</span><b>${done} / ${H.rooms.length} ห้อง</b></div><div class="bar"><i id="hubBar"></i></div></div>` : ''}
      </div>
      <div class="t-body">
        ${H.activity.status === 'closed' ? `<div class="notice bad">${icon('lock', 'sm')}<span>กิจกรรมนี้ปิดการเช็คชื่อแล้ว</span></div>` : ''}
        <h2>เลือกห้องที่คุณเป็นครูที่ปรึกษา</h2>
        ${H.rooms.length > 8 ? `<label class="search-box">${icon('search')}<input id="hubSearch" placeholder="ค้นหาห้อง หรือชื่อครู" autocomplete="off"></label>` : ''}
        ${last ? `<button class="hub-recent" data-name="${esc(last.name)}"><span class="icon-box">${icon('refresh')}</span><span class="grow"><span class="small" style="color:var(--pri)">ห้องของคุณล่าสุด</span><b>${esc(last.name)}${last.advisor ? ' · ' + esc(last.advisor) : ''}</b></span>${icon('arrowRight')}</button>` : ''}
        ${!H.rooms.length ? '<div class="card empty">กิจกรรมนี้ยังไม่มีห้องเรียน กรุณาแจ้งแอดมิน</div>' : ''}
        <div id="groups" class="stack"></div>
        ${H.activity.require_pin ? `<p class="help center">${icon('lock', 'sm')} แต่ละห้องต้องใส่ PIN ของห้องตัวเองก่อนเช็คชื่อ</p>` : ''}
      </div>`;
    const groupsEl = document.getElementById('groups');
    function drawGroups(q) {
      const list = q ? H.rooms.filter((r) => (r.name + ' ' + (r.advisor || '')).toLowerCase().includes(q.toLowerCase())) : H.rooms;
      const groups = [];
      list.forEach((r) => { let g = groups.find((x) => x.grade === r.grade); if (!g) groups.push(g = { grade: r.grade, rooms: [] }); g.rooms.push(r); });
      let i = 0;
      groupsEl.innerHTML = (q && !list.length ? '<div class="empty">ไม่พบห้องที่ค้นหา</div>' : '')
        + groups.map((g) => `<div class="col" style="gap:8px"><span class="label">${esc(g.grade)}</span><div class="hub-grid stagger">${g.rooms.map((r) => tile(r, i++)).join('')}</div></div>`).join('');
    }
    drawGroups('');
    playEnter();
    requestAnimationFrame(() => { const b = document.getElementById('hubBar'); if (b) b.style.width = pct + '%'; });
    app.addEventListener('click', (e) => {
      const b = e.target.closest('.tile[data-name], .hub-recent[data-name]');
      if (!b) return;
      const r = H.rooms.find((x) => x.name === b.dataset.name);
      store.set(lastKey, r.name);
      go('check.html?t=' + encodeURIComponent(r.token) + '&h=' + encodeURIComponent(hub));
    });
    const sb = document.getElementById('hubSearch');
    if (sb) sb.addEventListener('input', debounce(() => drawGroups(sb.value.trim()), 150));
  }

  /* ============================== หน้าเช็คชื่อของห้อง ============================== */
  async function load(pin) {
    try {
      const p = { token, pin: pin || sessionStorage.getItem(pinKey) || '' };
      const data = await API.call('teacher.get', p);
      if (p.pin) sessionStorage.setItem(pinKey, p.pin);
      // เก็บสิ่งที่เช็คไว้แต่ยังไม่ได้บันทึก (เช่น ถูกถาม PIN ใหม่ตอนกดบันทึก) ไม่ให้หายตอนโหลดใหม่
      const unsaved = {};
      Object.keys(S.dirty).forEach((sid) => { if (S.dirty[sid] && S.marks[sid]) unsaved[sid] = S.marks[sid]; });
      S.data = data;
      S.marks = {};
      Object.keys(data.attendance).forEach((sid) => { S.marks[sid] = JSON.parse(JSON.stringify(data.attendance[sid].data)); });
      S.dirty = {};
      Object.keys(unsaved).forEach((sid) => {
        if (data.sessions.some((s) => s.id === sid)) { S.marks[sid] = unsaved[sid]; S.dirty[sid] = true; }
      });
      if (!S.sessionId || !data.sessions.some((s) => s.id === S.sessionId)) pickDefaultSession();
      document.title = 'เช็คชื่อ ' + data.classroom.name + ' · ' + data.activity.name;
      render();
      playEnter();
    } catch (e) {
      if (e.code === 'HUB') return location.replace('check.html?h=' + encodeURIComponent(token));
      if (e.code === 'PIN') { renderPin(e.message, !!pin); return playEnter(); }
      if (e.code === 'LINK') return fatal('ลิงก์ใช้งานไม่ได้', e.message);
      fatal('โหลดข้อมูลไม่สำเร็จ', e.message, true);
    }
  }

  function pickDefaultSession() {
    const ss = S.data.sessions;
    if (!ss.length) { S.sessionId = null; S.date = null; return; }
    const pick = ss.find((s) => s.state === 'open')
      || ss.find((s) => s.state === 'unlocked' && !S.data.attendance[s.id])
      || ss.find((s) => s.state === 'unlocked')
      || ss.find((s) => s.date === S.data.today && s.state === 'upcoming')
      || ss.filter((s) => s.date <= S.data.today).pop()
      || ss[0];
    S.sessionId = pick.id;
    S.date = pick.date;
  }

  function fatal(title, msg, retry) {
    app.innerHTML = `<div class="t-body"><div class="card center pin-box">
      <div style="color:var(--bad);margin-bottom:8px">${icon('alert', 'lg')}</div>
      <h2>${esc(title)}</h2><p class="sub" style="margin-top:6px">${esc(msg)}</p>
      ${retry ? '<button class="btn primary" style="margin-top:16px" id="retry">ลองใหม่</button>' : ''}</div></div>`;
    const b = document.getElementById('retry');
    if (b) b.onclick = () => { app.innerHTML = '<div class="loading-block"><div class="spinner"></div>กำลังโหลด…</div>'; load(); };
  }

  function renderPin(msg, wasWrong) {
    sessionStorage.removeItem(pinKey);
    app.innerHTML = `<div class="t-body">${hubUrl ? `<a class="link-btn" href="${hubUrl}" data-back>${icon('back', 'sm')} เลือกห้องอื่น</a>` : ''}<div class="card pin-box stack">
      <div class="center"><span class="icon-box" style="width:56px;height:56px;border-radius:18px">${icon('lock', 'lg')}</span></div>
      <div class="center"><h2>ใส่ PIN 4 หลัก</h2><p class="sub small" style="margin-top:4px">PIN ได้รับมาพร้อมลิงก์จากแอดมิน</p></div>
      <input class="input pin-input ${wasWrong ? 'err' : ''}" id="pin" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••">
      ${wasWrong ? `<p class="error-text center">${esc(msg)}</p>` : ''}
      <button class="btn primary block" id="go">เข้าสู่หน้าเช็คชื่อ</button></div></div>`;
    const inp = document.getElementById('pin');
    const submit = () => {
      const v = inp.value.trim();
      if (!/^\d{4}$/.test(v)) { inp.classList.remove('err'); void inp.offsetWidth; inp.classList.add('err'); return; }
      app.innerHTML = '<div class="loading-block"><div class="spinner"></div>กำลังตรวจสอบ…</div>';
      load(v);
    };
    inp.focus();
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    inp.addEventListener('input', () => { inp.classList.remove('err'); if (inp.value.length === 4) submit(); });
    document.getElementById('go').onclick = submit;
  }

  const STATE_TEXT = {
    open: (s) => `<i class="live-dot"></i> เปิดถึง ${s.close_time} น.`,
    upcoming: (s) => `${icon('clock', 'sm')} เปิด ${s.date === S.data.today ? s.open_time + ' น.' : thDate(s.date)}`,
    closed: () => `${icon('lock', 'sm')} ปิดแล้ว`,
    late: () => `${icon('edit', 'sm')} เลยเวลา · แก้ไขได้`,
    unlocked: (s) => `${icon('unlock', 'sm')} เปิดย้อนหลังถึง ${untilText(s.unlock_until)}`,
  };
  const PILL_CLASS = { P: 'ok', A: 'bad', L: 'warn', T: 'late', S: 'sky' };

  function current() { return S.data.sessions.find((s) => s.id === S.sessionId); }
  function canEdit(s) { return S.data.isAdmin || (['open', 'late', 'unlocked'].includes(s.state) && S.data.activity.status !== 'closed'); }
  function untilText(u) { return (u.slice(0, 10) === S.data.today ? '' : thDate(u.slice(0, 10)) + ' ') + u.slice(11, 16) + ' น.'; }
  function marksOf(sid) { return (S.marks[sid] = S.marks[sid] || {}); }

  function tallyOf(m) {
    const tally = {}; let unset = 0;
    S.data.students.forEach((st) => { const r = m[st.id]; if (r) tally[r.s] = (tally[r.s] || 0) + 1; else unset++; });
    return { tally, unset };
  }

  function rowInner(st, r, editable) {
    const d = S.data;
    return `<div class="stu-top">
        <span class="no">${esc(st.number)}</span>
        <div class="nm"><b>${esc(st.name)}</b>${st.student_code ? `<small>${esc(st.student_code)}</small>` : ''}</div>
        ${r ? `<span class="badge">${icon('check', 'sm')} ${esc(d.statusDefs[r.s].label)}</span>` : ''}
      </div>
      <div class="sbtns">${d.activity.statuses.map((k) => `<button class="sbtn ${k} ${r && r.s === k ? 'on' : ''}" data-s="${k}" ${editable ? '' : 'disabled'}>${esc(d.statusDefs[k].label)}</button>`).join('')}</div>
      ${r && r.s !== 'P' && (editable || r.n) ? `<input class="input note-input" data-note placeholder="หมายเหตุ (ถ้ามี) เช่น ลาป่วย" value="${esc(r.n || '')}" maxlength="200" ${editable ? '' : 'disabled'}>` : ''}`;
  }

  function render() {
    const d = S.data;
    const sess = current();
    const dates = [...new Set(d.sessions.map((s) => s.date))];
    const daySessions = d.sessions.filter((s) => s.date === S.date);
    const editable = sess && canEdit(sess);
    const m = sess ? marksOf(sess.id) : {};

    app.innerHTML = `
      <div class="t-head">
        ${hubUrl ? `<a class="hub-back" href="${hubUrl}" data-back>${icon('back', 'sm')} เลือกห้องอื่น</a>` : ''}
        <div class="act">${esc(d.activity.name)}${d.classroom.advisor ? ' · ' + esc(d.classroom.advisor) : ''}</div>
        <div class="room">${esc(d.classroom.name)}</div>
        <div class="chips">
          ${sess ? `<span class="state-pill ${sess.state}">${STATE_TEXT[sess.state](sess)}</span>` : ''}
          <span class="adv">${d.students.length} คน</span>
          ${d.isAdmin ? '<span class="pill warn">โหมดแอดมิน · แก้ไขได้ทุกรอบ</span>' : ''}
        </div>
      </div>
      <div class="t-body">
        ${!d.sessions.length ? '<div class="card empty">กิจกรรมนี้ยังไม่มีรอบเช็คชื่อ</div>' : `
        ${dates.length > 1 ? `<div class="seg" id="dates">${dates.map((x) => `<button data-date="${x}" class="${x === S.date ? 'on' : ''}">${thDate(x, false, true)}${x === d.today ? '<small>วันนี้</small>' : ''}</button>`).join('')}</div>` : `<div class="sub small">${thDate(S.date, true, true)}${S.date === d.today ? ' · วันนี้' : ''}</div>`}
        ${daySessions.length > 1 ? `<div class="seg" id="slots">${daySessions.map((s) => `<button data-sid="${s.id}" class="${s.id === S.sessionId ? 'on' : ''}">${esc(s.label)}<small>${s.open_time}–${s.close_time}${d.attendance[s.id] ? ' ✓' : ''}</small></button>`).join('')}</div>` : ''}
        ${d.activity.status === 'closed' && !d.isAdmin ? '<div class="notice bad">' + icon('lock', 'sm') + '<span>กิจกรรมนี้ปิดการเช็คชื่อแล้ว</span></div>' : ''}
        ${sess && sess.state === 'upcoming' && !d.isAdmin ? `<div class="notice warn">${icon('clock', 'sm')}<span>ยังไม่ถึงเวลาเช็คชื่อรอบนี้ เปิดให้เช็ค ${thDate(sess.date)} เวลา ${sess.open_time}–${sess.close_time} น.</span></div>` : ''}
        ${sess && sess.state === 'unlocked' && d.activity.status !== 'closed' ? `<div class="notice sky">${icon('unlock', 'sm')}<span>แอดมินเปิดให้ห้องนี้เช็คชื่อรอบนี้ย้อนหลังได้ถึง ${untilText(sess.unlock_until)}</span></div>` : ''}
        ${sess && sess.state === 'closed' && !d.isAdmin ? `<div class="notice bad">${icon('lock', 'sm')}<span>หมดเวลาเช็คชื่อรอบนี้แล้ว หากต้องการแก้ไขให้ติดต่อแอดมิน</span></div>` : ''}
        <div class="t-sumcard">
          <div class="top">
            <div class="grow"><span class="num" id="numDone">0</span> <span class="sub">/ ${d.students.length} คน เช็คแล้ว</span></div>
            <div class="counts">${d.activity.statuses.map((k) => `<span class="pill ${PILL_CLASS[k]}" data-count="${k}">${esc(d.statusDefs[k].label)} <b>0</b></span>`).join('')}</div>
          </div>
          <div class="bar light"><i id="doneBar"></i></div>
          ${editable && d.students.length ? `<button class="btn accent block all" id="allP">${icon('checks')} <span id="allLabel"></span></button>` : ''}
        </div>
        ${!d.students.length ? '<div class="card empty">ห้องนี้ยังไม่มีรายชื่อนักเรียน กรุณาแจ้งแอดมิน</div>' : ''}
        <div class="col" id="list" style="gap:10px">
          ${d.students.map((st) => { const r = m[st.id]; return `<div class="stu ${r ? 's-' + r.s : ''}" data-id="${st.id}">${rowInner(st, r, editable)}</div>`; }).join('')}
        </div>`}
      </div>
      ${sess && d.students.length ? `<div class="t-foot">
        ${editable ? `<button class="btn primary block" id="save"></button>` : ''}
        <div class="small muted center" id="saveInfo"></div>
      </div>` : ''}`;
    bind();
    refresh(true);
  }

  /** อัปเดตเฉพาะส่วนสรุป แถบความคืบหน้า และปุ่มบันทึก (ไม่วาดทั้งหน้าใหม่ แอนิเมชันจึงลื่น) */
  function refresh(first) {
    const d = S.data;
    const sess = current();
    if (!sess) return;
    const m = marksOf(sess.id);
    const { tally, unset } = tallyOf(m);
    const doneN = d.students.length - unset;
    countUp(document.getElementById('numDone'), doneN, first ? 500 : 350);
    const bar = document.getElementById('doneBar');
    if (bar) requestAnimationFrame(() => { bar.style.width = (d.students.length ? doneN / d.students.length * 100 : 0) + '%'; });
    app.querySelectorAll('[data-count]').forEach((p) => {
      const b = p.querySelector('b');
      const v = String(tally[p.dataset.count] || 0);
      if (b.textContent !== v) { b.textContent = v; if (!first) { p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); setTimeout(() => p.classList.remove('bump'), 250); } }
    });
    const allLabel = document.getElementById('allLabel');
    if (allLabel) allLabel.textContent = d.statusDefs.P.label + 'ทั้งหมด' + (unset && unset < d.students.length ? ` (อีก ${unset} คน)` : '');
    const save = document.getElementById('save');
    if (save) {
      save.disabled = S.saving;
      save.classList.toggle('saving', S.saving);
      save.classList.toggle('saved', S.justSaved && !S.dirty[sess.id] && !S.saving);
      save.innerHTML = S.saving ? `${icon('refresh')} กำลังบันทึก…` : S.justSaved && !S.dirty[sess.id] ? `${icon('check')} บันทึกแล้ว` : `${icon('save')} บันทึกการเช็คชื่อ`;
    }
    const info = document.getElementById('saveInfo');
    const saved = d.attendance[sess.id];
    if (info) {
      info.innerHTML = S.dirty[sess.id]
        ? (unset ? `ยังไม่ได้เช็คอีก <b style="color:var(--warn)">${unset}</b> คน` : '<span style="color:var(--ok)">เช็คครบแล้ว พร้อมบันทึก</span>')
        : saved ? `บันทึกล่าสุด ${esc(saved.updated_at.slice(11, 16))} น. ${thDate(saved.updated_at.slice(0, 10))} · เช็คแล้ว ${doneN}/${d.students.length} คน`
          : unset ? `ยังไม่ได้เช็คอีก ${unset} คน` : 'ยังไม่ได้บันทึกรอบนี้';
    }
  }

  function updateRow(id, delay) {
    const el = app.querySelector(`.stu[data-id="${id}"]`);
    if (!el) return;
    const st = S.data.students.find((x) => x.id === id);
    const r = marksOf(S.sessionId)[id];
    el.className = 'stu' + (r ? ' s-' + r.s : '');
    el.innerHTML = rowInner(st, r, canEdit(current()));
    el.style.setProperty('--d', (delay || 0) + 'ms');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function changed() {
    S.dirty[S.sessionId] = true;
    S.justSaved = false;
    refresh();
  }

  function bind() {
    const d = S.data;
    const dates = document.getElementById('dates');
    if (dates) dates.onclick = (e) => {
      const b = e.target.closest('button[data-date]'); if (!b || b.dataset.date === S.date) return;
      if (!leaveOk()) return;
      S.date = b.dataset.date;
      const day = d.sessions.filter((s) => s.date === S.date);
      S.sessionId = (day.find((s) => s.state === 'open') || day[0]).id;
      S.justSaved = false;
      render();
    };
    const slots = document.getElementById('slots');
    if (slots) slots.onclick = (e) => {
      const b = e.target.closest('button[data-sid]'); if (!b || b.dataset.sid === S.sessionId) return;
      if (!leaveOk()) return;
      S.sessionId = b.dataset.sid; S.justSaved = false; render();
    };
    const list = document.getElementById('list');
    if (list) {
      list.onclick = (e) => {
        const b = e.target.closest('.sbtn'); if (!b || b.disabled) return;
        const id = b.closest('.stu').dataset.id;
        const m = marksOf(S.sessionId);
        const prev = m[id];
        if (prev && prev.s === b.dataset.s) return;
        m[id] = { s: b.dataset.s };
        if (prev && prev.n && b.dataset.s !== 'P') m[id].n = prev.n;
        updateRow(id);
        if (b.dataset.s !== 'P' && !(prev && prev.s !== 'P')) { const n = list.querySelector(`.stu[data-id="${id}"] [data-note]`); if (n) n.focus({ preventScroll: true }); }
        changed();
      };
      list.oninput = (e) => {
        if (!e.target.matches('[data-note]')) return;
        const id = e.target.closest('.stu').dataset.id;
        const r = marksOf(S.sessionId)[id];
        if (r) { r.n = e.target.value; changed(); }
      };
    }
    const allP = document.getElementById('allP');
    if (allP) allP.onclick = () => {
      const m = marksOf(S.sessionId);
      const anySet = d.students.some((st) => m[st.id]);
      const allSet = d.students.every((st) => m[st.id]);
      let i = 0;
      d.students.forEach((st) => {
        if (!m[st.id] || allSet || !anySet) {
          const was = m[st.id] && m[st.id].s;
          m[st.id] = { s: 'P' };
          if (was !== 'P') updateRow(st.id, Math.min(i++ * 28, 600));
        }
      });
      changed();
    };
    const save = document.getElementById('save');
    if (save) save.onclick = doSave;
  }

  function leaveOk() {
    return !S.sessionId || !S.dirty[S.sessionId] || confirm('ยังไม่ได้บันทึกการเช็คชื่อรอบนี้ ต้องการออกหรือไม่?');
  }

  async function doSave() {
    const d = S.data;
    const sid = S.sessionId;
    const m = marksOf(sid);
    const missing = d.students.filter((st) => !m[st.id]);
    if (missing.length) {
      toast(`ยังไม่ได้เช็คอีก ${missing.length} คน (เลขที่ ${missing.slice(0, 5).map((s) => s.number).join(', ')}${missing.length > 5 ? '…' : ''})`, 'bad');
      missing.forEach((st) => { const el = app.querySelector(`.stu[data-id="${st.id}"]`); if (el) { el.classList.remove('missing'); void el.offsetWidth; el.classList.add('missing'); } });
      const el = app.querySelector(`.stu[data-id="${missing[0].id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const snap = JSON.stringify(m);
    S.saving = true; refresh();
    try {
      const records = d.students.map((st) => ({ studentId: st.id, status: m[st.id].s, note: m[st.id].n || '' }));
      const res = await API.call('teacher.save', { token, pin: sessionStorage.getItem(pinKey) || '', sessionId: sid, records });
      d.attendance[sid] = { data: JSON.parse(snap), updated_at: res.updated_at };
      // ถ้ากดเปลี่ยนสถานะระหว่างรอบันทึก ส่วนนั้นยังไม่ถึงเซิร์ฟเวอร์
      S.dirty[sid] = JSON.stringify(marksOf(sid)) !== snap;
      S.justSaved = true;
      toast('บันทึกการเช็คชื่อแล้ว', 'ok');
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (e) {
      if (e.code === 'PIN') { S.saving = false; return renderPin(e.message, true); }
      toast(e.message, 'bad');
    }
    S.saving = false;
    if (sid === S.sessionId) {
      refresh();
      const slot = app.querySelector(`#slots button[data-sid="${sid}"] small`);
      if (slot && !slot.textContent.includes('✓')) slot.textContent += ' ✓';
    }
  }

  window.addEventListener('beforeunload', (e) => {
    if (Object.values(S.dirty).some(Boolean)) { e.preventDefault(); e.returnValue = ''; }
  });
})();
