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
  };

  if (!token && hub) return loadHub();
  if (!token) return fatal('ไม่พบรหัสลิงก์', 'กรุณาเปิดจากลิงก์ที่ได้รับจากแอดมินฝ่ายกิจกรรม');

  load();

  /* ---------- ลิงก์รวม: ให้ครูเลือกห้องของตัวเอง ---------- */
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
    let q = '';
    const go = (r) => { store.set(lastKey, r.name); location.href = 'check.html?t=' + encodeURIComponent(r.token) + '&h=' + encodeURIComponent(hub); };
    const s = H.session;
    const stateText = !s ? '' : s.state === 'open' ? `เปิดเช็คถึง ${s.close_time} น.` : s.state === 'upcoming' ? `เปิด ${s.date === H.today ? s.open_time + ' น.' : thDate(s.date)}` : s.state === 'late' ? 'เลยเวลา · แก้ไขได้' : 'ปิดแล้ว';

    function draw() {
      const last = H.rooms.find((r) => r.name === store.get(lastKey));
      const list = q ? H.rooms.filter((r) => (r.name + ' ' + (r.advisor || '')).toLowerCase().includes(q.toLowerCase())) : H.rooms;
      const groups = [];
      list.forEach((r) => { let g = groups.find((x) => x.grade === r.grade); if (!g) groups.push(g = { grade: r.grade, rooms: [] }); g.rooms.push(r); });
      const done = H.rooms.filter((r) => r.checked_at).length;
      const card = (r) => `<button class="hub-room ${r.checked_at ? 'done' : ''}" data-name="${esc(r.name)}">
          <b>${esc(r.name)}</b>
          <small>${esc(r.advisor) || '&nbsp;'}</small>
          ${s ? (r.checked_at ? `<span class="pill ok">${icon('check', 'sm')} เช็คแล้ว</span>` : '<span class="pill warn">รอเช็ค</span>') : ''}
        </button>`;
      app.innerHTML = `
        <div class="t-head">
          <div class="act">${esc(H.schoolName || '')}</div>
          <div class="room">${esc(H.activity.name)}</div>
          <div class="adv">${dateRangeText(H.activity.dates)}</div>
          ${s ? `<div class="row" style="margin-top:8px;gap:8px"><span class="state-pill ${s.state}">${icon('clock', 'sm')} รอบ${esc(s.label)} · ${stateText}</span><span class="small" style="color:var(--side-muted)">เช็คแล้ว ${done}/${H.rooms.length} ห้อง</span></div>` : ''}
        </div>
        <div class="t-body">
          ${H.activity.status === 'closed' ? `<div class="notice bad">${icon('lock', 'sm')}<span>กิจกรรมนี้ปิดการเช็คชื่อแล้ว</span></div>` : ''}
          <h2>เลือกห้องที่คุณเป็นครูที่ปรึกษา</h2>
          ${last && !q ? `<div class="col" style="gap:6px"><span class="label">ห้องที่คุณเลือกล่าสุด</span><div class="hub-grid">${card(last)}</div></div>` : ''}
          ${H.rooms.length > 8 ? `<input class="input" id="hubSearch" placeholder="ค้นหาห้อง หรือชื่อครู" value="${esc(q)}">` : ''}
          ${!H.rooms.length ? '<div class="card empty">กิจกรรมนี้ยังไม่มีห้องเรียน กรุณาแจ้งแอดมิน</div>' : ''}
          ${q && !list.length ? '<div class="empty">ไม่พบห้องที่ค้นหา</div>' : ''}
          ${groups.map((g) => `<div class="col" style="gap:6px"><span class="label">${esc(g.grade)}</span><div class="hub-grid">${g.rooms.map(card).join('')}</div></div>`).join('')}
          ${H.activity.require_pin ? `<p class="help center">${icon('lock', 'sm')} แต่ละห้องต้องใส่ PIN ของห้องตัวเองก่อนเช็คชื่อ</p>` : ''}
        </div>`;
      app.querySelectorAll('.hub-room').forEach((b) => b.addEventListener('click', () => go(H.rooms.find((r) => r.name === b.dataset.name))));
      const sb = document.getElementById('hubSearch');
      if (sb) sb.addEventListener('input', debounce(() => { q = sb.value; draw(); const n = document.getElementById('hubSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    }
    draw();
  }

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
    } catch (e) {
      if (e.code === 'HUB') return location.replace('check.html?h=' + encodeURIComponent(token));
      if (e.code === 'PIN') return renderPin(e.message, !!pin);
      if (e.code === 'LINK') return fatal('ลิงก์ใช้งานไม่ได้', e.message);
      fatal('โหลดข้อมูลไม่สำเร็จ', e.message, true);
    }
  }

  function pickDefaultSession() {
    const ss = S.data.sessions;
    if (!ss.length) { S.sessionId = null; S.date = null; return; }
    const pick = ss.find((s) => s.state === 'open')
      || ss.find((s) => s.date === S.data.today && s.state === 'upcoming')
      || ss.filter((s) => s.date <= S.data.today).pop()
      || ss[0];
    S.sessionId = pick.id;
    S.date = pick.date;
  }

  function fatal(title, msg, retry) {
    app.innerHTML = `<div class="t-body"><div class="card center" style="margin-top:60px">
      <div style="color:var(--bad);margin-bottom:8px">${icon('alert')}</div>
      <h2>${esc(title)}</h2><p class="sub" style="margin-top:6px">${esc(msg)}</p>
      ${retry ? '<button class="btn primary" style="margin-top:16px" id="retry">ลองใหม่</button>' : ''}</div></div>`;
    const b = document.getElementById('retry');
    if (b) b.onclick = () => { app.innerHTML = '<div class="loading-block"><div class="spinner"></div>กำลังโหลด…</div>'; load(); };
  }

  function renderPin(msg, wasWrong) {
    sessionStorage.removeItem(pinKey);
    app.innerHTML = `<div class="t-body">${hubUrl ? `<a class="link-btn" href="${hubUrl}">${icon('back', 'sm')} เลือกห้องอื่น</a>` : ''}<div class="card pin-box stack">
      <div class="center" style="color:var(--pri)">${icon('lock')}</div>
      <div class="center"><h2>ใส่ PIN 4 หลัก</h2><p class="sub small" style="margin-top:4px">PIN ได้รับมาพร้อมลิงก์จากแอดมิน</p></div>
      <input class="input pin-input" id="pin" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••">
      ${wasWrong ? `<p class="error-text center">${esc(msg)}</p>` : ''}
      <button class="btn primary block" id="go">เข้าสู่หน้าเช็คชื่อ</button></div></div>`;
    const inp = document.getElementById('pin');
    const go = () => {
      const v = inp.value.trim();
      if (!/^\d{4}$/.test(v)) { inp.classList.add('err'); return; }
      app.innerHTML = '<div class="loading-block"><div class="spinner"></div>กำลังตรวจสอบ…</div>';
      load(v);
    };
    inp.focus();
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    inp.addEventListener('input', () => { inp.classList.remove('err'); if (inp.value.length === 4) go(); });
    document.getElementById('go').onclick = go;
  }

  const STATE_TEXT = {
    open: (s) => `${icon('clock', 'sm')} เปิดถึง ${s.close_time} น.`,
    upcoming: (s) => `${icon('clock', 'sm')} เปิด ${s.date === S.data.today ? s.open_time + ' น.' : thDate(s.date)}`,
    closed: () => `${icon('lock', 'sm')} ปิดแล้ว`,
    late: () => `${icon('edit', 'sm')} เลยเวลา · แก้ไขได้`,
  };

  function current() { return S.data.sessions.find((s) => s.id === S.sessionId); }
  function canEdit(s) { return S.data.isAdmin || ((s.state === 'open' || s.state === 'late') && S.data.activity.status !== 'closed'); }
  function marksOf(sid) { return (S.marks[sid] = S.marks[sid] || {}); }

  function render() {
    const d = S.data;
    const sess = current();
    const dates = [...new Set(d.sessions.map((s) => s.date))];
    const daySessions = d.sessions.filter((s) => s.date === S.date);
    const statuses = d.activity.statuses;
    const editable = sess && canEdit(sess);
    const m = sess ? marksOf(sess.id) : {};
    const tally = {}; let unset = 0;
    d.students.forEach((st) => { const r = m[st.id]; if (r) tally[r.s] = (tally[r.s] || 0) + 1; else unset++; });
    const saved = sess && d.attendance[sess.id];

    app.innerHTML = `
      <div class="t-head">
        ${hubUrl ? `<a class="hub-back" href="${hubUrl}">${icon('back', 'sm')} เลือกห้องอื่น</a>` : ''}
        <div class="act">${esc(d.activity.name)}${d.schoolName ? ' · ' + esc(d.schoolName) : ''}</div>
        <div class="row" style="margin-top:2px">
          <div class="room grow">${esc(d.classroom.name)}</div>
          ${sess ? `<span class="state-pill ${sess.state}">${STATE_TEXT[sess.state](sess)}</span>` : ''}
        </div>
        <div class="adv">${d.classroom.advisor ? 'ครูที่ปรึกษา: ' + esc(d.classroom.advisor) + ' · ' : ''}${d.students.length} คน</div>
        ${d.isAdmin ? '<div style="margin-top:8px"><span class="pill warn">โหมดแอดมิน · แก้ไขได้ทุกรอบ</span></div>' : ''}
      </div>
      <div class="t-body">
        ${!d.sessions.length ? '<div class="card empty">กิจกรรมนี้ยังไม่มีรอบเช็คชื่อ</div>' : `
        ${dates.length > 1 ? `<div class="seg" id="dates">${dates.map((x) => `<button data-date="${x}" class="${x === S.date ? 'on' : ''}">${thDate(x, false, true)}${x === d.today ? '<small>วันนี้</small>' : ''}</button>`).join('')}</div>` : `<div class="sub small">${thDate(S.date, true, true)}${S.date === d.today ? ' · วันนี้' : ''}</div>`}
        ${daySessions.length > 1 ? `<div class="seg" id="slots">${daySessions.map((s) => `<button data-sid="${s.id}" class="${s.id === S.sessionId ? 'on' : ''}">${esc(s.label)}<small>${s.open_time}–${s.close_time}${d.attendance[s.id] ? ' ✓' : ''}</small></button>`).join('')}</div>` : ''}
        ${d.activity.status === 'closed' && !d.isAdmin ? '<div class="notice bad">' + icon('lock', 'sm') + '<span>กิจกรรมนี้ปิดการเช็คชื่อแล้ว</span></div>' : ''}
        ${sess && sess.state === 'upcoming' && !d.isAdmin ? `<div class="notice warn">${icon('clock', 'sm')}<span>ยังไม่ถึงเวลาเช็คชื่อรอบนี้ เปิดให้เช็ค ${thDate(sess.date)} เวลา ${sess.open_time}–${sess.close_time} น.</span></div>` : ''}
        ${sess && sess.state === 'closed' && !d.isAdmin ? `<div class="notice bad">${icon('lock', 'sm')}<span>หมดเวลาเช็คชื่อรอบนี้แล้ว หากต้องการแก้ไขให้ติดต่อแอดมิน</span></div>` : ''}
        <div class="t-sum">
          ${statuses.map((k) => `<div class="${k}"><span>${esc(d.statusDefs[k].label)}</span><b>${tally[k] || 0}</b></div>`).join('')}
          <div class="none"><span>ยังไม่เช็ค</span><b>${unset}</b></div>
        </div>
        ${editable ? `<button class="btn block" id="allP">${icon('checks', 'sm')} ${esc(d.statusDefs.P.label)}ทั้งหมด${unset && unset < d.students.length ? ' (เฉพาะที่ยังไม่เช็ค)' : ''}</button>` : ''}
        ${!d.students.length ? '<div class="card empty">ห้องนี้ยังไม่มีรายชื่อนักเรียน กรุณาแจ้งแอดมิน</div>' : ''}
        <div class="col ${statuses.length > 3 ? 'many' : ''}" id="list" style="gap:6px">
          ${d.students.map((st) => {
            const r = m[st.id];
            return `<div class="stu ${r ? '' : 'unset'}" data-id="${st.id}">
              <div class="stu-top">
                <span class="no">${esc(st.number)}</span>
                <div class="nm"><b>${esc(st.name)}</b>${st.student_code ? `<small>${esc(st.student_code)}</small>` : ''}</div>
                <div class="sbtns">${statuses.map((k) => `<button class="sbtn ${k} ${r && r.s === k ? 'on' : ''}" data-s="${k}" ${editable ? '' : 'disabled'}>${esc(d.statusDefs[k].label)}</button>`).join('')}</div>
              </div>
              ${r && r.s !== 'P' && (editable || r.n) ? `<input class="input note-input" data-note placeholder="หมายเหตุ (ถ้ามี) เช่น ลาป่วย" value="${esc(r.n || '')}" maxlength="200" ${editable ? '' : 'disabled'}>` : ''}
            </div>`;
          }).join('')}
        </div>`}
      </div>
      ${sess && d.students.length ? `<div class="t-foot">
        ${editable ? `<button class="btn primary block" id="save" ${S.saving ? 'disabled' : ''}>${icon('save')} ${S.saving ? 'กำลังบันทึก…' : 'บันทึกการเช็คชื่อ'}</button>` : ''}
        <div class="small muted center" id="saveInfo">${S.dirty[sess.id] ? '<span style="color:var(--warn)">ยังไม่ได้บันทึกการเปลี่ยนแปลง</span>' : saved ? `บันทึกล่าสุด ${esc(saved.updated_at.slice(11, 16))} น. ${thDate(saved.updated_at.slice(0, 10))} · เช็คแล้ว ${d.students.length - unset}/${d.students.length} คน` : 'ยังไม่ได้บันทึกรอบนี้'}</div>
      </div>` : ''}`;
    bind();
  }

  function bind() {
    const d = S.data;
    const dates = document.getElementById('dates');
    if (dates) dates.onclick = (e) => {
      const b = e.target.closest('button[data-date]'); if (!b) return;
      if (!leaveOk()) return;
      S.date = b.dataset.date;
      const day = d.sessions.filter((s) => s.date === S.date);
      S.sessionId = (day.find((s) => s.state === 'open') || day[0]).id;
      render();
    };
    const slots = document.getElementById('slots');
    if (slots) slots.onclick = (e) => {
      const b = e.target.closest('button[data-sid]'); if (!b) return;
      if (!leaveOk()) return;
      S.sessionId = b.dataset.sid; render();
    };
    const list = document.getElementById('list');
    if (list) {
      list.onclick = (e) => {
        const b = e.target.closest('.sbtn'); if (!b || b.disabled) return;
        const id = b.closest('.stu').dataset.id;
        const m = marksOf(S.sessionId);
        const prev = m[id];
        m[id] = { s: b.dataset.s };
        if (prev && prev.n && b.dataset.s !== 'P') m[id].n = prev.n;
        S.dirty[S.sessionId] = true;
        const y = window.scrollY; render(); window.scrollTo(0, y);
      };
      list.oninput = (e) => {
        if (!e.target.matches('[data-note]')) return;
        const id = e.target.closest('.stu').dataset.id;
        const r = marksOf(S.sessionId)[id];
        if (r) { r.n = e.target.value; S.dirty[S.sessionId] = true; document.getElementById('saveInfo').innerHTML = '<span style="color:var(--warn)">ยังไม่ได้บันทึกการเปลี่ยนแปลง</span>'; }
      };
    }
    const allP = document.getElementById('allP');
    if (allP) allP.onclick = () => {
      const m = marksOf(S.sessionId);
      const anySet = d.students.some((st) => m[st.id]);
      const allSet = d.students.every((st) => m[st.id]);
      d.students.forEach((st) => { if (!m[st.id] || allSet || !anySet) m[st.id] = { s: 'P' }; });
      S.dirty[S.sessionId] = true;
      render();
    };
    const save = document.getElementById('save');
    if (save) save.onclick = doSave;
  }

  function leaveOk() {
    return !S.dirty[S.sessionId] || confirm('ยังไม่ได้บันทึกการเช็คชื่อรอบนี้ ต้องการเปลี่ยนรอบหรือไม่?');
  }

  async function doSave() {
    const d = S.data;
    const sid = S.sessionId;
    const m = marksOf(sid);
    const missing = d.students.filter((st) => !m[st.id]);
    if (missing.length) {
      toast(`ยังไม่ได้เช็คอีก ${missing.length} คน (เลขที่ ${missing.slice(0, 5).map((s) => s.number).join(', ')}${missing.length > 5 ? '…' : ''})`, 'bad');
      const el = document.querySelector(`.stu[data-id="${missing[0].id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const snap = JSON.stringify(m);
    S.saving = true; render();
    try {
      const records = d.students.map((st) => ({ studentId: st.id, status: m[st.id].s, note: m[st.id].n || '' }));
      const res = await API.call('teacher.save', { token, pin: sessionStorage.getItem(pinKey) || '', sessionId: sid, records });
      d.attendance[sid] = { data: JSON.parse(snap), updated_at: res.updated_at };
      // ถ้ากดเปลี่ยนสถานะระหว่างรอบันทึก ส่วนนั้นยังไม่ถึงเซิร์ฟเวอร์
      S.dirty[sid] = JSON.stringify(marksOf(sid)) !== snap;
      toast('บันทึกการเช็คชื่อแล้ว', 'ok');
    } catch (e) {
      if (e.code === 'PIN') { S.saving = false; return renderPin(e.message, true); }
      toast(e.message, 'bad');
    }
    S.saving = false;
    render();
  }

  window.addEventListener('beforeunload', (e) => {
    if (Object.values(S.dirty).some(Boolean)) { e.preventDefault(); e.returnValue = ''; }
  });
})();
