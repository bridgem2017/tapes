/* Tape Solution 사이트 + 제품 등록 API (Node.js 18 이상, 추가 설치 없음)
 *   ADMIN_PASSWORD='비밀번호' node server.js      → http://localhost:3000
 * 제품 저장 시 products.json 과 assets/products.js 를 함께 갱신하고, 이전 파일은 server/backup/ 에 보관합니다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE = path.resolve(__dirname, '..', 'tape-site');
const PORT = +process.env.PORT || 3000;
const BACKUP = path.join(__dirname, 'backup');
const UPLOAD = path.join(SITE, 'assets', 'images', 'uploads');
let ADMIN = process.env.ADMIN_PASSWORD;
if (!ADMIN) { ADMIN = crypto.randomBytes(6).toString('hex'); console.log(`[주의] ADMIN_PASSWORD 가 없어 임시 비밀번호를 만들었습니다: ${ADMIN}`); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const FIELDS = ['brand', 'code', 'name', 'category', 'adhesive', 'carrier', 'thickness', 'temp', 'industries', 'applications', 'substrates', 'alternatives', 'img', 'source', 'sourceUrl', 'verified'];
const LISTS = ['industries', 'applications', 'substrates', 'alternatives'];

const key = p => `${p.brand}|${p.code}`.toLowerCase();
const read = () => JSON.parse(fs.readFileSync(path.join(SITE, 'products.json'), 'utf8'));
function write(list) {
  fs.mkdirSync(BACKUP, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(path.join(SITE, 'products.json'), path.join(BACKUP, `products-${stamp}.json`));
  const olds = fs.readdirSync(BACKUP).filter(f => f.startsWith('products-')).sort();
  olds.slice(0, Math.max(0, olds.length - 50)).forEach(f => fs.unlinkSync(path.join(BACKUP, f)));
  const json = JSON.stringify(list, null, 2);
  const tmp = (f, s) => { fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f); };
  tmp(path.join(SITE, 'products.json'), json);
  tmp(path.join(SITE, 'assets', 'products.js'), `const products = ${json};\n`);
}
function clean(p) {
  const o = {};
  for (const f of FIELDS) {
    const v = p[f];
    o[f] = LISTS.includes(f) ? (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 40) : []) : String(v ?? '').trim().slice(0, f === 'img' ? 2_000_000 : 600);
  }
  if (!o.brand || !o.code || !o.name || !o.category) throw Object.assign(new Error('브랜드·품번·제품명·제품군은 필수입니다.'), { status: 400 });
  if (o.sourceUrl && !/^https?:\/\//.test(o.sourceUrl)) o.sourceUrl = '';
  return o;
}
function insert(list, rec) { const i = list.findIndex(x => x.brand === rec.brand); list.splice(i < 0 ? list.length : i, 0, rec); }

function body(req, limit = 12_000_000) {
  return new Promise((res, rej) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { rej(Object.assign(new Error('요청이 너무 큽니다.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { res(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { rej(Object.assign(new Error('잘못된 요청'), { status: 400 })); } });
  });
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const authed = req => { const a = Buffer.from(String(req.headers['x-admin-password'] || '')), b = Buffer.from(ADMIN); return a.length === b.length && crypto.timingSafeEqual(a, b); };


/* ---------- 문의 메일 (SMTP) ----------
 * SMTP_HOST, SMTP_PORT(465=SSL, 587=STARTTLS), SMTP_USER, SMTP_PASS, MAIL_TO(기본 tapes@tapes.co.kr), MAIL_FROM(기본 SMTP_USER)
 * 설정이 없으면 503 을 돌려주고, 홈페이지는 Web3Forms 로 대신 보냅니다. */
const net = require('net');
const tls = require('tls');
const MAIL_TO = process.env.MAIL_TO || 'tapes@tapes.co.kr';
const SMTP = { host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 465, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
const hits = new Map();
function smtpSend({ subject, text, replyTo }) {
  return new Promise((resolve, reject) => {
    const from = process.env.MAIL_FROM || SMTP.user;
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
    const hdr = s => `=?UTF-8?B?${b64(s)}?=`;
    const msg = [
      `From: ${hdr('Tape Solution 홈페이지')} <${from}>`, `To: <${MAIL_TO}>`, replyTo ? `Reply-To: <${replyTo}>` : null,
      `Subject: ${hdr(subject)}`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      b64(text).replace(/.{76}/g, '$&\r\n')].filter(x => x !== null).join('\r\n');
    const steps = [
      ['EHLO tape-solution', 250], ...(SMTP.port === 587 ? [['STARTTLS', 220, 'tls'], ['EHLO tape-solution', 250]] : []),
      ['AUTH LOGIN', 334], [b64(SMTP.user), 334], [b64(SMTP.pass), 235],
      [`MAIL FROM:<${from}>`, 250], [`RCPT TO:<${MAIL_TO}>`, 250], ['DATA', 354], [msg + '\r\n.', 250], ['QUIT', 221]];
    let sock = SMTP.port === 465 ? tls.connect(SMTP.port, SMTP.host, { servername: SMTP.host }) : net.connect(SMTP.port, SMTP.host);
    let buf = '', i = -1, done = false;
    const fail = e => { if (!done) { done = true; sock.destroy(); reject(e); } };
    const timer = setTimeout(() => fail(new Error('SMTP timeout')), 20000);
    const next = () => { i++; if (i >= steps.length) { done = true; clearTimeout(timer); sock.end(); return resolve(); } sock.write(steps[i][0] + '\r\n'); };
    const onData = d => {
      buf += d.toString(); if (!/(^|\r\n)\d{3} [^\r\n]*\r\n$/.test(buf)) return;
      const code = +buf.match(/(\d{3}) [^\r\n]*\r\n$/)[1]; buf = '';
      const want = i < 0 ? 220 : steps[i][1];
      if (code !== want) return fail(new Error(`SMTP ${code}`));
      if (i >= 0 && steps[i][2] === 'tls') {
        sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, servername: SMTP.host }, () => next());
        sock.on('data', onData); sock.on('error', fail); return;
      }
      if (i === steps.length - 1) { done = true; clearTimeout(timer); sock.end(); return resolve(); }
      next();
    };
    sock.on('data', onData); sock.on('error', fail);
  });
}
async function mailRoute(req, res) {
  if (!SMTP.host || !SMTP.user || !SMTP.pass) return send(res, 503, { error: 'mail not configured' });
  const ip = req.socket.remoteAddress, now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 600000);
  if (arr.length >= 5) return send(res, 429, { error: '잠시 후 다시 시도해주세요.' }); arr.push(now); hits.set(ip, arr);
  const { subject, fields } = await body(req, 100_000);
  if (!fields || typeof fields !== 'object') return send(res, 400, { error: '잘못된 요청' });
  const lines = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `■ ${String(k).slice(0, 40)}\n${String(v).slice(0, 4000)}\n`);
  const email = String(fields['이메일'] || '').trim();
  try { await smtpSend({ subject: String(subject || '[홈페이지 문의]').slice(0, 150), text: lines.join('\n') + `\n— 접수 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`, replyTo: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null }); }
  catch (e) { console.error('[mail]', e.message); return send(res, 502, { error: '메일 서버 오류' }); }
  send(res, 200, { ok: true });
}

async function apiRoute(req, res, url) {
  const p = url.pathname.replace(/^\/api\//, '');
  if (p === 'health') return send(res, 200, { ok: true });
  if (p === 'mail' && req.method === 'POST') return mailRoute(req, res);
  if (!authed(req)) return send(res, 401, { error: '비밀번호가 올바르지 않습니다.' });
  if (p === 'login') return send(res, 200, { ok: true });
  if (p === 'products' && req.method === 'GET') return send(res, 200, { products: read() });
  if (p === 'products' && req.method === 'POST') {
    const { product } = await body(req); const rec = clean(product); const list = read();
    if (list.some(x => key(x) === key(rec))) return send(res, 409, { error: `${rec.brand} ${rec.code} 는 이미 등록되어 있습니다.` });
    insert(list, rec); write(list); return send(res, 200, { products: list });
  }
  if (p === 'products' && req.method === 'PUT') {
    const { key: k, product } = await body(req); const rec = clean(product); const list = read();
    const i = list.findIndex(x => key(x) === String(k || '').toLowerCase());
    if (i < 0) return send(res, 404, { error: '수정할 제품을 찾을 수 없습니다.' });
    if (list.some((x, j) => j !== i && key(x) === key(rec))) return send(res, 409, { error: `${rec.brand} ${rec.code} 는 이미 등록되어 있습니다.` });
    list[i] = rec; write(list); return send(res, 200, { products: list });
  }
  if (p === 'products' && req.method === 'DELETE') {
    const k = String(url.searchParams.get('key') || '').toLowerCase(); const list = read();
    const i = list.findIndex(x => key(x) === k); if (i < 0) return send(res, 404, { error: '삭제할 제품을 찾을 수 없습니다.' });
    list.splice(i, 1); write(list); return send(res, 200, { products: list });
  }
  if (p === 'products/bulk' && req.method === 'POST') {
    const { products } = await body(req); if (!Array.isArray(products) || products.length > 2000) return send(res, 400, { error: '잘못된 요청' });
    const list = read();
    for (const raw of products) { const rec = clean(raw); const i = list.findIndex(x => key(x) === key(rec)); if (i > -1) list[i] = rec; else insert(list, rec); }
    write(list); return send(res, 200, { products: list });
  }
  if (p === 'upload' && req.method === 'POST') {
    const { name, dataUrl } = await body(req);
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) return send(res, 400, { error: 'JPG·PNG·WEBP 이미지만 올릴 수 있습니다.' });
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 5_000_000) return send(res, 413, { error: '이미지는 5MB 이하만 가능합니다.' });
    fs.mkdirSync(UPLOAD, { recursive: true });
    const slug = String(name || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'product';
    const file = `${slug}-${Date.now().toString(36)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(UPLOAD, file), buf);
    return send(res, 200, { path: `assets/images/uploads/${file}` });
  }
  send(res, 404, { error: '없는 요청입니다.' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await apiRoute(req, res, url);
    let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(SITE, '.' + rel);
    if (!file.startsWith(SITE + path.sep)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
      const ext = path.extname(file).toLowerCase();
      const fresh = /products\.(js|json)$|\.html$|admin\.(js|css)$/.test(file);
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': fresh ? 'no-cache' : 'public, max-age=3600' });
      fs.createReadStream(file).pipe(res);
    });
  } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : '서버 오류' }); if (!e.status) console.error(e); }
}).listen(PORT, () => console.log(`Tape Solution → http://localhost:${PORT}  (제품 관리: /product-admin.html)`));
