/* หน้าแอดมิน: ห้องเรียนและรายชื่อนักเรียน — เพิ่มด้วยมือ, วางรายชื่อ, นำเข้า/ส่งออก Excel */

const PREFIXES = ['ด.ช.', 'ด.ญ.', 'นาย', 'น.ส.', 'นาง'];
const PREFIX_RE = /^(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|ดช\.?|ดญ\.?|นางสาว|น\.ส\.|นาย|นาง|mr\.?|mrs\.?|miss|ms\.?)\s*/i;
const TEMPLATE_HEAD = ['ห้อง', 'เลขที่', 'เลขประจำตัว', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เพศ'];

function genderFromPrefix(p) {
  if (/^(ด\.ช\.|เด็กชาย|ดช|นาย|mr)/i.test(p)) return 'ชาย';
  if (/^(ด\.ญ\.|เด็กหญิง|ดญ|น\.ส\.|นางสาว|นาง|miss|mrs|ms)/i.test(p)) return 'หญิง';
  return '';
}

/** แยก "ด.ช.กิตติ ศรีสุข" → {prefix, first_name, last_name} */
function splitName(full) {
  let s = String(full || '').trim().replace(/\s+/g, ' ');
  let prefix = '';
  const m = s.match(PREFIX_RE);
  if (m) { prefix = m[1]; s = s.slice(m[0].length).trim(); }
  const parts = s.split(' ');
  return { prefix, first_name: parts.shift() || '', last_name: parts.join(' ') };
}

function fullName(s) { return (s.prefix || '') + s.first_name + ' ' + (s.last_name || ''); }

function groupRooms(rooms) {
  const g = [];
  rooms.forEach((c) => {
    let x = g.find((y) => y.grade === c.grade);
    if (!x) { x = { grade: c.grade, rooms: [] }; g.push(x); }
    x.rooms.push(c);
  });
  return g;
}

function downloadTemplate() {
  if (!window.XLSX) return toast('กำลังโหลดตัวสร้างไฟล์ Excel ลองใหม่อีกครั้ง', 'bad');
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEAD,
    ['ม.4/1', 1, '24501', 'ด.ช.', 'กิตติ', 'ศรีสุข', 'ชาย'],
    ['ม.4/1', 2, '24502', 'ด.ญ.', 'ขวัญใจ', 'ทองดี', 'หญิง'],
    ['ม.4/2', 1, '24540', 'นาย', 'ธนกร', 'ใจกล้า', 'ชาย'],
  ]);
  ws['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'รายชื่อนักเรียน');
  XLSX.writeFile(wb, 'แม่แบบรายชื่อนักเรียน.xlsx');
}

async function pageStudents(main, roomId, alive) {
  let rooms = A.boot.classrooms;
  let room = rooms.find((c) => c.id === roomId) || rooms[0] || null;
  let students = [];
  let filter = '';
  let roomFilter = '';

  async function loadStudents() {
    if (!room) { students = []; return true; }
    const want = room;
    try {
      const list = await API.call('student.list', { classroomId: want.id });
      // กดเปลี่ยนห้องเร็ว ๆ คำตอบอาจมาสลับลำดับ ทิ้งคำตอบของห้องที่ไม่ได้เลือกแล้ว
      if (!alive() || room !== want) return false;
      students = list;
      return true;
    } catch (e) { apiErr(e); return false; }
  }

  async function reloadAll(selectId) {
    try { await refreshBoot(); } catch (e) { apiErr(e); return; }
    if (!alive()) return;
    rooms = A.boot.classrooms;
    room = rooms.find((c) => c.id === (selectId || (room && room.id))) || rooms[0] || null;
    if (room && location.hash !== '#/students/' + room.id) history.replaceState(null, '', '#/students/' + room.id);
    if (await loadStudents()) draw();
  }

  loading(main);
  if (!(await loadStudents())) return;
  draw();

  function draw() {
    const list = filter ? students.filter((s) => (fullName(s) + ' ' + s.student_code + ' ' + s.number).toLowerCase().includes(filter.toLowerCase())) : students;
    const male = students.filter((s) => s.gender === 'ชาย').length;
    const female = students.filter((s) => s.gender === 'หญิง').length;
    const shownRooms = roomFilter ? rooms.filter((c) => c.name.toLowerCase().includes(roomFilter.toLowerCase())) : rooms;
    main.innerHTML = `
      <div class="page-head">
        <div class="grow"><div class="crumb">ข้อมูลพื้นฐาน  ›  นักเรียน / ห้องเรียน</div><h1>จัดการรายชื่อนักเรียน</h1></div>
        <button class="btn" id="tpl">${icon('download', 'sm')} แม่แบบ Excel</button>
        <button class="btn" id="import"><span style="color:var(--xl);display:inline-flex">${icon('xls', 'sm')}</span> นำเข้าจาก Excel</button>
        ${room ? `<button class="btn primary" id="addMany">${icon('plus', 'sm')} เพิ่มนักเรียน</button>` : ''}
      </div>
      ${!rooms.length ? `<div class="card empty">${icon('door')}<h2>ยังไม่มีห้องเรียน</h2>
        <p style="margin:6px 0 16px">เพิ่มห้องทีละห้อง หรือนำเข้าไฟล์ Excel ที่มีคอลัมน์ "ห้อง" ระบบจะสร้างห้องให้อัตโนมัติ</p>
        <div class="row" style="justify-content:center"><button class="btn" id="addRoom2">${icon('plus', 'sm')} เพิ่มห้อง</button><button class="btn primary" id="import2">${icon('xls', 'sm')} นำเข้าจาก Excel</button></div></div>` : `
      <div class="split">
        <div class="card room-list">
          <div class="row" style="padding:0 6px 6px"><h3 class="grow" style="font-size:15px">ห้องเรียน (${rooms.length})</h3><button class="icon-btn" id="addRoom" title="เพิ่มห้อง" style="color:var(--pri)">${icon('plus')}</button></div>
          ${rooms.length > 8 ? `<input class="input" id="roomSearch" placeholder="ค้นหาห้อง" value="${esc(roomFilter)}" style="margin-bottom:4px">` : ''}
          ${groupRooms(shownRooms).map((g) => `<div class="grade-label">${esc(g.grade)}</div>${g.rooms.map((c) => `
            <button class="room-item ${room && c.id === room.id ? 'on' : ''}" data-room="${c.id}"><span class="grow">${esc(c.name)}</span>${c.student_count ? `<span class="small ${room && c.id === room.id ? '' : 'sub'}">${c.student_count} คน</span>` : '<span class="pill warn">ยังไม่มีรายชื่อ</span>'}</button>`).join('')}`).join('')}
        </div>
        <div class="stack" style="min-width:0">
          <div class="dropzone inline" id="dropzone" role="button" tabindex="0">
            <span class="icon-box xl" style="width:56px;height:56px;border-radius:16px">${icon('xls', 'lg')}</span>
            <div class="grow"><h3 class="head-font" style="font-size:18px;color:var(--text)">ลากไฟล์ Excel มาวางที่นี่</h3><p class="small sub">ระบบแยกห้อง ตรวจชื่อซ้ำ และสร้างห้องใหม่ให้อัตโนมัติ · หรือกด <b>เพิ่มนักเรียน</b> เพื่อพิมพ์/วางรายชื่อจาก LINE</p></div>
            <span class="btn">${icon('upload', 'sm')} เลือกไฟล์</span>
          </div>
          <div class="card tight row wrap" style="gap:28px;padding:14px 24px">
            <div><div class="sub small">ห้อง</div><div class="head-font" style="font-size:24px;font-weight:600">${esc(room.name)}</div></div>
            <div><div class="sub small">ครูที่ปรึกษา</div><div style="font-weight:500">${esc(room.advisor) || '<span class="muted">ยังไม่ระบุ</span>'}</div>${room.advisor_contact ? `<div class="small sub">${esc(room.advisor_contact)}</div>` : ''}</div>
            <div><div class="sub small">นักเรียน</div><div style="font-weight:500">${students.length} คน${students.length ? ` <span class="sub small">(ชาย ${male} · หญิง ${female})</span>` : ''}</div></div>
            <button class="link-btn right" id="editRoom">${icon('edit', 'sm')} แก้ไขห้อง</button>
          </div>
          <div class="card stack" style="gap:10px;padding:16px 24px">
            <h3>เพิ่มนักเรียนทีละคน</h3>
            <div class="quick-add" id="quick">
              <div class="field"><label>เลขที่</label><input class="input" data-q="number" placeholder="${nextNumber()}" inputmode="numeric"></div>
              <div class="field"><label>เลขประจำตัว</label><input class="input" data-q="student_code" inputmode="numeric"></div>
              <div class="field"><label>คำนำหน้า</label><select class="input" data-q="prefix">${PREFIXES.map((p) => `<option>${p}</option>`).join('')}<option value="">อื่น ๆ</option></select></div>
              <div class="field"><label>ชื่อ</label><input class="input" data-q="first_name" placeholder="ชื่อจริง"></div>
              <div class="field"><label>นามสกุล</label><input class="input" data-q="last_name" placeholder="นามสกุล"></div>
              <div class="field"><label>เพศ</label><select class="input" data-q="gender"><option value="">อัตโนมัติ</option><option>ชาย</option><option>หญิง</option></select></div>
              <button class="btn soft" id="quickAdd">${icon('plus', 'sm')} เพิ่ม</button>
            </div>
          </div>
          <div class="card" style="padding:16px 24px 12px">
            <div class="card-head">
              <h2 class="grow">รายชื่อนักเรียน ${esc(room.name)}</h2>
              <input class="input" id="search" placeholder="ค้นหาชื่อหรือเลขประจำตัว" value="${esc(filter)}" style="max-width:240px">
              <button class="btn sm ghost" id="export" ${students.length ? '' : 'disabled'}>${icon('download', 'sm')} ส่งออก</button>
            </div>
            ${!students.length ? `<div class="empty">ห้องนี้ยังไม่มีรายชื่อ — เพิ่มด้วยมือด้านบน กด <b>เพิ่มนักเรียน</b> เพื่อกรอก/วางหลายคน หรือ <b>นำเข้าจาก Excel</b></div>` : `
            <div class="table-wrap"><table class="t">
              <thead><tr><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ – นามสกุล</th><th>เพศ</th><th></th></tr></thead>
              <tbody id="rows">${list.map((s) => `<tr data-id="${s.id}"><td>${esc(s.number)}</td><td class="sub">${esc(s.student_code)}</td><td style="font-weight:500">${esc(fullName(s))}</td><td class="sub">${esc(s.gender)}</td>
                <td class="actions"><button class="icon-btn" data-edit title="แก้ไข">${icon('edit', 'sm')}</button><button class="icon-btn danger" data-del title="ลบ">${icon('trash', 'sm')}</button></td></tr>`).join('')}</tbody>
            </table></div>
            ${filter ? `<p class="help" style="margin-top:8px">พบ ${list.length} จาก ${students.length} คน</p>` : ''}`}
          </div>
        </div>
      </div>`}`;
    bind();
  }

  function nextNumber() { return String(students.reduce((m, s) => Math.max(m, Number(s.number) || 0), 0) + 1); }

  function bind() {
    const q = (s) => main.querySelector(s);
    q('#tpl').onclick = downloadTemplate;
    const imp = () => importModal(room, rooms, (selectId) => reloadAll(selectId));
    q('#import').onclick = imp;
    if (q('#import2')) q('#import2').onclick = imp;
    const dz = q('#dropzone');
    if (dz) {
      dz.onclick = imp;
      dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); imp(); } };
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) importModal(room, rooms, (selectId) => reloadAll(selectId), f); });
    }
    const addRoom = () => roomModal(null, (id) => reloadAll(id));
    if (q('#addRoom')) q('#addRoom').onclick = addRoom;
    if (q('#addRoom2')) q('#addRoom2').onclick = addRoom;
    if (!room) return;
    q('#addMany').onclick = () => addStudentsModal(room, students, () => reloadAll());
    q('#editRoom').onclick = () => roomModal(room, (id) => reloadAll(id), students.length);
    main.querySelectorAll('[data-room]').forEach((b) => b.addEventListener('click', async () => {
      room = rooms.find((c) => c.id === b.dataset.room);
      filter = '';
      history.replaceState(null, '', '#/students/' + room.id);
      main.querySelectorAll('.room-item').forEach((x) => x.classList.toggle('on', x === b));
      if (await loadStudents()) draw();
    }));
    const rs = q('#roomSearch');
    if (rs) rs.addEventListener('input', debounce(() => { roomFilter = rs.value; draw(); const n = main.querySelector('#roomSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    const search = q('#search');
    if (search) search.addEventListener('input', debounce(() => { filter = search.value; draw(); const n = main.querySelector('#search'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
    const quick = q('#quick');
    const prefixSel = quick.querySelector('[data-q="prefix"]');
    const quickAdd = async () => {
      const s = {};
      quick.querySelectorAll('[data-q]').forEach((el) => { s[el.dataset.q] = el.value.trim(); });
      if (!s.first_name) { toast('กรุณากรอกชื่อ', 'bad'); quick.querySelector('[data-q="first_name"]').focus(); return; }
      if (s.student_code && students.some((x) => x.student_code === s.student_code)) return toast('เลขประจำตัว ' + s.student_code + ' มีอยู่ในห้องนี้แล้ว', 'bad');
      if (!s.gender) s.gender = genderFromPrefix(s.prefix);
      const btn = q('#quickAdd'); btn.disabled = true;
      try {
        await API.call('student.saveMany', { classroomId: room.id, students: [s], mode: 'append' });
        toast('เพิ่ม ' + fullName(s) + ' แล้ว', 'ok');
        const keepPrefix = s.prefix;
        await reloadAll();
        const f = main.querySelector('#quick [data-q="student_code"]');
        if (f) { main.querySelector('#quick [data-q="prefix"]').value = keepPrefix; f.focus(); }
      } catch (e) { apiErr(e); btn.disabled = false; }
    };
    q('#quickAdd').onclick = quickAdd;
    quick.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } });
    prefixSel.value = 'ด.ช.';
    if (q('#export')) q('#export').onclick = () => {
      if (!window.XLSX) return;
      const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEAD].concat(students.map((s) => [room.name, Number(s.number) || s.number, s.student_code, s.prefix, s.first_name, s.last_name, s.gender])));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'รายชื่อ');
      XLSX.writeFile(wb, `รายชื่อนักเรียน_${room.name.replace(/\//g, '-')}.xlsx`);
    };
    const rows = q('#rows');
    if (rows) rows.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr'); if (!tr) return;
      const s = students.find((x) => x.id === tr.dataset.id);
      if (e.target.closest('[data-edit]')) studentModal(s, rooms, () => reloadAll());
      if (e.target.closest('[data-del]')) {
        if (!(await confirmBox('ลบนักเรียน?', `ลบ <b>${esc(fullName(s))}</b> ออกจากห้อง ${esc(room.name)}`, { okText: 'ลบ', danger: true }))) return;
        try { await API.call('student.delete', { id: s.id }); toast('ลบแล้ว', 'ok'); reloadAll(); } catch (err) { apiErr(err); }
      }
    });
  }
}

/* ---------- ห้องเรียน ---------- */
function roomModal(room, done, count) {
  const m = openModal(`
    <div class="modal-head"><div class="badge-ic">${icon('door')}</div><div class="grow"><h2>${room ? 'แก้ไขห้อง ' + esc(room.name) : 'เพิ่มห้องเรียน'}</h2></div><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="grid2">
      <div class="field"><label>ชื่อห้อง *</label><input class="input" id="rName" value="${esc(room ? room.name : '')}" placeholder="ม.4/1" maxlength="40"></div>
      <div class="field"><label>ระดับชั้น</label><input class="input" id="rGrade" value="${esc(room ? room.grade : '')}" placeholder="อัตโนมัติจากชื่อห้อง เช่น ม.4"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>ครูที่ปรึกษา</label><input class="input" id="rAdv" value="${esc(room ? room.advisor : '')}" placeholder="ครูสมศรี ใจดี (ใส่ได้หลายคน)"></div>
      <div class="field"><label>เบอร์ / LINE ID ครู</label><input class="input" id="rContact" value="${esc(room ? room.advisor_contact : '')}" placeholder="ไม่บังคับ"></div>
    </div>
    <div class="field" style="max-width:200px"><label>ลำดับการแสดง</label><input class="input" id="rSort" type="number" value="${esc(room ? room.sort : '')}" placeholder="เว้นว่าง = เรียงตามชื่อ"></div>
    <div class="modal-foot">${room ? `<button class="btn danger" id="rDel" style="margin-right:auto">${icon('trash', 'sm')} ลบห้อง</button>` : ''}<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="rSave">บันทึก</button></div>`);
  const v = (id) => m.el.querySelector(id).value.trim();
  m.el.querySelector('#rSave').onclick = async () => {
    if (!v('#rName')) return toast('กรุณากรอกชื่อห้อง', 'bad');
    try {
      const r = await API.call('classroom.save', { id: room && room.id, name: v('#rName'), grade: v('#rGrade'), advisor: v('#rAdv'), advisor_contact: v('#rContact'), sort: v('#rSort') });
      m.close(); toast('บันทึกห้องแล้ว', 'ok'); done(r.id);
    } catch (e) { apiErr(e); }
  };
  const del = m.el.querySelector('#rDel');
  if (del) del.onclick = async () => {
    if (!(await confirmBox('ลบห้อง ' + room.name + '?', `รายชื่อนักเรียน ${count || 0} คนในห้องนี้และลิงก์เช็คชื่อของห้องนี้จะถูกลบด้วย`, { okText: 'ลบห้อง', danger: true }))) return;
    try { await API.call('classroom.delete', { id: room.id }); m.close(); toast('ลบห้องแล้ว', 'ok'); location.hash = '#/students'; done(null); } catch (e) { apiErr(e); }
  };
}

/* ---------- แก้ไขนักเรียน ---------- */
function studentModal(s, rooms, done) {
  const m = openModal(`
    <div class="modal-head"><div class="badge-ic">${icon('user')}</div><div class="grow"><h2>แก้ไขข้อมูลนักเรียน</h2></div><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="grid3">
      <div class="field"><label>เลขที่</label><input class="input" data-k="number" value="${esc(s.number)}"></div>
      <div class="field"><label>เลขประจำตัว</label><input class="input" data-k="student_code" value="${esc(s.student_code)}"></div>
      <div class="field"><label>ห้อง</label><select class="input" data-k="classroom_id">${rooms.map((c) => `<option value="${c.id}" ${c.id === s.classroom_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    </div>
    <div class="grid3">
      <div class="field"><label>คำนำหน้า</label><input class="input" data-k="prefix" value="${esc(s.prefix)}" list="prefixes"></div>
      <div class="field"><label>ชื่อ *</label><input class="input" data-k="first_name" value="${esc(s.first_name)}"></div>
      <div class="field"><label>นามสกุล</label><input class="input" data-k="last_name" value="${esc(s.last_name)}"></div>
    </div>
    <div class="field" style="max-width:160px"><label>เพศ</label><select class="input" data-k="gender"><option value=""></option>${['ชาย', 'หญิง'].map((g) => `<option ${s.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    <datalist id="prefixes">${PREFIXES.map((p) => `<option value="${p}">`).join('')}</datalist>
    <div class="modal-foot"><button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="sSave">บันทึก</button></div>`);
  m.el.querySelector('#sSave').onclick = async () => {
    const p = { id: s.id };
    m.el.querySelectorAll('[data-k]').forEach((el) => { p[el.dataset.k] = el.value.trim(); });
    if (!p.first_name) return toast('กรุณากรอกชื่อ', 'bad');
    try { await API.call('student.update', p); m.close(); toast('บันทึกแล้ว', 'ok'); done(); } catch (e) { apiErr(e); }
  };
}

/* ---------- เพิ่มนักเรียนหลายคน (กรอกเอง / วางรายชื่อ) ---------- */
function parsePasted(text) {
  return String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    let cells = line.includes('\t') ? line.split('\t').map((c) => c.trim()).filter(Boolean) : line.split(/\s+/);
    const out = { number: '', student_code: '', prefix: '', first_name: '', last_name: '', gender: '' };
    const nums = [];
    while (cells.length && /^\d+\.?$/.test(cells[0])) nums.push(cells.shift().replace('.', ''));
    if (nums.length >= 2) { out.number = nums[0]; out.student_code = nums[1]; } else if (nums.length === 1) {
      if (nums[0].length >= 4) out.student_code = nums[0]; else out.number = nums[0];
    }
    if (cells.length && PREFIX_RE.test(cells[0]) && cells[0].replace(PREFIX_RE, '') === '') out.prefix = cells.shift();
    const rest = cells.join(' ');
    const g = /\s(ชาย|หญิง)$/.exec(rest);
    const sp = splitName((out.prefix ? out.prefix : '') + (g ? rest.slice(0, g.index) : rest));
    Object.assign(out, sp);
    out.gender = g ? g[1] : genderFromPrefix(out.prefix);
    return out;
  }).filter((s) => s.first_name);
}

function addStudentsModal(room, existing, done) {
  let tab = 'rows';
  let rows = [blank(), blank(), blank()];
  let pasteText = '';
  function blank() { return { number: '', student_code: '', prefix: 'ด.ช.', first_name: '', last_name: '', gender: '' }; }
  const baseNum = existing.reduce((mx, s) => Math.max(mx, Number(s.number) || 0), 0);
  const m = openModal('<div id="am"></div>', { wide: true });
  const box = m.el.querySelector('#am');
  box.style.display = 'contents';

  function issues() {
    const codes = {};
    existing.forEach((s) => { if (s.student_code) codes[s.student_code] = fullName(s); });
    const seen = {};
    return rows.map((r) => {
      const any = r.first_name || r.last_name || r.student_code;
      if (!any) return null;
      const errs = [];
      if (!r.first_name) errs.push('ยังไม่ได้กรอกชื่อ');
      if (r.student_code && codes[r.student_code]) errs.push(`เลขประจำตัว ${r.student_code} มีอยู่แล้ว (${codes[r.student_code]})`);
      if (r.student_code && seen[r.student_code]) errs.push(`เลขประจำตัว ${r.student_code} ซ้ำกับแถวอื่น`);
      if (r.student_code) seen[r.student_code] = 1;
      return errs;
    });
  }

  function draw() {
    const iss = issues();
    const ready = iss.filter((x) => x && !x.length).length;
    const bad = iss.filter((x) => x && x.length).length;
    let autoNum = baseNum;
    box.innerHTML = `
      <div class="modal-head"><div class="badge-ic">${icon('user')}</div><div class="grow"><h2>เพิ่มนักเรียนเข้าห้อง ${esc(room.name)}</h2><p class="sub small">กรอกเองได้เลย ไม่ต้องใช้ไฟล์ Excel</p></div><button class="icon-btn" data-x>${icon('x')}</button></div>
      <div class="seg" style="align-self:flex-start"><button data-tab="rows" class="${tab === 'rows' ? 'on' : ''}">กรอกทีละคน</button><button data-tab="paste" class="${tab === 'paste' ? 'on' : ''}">วางรายชื่อหลายคน</button></div>
      ${tab === 'rows' ? `
        <div class="col" style="gap:8px" id="entry">
          <div class="entry-grid label"><span>เลขที่</span><span class="hide-sm">เลขประจำตัว</span><span class="hide-sm">คำนำหน้า</span><span>ชื่อ *</span><span>นามสกุล</span><span class="hide-sm">เพศ</span><span></span></div>
          ${rows.map((r, i) => {
            const e = iss[i];
            const ph = r.first_name || r.last_name || r.student_code ? String(++autoNum) : String(autoNum + 1);
            return `<div class="entry-grid" data-i="${i}">
              <input class="input" data-k="number" value="${esc(r.number)}" placeholder="${ph}" inputmode="numeric">
              <input class="input hide-sm ${e && e.some((x) => x.includes('เลขประจำตัว')) ? 'err' : ''}" data-k="student_code" value="${esc(r.student_code)}" placeholder="เลขประจำตัว" inputmode="numeric">
              <select class="input hide-sm" data-k="prefix">${PREFIXES.map((p) => `<option ${r.prefix === p ? 'selected' : ''}>${p}</option>`).join('')}<option value="" ${!r.prefix ? 'selected' : ''}>-</option></select>
              <input class="input ${e && e.includes('ยังไม่ได้กรอกชื่อ') ? 'err' : ''}" data-k="first_name" value="${esc(r.first_name)}" placeholder="ชื่อจริง">
              <input class="input" data-k="last_name" value="${esc(r.last_name)}" placeholder="นามสกุล">
              <select class="input hide-sm" data-k="gender"><option value="">อัตโนมัติ</option>${['ชาย', 'หญิง'].map((g) => `<option ${r.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
              <button class="icon-btn danger" data-rm="${i}" title="ลบแถว">${icon('trash', 'sm')}</button>
            </div>${e && e.length ? `<div class="error-text" style="padding-left:68px">${e.map(esc).join(' · ')}</div>` : ''}`;
          }).join('')}
          <button class="btn block" id="addRow" style="border-style:dashed;color:var(--pri)">${icon('plus', 'sm')} เพิ่มแถว</button>
        </div>
        <div class="notice">${icon('info', 'sm')}<span>เว้นเลขที่ว่างไว้ได้ ระบบจะเรียงต่อจากคนสุดท้ายให้ · กด Enter ที่ช่องนามสกุลเพื่อขึ้นแถวใหม่</span></div>`
      : `
        <p class="sub small">คัดลอกจาก Word, Google Sheets, Excel หรือ LINE แล้ววางได้เลย บรรทัดละ 1 คน เช่น<br><code>24538 ด.ช.ธนกร ใจกล้า</code> หรือ <code>1  24538  ด.ช.  ธนกร  ใจกล้า</code></p>
        <textarea class="input" id="paste" rows="9" placeholder="24538 ด.ช.ธนกร ใจกล้า&#10;24539 ด.ญ.พิมพ์ชนก วงศ์สวัสดิ์">${esc(pasteText)}</textarea>
        <div class="row"><span class="pill ${parsePasted(pasteText).length ? 'ok' : ''}" id="pcount">อ่านได้ ${parsePasted(pasteText).length} คน</span><span class="small sub grow">ระบบแยกเลขประจำตัว คำนำหน้า ชื่อ และนามสกุลให้อัตโนมัติ</span><button class="btn soft" id="toRows">${icon('check', 'sm')} ตรวจสอบรายชื่อ</button></div>`}
      <div class="modal-foot">
        ${tab === 'rows' ? `<span class="small sub" style="margin-right:auto">พร้อมเพิ่ม ${ready} คน${bad ? ` · <span style="color:var(--bad)">มีปัญหา ${bad} แถว</span>` : ''}</span>` : '<span style="margin-right:auto"></span>'}
        <button class="btn" data-x>ยกเลิก</button>
        ${tab === 'rows' ? `<button class="btn primary" id="saveRows" ${ready && !bad ? '' : 'disabled'}>${icon('check', 'sm')} บันทึก ${ready} คน</button>` : ''}
      </div>`;
    bindM();
  }

  function sync() {
    box.querySelectorAll('.entry-grid[data-i]').forEach((row) => {
      const r = rows[row.dataset.i];
      row.querySelectorAll('[data-k]').forEach((el) => { r[el.dataset.k] = el.value.trim(); });
    });
  }

  function bindM() {
    box.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => m.close(); });
    box.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { if (tab === 'rows') sync(); tab = b.dataset.tab; draw(); }; });
    if (tab === 'rows') {
      const entry = box.querySelector('#entry');
      entry.addEventListener('change', () => { sync(); refreshFoot(); });
      entry.addEventListener('input', debounce(() => { sync(); refreshFoot(); }, 250));
      entry.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rm]'); if (!b) return;
        sync(); rows.splice(Number(b.dataset.rm), 1); if (!rows.length) rows.push(blank()); draw();
      });
      entry.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.dataset.k === 'last_name') {
          e.preventDefault(); sync();
          const i = Number(e.target.closest('[data-i]').dataset.i);
          if (i === rows.length - 1) rows.push(Object.assign(blank(), { prefix: rows[i].prefix }));
          draw();
          const next = box.querySelector(`.entry-grid[data-i="${i + 1}"] [data-k="first_name"]`);
          if (next) next.focus();
        }
      });
      box.querySelector('#addRow').onclick = () => {
        sync(); rows.push(Object.assign(blank(), { prefix: rows.length ? rows[rows.length - 1].prefix : 'ด.ช.' })); draw();
        const inputs = box.querySelectorAll('[data-k="first_name"]'); inputs[inputs.length - 1].focus();
      };
      box.querySelector('#saveRows').onclick = save;
    } else {
      const ta = box.querySelector('#paste');
      ta.focus();
      ta.addEventListener('input', () => {
        pasteText = ta.value;
        const n = parsePasted(pasteText).length;
        const pc = box.querySelector('#pcount'); pc.textContent = 'อ่านได้ ' + n + ' คน'; pc.className = 'pill ' + (n ? 'ok' : '');
      });
      box.querySelector('#toRows').onclick = () => {
        const parsed = parsePasted(pasteText);
        if (!parsed.length) return toast('ยังอ่านรายชื่อไม่ได้ ตรวจสอบรูปแบบอีกครั้ง', 'bad');
        rows = rows.filter((r) => r.first_name || r.last_name || r.student_code).concat(parsed);
        tab = 'rows'; draw();
        toast(`เพิ่ม ${parsed.length} คนลงตารางแล้ว ตรวจสอบก่อนกดบันทึก`);
      };
    }
  }

  function refreshFoot() {
    const iss = issues();
    const ready = iss.filter((x) => x && !x.length).length;
    const bad = iss.filter((x) => x && x.length).length;
    const btn = box.querySelector('#saveRows');
    btn.disabled = !ready || !!bad;
    btn.innerHTML = `${icon('check', 'sm')} บันทึก ${ready} คน`;
    box.querySelector('.modal-foot span').innerHTML = `พร้อมเพิ่ม ${ready} คน${bad ? ` · <span style="color:var(--bad)">มีปัญหา ${bad} แถว</span>` : ''}`;
    box.querySelectorAll('.entry-grid[data-i]').forEach((row) => {
      const e = iss[row.dataset.i] || [];
      row.querySelector('[data-k="first_name"]').classList.toggle('err', e.includes('ยังไม่ได้กรอกชื่อ'));
      row.querySelector('[data-k="student_code"]').classList.toggle('err', e.some((x) => x.includes('เลขประจำตัว')));
      const next = row.nextElementSibling;
      if (next && next.classList.contains('error-text')) { if (e.length) next.textContent = e.join(' · '); else next.remove(); } else if (e.length) row.insertAdjacentHTML('afterend', `<div class="error-text" style="padding-left:68px">${e.map(esc).join(' · ')}</div>`);
    });
  }

  async function save() {
    sync();
    const iss = issues();
    if (iss.some((x) => x && x.length)) return draw();
    const list = rows.filter((r) => r.first_name).map((r) => Object.assign({}, r, { gender: r.gender || genderFromPrefix(r.prefix) }));
    if (!list.length) return;
    const btn = box.querySelector('#saveRows'); btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      const r = await API.call('student.saveMany', { classroomId: room.id, students: list, mode: 'append' });
      m.close();
      toast(`เพิ่ม ${r.added} คน${r.updated ? ` · อัปเดต ${r.updated} คน` : ''} แล้ว`, 'ok');
      done();
    } catch (e) { apiErr(e); btn.disabled = false; btn.textContent = 'บันทึก'; }
  }

  draw();
}

/* ---------- นำเข้า Excel ---------- */
const HEAD_MAP = {
  room: ['ห้อง', 'ห้องเรียน', 'ชั้น/ห้อง', 'ระดับชั้น/ห้อง', 'room', 'class', 'classroom'],
  grade: ['ชั้น', 'ระดับชั้น', 'grade', 'level'],
  number: ['เลขที่', 'ที่', 'no', 'number', 'ลำดับ'],
  student_code: ['เลขประจำตัว', 'เลขประจำตัวนักเรียน', 'รหัส', 'รหัสนักเรียน', 'studentid', 'id', 'code'],
  prefix: ['คำนำหน้า', 'คำนำหน้าชื่อ', 'prefix', 'title'],
  first_name: ['ชื่อ', 'firstname', 'first', 'name'],
  last_name: ['นามสกุล', 'สกุล', 'lastname', 'last', 'surname'],
  full: ['ชื่อ-นามสกุล', 'ชื่อ–นามสกุล', 'ชื่อนามสกุล', 'ชื่อ-สกุล', 'ชื่อสกุล', 'fullname'],
  gender: ['เพศ', 'gender', 'sex'],
  advisor: ['ครูที่ปรึกษา', 'advisor'],
};

function normHead(h) { return String(h || '').toLowerCase().replace(/[\s._]/g, ''); }

function mapHeader(row) {
  const map = {};
  row.forEach((h, i) => {
    const n = normHead(h);
    if (!n) return;
    Object.keys(HEAD_MAP).forEach((k) => {
      if (map[k] === undefined && HEAD_MAP[k].some((x) => normHead(x) === n)) map[k] = i;
    });
  });
  return map;
}

function parseSheetRows(aoa) {
  let hi = -1; let map = null;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const mp = mapHeader(aoa[i] || []);
    if ((mp.first_name !== undefined || mp.full !== undefined) && Object.keys(mp).length >= 2) { hi = i; map = mp; break; }
  }
  if (hi < 0) return null;
  const cell = (r, k) => (map[k] === undefined ? '' : String(r[map[k]] == null ? '' : r[map[k]]).trim());
  const out = [];
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    if (!r.some((c) => String(c == null ? '' : c).trim())) continue;
    const s = { line: i + 1, room: cell(r, 'room'), number: cell(r, 'number').replace(/\.0+$/, ''), student_code: cell(r, 'student_code').replace(/\.0+$/, ''), prefix: cell(r, 'prefix'), first_name: cell(r, 'first_name'), last_name: cell(r, 'last_name'), gender: cell(r, 'gender'), advisor: cell(r, 'advisor') };
    const grade = cell(r, 'grade');
    if (grade && /^\d+$/.test(s.room)) s.room = grade + '/' + s.room;
    else if (grade && !s.room) s.room = grade;
    if (map.full !== undefined && !s.first_name) Object.assign(s, splitName(cell(r, 'full')), s.prefix ? { prefix: s.prefix } : {});
    if (s.first_name && !s.prefix) { const sp = splitName(s.first_name); if (sp.prefix) { s.prefix = sp.prefix; s.first_name = sp.first_name + (sp.last_name ? ' ' + sp.last_name : ''); } }
    if (s.first_name && !s.last_name && s.first_name.includes(' ') && map.last_name === undefined) { const sp = splitName(s.first_name); s.first_name = sp.first_name; s.last_name = sp.last_name; }
    if (!s.gender) s.gender = genderFromPrefix(s.prefix);
    if (/^(m|male|ช)$/i.test(s.gender)) s.gender = 'ชาย';
    if (/^(f|female|ญ)$/i.test(s.gender)) s.gender = 'หญิง';
    out.push(s);
  }
  return { rows: out, hasRoom: map.room !== undefined || map.grade !== undefined };
}

function importModal(curRoom, rooms, done, initialFile) {
  const st = { step: 1, file: null, rows: [], hasRoom: false, target: 'auto', mode: 'append', sheetName: '' };
  const m = openModal('<div id="im"></div>', { wide: true });
  const box = m.el.querySelector('#im');
  box.style.display = 'contents';
  const roomNames = rooms.map((c) => c.name);

  function check() {
    const seen = {};
    st.rows.forEach((r) => {
      r.problems = []; r.warn = []; r.info = '';
      if (!r.first_name) r.problems.push('ไม่มีชื่อ');
      if (st.target === 'auto' && !r.room) r.problems.push('ไม่ระบุห้อง');
      if (!r.last_name) r.warn.push('ไม่มีนามสกุล');
      if (r.student_code) {
        if (seen[r.student_code]) r.problems.push('เลขประจำตัวซ้ำ (แถว ' + seen[r.student_code] + ')');
        else seen[r.student_code] = r.line;
      }
      if (st.target === 'auto' && r.room && !roomNames.includes(r.room)) r.info = 'ห้องใหม่';
    });
  }

  function draw() {
    const steps = ['อัปโหลดไฟล์', 'ตรวจสอบข้อมูล', 'นำเข้าเรียบร้อย'];
    let body = '';
    if (st.step === 1) {
      body = `
        <label class="dropzone" id="dz">
          <input type="file" id="file" accept=".xlsx,.xls,.csv" class="hidden">
          <div style="color:var(--xl)">${icon('xls')}</div>
          <div style="font-weight:500;color:var(--text);margin-top:6px">ลากไฟล์มาวางที่นี่ หรือกดเพื่อเลือกไฟล์</div>
          <div class="small" style="margin-top:4px">รองรับ .xlsx, .xls, .csv · ขนาดไม่เกิน 5 MB</div>
        </label>
        <div class="notice">${icon('info', 'sm')}<span>คอลัมน์ที่ระบบรู้จัก: <b>ห้อง, เลขที่, เลขประจำตัว, คำนำหน้า, ชื่อ, นามสกุล, เพศ</b> (หรือคอลัมน์ "ชื่อ-นามสกุล" รวมกัน) · <button class="link-btn" id="tplLink">ดาวน์โหลดแม่แบบ Excel</button></span></div>`;
    } else if (st.step === 2) {
      check();
      const ok = st.rows.filter((r) => !r.problems.length);
      const bad = st.rows.length - ok.length;
      const warn = ok.filter((r) => r.warn.length).length;
      const newRooms = st.target === 'auto' ? [...new Set(ok.filter((r) => r.info).map((r) => r.room))] : [];
      const roomsInFile = st.target === 'auto' ? [...new Set(ok.map((r) => r.room))] : [];
      const show = st.rows.filter((r) => r.problems.length).concat(st.rows.filter((r) => !r.problems.length).slice(0, 60));
      body = `
        <div class="dropzone has"><div style="color:var(--xl)">${icon('xls')}</div><div class="grow"><div style="font-weight:600;color:var(--text)">${esc(st.file.name)}</div><div class="small">${Math.round(st.file.size / 1024)} KB · พบ ${st.rows.length} แถว${st.target === 'auto' ? ` · ${roomsInFile.length} ห้อง` : ''} · ชีต "${esc(st.sheetName)}"</div></div><button class="btn sm" id="change">${icon('upload', 'sm')} เปลี่ยนไฟล์</button></div>
        <div class="grid2">
          <div class="col"><span class="label">นำเข้าไปที่ห้อง</span>
            <label class="check"><input type="radio" name="target" value="auto" ${st.target === 'auto' ? 'checked' : ''} ${st.hasRoom ? '' : 'disabled'}> แยกห้องอัตโนมัติจากคอลัมน์ "ห้อง"${st.hasRoom ? '' : ' <span class="muted small">(ไฟล์ไม่มีคอลัมน์ห้อง)</span>'}</label>
            ${curRoom ? `<label class="check"><input type="radio" name="target" value="current" ${st.target === 'current' ? 'checked' : ''}> นำเข้าทั้งหมดไปที่ ${esc(curRoom.name)}</label>` : ''}
          </div>
          <div class="col"><span class="label">ถ้ามีรายชื่อเดิมอยู่แล้ว</span>
            <label class="check"><input type="radio" name="mode" value="append" ${st.mode === 'append' ? 'checked' : ''}> เพิ่มต่อ / อัปเดตตามเลขประจำตัว</label>
            <label class="check"><input type="radio" name="mode" value="replace" ${st.mode === 'replace' ? 'checked' : ''}> ลบของเดิมในห้องที่นำเข้า แล้วแทนที่ทั้งหมด</label>
          </div>
        </div>
        <div class="row wrap"><h3 class="grow">ตรวจสอบข้อมูล</h3><span class="pill ok">ถูกต้อง ${ok.length}</span>${warn ? `<span class="pill warn">ไม่มีนามสกุล ${warn}</span>` : ''}${bad ? `<span class="pill bad">มีปัญหา ${bad}</span>` : ''}${newRooms.length ? `<span class="pill pri">ห้องใหม่ ${newRooms.length}</span>` : ''}</div>
        <div class="table-wrap" style="border:1px solid var(--border);border-radius:10px;max-height:340px;overflow:auto"><table class="t compact">
          <thead><tr><th>แถว</th>${st.target === 'auto' ? '<th>ห้อง</th>' : ''}<th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ – นามสกุล</th><th>เพศ</th><th>ผลตรวจสอบ</th></tr></thead>
          <tbody>${show.map((r) => `<tr class="${r.problems.length ? 'bad' : r.warn.length ? 'warn' : ''}"><td class="muted">${r.line}</td>${st.target === 'auto' ? `<td>${esc(r.room) || '<span style="color:var(--bad)">—</span>'}</td>` : ''}<td>${esc(r.number)}</td><td>${esc(r.student_code)}</td><td class="nowrap">${esc(fullName(r)) || '<span style="color:var(--bad)">—</span>'}</td><td class="sub">${esc(r.gender)}</td>
            <td>${r.problems.length ? `<span class="pill bad">${esc(r.problems.join(', '))}</span>` : r.warn.length ? `<span class="pill warn">${esc(r.warn.join(', '))}</span>` : '<span class="pill ok">ถูกต้อง</span>'}${r.info ? ' <span class="pill pri">ห้องใหม่</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
        ${st.rows.length > show.length ? `<p class="help">แสดงตัวอย่าง ${show.length} จาก ${st.rows.length} แถว (แสดงแถวที่มีปัญหาทั้งหมด)</p>` : ''}
        ${newRooms.length ? `<div class="notice">${icon('info', 'sm')}<span>ระบบจะสร้างห้องใหม่ให้อัตโนมัติ: ${newRooms.slice(0, 12).map(esc).join(', ')}${newRooms.length > 12 ? ' …' : ''}</span></div>` : ''}
        ${st.mode === 'replace' ? `<div class="notice bad">${icon('alert', 'sm')}<span>รายชื่อเดิมใน${st.target === 'auto' ? ' ' + roomsInFile.length + ' ห้องที่อยู่ในไฟล์' : 'ห้อง ' + esc(curRoom.name)} จะถูกลบแล้วแทนที่ด้วยรายชื่อจากไฟล์</span></div>` : ''}
        ${bad ? `<p class="small sub">แถวที่มีปัญหา ${bad} แถวจะถูกข้าม แก้ไขในไฟล์แล้วนำเข้าใหม่ได้ภายหลัง</p>` : ''}`;
      st.okCount = ok.length;
    } else {
      body = `<div class="empty" style="padding:24px 0"><div style="color:var(--ok)">${icon('checks')}</div><h2>นำเข้าเรียบร้อย</h2><p style="margin-top:6px">${esc(st.result)}</p></div>`;
    }
    box.innerHTML = `
      <div class="modal-head"><div class="badge-ic xl">${icon('xls')}</div><div class="grow"><h2>นำเข้ารายชื่อนักเรียนจาก Excel</h2><p class="sub small">รองรับไฟล์ .xlsx, .xls, .csv</p></div><button class="icon-btn" data-x>${icon('x')}</button></div>
      <div class="steps">${steps.map((s, i) => `${i ? `<div class="line ${st.step > i ? 'on' : ''}"></div>` : ''}<div class="${st.step >= i + 1 ? 'on' : ''}"><span class="dot">${st.step > i + 1 ? icon('check', 'sm') : i + 1}</span>${s}</div>`).join('')}</div>
      ${body}
      <div class="modal-foot">
        ${st.step === 3 ? '<button class="btn primary" data-x>เสร็จสิ้น</button>' : `<button class="btn" data-x>ยกเลิก</button>`}
        ${st.step === 2 ? `<button class="btn primary" id="doImport" ${st.okCount ? '' : 'disabled'}>${icon('check', 'sm')} นำเข้า ${st.okCount} คน</button>` : ''}
      </div>`;
    bindI();
  }

  async function readFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('ไฟล์ใหญ่เกิน 5 MB', 'bad');
    if (!window.XLSX) return toast('กำลังโหลดตัวอ่านไฟล์ Excel ลองใหม่อีกครั้ง', 'bad');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', raw: false });
      let parsed = null; let sheetName = '';
      for (const name of wb.SheetNames) {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
        parsed = parseSheetRows(aoa);
        if (parsed && parsed.rows.length) { sheetName = name; break; }
      }
      if (!parsed || !parsed.rows.length) return toast('ไม่พบหัวตาราง "ชื่อ" ในไฟล์ ลองใช้แม่แบบ Excel ของระบบ', 'bad');
      if (!parsed.hasRoom && !curRoom) return toast('ไฟล์ไม่มีคอลัมน์ "ห้อง" กรุณาเพิ่มคอลัมน์ห้อง หรือสร้างห้องก่อน', 'bad');
      Object.assign(st, { file, rows: parsed.rows, hasRoom: parsed.hasRoom, sheetName, step: 2 });
      st.target = parsed.hasRoom ? 'auto' : 'current';
      draw();
    } catch (e) {
      toast('อ่านไฟล์ไม่ได้: ' + e.message, 'bad');
    }
  }

  function bindI() {
    box.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => m.close(); });
    if (st.step === 1) {
      const dz = box.querySelector('#dz');
      const input = box.querySelector('#file');
      input.onchange = () => readFile(input.files[0]);
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', (e) => readFile(e.dataTransfer.files[0]));
      box.querySelector('#tplLink').onclick = (e) => { e.preventDefault(); downloadTemplate(); };
    }
    if (st.step === 2) {
      box.querySelector('#change').onclick = () => { st.step = 1; draw(); };
      box.querySelectorAll('input[name="target"]').forEach((r) => r.addEventListener('change', () => { st.target = r.value; draw(); }));
      box.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => { st.mode = r.value; draw(); }));
      box.querySelector('#doImport').onclick = doImport;
    }
  }

  async function doImport() {
    const ok = st.rows.filter((r) => !r.problems.length);
    if (!ok.length) return;
    const btn = box.querySelector('#doImport'); btn.disabled = true; btn.textContent = 'กำลังนำเข้า…';
    const clean = (r) => ({ number: r.number, student_code: r.student_code, prefix: r.prefix, first_name: r.first_name, last_name: r.last_name, gender: r.gender });
    try {
      let res;
      if (st.target === 'auto') {
        res = await API.call('student.importAll', { mode: st.mode, rows: ok.map((r) => Object.assign(clean(r), { room: r.room, advisor: r.advisor })) });
      } else {
        res = await API.call('student.saveMany', { classroomId: curRoom.id, mode: st.mode, students: ok.map(clean) });
      }
      st.result = `เพิ่มใหม่ ${res.added} คน · อัปเดต ${res.updated} คน${res.createdRooms ? ` · สร้างห้องใหม่ ${res.createdRooms} ห้อง` : ''}`;
      st.step = 3;
      draw();
      done(st.target === 'current' ? curRoom.id : null);
    } catch (e) { apiErr(e); btn.disabled = false; btn.textContent = 'นำเข้า'; }
  }

  draw();
  if (initialFile) readFile(initialFile);
}
