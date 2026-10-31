// اختبار متصفح للصفحات التفاعلية (live.js) مع خادم يحاكي واجهات Supabase،
// واختبار بناء الموقع من بيانات Supabase (المنشور + القائمة + الصور).
// قواعد الأمان نفسها مختبرة على PostgreSQL في tests/supabase.test.ts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chromium, type Browser, type Page } from 'playwright';
import { buildStatic } from '../../scripts/build-static.ts';

const UID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ADMIN = '99999999-8888-7777-6666-555555555555';
interface Req { method: string; path: string; query: URLSearchParams; headers: http.IncomingHttpHeaders; body: Buffer }
const log: Req[] = [];
let mockUrl = '', siteUrl = '', dist = '', browser: Browser;
const servers: http.Server[] = [];
const cspErrors: string[] = [];
let png: Buffer;

const session = (id: string, email: string) => ({ access_token: 'tok-' + id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + id,
  user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
const menu: { id: number; business_id: number; section: string; name: string; price: number | null; note: string; image: string | null; available: boolean; sort: number }[] = [
  { id: 1, business_id: 1000001, section: 'مشويات', name: 'تكة لحم', price: 6000, note: 'نفر', image: 'u/' + UID + '/' + 'b'.repeat(32) + '.webp', available: true, sort: 0 },
  { id: 2, business_id: 1000001, section: 'مشروبات', name: 'لبن', price: 750, note: '', image: null, available: false, sort: 1 },
];
const published = [
  { id: 1000001, type: 'business', title: 'مطعم المحاكاة', body: 'مشويات', category: 'مطاعم', area: 'المعامل', price: null, contact_phone: '07705555555', show_phone: true, whatsapp: true,
    details: { address: 'الشارع العام', evil: { x: 1 } }, images: ['u/' + UID + '/' + 'a'.repeat(32) + '.webp'], business_id: null, open_state: 'open', verified: true, is_official: false,
    published_at: new Date().toISOString(), expires_at: null, updated_at: new Date().toISOString() },
  { id: 1000002, type: 'job', title: 'وظيفة بتصنيف خاطئ', body: '', category: 'غير موجود', area: 'المعامل', price: null, contact_phone: null, show_phone: false, whatsapp: false,
    details: {}, images: [], business_id: null, open_state: 'unknown', verified: false, is_official: false, published_at: new Date().toISOString(), expires_at: null, updated_at: new Date().toISOString() },
];

function mock(req: http.IncomingMessage, res: http.ServerResponse, body: Buffer) {
  const u = new URL(req.url!, 'http://x');
  const send = (code: number, data: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const one = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
  const json = () => { try { return JSON.parse(body.toString() || '{}'); } catch { return {}; } };
  const auth = String(req.headers.authorization ?? '');
  const p = u.pathname;
  if (p === '/auth/v1/signup') { const b = json(); return send(200, session(UID, b.email)); }
  if (p === '/auth/v1/token') { const b = json(); return send(200, session(b.email === 'admin@x.iq' ? ADMIN : UID, b.email)); }
  if (p === '/auth/v1/user') return send(200, session(auth.includes(ADMIN) ? ADMIN : UID, 'x@x.iq').user);
  if (p.startsWith('/storage/v1/object/public/media/')) { res.writeHead(200, { 'Content-Type': 'image/webp' }); return res.end(png); }
  if (p.startsWith('/storage/v1/object/')) return send(200, { Key: p.replace('/storage/v1/object/', '') });
  if (p === '/rest/v1/public_posts') return send(200, published);
  if (p === '/rest/v1/rpc/site_stamp') return send(200, 'stamp-1');
  if (p.startsWith('/rest/v1/rpc/')) return send(200, null);
  if (p === '/rest/v1/profiles') { const admin = u.searchParams.get('id') === 'eq.' + ADMIN; const prof = { name: admin ? 'المدير' : 'أبو علي', phone: '07701111111', role: admin ? 'admin' : 'owner' }; return send(200, one ? prof : [prof]); }
  if (p === '/rest/v1/menu_items' && req.method === 'GET') { const rows = menu.filter((m) => (u.searchParams.get('business_id') ?? '').includes('1000001') ? m.business_id === 1000001 : true); return send(200, rows); }
  if (p === '/rest/v1/posts' && req.method === 'POST') { const row = { id: 1000005 }; return one ? send(201, row) : String(req.headers.prefer ?? '').includes('representation') ? send(201, [row]) : send(201, null); }
  if (p === '/rest/v1/posts' && req.method === 'GET') {
    if (u.searchParams.get('status') === 'eq.pending') return send(200, [{ id: 1000009, type: 'market', title: 'سلعة بانتظار المراجعة', body: 'تفاصيل', category: 'هواتف', area: 'المعامل', price: 1000, contact_phone: '07701234567', show_phone: true, guest_name: 'زائر', details: {}, images: [], created_at: new Date().toISOString(), owner_id: null }]);
    if (u.searchParams.get('id')) { const r = { id: 1000001, title: 'مطعم المحاكاة', status: 'published', owner_id: UID, author_id: UID }; return send(200, one ? r : [r]); }
    return send(200, [{ id: 1000005, type: 'business', title: 'مطعم أبو علي', category: 'مطاعم', area: 'المعامل', status: 'pending', owner_id: null, author_id: UID, open_state: 'unknown', updated_at: new Date().toISOString() }]);
  }
  if (p === '/rest/v1/claims' && req.method === 'GET') return send(200, [{ business_id: 1000005, status: 'pending', note: null }]);
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') return send(201, one ? {} : []);
  return send(200, []);
}

async function listen(handler: http.RequestListener): Promise<string> {
  const s = http.createServer(handler);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}

before(async () => {
  png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#c63' } }).webp().toBuffer();
  mockUrl = await listen((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,PUT,OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const u = new URL(req.url!, 'http://x');
      log.push({ method: req.method!, path: u.pathname, query: u.searchParams, headers: req.headers, body: Buffer.concat(chunks) });
      mock(req, res, Buffer.concat(chunks));
    });
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'almamel-live-'));
  dist = path.join(root, 'almamel');
  const content = path.join(root, 'content');
  fs.mkdirSync(path.join(content, 'listings'), { recursive: true });
  // خادم ملفات ثابتة يقدّم الموقع تحت /almamel مثل GitHub Pages
  siteUrl = await listen((req, res) => {
    const u = new URL(req.url!, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const type = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(f).pipe(res);
  });
  await buildStatic({ siteUrl: siteUrl + '/almamel', contentDir: content, outDir: dist, repo: 'u/almamel', quiet: true, supabase: { url: mockUrl, key: 'test-anon-key' } });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  for (const s of servers) s.close();
  assert.deepEqual(cspErrors, [], 'no Content-Security-Policy violations or page errors');
});

async function open(urlPath: string, w = 390): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ar-IQ' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused/i.test(m.text())) cspErrors.push(m.text()); });
  page.on('pageerror', (e) => cspErrors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'سبب الاختبار' : undefined));
  await page.goto(siteUrl + '/almamel' + urlPath);
  return page;
}
const posts = () => log.filter((r) => r.path === '/rest/v1/posts' && r.method === 'POST');

test('build pulls published Supabase content: restaurant page with menu, images and order links', () => {
  const page = fs.readFileSync(path.join(dist, 'businesses/1000001/index.html'), 'utf8');
  assert.ok(page.includes('مطعم المحاكاة') && page.includes('تكة لحم') && page.includes('غير متوفر حالياً'));
  // الطلب عبر سلة: أزرار «+» لكل صنف، ورسالة واحدة لواتساب المحل
  assert.ok(page.includes('data-cart data-wa="https://wa.me/9647705555555"'));
  assert.ok(/<button class="add-btn"[^>]*data-add data-name="تكة لحم"/.test(page), 'add-to-cart button per available item');
  assert.ok(page.includes('بيانات النشاط موثقة'));
  assert.ok(!page.includes('evil'), 'unknown detail keys dropped');
  assert.ok(/src="\/almamel\/media\/[0-9a-f]+\.webp"/.test(page), 'images re-hosted locally');
  assert.ok(!fs.existsSync(path.join(dist, 'jobs/1000002')), 'row with unknown category skipped');
  assert.equal(fs.readFileSync(path.join(dist, 'build-stamp.txt'), 'utf8'), 'stamp-1');
  assert.ok(fs.existsSync(path.join(dist, 'static/vendor/supabase.js')));
  const submit = fs.readFileSync(path.join(dist, 'submit/index.html'), 'utf8');
  assert.ok(submit.includes(`connect-src 'self' ${mockUrl}`), 'CSP allows the Supabase origin');
  assert.ok(!/method="post"/i.test(submit));
});

test('visitor posts an ad with a photo directly from the site', async () => {
  const p = await open('/submit/job/');
  await p.waitForFunction(() => (document.querySelector('select[name=category]') as HTMLSelectElement).options.length > 1);
  await p.selectOption('select[name=category]', { index: 1 });
  await p.fill('#f-title', 'مطلوب كاشير');
  await p.fill('#f-d_job_workplace', 'ماركت الحي');
  await p.fill('#f-d_job_positions', '٢');
  await p.fill('#f-price', '٤٥٠٠٠٠');
  await p.fill('#f-body', 'دوام صباحي');
  await p.fill('#f-guest_name', 'زائر كريم');
  await p.fill('#f-contact_phone', '07701234567');
  const img = path.join(os.tmpdir(), 'live-photo.jpg');
  fs.writeFileSync(img, await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#39c' } }).jpeg().toBuffer());
  await p.setInputFiles('#f-images', img);
  await p.click('[data-live-submit] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-ok:has-text("وصل إعلانك")');
  const up = log.find((r) => r.path.startsWith('/storage/v1/object/media/guest/'));
  assert.ok(up, 'uploaded to guest folder');
  assert.match(up!.path, /^\/storage\/v1\/object\/media\/guest\/[0-9a-f]{32}\.webp$/);
  const at = up!.body.indexOf('RIFF'); // المكتبة ترسل الصورة داخل نموذج multipart
  const file = up!.body.subarray(at);
  assert.equal(file.toString('latin1', 8, 12), 'WEBP', 'image re-encoded to WebP in the browser');
  const meta = await sharp(file).metadata();
  assert.ok(Math.max(meta.width!, meta.height!) <= 1600, 'image resized');
  const row = JSON.parse(posts().at(-1)!.body.toString());
  assert.equal(row.type, 'job'); assert.equal(row.guest_name, 'زائر كريم'); assert.equal(row.price, 450000);
  assert.equal(row.details.workplace, 'ماركت الحي'); assert.equal(row.details.positions, 2); assert.equal(row.contact_phone, '07701234567');
  assert.ok(!('blood_type' in row.details) && !('location' in row.details), 'other sections\' fields are not sent');
  assert.ok(!('status' in row) && !('author_id' in row), 'client never sends status or author');
  await p.context().close();
});

test('help requests have their own fields: blood type, units, hospital, consent', async () => {
  const p = await open('/submit/help/');
  await p.waitForFunction(() => (document.querySelector('select[name=category]') as HTMLSelectElement).options.length > 1);
  assert.equal((await p.textContent('label[for="f-title"]'))!.trim().startsWith('عنوان الطلب'), true, 'title label follows the section');
  assert.ok(!(await p.isVisible('#f-price')), 'no price for help requests');
  await p.selectOption('select[name=category]', { index: 1 });
  await p.fill('#f-title', 'مطلوب متبرع دم');
  await p.selectOption('#f-d_help_blood_type', 'O+');
  await p.fill('#f-d_help_units', '3');
  await p.fill('#f-d_help_location', 'مستشفى المعامل');
  await p.fill('#f-body', 'حالة طارئة');
  await p.fill('#f-guest_name', 'زائر');
  await p.fill('#f-contact_phone', '07701234568');
  await p.click('[data-live-submit] button[type=submit]');
  await p.waitForSelector('.live-msg:has-text("أكّد موافقة صاحب الحالة")');
  await p.check('#f-d_help_consent');
  await p.click('[data-live-submit] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-ok:has-text("وصل إعلانك")');
  const row = JSON.parse(posts().at(-1)!.body.toString());
  assert.equal(row.type, 'help');
  assert.deepEqual([row.details.blood_type, row.details.units, row.details.location, row.details.consent], ['O+', 3, 'مستشفى المعامل', true]);
  await p.context().close();
});

test('owner registers, adds the shop with proof, and lands on the dashboard', async () => {
  const p = await open('/owner/register/');
  await p.fill('#f-name', 'أبو علي'); await p.fill('#f-phone', '07701111111'); await p.fill('#f-email', 'owner@x.iq'); await p.fill('#f-password', 'owner-pass-1234');
  await p.check('#f-agree');
  await p.click('[data-step=account] button[type=submit]');
  await p.waitForSelector('[data-step=business]:not([hidden])');
  const signup = JSON.parse(log.find((r) => r.path === '/auth/v1/signup')!.body.toString());
  assert.deepEqual(signup.data, { name: 'أبو علي', phone: '07701111111' });
  await p.fill('#f-title', 'مطعم أبو علي'); await p.selectOption('#f-category', { label: 'مطاعم' }); await p.fill('#f-address', 'الشارع العام');
  await p.fill('#f-contact_phone', '07705555555'); await p.fill('#f-message', 'اتصلوا على رقم المحل العصر');
  const img = path.join(os.tmpdir(), 'live-front.png');
  fs.writeFileSync(img, await sharp({ create: { width: 800, height: 600, channels: 3, background: '#963' } }).png().toBuffer());
  await p.setInputFiles('#f-proof', img);
  await p.click('[data-step=business] button[type=submit]');
  await p.waitForURL(/\/owner\/dashboard\/\?sent=1/);
  const biz = JSON.parse(posts().at(-1)!.body.toString());
  assert.equal(biz.type, 'business'); assert.equal(biz.details.address, 'الشارع العام');
  const proof = log.find((r) => r.path.startsWith('/storage/v1/object/proofs/'));
  assert.match(proof!.path, new RegExp(`^/storage/v1/object/proofs/${UID}/[0-9a-f]{32}\\.webp$`), 'proof in private bucket, own folder');
  const claim = JSON.parse(log.filter((r) => r.path === '/rest/v1/claims' && r.method === 'POST').at(-1)!.body.toString());
  assert.equal(claim.business_id, 1000005); assert.match(claim.proof_path, new RegExp(`^${UID}/`));
  await p.waitForSelector('[data-businesses] .owner-card');
  assert.ok((await p.textContent('[data-businesses]'))!.includes('قيد التحقق من الملكية'));
  await p.context().close();
});

test('owner manages the menu: add an item with a photo', async () => {
  const p = await open('/login/');
  await p.fill('#f-email', 'owner@x.iq'); await p.fill('#f-password', 'owner-pass-1234');
  await p.click('[data-login] button[type=submit]');
  await p.waitForURL(/\/owner\/dashboard\//);
  await p.goto(siteUrl + '/almamel/owner/menu/?b=1000001');
  await p.waitForSelector('[data-items] .menu-item');
  assert.ok((await p.textContent('[data-items]'))!.includes('تكة لحم'));
  await p.fill('#f-section', 'سندويشات'); await p.fill('#f-name', 'لفة كباب'); await p.fill('#f-price', '2000');
  const img = path.join(os.tmpdir(), 'live-item.jpg');
  fs.writeFileSync(img, await sharp({ create: { width: 600, height: 600, channels: 3, background: '#a52' } }).jpeg().toBuffer());
  await p.setInputFiles('#f-image', img);
  await p.click('[data-add-item] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-ok:has-text("لفة كباب")');
  const ins = JSON.parse(log.filter((r) => r.path === '/rest/v1/menu_items' && r.method === 'POST').at(-1)!.body.toString());
  assert.equal(ins.business_id, 1000001); assert.equal(ins.section, 'سندويشات'); assert.equal(ins.price, 2000);
  assert.match(ins.image, new RegExp(`^u/${UID}/[0-9a-f]{32}\\.webp$`));
  await p.context().close();
});

test('admin reviews and approves a pending ad', async () => {
  const p = await open('/login/', 1280);
  await p.fill('#f-email', 'admin@x.iq'); await p.fill('#f-password', 'admin-pass-1234');
  await p.click('[data-login] button[type=submit]');
  await p.waitForURL(/\/admin\//);
  await p.waitForSelector('[data-pending] .panel');
  assert.ok((await p.textContent('[data-pending]'))!.includes('سلعة بانتظار المراجعة'));
  await p.click('[data-pending] button:has-text("موافقة ونشر")');
  await p.waitForSelector('.live-msg.flash-ok');
  const rpc = log.filter((r) => r.path === '/rest/v1/rpc/moderate_post').at(-1)!;
  assert.deepEqual(JSON.parse(rpc.body.toString()), { p_id: 1000009, p_action: 'approve', p_reason: null });
  await p.context().close();
});
