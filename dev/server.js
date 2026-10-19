/**
 * เซิร์ฟเวอร์ทดสอบในเครื่อง: รัน apps-script/Code.js จริงบน Node โดยจำลอง Google services
 * (SpreadsheetApp, CacheService, PropertiesService ฯลฯ) แล้วเสิร์ฟหน้าเว็บจาก docs/
 *   node dev/server.js  →  http://localhost:8787
 * ข้อมูลจำลองเก็บใน dev/db.json · รหัสผ่านแอดมินทดสอบ: devpass1
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const DB_FILE = path.join(__dirname, 'db.json');
const PORT = Number(process.env.PORT) || 8787;

/* ---------- fake Google services ---------- */
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { sheets: {}, props: {} };
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
  _rows() { return this.sheet.rows(); }
  getDisplayValues() {
    const rows = this._rows(); const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = rows[this.r - 1 + i] || []; const o = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v == null ? '' : String(v)); }
      out.push(o);
    }
    return out;
  }
  getValues() { return this.getDisplayValues(); }
  setValues(v) {
    if (v.length !== this.nr || v.some((r) => r.length !== this.nc)) throw new Error(`setValues size mismatch: got ${v.length}x${v[0] && v[0].length}, range ${this.nr}x${this.nc}`);
    const rows = this._rows();
    for (let i = 0; i < this.nr; i++) {
      const ri = this.r - 1 + i;
      while (rows.length <= ri) rows.push([]);
      for (let j = 0; j < this.nc; j++) rows[ri][this.c - 1 + j] = v[i][j] == null ? '' : String(v[i][j]);
    }
    return this;
  }
  clearContent() { const blank = []; for (let i = 0; i < this.nr; i++) blank.push(new Array(this.nc).fill('')); return this.setValues(blank); }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; if (!db.sheets[name]) db.sheets[name] = []; }
  rows() { return db.sheets[this.name]; }
  getName() { return this.name; }
  getLastRow() { const r = this.rows(); for (let i = r.length - 1; i >= 0; i--) if (r[i] && r[i].some((v) => v !== '' && v != null)) return i + 1; return 0; }
  getMaxRows() { return Math.max(1000, this.rows().length); }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr, nc); }
  setFrozenRows() {}
}

const fakeSS = {
  getId: () => 'fake-spreadsheet-id',
  getUrl: () => 'https://docs.google.com/spreadsheets/d/fake-spreadsheet-id/edit',
  getSheetByName: (n) => (db.sheets[n] ? new FakeSheet(n) : null),
  insertSheet: (n) => new FakeSheet(n),
  getSheets: () => Object.keys(db.sheets).map((n) => new FakeSheet(n)),
  deleteSheet: (s) => { delete db.sheets[s.name]; },
};

const cache = new Map();
const TZ_FMT = (date, tz) => {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(date).forEach((x) => { p[x.type] = x.value; });
  if (p.hour === '24') p.hour = '00';
  return p;
};

const context = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => fakeSS, openById: () => fakeSS },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in db.props ? db.props[k] : null), setProperty: (k, v) => { db.props[k] = String(v); } }) },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => { const e = cache.get(k); if (!e || e.exp < Date.now()) return null; return e.v; },
      put: (k, v, ttl) => cache.set(k, { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }),
      remove: (k) => cache.delete(k),
    }),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }) },
  Logger: { log: (m) => console.log('[Logger]', m) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(String(s), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    formatDate: (date, tz, fmt) => {
      const p = TZ_FMT(date, tz);
      return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
    },
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.js'), 'utf8'), context, { filename: 'Code.js' });

if (!db.props.ADMIN_HASH) {
  vm.runInContext('setup(); setAdminPassword_("devpass1");', context);
  save();
  console.log('สร้างฐานข้อมูลทดสอบแล้ว · รหัสผ่านแอดมิน: devpass1');
}

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api') {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      // ล้างแคชตารางทุกคำขอ เหมือนการรันใหม่ทุกครั้งบน Apps Script
      vm.runInContext('SS_CACHE = null; Object.keys(TABLE_CACHE).forEach(function (k) { delete TABLE_CACHE[k]; });', context);
      const fn = req.method === 'POST' ? 'doPost' : 'doGet';
      context.__e = { postData: { contents: body }, parameter: Object.fromEntries(url.searchParams) };
      let out;
      try { out = vm.runInContext(fn + '(__e)', context).body; } catch (e) { out = JSON.stringify({ ok: false, error: 'DEV: ' + e.stack }); }
      save();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(out);
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(DOCS, p);
  if (!file.startsWith(DOCS) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  if (p === '/assets/config.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'] });
    return res.end(`window.APP_CONFIG = { API_URL: 'http://localhost:${PORT}/api' };`);
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`ทดสอบได้ที่ http://localhost:${PORT}`));
