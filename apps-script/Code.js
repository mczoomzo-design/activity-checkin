/**
 * ระบบเช็คชื่อกิจกรรมนักเรียน — Backend (Google Apps Script Web App)
 * ฐานข้อมูล: Google Sheets ที่ผูกกับสคริปต์นี้
 * หน้าเว็บ (GitHub Pages) เรียก API นี้ด้วย POST แบบ text/plain + JSON
 */

const TZ = 'Asia/Bangkok';

const SCHEMA = {
  Classrooms: ['id', 'name', 'grade', 'advisor', 'advisor_contact', 'sort'],
  Students: ['id', 'classroom_id', 'number', 'student_code', 'prefix', 'first_name', 'last_name', 'gender'],
  Activities: ['id', 'name', 'description', 'dates_json', 'slots_json', 'targets_json', 'statuses_json',
    'pass_threshold', 'allow_late_edit', 'require_pin', 'status', 'created_at', 'updated_at'],
  Sessions: ['id', 'activity_id', 'date', 'label', 'open_time', 'close_time', 'seq'],
  Links: ['token', 'activity_id', 'classroom_id', 'pin', 'created_at'],
  Attendance: ['session_id', 'classroom_id', 'data_json', 'updated_at', 'updated_by'],
};

const STATUS_DEFS = {
  P: { label: 'มา', present: true },
  A: { label: 'ขาด', present: false },
  L: { label: 'ลา', present: false },
  T: { label: 'สาย', present: true },
  S: { label: 'ป่วย', present: false },
};

const ADMIN_TTL = 6 * 60 * 60; // วินาที

/* ============================== Entry points ============================== */

function doGet(e) {
  return json_({ ok: true, data: { app: 'activity-checkin', time: nowStr_() } });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' });
  }
  try {
    const data = route_(req.action, req.payload || {}, req.auth || '');
    return json_({ ok: true, data: data });
  } catch (err) {
    const msg = err && err.userMessage ? err.userMessage : 'เกิดข้อผิดพลาดในระบบ: ' + (err && err.message);
    return json_({ ok: false, error: msg, code: err && err.code });
  }
}

const PUBLIC_ACTIONS = {
  'admin.login': adminLogin_,
  'teacher.get': teacherGet_,
  'teacher.save': teacherSave_,
  'hub.get': hubGet_,
};

const ADMIN_ACTIONS = {
  'admin.logout': adminLogout_,
  'admin.changePassword': adminChangePassword_,
  'admin.bootstrap': adminBootstrap_,
  'settings.save': settingsSave_,
  'classroom.save': classroomSave_,
  'classroom.delete': classroomDelete_,
  'student.list': studentList_,
  'student.saveMany': studentSaveMany_,
  'student.importAll': studentImportAll_,
  'student.update': studentUpdate_,
  'student.delete': studentDelete_,
  'activity.list': activityList_,
  'activity.get': activityGet_,
  'activity.save': activitySave_,
  'activity.delete': activityDelete_,
  'activity.links': activityLinks_,
  'activity.report': activityReport_,
  'link.reset': linkReset_,
};

const WRITE_ACTIONS = ['teacher.save', 'admin.changePassword', 'settings.save', 'classroom.save', 'classroom.delete',
  'student.saveMany', 'student.importAll', 'student.update', 'student.delete', 'activity.save', 'activity.delete',
  'activity.links', 'link.reset', 'hub.get'];

function route_(action, p, auth) {
  let fn = PUBLIC_ACTIONS[action];
  let isAdmin = false;
  if (!fn) {
    fn = ADMIN_ACTIONS[action];
    if (!fn) throw userErr_('ไม่รู้จักคำสั่ง ' + action);
    requireAdmin_(auth);
    isAdmin = true;
  }
  const ctx = { auth: auth, isAdmin: isAdmin || checkAdmin_(auth) };
  if (WRITE_ACTIONS.indexOf(action) >= 0) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) throw userErr_('ระบบกำลังบันทึกข้อมูลของผู้ใช้อื่น ลองใหม่อีกครั้ง');
    try {
      return fn(p, ctx);
    } finally {
      lock.releaseLock();
    }
  }
  return fn(p, ctx);
}

/* ============================== Setup ============================== */

/** รันฟังก์ชันนี้ 1 ครั้งจากหน้า Apps Script editor เพื่อสร้างชีตและรหัสผ่านแอดมิน */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  Object.keys(SCHEMA).forEach(function (n) { sheet_(n); });
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  if (!props.getProperty('SCHOOL_NAME')) props.setProperty('SCHOOL_NAME', 'โรงเรียนของฉัน');
  let msg = 'ตั้งค่าเรียบร้อย';
  if (!props.getProperty('ADMIN_HASH')) {
    const pw = randomToken_(10);
    setAdminPassword_(pw);
    msg += '\nรหัสผ่านแอดมินเริ่มต้น: ' + pw + '\n(เข้าสู่ระบบแล้วเปลี่ยนรหัสผ่านที่เมนู ตั้งค่า)';
  }
  Logger.log(msg);
  return msg;
}

/** ใช้เมื่อลืมรหัสผ่านแอดมิน: รันจาก editor แล้วดูรหัสใหม่ใน Execution log */
function resetAdminPassword() {
  const pw = randomToken_(10);
  setAdminPassword_(pw);
  Logger.log('รหัสผ่านแอดมินใหม่: ' + pw);
  return pw;
}

/* ============================== Sheet DB ============================== */

let SS_CACHE = null;
const TABLE_CACHE = {};

function ss_() {
  if (SS_CACHE) return SS_CACHE;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  SS_CACHE = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return SS_CACHE;
}

function sheet_(name) {
  const ss = ss_();
  let s = ss.getSheetByName(name);
  if (!s) {
    const cols = SCHEMA[name];
    s = ss.insertSheet(name);
    s.getRange(1, 1, s.getMaxRows(), cols.length).setNumberFormat('@');
    s.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#E8F0FE');
    s.setFrozenRows(1);
  }
  return s;
}

function read_(name) {
  if (TABLE_CACHE[name]) return TABLE_CACHE[name];
  const cols = SCHEMA[name];
  const s = sheet_(name);
  const last = s.getLastRow();
  const rows = [];
  if (last >= 2) {
    const vals = s.getRange(2, 1, last - 1, cols.length).getDisplayValues();
    for (let i = 0; i < vals.length; i++) {
      if (vals[i].join('') === '') continue;
      const o = { _row: i + 2 };
      for (let j = 0; j < cols.length; j++) o[cols[j]] = vals[i][j];
      rows.push(o);
    }
  }
  TABLE_CACHE[name] = rows;
  return rows;
}

function toRow_(name, o) {
  return SCHEMA[name].map(function (c) { return o[c] === undefined || o[c] === null ? '' : String(o[c]); });
}

function insert_(name, objs) {
  if (!objs.length) return;
  const s = sheet_(name);
  const cols = SCHEMA[name].length;
  const start = s.getLastRow() + 1;
  s.getRange(start, 1, objs.length, cols).setNumberFormat('@').setValues(objs.map(function (o) { return toRow_(name, o); }));
  delete TABLE_CACHE[name];
}

function update_(name, obj) {
  if (!obj._row) throw new Error('missing _row');
  const s = sheet_(name);
  s.getRange(obj._row, 1, 1, SCHEMA[name].length).setNumberFormat('@').setValues([toRow_(name, obj)]);
  delete TABLE_CACHE[name];
}

/** เขียนตารางใหม่ทั้งตาราง (ใช้ตอนลบหลายแถว) */
function rewrite_(name, objs) {
  const s = sheet_(name);
  const cols = SCHEMA[name].length;
  const last = s.getLastRow();
  if (last >= 2) s.getRange(2, 1, last - 1, cols).clearContent();
  if (objs.length) {
    s.getRange(2, 1, objs.length, cols).setNumberFormat('@').setValues(objs.map(function (o) { return toRow_(name, o); }));
  }
  delete TABLE_CACHE[name];
}

function removeWhere_(name, pred) {
  const all = read_(name);
  const keep = all.filter(function (r) { return !pred(r); });
  if (keep.length !== all.length) rewrite_(name, keep);
  return all.length - keep.length;
}

/* ============================== Helpers ============================== */

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function userErr_(msg, code) {
  const e = new Error(msg);
  e.userMessage = msg;
  e.code = code;
  return e;
}

function nowStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function hm_() { return Utilities.formatDate(new Date(), TZ, 'HH:mm'); }

function randomToken_(len) {
  let s = '';
  while (s.length < len) s += Utilities.getUuid().replace(/-/g, '');
  // ตัดตัวที่สับสนง่ายออก แล้วสลับตัวพิมพ์ให้เดายากขึ้น
  return s.slice(0, len).split('').map(function (c, i) {
    return /[a-f]/.test(c) && (c.charCodeAt(0) + i) % 2 ? c.toUpperCase() : c;
  }).join('');
}

function newId_(prefix) { return prefix + randomToken_(8); }

function sha256_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function str_(v, max) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return max ? s.slice(0, max) : s;
}

function strList_(v) {
  return Array.isArray(v) ? v.map(function (x) { return str_(x, 100); }).filter(Boolean) : [];
}

function parseJson_(s, def) {
  try { return s ? JSON.parse(s) : def; } catch (e) { return def; }
}

function byKey_(arr, key) {
  const m = {};
  arr.forEach(function (r) { m[r[key]] = r; });
  return m;
}

function compareRoom_(a, b) {
  const sa = Number(a.sort || 0), sb = Number(b.sort || 0);
  if (sa !== sb) return sa - sb;
  return String(a.name).localeCompare(String(b.name), 'th', { numeric: true });
}

function studentOut_(s) {
  return {
    id: s.id, classroom_id: s.classroom_id, number: s.number, student_code: s.student_code,
    prefix: s.prefix, first_name: s.first_name, last_name: s.last_name, gender: s.gender,
  };
}

function sortStudents_(list) {
  return list.sort(function (a, b) {
    const na = Number(a.number) || 9999, nb = Number(b.number) || 9999;
    if (na !== nb) return na - nb;
    return String(a.first_name).localeCompare(String(b.first_name), 'th');
  });
}

/* ============================== Admin auth ============================== */

function setAdminPassword_(pw) {
  const salt = randomToken_(16);
  const props = PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SALT', salt);
  props.setProperty('ADMIN_HASH', sha256_(salt + ':' + pw));
}

function checkAdmin_(token) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  if (cache.get('adm_' + token)) {
    cache.put('adm_' + token, '1', ADMIN_TTL);
    return true;
  }
  return false;
}

function requireAdmin_(token) {
  if (!checkAdmin_(token)) throw userErr_('กรุณาเข้าสู่ระบบใหม่', 'AUTH');
}

function adminLogin_(p) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  if (fails >= 10) throw userErr_('ใส่รหัสผิดหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่');
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty('ADMIN_SALT');
  const hash = props.getProperty('ADMIN_HASH');
  if (!hash) throw userErr_('ยังไม่ได้ตั้งค่าระบบ กรุณารันฟังก์ชัน setup ใน Apps Script ก่อน');
  if (sha256_(salt + ':' + str_(p.password)) !== hash) {
    cache.put('login_fails', String(fails + 1), 600);
    throw userErr_('รหัสผ่านไม่ถูกต้อง');
  }
  const token = randomToken_(32);
  cache.put('adm_' + token, '1', ADMIN_TTL);
  return { token: token };
}

function adminLogout_(p, ctx) {
  CacheService.getScriptCache().remove('adm_' + ctx.auth);
  return true;
}

function adminChangePassword_(p) {
  const props = PropertiesService.getScriptProperties();
  if (sha256_(props.getProperty('ADMIN_SALT') + ':' + str_(p.oldPassword)) !== props.getProperty('ADMIN_HASH')) {
    throw userErr_('รหัสผ่านเดิมไม่ถูกต้อง');
  }
  const pw = str_(p.newPassword);
  if (pw.length < 6) throw userErr_('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร');
  setAdminPassword_(pw);
  return true;
}

function settingsSave_(p) {
  const name = str_(p.schoolName, 120);
  if (!name) throw userErr_('กรุณากรอกชื่อโรงเรียน');
  PropertiesService.getScriptProperties().setProperty('SCHOOL_NAME', name);
  return { schoolName: name };
}

function schoolName_() {
  return PropertiesService.getScriptProperties().getProperty('SCHOOL_NAME') || '';
}

/* ============================== Bootstrap ============================== */

function adminBootstrap_() {
  return {
    schoolName: schoolName_(),
    sheetUrl: ss_().getUrl(),
    classrooms: classroomsWithCounts_(),
    statusDefs: STATUS_DEFS,
    today: today_(),
    now: hm_(),
  };
}

function classroomsWithCounts_() {
  const counts = {};
  read_('Students').forEach(function (s) { counts[s.classroom_id] = (counts[s.classroom_id] || 0) + 1; });
  return read_('Classrooms').slice().sort(compareRoom_).map(function (c) {
    return {
      id: c.id, name: c.name, grade: c.grade, advisor: c.advisor, advisor_contact: c.advisor_contact,
      sort: c.sort, student_count: counts[c.id] || 0,
    };
  });
}

/* ============================== Classrooms ============================== */

function gradeFromName_(name) {
  const m = String(name).match(/^(.*?)[\/\-]/);
  return m ? m[1].trim() : String(name).trim();
}

function classroomSave_(p) {
  const name = str_(p.name, 40);
  if (!name) throw userErr_('กรุณากรอกชื่อห้อง');
  const all = read_('Classrooms');
  const dup = all.filter(function (c) { return c.name === name && c.id !== p.id; })[0];
  if (dup) throw userErr_('มีห้อง ' + name + ' อยู่แล้ว');
  const data = {
    name: name,
    grade: str_(p.grade, 20) || gradeFromName_(name),
    advisor: str_(p.advisor, 200),
    advisor_contact: str_(p.advisor_contact, 200),
    sort: str_(p.sort, 10),
  };
  if (p.id) {
    const row = all.filter(function (c) { return c.id === p.id; })[0];
    if (!row) throw userErr_('ไม่พบห้องนี้');
    Object.assign(row, data);
    update_('Classrooms', row);
    return { id: row.id };
  }
  const id = newId_('c');
  insert_('Classrooms', [Object.assign({ id: id }, data)]);
  return { id: id };
}

function classroomDelete_(p) {
  const id = str_(p.id);
  removeWhere_('Classrooms', function (c) { return c.id === id; });
  const removed = removeWhere_('Students', function (s) { return s.classroom_id === id; });
  removeWhere_('Links', function (l) { return l.classroom_id === id; });
  removeWhere_('Attendance', function (a) { return a.classroom_id === id; });
  return { removedStudents: removed };
}

/* ============================== Students ============================== */

function studentList_(p) {
  const id = str_(p.classroomId);
  return sortStudents_(read_('Students').filter(function (s) { return s.classroom_id === id; }).map(studentOut_));
}

function cleanStudent_(s) {
  return {
    number: str_(s.number, 6),
    student_code: str_(s.student_code, 20),
    prefix: str_(s.prefix, 20),
    first_name: str_(s.first_name, 80),
    last_name: str_(s.last_name, 80),
    gender: str_(s.gender, 10),
  };
}

/**
 * บันทึกนักเรียนหลายคนเข้าห้องเดียว
 * mode: 'append' = เพิ่มใหม่/อัปเดตตามเลขประจำตัว, 'replace' = ลบของเดิมในห้องก่อน
 */
function studentSaveMany_(p) {
  const classroomId = str_(p.classroomId);
  if (!read_('Classrooms').some(function (c) { return c.id === classroomId; })) throw userErr_('ไม่พบห้องนี้');
  const list = (p.students || []).map(cleanStudent_).filter(function (s) { return s.first_name; });
  if (!list.length) throw userErr_('ไม่มีรายชื่อที่จะบันทึก');
  return upsertStudents_(list.map(function (s) { return Object.assign(s, { classroom_id: classroomId }); }),
    p.mode === 'replace' ? [classroomId] : []);
}

/** นำเข้าจากไฟล์ที่มีคอลัมน์ "ห้อง" — สร้างห้องให้อัตโนมัติถ้ายังไม่มี */
function studentImportAll_(p) {
  const rows = p.rows || [];
  const rooms = read_('Classrooms');
  const byName = {};
  rooms.forEach(function (c) { byName[c.name] = c; });
  const newRooms = [];
  const list = [];
  rows.forEach(function (r) {
    const roomName = str_(r.room, 40);
    const s = cleanStudent_(r);
    if (!roomName || !s.first_name) return;
    let room = byName[roomName];
    if (!room) {
      room = { id: newId_('c'), name: roomName, grade: gradeFromName_(roomName), advisor: str_(r.advisor, 200), advisor_contact: '', sort: '' };
      byName[roomName] = room;
      newRooms.push(room);
    }
    s.classroom_id = room.id;
    list.push(s);
  });
  if (!list.length) throw userErr_('ไม่มีรายชื่อที่จะนำเข้า');
  insert_('Classrooms', newRooms);
  const replaceIds = p.mode === 'replace'
    ? Object.keys(list.reduce(function (m, s) { m[s.classroom_id] = 1; return m; }, {}))
    : [];
  const res = upsertStudents_(list, replaceIds);
  res.createdRooms = newRooms.length;
  return res;
}

function upsertStudents_(list, replaceClassroomIds) {
  let all = read_('Students');
  // คนในห้องที่ถูกแทนที่: เก็บ id เดิมไว้ใช้ซ้ำ ข้อมูลเช็คชื่อที่ผูกกับ id จะได้ไม่หลุด
  const reuse = {};
  const reused = {};
  const nameKey = function (s) { return 'n:' + s.classroom_id + '|' + s.first_name + '|' + s.last_name; };
  if (replaceClassroomIds.length) {
    all.forEach(function (s) {
      if (replaceClassroomIds.indexOf(s.classroom_id) < 0) return;
      if (s.student_code) reuse['c:' + s.student_code] = s.id;
      reuse[nameKey(s)] = s.id;
    });
    all = all.filter(function (s) { return replaceClassroomIds.indexOf(s.classroom_id) < 0; });
  }
  const byCode = {};
  all.forEach(function (s) { if (s.student_code) byCode[s.student_code] = s; });
  const nextNum = {};
  all.forEach(function (s) {
    const n = Number(s.number) || 0;
    nextNum[s.classroom_id] = Math.max(nextNum[s.classroom_id] || 0, n);
  });
  let added = 0, updated = 0;
  const seen = {};
  list.forEach(function (s) {
    if (s.student_code && seen[s.student_code]) return; // ซ้ำในไฟล์เดียวกัน ใช้แถวแรก
    if (s.student_code) seen[s.student_code] = 1;
    const ex = s.student_code ? byCode[s.student_code] : null;
    if (!s.number) {
      if (ex && ex.classroom_id === s.classroom_id && ex.number) s.number = ex.number;
      else s.number = String((nextNum[s.classroom_id] = (nextNum[s.classroom_id] || 0) + 1));
    } else {
      nextNum[s.classroom_id] = Math.max(nextNum[s.classroom_id] || 0, Number(s.number) || 0);
    }
    if (ex) {
      Object.assign(ex, s);
      updated++;
    } else {
      const oldId = [s.student_code ? reuse['c:' + s.student_code] : '', reuse[nameKey(s)]]
        .filter(function (x) { return x && !reused[x]; })[0];
      if (oldId) reused[oldId] = 1;
      const row = Object.assign({ id: oldId || newId_('s') }, s);
      all.push(row);
      if (row.student_code) byCode[row.student_code] = row;
      added++;
    }
  });
  rewrite_('Students', all);
  return { added: added, updated: updated };
}

function studentUpdate_(p) {
  const row = read_('Students').filter(function (s) { return s.id === p.id; })[0];
  if (!row) throw userErr_('ไม่พบนักเรียนคนนี้');
  const s = cleanStudent_(p);
  if (!s.first_name) throw userErr_('กรุณากรอกชื่อ');
  if (s.student_code && read_('Students').some(function (o) { return o.id !== row.id && o.student_code === s.student_code; })) {
    throw userErr_('เลขประจำตัว ' + s.student_code + ' มีอยู่แล้ว');
  }
  Object.assign(row, s);
  if (p.classroom_id) row.classroom_id = str_(p.classroom_id);
  update_('Students', row);
  return studentOut_(row);
}

function studentDelete_(p) {
  const ids = p.ids || [p.id];
  const n = removeWhere_('Students', function (s) { return ids.indexOf(s.id) >= 0; });
  return { removed: n };
}

/* ============================== Activities ============================== */

function activityOut_(a) {
  return {
    id: a.id, name: a.name, description: a.description,
    dates: parseJson_(a.dates_json, []), slots: parseJson_(a.slots_json, []),
    targets: parseJson_(a.targets_json, 'ALL'), statuses: parseJson_(a.statuses_json, ['P', 'A', 'L']),
    pass_threshold: Number(a.pass_threshold || 0), allow_late_edit: a.allow_late_edit === '1',
    require_pin: a.require_pin === '1', status: a.status || 'active',
    created_at: a.created_at, updated_at: a.updated_at,
  };
}

function targetRooms_(act) {
  const rooms = read_('Classrooms').slice().sort(compareRoom_);
  if (act.targets === 'ALL' || !act.targets) return rooms;
  if (act.targets.grades) return rooms.filter(function (c) { return act.targets.grades.indexOf(c.grade) >= 0; });
  if (act.targets.rooms) return rooms.filter(function (c) { return act.targets.rooms.indexOf(c.id) >= 0; });
  return rooms;
}

function sessionsOf_(activityId) {
  return read_('Sessions').filter(function (s) { return s.activity_id === activityId; })
    .sort(function (a, b) { return Number(a.seq) - Number(b.seq); })
    .map(function (s) {
      return { id: s.id, date: s.date, label: s.label, open_time: s.open_time, close_time: s.close_time, seq: Number(s.seq) };
    });
}

function activityList_() {
  const today = today_();
  const sessions = read_('Sessions');
  const att = read_('Attendance');
  const attBySession = {};
  att.forEach(function (a) { (attBySession[a.session_id] = attBySession[a.session_id] || []).push(a); });
  return read_('Activities').map(function (row) {
    const a = activityOut_(row);
    const ss = sessions.filter(function (s) { return s.activity_id === a.id; });
    const roomIds = targetRooms_(a).map(function (c) { return c.id; });
    const todays = ss.filter(function (s) { return s.date === today; }).sort(function (x, y) { return Number(x.seq) - Number(y.seq); });
    a.session_count = ss.length;
    a.room_count = roomIds.length;
    a.today_sessions = todays.map(function (s) {
      // นับเฉพาะห้องเป้าหมายปัจจุบัน (ห้องที่ถูกเอาออกจากเป้าหมายแล้วไม่ต้องนับ)
      const checked = (attBySession[s.id] || []).filter(function (x) { return roomIds.indexOf(x.classroom_id) >= 0; }).length;
      return { id: s.id, label: s.label, open_time: s.open_time, close_time: s.close_time, checked: checked };
    });
    return a;
  }).sort(function (x, y) { return String(y.created_at).localeCompare(String(x.created_at)); });
}

function activityGet_(p) {
  const row = read_('Activities').filter(function (a) { return a.id === p.id; })[0];
  if (!row) throw userErr_('ไม่พบกิจกรรมนี้');
  const a = activityOut_(row);
  a.sessions = sessionsOf_(a.id);
  return a;
}

function validTime_(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }

function activitySave_(p) {
  const name = str_(p.name, 150);
  if (!name) throw userErr_('กรุณากรอกชื่อกิจกรรม');
  const dates = (p.dates || []).map(function (d) { return str_(d); })
    .filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); });
  const uniqDates = dates.filter(function (d, i) { return dates.indexOf(d) === i; }).sort();
  if (!uniqDates.length) throw userErr_('กรุณาเลือกวันที่จัดกิจกรรมอย่างน้อย 1 วัน');
  if (uniqDates.length > 60) throw userErr_('กิจกรรมยาวได้ไม่เกิน 60 วัน');
  const slots = (p.slots || []).map(function (s) {
    return { label: str_(s.label, 40), open: str_(s.open), close: str_(s.close) };
  });
  if (!slots.length) throw userErr_('กรุณาเพิ่มรอบเช็คชื่ออย่างน้อย 1 รอบ');
  const labels = {};
  slots.forEach(function (s) {
    if (!s.label) throw userErr_('กรุณาตั้งชื่อรอบเช็คชื่อให้ครบ');
    if (!validTime_(s.open) || !validTime_(s.close)) throw userErr_('เวลาของรอบ "' + s.label + '" ไม่ถูกต้อง');
    if (s.open >= s.close) throw userErr_('เวลาเปิดของรอบ "' + s.label + '" ต้องก่อนเวลาปิด');
    // syncSessions_ จับคู่รอบเดิมด้วย วัน|ชื่อรอบ ชื่อซ้ำจะทำให้ได้ id ซ้ำกัน
    if (labels[s.label]) throw userErr_('ชื่อรอบ "' + s.label + '" ซ้ำกัน');
    labels[s.label] = 1;
  });
  const statuses = Object.keys(STATUS_DEFS).filter(function (k) { return k === 'P' || (p.statuses || []).indexOf(k) >= 0; });
  const tGrades = strList_(p.targets && p.targets.grades);
  const tRooms = strList_(p.targets && p.targets.rooms);
  const targets = tGrades.length ? { grades: tGrades } : tRooms.length ? { rooms: tRooms } : 'ALL';
  const now = nowStr_();
  const data = {
    name: name,
    description: str_(p.description, 1000),
    dates_json: JSON.stringify(uniqDates),
    slots_json: JSON.stringify(slots),
    targets_json: JSON.stringify(targets),
    statuses_json: JSON.stringify(statuses),
    pass_threshold: String(Math.max(0, Math.min(100, Number(p.pass_threshold) || 0))),
    allow_late_edit: p.allow_late_edit ? '1' : '0',
    require_pin: p.require_pin ? '1' : '0',
    status: p.status === 'closed' ? 'closed' : 'active',
    updated_at: now,
  };
  let id = p.id;
  if (id) {
    const row = read_('Activities').filter(function (a) { return a.id === id; })[0];
    if (!row) throw userErr_('ไม่พบกิจกรรมนี้');
    Object.assign(row, data);
    update_('Activities', row);
  } else {
    id = newId_('a');
    insert_('Activities', [Object.assign({ id: id, created_at: now }, data)]);
  }
  syncSessions_(id, uniqDates, slots);
  return activityGet_({ id: id });
}

/** สร้างรอบเช็คชื่อจาก วัน × รอบ โดยเก็บ id เดิมไว้ถ้าวันและชื่อรอบตรงกัน (ข้อมูลเช็คชื่อเดิมจึงไม่หาย) */
function syncSessions_(activityId, dates, slots) {
  const all = read_('Sessions');
  const mine = all.filter(function (s) { return s.activity_id === activityId; });
  const others = all.filter(function (s) { return s.activity_id !== activityId; });
  const oldByKey = {};
  mine.forEach(function (s) { oldByKey[s.date + '|' + s.label] = s; });
  const next = [];
  let seq = 0;
  dates.forEach(function (d) {
    slots.forEach(function (sl) {
      const old = oldByKey[d + '|' + sl.label];
      next.push({
        id: old ? old.id : newId_('x'), activity_id: activityId, date: d, label: sl.label,
        open_time: sl.open, close_time: sl.close, seq: String(++seq),
      });
    });
  });
  const keepIds = next.map(function (s) { return s.id; });
  const removedIds = mine.filter(function (s) { return keepIds.indexOf(s.id) < 0; }).map(function (s) { return s.id; });
  rewrite_('Sessions', others.concat(next));
  if (removedIds.length) removeWhere_('Attendance', function (a) { return removedIds.indexOf(a.session_id) >= 0; });
}

function activityDelete_(p) {
  const id = str_(p.id);
  const sessIds = read_('Sessions').filter(function (s) { return s.activity_id === id; }).map(function (s) { return s.id; });
  removeWhere_('Activities', function (a) { return a.id === id; });
  removeWhere_('Sessions', function (s) { return s.activity_id === id; });
  removeWhere_('Links', function (l) { return l.activity_id === id; });
  removeWhere_('Attendance', function (a) { return sessIds.indexOf(a.session_id) >= 0; });
  return true;
}

/* ============================== Links & progress ============================== */

/** classroom_id ของ "ลิงก์รวม" ที่ครูทุกห้องใช้ร่วมกัน แล้วเลือกห้องของตัวเอง */
const HUB = 'ALL';

function randomPin_() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** สร้างลิงก์ของห้องเป้าหมายและลิงก์รวมที่ยังไม่มี แล้วคืน map classroom_id → link */
function ensureLinks_(act, rooms) {
  const links = read_('Links').filter(function (l) { return l.activity_id === act.id; });
  const byRoom = byKey_(links, 'classroom_id');
  const created = [];
  rooms.map(function (c) { return c.id; }).concat([HUB]).forEach(function (id) {
    if (!byRoom[id]) {
      const l = { token: randomToken_(20), activity_id: act.id, classroom_id: id, pin: id === HUB ? '' : randomPin_(), created_at: nowStr_() };
      created.push(l);
      byRoom[id] = l;
    }
  });
  insert_('Links', created);
  return byRoom;
}

/** คืนลิงก์ของทุกห้องเป้าหมาย (สร้างให้ถ้ายังไม่มี) พร้อมความคืบหน้าการเช็คชื่อทุกรอบ */
function activityLinks_(p) {
  const act = activityGet_({ id: p.id });
  const rooms = targetRooms_(act);
  const byRoom = ensureLinks_(act, rooms);

  const counts = {};
  read_('Students').forEach(function (s) { counts[s.classroom_id] = (counts[s.classroom_id] || 0) + 1; });
  const sessIds = act.sessions.map(function (s) { return s.id; });
  const att = {};
  read_('Attendance').forEach(function (a) {
    if (sessIds.indexOf(a.session_id) < 0) return;
    const d = parseJson_(a.data_json, {});
    const tally = {};
    Object.keys(d).forEach(function (k) { const st = d[k].s; tally[st] = (tally[st] || 0) + 1; });
    att[a.session_id + '|' + a.classroom_id] = { n: Object.keys(d).length, tally: tally, at: a.updated_at };
  });
  return {
    activity: act,
    today: today_(),
    now: hm_(),
    hub: byRoom[HUB].token,
    rooms: rooms.map(function (c) {
      return {
        id: c.id, name: c.name, advisor: c.advisor, advisor_contact: c.advisor_contact,
        student_count: counts[c.id] || 0, token: byRoom[c.id].token, pin: byRoom[c.id].pin,
        progress: act.sessions.map(function (s) { return att[s.id + '|' + c.id] || null; }),
      };
    }),
  };
}

function linkReset_(p) {
  const row = read_('Links').filter(function (l) { return l.activity_id === p.activityId && l.classroom_id === p.classroomId; })[0];
  if (!row) throw userErr_('ไม่พบลิงก์นี้');
  row.token = randomToken_(20);
  row.pin = row.classroom_id === HUB ? '' : randomPin_();
  row.created_at = nowStr_();
  update_('Links', row);
  return { token: row.token, pin: row.pin };
}

/* ============================== Teacher ============================== */

function linkContext_(p, ctx) {
  const token = str_(p.token);
  if (!token || token.length < 10) throw userErr_('ลิงก์ไม่ถูกต้อง', 'LINK');
  const link = read_('Links').filter(function (l) { return l.token === token; })[0];
  if (!link) throw userErr_('ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว กรุณาขอลิงก์ใหม่จากแอดมิน', 'LINK');
  const actRow = read_('Activities').filter(function (a) { return a.id === link.activity_id; })[0];
  if (!actRow) throw userErr_('กิจกรรมนี้ถูกลบไปแล้ว', 'LINK');
  const act = activityOut_(actRow);
  if (link.classroom_id === HUB) throw userErr_('นี่คือลิงก์รวม กรุณาเลือกห้อง', 'HUB');
  const room = read_('Classrooms').filter(function (c) { return c.id === link.classroom_id; })[0];
  if (!room) throw userErr_('ไม่พบห้องเรียนของลิงก์นี้', 'LINK');
  if (act.require_pin && !ctx.isAdmin) {
    const cache = CacheService.getScriptCache();
    const key = 'pin_fail_' + token;
    const fails = Number(cache.get(key) || 0);
    if (fails >= 8) throw userErr_('ใส่ PIN ผิดหลายครั้ง รอ 10 นาทีแล้วลองใหม่', 'PIN');
    if (str_(p.pin) !== link.pin) {
      if (p.pin) cache.put(key, String(fails + 1), 600);
      throw userErr_(p.pin ? 'PIN ไม่ถูกต้อง' : 'กรุณาใส่ PIN', 'PIN');
    }
  }
  return { link: link, act: act, room: room };
}

function sessionState_(s, act, today, now) {
  if (s.date < today) return act.allow_late_edit ? 'late' : 'closed';
  if (s.date > today) return 'upcoming';
  if (now < s.open_time) return 'upcoming';
  if (now <= s.close_time) return 'open';
  return act.allow_late_edit ? 'late' : 'closed';
}

/** รอบที่ควรแสดงตอนนี้: รอบที่เปิดอยู่ > รอบถัดไปของวันนี้ > รอบล่าสุดที่ผ่านมา > รอบแรก */
function currentSession_(sessions, today, now) {
  return sessions.filter(function (s) { return s.date === today && now >= s.open_time && now <= s.close_time; })[0]
    || sessions.filter(function (s) { return s.date === today && now < s.open_time; })[0]
    || sessions.filter(function (s) { return s.date <= today; }).pop()
    || sessions[0] || null;
}

/** หน้าลิงก์รวม: รายชื่อห้องทั้งหมดของกิจกรรม ให้ครูเลือกห้องของตัวเอง */
function hubGet_(p) {
  const token = str_(p.token);
  const link = token.length >= 10 ? read_('Links').filter(function (l) { return l.token === token && l.classroom_id === HUB; })[0] : null;
  if (!link) throw userErr_('ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว กรุณาขอลิงก์ใหม่จากแอดมิน', 'LINK');
  const actRow = read_('Activities').filter(function (a) { return a.id === link.activity_id; })[0];
  if (!actRow) throw userErr_('กิจกรรมนี้ถูกลบไปแล้ว', 'LINK');
  const act = activityOut_(actRow);
  const rooms = targetRooms_(act);
  const byRoom = ensureLinks_(act, rooms);
  const today = today_(), now = hm_();
  const sess = currentSession_(sessionsOf_(act.id), today, now);
  const checked = {};
  if (sess) read_('Attendance').forEach(function (a) { if (a.session_id === sess.id) checked[a.classroom_id] = a.updated_at; });
  const counts = {};
  read_('Students').forEach(function (s) { counts[s.classroom_id] = (counts[s.classroom_id] || 0) + 1; });
  return {
    schoolName: schoolName_(),
    activity: { name: act.name, description: act.description, dates: act.dates, require_pin: act.require_pin, status: act.status },
    session: sess ? { date: sess.date, label: sess.label, open_time: sess.open_time, close_time: sess.close_time, state: sessionState_(sess, act, today, now) } : null,
    today: today,
    rooms: rooms.map(function (c) {
      return { name: c.name, grade: c.grade, advisor: c.advisor, student_count: counts[c.id] || 0, token: byRoom[c.id].token, checked_at: checked[c.id] || '' };
    }),
  };
}

function teacherGet_(p, ctx) {
  const c = linkContext_(p, ctx);
  const today = today_(), now = hm_();
  const sessions = sessionsOf_(c.act.id).map(function (s) {
    s.state = sessionState_(s, c.act, today, now);
    return s;
  });
  const sessIds = sessions.map(function (s) { return s.id; });
  const attendance = {};
  read_('Attendance').forEach(function (a) {
    if (a.classroom_id === c.room.id && sessIds.indexOf(a.session_id) >= 0) {
      attendance[a.session_id] = { data: parseJson_(a.data_json, {}), updated_at: a.updated_at };
    }
  });
  const students = sortStudents_(read_('Students').filter(function (s) { return s.classroom_id === c.room.id; }))
    .map(function (s) { return { id: s.id, number: s.number, student_code: s.student_code, name: (s.prefix || '') + s.first_name + ' ' + s.last_name }; });
  return {
    schoolName: schoolName_(),
    activity: { id: c.act.id, name: c.act.name, description: c.act.description, statuses: c.act.statuses, status: c.act.status, allow_late_edit: c.act.allow_late_edit },
    statusDefs: STATUS_DEFS,
    classroom: { id: c.room.id, name: c.room.name, advisor: c.room.advisor },
    sessions: sessions,
    students: students,
    attendance: attendance,
    today: today,
    now: now,
    isAdmin: ctx.isAdmin,
  };
}

function teacherSave_(p, ctx) {
  const c = linkContext_(p, ctx);
  if (c.act.status === 'closed' && !ctx.isAdmin) throw userErr_('กิจกรรมนี้ปิดการเช็คชื่อแล้ว');
  const sess = sessionsOf_(c.act.id).filter(function (s) { return s.id === p.sessionId; })[0];
  if (!sess) throw userErr_('ไม่พบรอบเช็คชื่อนี้');
  const state = sessionState_(sess, c.act, today_(), hm_());
  if (!ctx.isAdmin) {
    if (state === 'upcoming') throw userErr_('ยังไม่ถึงเวลาเช็คชื่อรอบนี้ (เปิด ' + sess.open_time + ' น.)');
    if (state === 'closed') throw userErr_('หมดเวลาเช็คชื่อรอบนี้แล้ว (ปิด ' + sess.close_time + ' น.) ติดต่อแอดมินหากต้องการแก้ไข');
  }
  const allowed = c.act.statuses;
  const valid = {};
  read_('Students').forEach(function (s) { if (s.classroom_id === c.room.id) valid[s.id] = 1; });
  const data = {};
  (p.records || []).forEach(function (r) {
    if (!valid[r.studentId] || allowed.indexOf(r.status) < 0) return;
    const rec = { s: r.status };
    const note = str_(r.note, 200);
    if (note) rec.n = note;
    data[r.studentId] = rec;
  });
  if (!Object.keys(data).length) throw userErr_('ยังไม่ได้เช็คชื่อนักเรียน');
  const now = nowStr_();
  const by = ctx.isAdmin ? 'admin' : 'link:' + c.link.token.slice(0, 6);
  const row = read_('Attendance').filter(function (a) { return a.session_id === sess.id && a.classroom_id === c.room.id; })[0];
  if (row) {
    row.data_json = JSON.stringify(data);
    row.updated_at = now;
    row.updated_by = by;
    update_('Attendance', row);
  } else {
    insert_('Attendance', [{ session_id: sess.id, classroom_id: c.room.id, data_json: JSON.stringify(data), updated_at: now, updated_by: by }]);
  }
  return { saved: Object.keys(data).length, updated_at: now };
}

/* ============================== Report ============================== */

function activityReport_(p) {
  const act = activityGet_({ id: p.id });
  const rooms = targetRooms_(act);
  const sessIds = act.sessions.map(function (s) { return s.id; });
  const att = {};
  read_('Attendance').forEach(function (a) {
    if (sessIds.indexOf(a.session_id) >= 0) att[a.session_id + '|' + a.classroom_id] = parseJson_(a.data_json, {});
  });
  const byRoom = {};
  read_('Students').forEach(function (s) { (byRoom[s.classroom_id] = byRoom[s.classroom_id] || []).push(s); });
  return {
    activity: act,
    statusDefs: STATUS_DEFS,
    rooms: rooms.map(function (c) {
      return {
        id: c.id, name: c.name, advisor: c.advisor,
        checked: act.sessions.map(function (s) { return !!att[s.id + '|' + c.id]; }),
        students: sortStudents_(byRoom[c.id] || []).map(function (s) {
          return {
            id: s.id, number: s.number, student_code: s.student_code,
            name: (s.prefix || '') + s.first_name + ' ' + s.last_name,
            marks: act.sessions.map(function (ss) {
              const d = att[ss.id + '|' + c.id];
              return d && d[s.id] ? d[s.id].s : '';
            }),
          };
        }),
      };
    }),
  };
}
