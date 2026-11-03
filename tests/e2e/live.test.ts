// اختبار متصفح للصفحات التفاعلية (live.js) مع خادم يحاكي واجهات Supabase،
// واختبار بناء الموقع من بيانات Supabase (المنشور + القائمة + الصور).
// قواعد الأمان نفسها مختبرة على PostgreSQL في tests/supabase.test.ts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
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

// رمز بشكل JWT (المكتبة تقرأ منه مستوى التحقق aal)؛ التوقيع يحمل المعرّف حتى يعرف الخادم الوهمي صاحبه
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (id: string, aal: string) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: id, aal, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.tok-' + id;
const session = (id: string, email: string, aal = 'aal2') => ({ access_token: jwt(id, aal), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + id,
  user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });
const menu: { id: number; business_id: number; section: string; name: string; price: number | null; note: string; image: string | null; available: boolean; sort: number }[] = [
  { id: 1, business_id: 1000001, section: 'مشويات', name: 'تكة لحم', price: 6000, note: 'نفر', image: 'u/' + UID + '/' + 'b'.repeat(32) + '.webp', available: true, sort: 0 },
  { id: 2, business_id: 1000001, section: 'مشروبات', name: 'لبن', price: 750, note: '', image: null, available: false, sort: 1 },
];
const published = [
  { id: 1000001, type: 'business', title: 'مطعم المحاكاة', body: 'مشويات', category: 'مطاعم', area: 'المعامل', price: null, contact_phone: '07705555555', show_phone: true, whatsapp: true,
    details: { address: 'الشارع العام', evil: { x: 1 }, open_from: '00:00', open_to: '23:59' }, images: ['u/' + UID + '/' + 'a'.repeat(32) + '.webp'], business_id: null, open_state: 'open', verified: true, is_official: false,
    published_at: new Date().toISOString(), expires_at: null, updated_at: new Date().toISOString() },
  { id: 1000002, type: 'job', title: 'وظيفة بتصنيف خاطئ', body: '', category: 'غير موجود', area: 'المعامل', price: null, contact_phone: null, show_phone: false, whatsapp: false,
    details: {}, images: [], business_id: null, open_state: 'unknown', verified: false, is_official: false, published_at: new Date().toISOString(), expires_at: null, updated_at: new Date().toISOString() },
];

const riders = [
  { id: 1, name: 'حسين الدراج', phone: '07712345678', whatsapp: true, vehicle: 'دراجة نارية', areas: 'المعامل والحسينية', hours: 'من ٩ للـ ١٢ بالليل', note: null, min_fare: 3500, decided_at: new Date().toISOString(),
    address: 'محلة ٧٠٣ زقاق ٥ دار ١٢', id_front: 'rider/' + 'd'.repeat(32) + '.webp', id_back: 'rider/' + 'e'.repeat(32) + '.webp', status: 'approved', created_at: new Date().toISOString() },
  { id: 2, name: 'عباس الستوتة', phone: '07798765432', whatsapp: false, vehicle: 'ستوتة', areas: 'الزوراء', hours: null, note: 'أغراض ثقيلة', min_fare: null, decided_at: null,
    address: 'قرب السيطرة', id_front: 'rider/' + 'f'.repeat(32) + '.webp', id_back: 'rider/' + '1'.repeat(32) + '.webp', status: 'pending', created_at: new Date().toISOString() },
];
const TOKEN = '11111111-2222-3333-4444-555555555555';
const shot = async (pg: Page, name: string) => { if (process.env.SHOTS) await pg.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };
const order = { id: 77, business_id: 1000001, status: 'new', reason: null, eta: null, created_at: new Date().toISOString(), decided_at: null, total: 12000,
  lines: [{ name: 'تكة لحم', price: 6000, q: 2 }] };

function mock(req: http.IncomingMessage, res: http.ServerResponse, body: Buffer) {
  const u = new URL(req.url!, 'http://x');
  const send = (code: number, data: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const one = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
  const json = () => { try { return JSON.parse(body.toString() || '{}'); } catch { return {}; } };
  const auth = String(req.headers.authorization ?? '');
  const p = u.pathname;
  if (p === '/auth/v1/signup') { const b = json(); return send(200, session(UID, b.email)); }
  if (p === '/auth/v1/token') { const b = json(); return send(200, b.email === 'mfa@x.iq' ? session(ADMIN, b.email, 'aal1') : session(b.email === 'admin@x.iq' ? ADMIN : UID, b.email)); }
  if (p === '/auth/v1/user') return send(200, { ...session(auth.includes(ADMIN) ? ADMIN : UID, 'x@x.iq').user, factors: [] });
  // الدخول بخطوتين
  if (p === '/auth/v1/factors' && req.method === 'POST') return send(200, { id: 'f1', type: 'totp', friendly_name: json().friendly_name, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } });
  if (p === '/auth/v1/factors/f1/challenge') return send(200, { id: 'c1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
  if (p === '/auth/v1/factors/f1/verify') return json().code === '123456' ? send(200, session(ADMIN, 'mfa@x.iq', 'aal2')) : send(422, { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
  if (p.startsWith('/storage/v1/object/public/media/')) { res.writeHead(200, { 'Content-Type': 'image/webp' }); return res.end(png); }
  if (p.startsWith('/storage/v1/object/sign/proofs')) return send(200, (json().paths as string[]).map((x) => ({ path: x, signedURL: '/object/public/media/' + x + '?token=t', error: null })));
  if (p.startsWith('/storage/v1/object/')) return send(200, { Key: p.replace('/storage/v1/object/', '') });
  if (p === '/rest/v1/public_riders') return send(200, riders.filter((r) => r.status === 'approved').map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !['address', 'id_front', 'id_back', 'status', 'created_at'].includes(k)))));
  if (p === '/rest/v1/delivery_fares') return send(200, [{ kind: 'zone', label: 'داخل نفس المحلة', price: 1000, sort: 1 }, { kind: 'zone', label: 'أبعد من هيج', price: null, sort: 2 }, { kind: 'extra', label: 'بالليل بعد الساعة ١٢', price: 1000, sort: 3 }]);
  if (p === '/rest/v1/riders' && req.method === 'GET') return send(200, auth.includes(ADMIN) ? riders : []);
  if (p === '/rest/v1/public_posts') {
    const eq = (k: string) => u.searchParams.get(k);
    const rows = published.filter((r) => (!eq('type') || (eq('type')!.startsWith('eq.') ? r.type === eq('type')!.slice(3) : r.type !== eq('type')!.slice(4)))
      && (!eq('id') || String(r.id) === eq('id')!.slice(3)));
    return send(200, rows);
  }
  if (p === '/rest/v1/rpc/site_stamp') return send(200, 'stamp-1');
  if (p === '/rest/v1/rpc/place_order') return send(200, TOKEN);
  if (p === '/rest/v1/rpc/order_status') return send(200, [{ ...order, business_phone: '07705555555', title: 'مطعم المحاكاة' }]);
  if (p === '/rest/v1/rpc/kitchen_orders') return send(200, [{ ...order, title: 'مطعم المحاكاة', items: 2, customer_name: 'زبون', customer_phone: '07701234567', landmark: 'قرب الجامع', lat: 33.4, lng: 44.3, note: null }]);
  if (p === '/rest/v1/rpc/create_invite') return send(200, 'abc123def4567890');
  if (p === '/rest/v1/rpc/invite_info' || p === '/rest/v1/rpc/accept_invite') return send(200, json().p_code === 'abc123def4567890' ? [{ business_id: 1000001, title: 'مركز حمد فون' }] : []);
  if (p === '/rest/v1/rpc/admin_debts') return send(200, [{ post_id: 1000020, name: 'مستعجل', phones: ['07701000001', '07701000002'], ips: ['5.6.7.8'], ads: 3, total: 3000, blocked: true, last_at: new Date().toISOString() }]);
  if (p === '/rest/v1/rpc/settle_debt') return send(200, 3000);
  if (p === '/rest/v1/rpc/guest_posts') return send(200, (json().p_tokens as string[]).map((t, i) => ({ id: 1000030 + i, type: 'market', title: 'ثلاجة للبيع', status: 'published', status_reason: null, expires_at: new Date(Date.now() + 2 * 864e5).toISOString(), fee_due: 1000, token: t })));
  if (p === '/rest/v1/rpc/expiring_posts') return send(200, [{ id: 1000002, type: 'job', title: 'وظيفة تنتهي', contact_phone: '07709990000', name: 'أبو حسن', expires_at: new Date(Date.now() + 864e5).toISOString() }]);
  if (p === '/rest/v1/rpc/views_30d') return send(200, [{ post_id: 1000001, n: 57 }, { post_id: 1000005, n: 57 }]);
  if (p === '/rest/v1/rpc/post_stats') return send(200, [{ day: '2026-11-01', n: 40 }, { day: '2026-11-02', n: 17 }]);
  if (p.startsWith('/rest/v1/rpc/')) return send(200, null);
  if (p === '/rest/v1/rating_summary') return send(200, [{ target_id: u.searchParams.get('target_type') === 'eq.rider' ? 1 : 1000001, avg: 4.5, n: 12 }]);
  if (p === '/rest/v1/public_reviews') return send(200, [{ stars: 5, comment: 'أكل طيب وتوصيل سريع', created_at: new Date().toISOString() }]);
  if (p === '/rest/v1/complaints' && req.method === 'GET') return send(200, auth.includes(ADMIN) ? [{ id: 9, target_type: 'rider', target_id: 1, reason: 'bad_service', details: 'تأخر ساعتين', phone: '07701231231', client_ip: '5.6.7.8', status: 'open', created_at: new Date().toISOString() }] : []);
  if (p === '/rest/v1/profiles') { const admin = u.searchParams.get('id') === 'eq.' + ADMIN; const prof = { name: admin ? 'المدير' : 'أبو علي', phone: '07701111111', role: admin ? 'admin' : 'owner' }; return send(200, one ? prof : [prof]); }
  if (p === '/rest/v1/menu_items' && req.method === 'GET' && u.searchParams.get('approved') === 'eq.false') {
    return send(200, [{ id: 31, name: 'قميص قطن', price: 15000, note: 'مقاسات كاملة', section: 'رجالي', image: 'u/' + UID + '/' + 'c'.repeat(32) + '.webp', business_id: 1000001, posts: { title: 'مطعم المحاكاة', status: 'published' } }]);
  }
  if (p === '/rest/v1/menu_items' && req.method === 'GET') { const rows = menu.filter((m) => (u.searchParams.get('business_id') ?? '').includes('1000001') ? m.business_id === 1000001 : true); return send(200, rows); }
  if (p === '/rest/v1/posts' && req.method === 'POST' && body.toString().includes('07701000001')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ code: 'P0001', message: 'عليك 3,000 د.ع رسوم إعلانات سابقة. سدّدها للإدارة على الواتساب وبعدها تكدر تنشر.', details: null, hint: null }));
  }
  if (p === '/rest/v1/posts' && req.method === 'POST') { const row = { id: 1000005 }; return one ? send(201, row) : String(req.headers.prefer ?? '').includes('representation') ? send(201, [row]) : send(201, null); }
  if (p === '/rest/v1/posts' && req.method === 'GET' && u.searchParams.get('or')?.includes('owner_id') && !u.searchParams.get('type')) {
    return send(200, [{ id: 1000001, type: 'business', title: 'مطعم المحاكاة', category: 'مطاعم', area: 'المعامل', status: 'published', owner_id: UID, author_id: UID, open_state: 'open',
      body: 'مشويات', details: { address: 'الشارع العام', hours: 'من ١٠' }, images: ['u/' + UID + '/' + 'a'.repeat(32) + '.webp'], whatsapp: true, logo: null, updated_at: new Date().toISOString() }]);
  }
  if (p === '/rest/v1/posts' && req.method === 'GET' && u.searchParams.get('type') === 'eq.business') return send(200, [{ id: 1000001, title: 'مطعم المحاكاة', status: 'published' }]);
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
  // موقع الإدارة المنفصل
  await buildStatic({ siteUrl: siteUrl + '/almamel-admin', contentDir: content, outDir: path.join(root, 'almamel-admin'), repo: 'u/almamel', quiet: true,
    supabase: { url: mockUrl, key: 'test-anon-key' }, admin: { publicUrl: siteUrl + '/almamel/' } });
  // رابط التسجيل الخاص الذي يُرسل للزبون
  await buildStatic({ siteUrl: siteUrl + '/almamel-tasjeel', contentDir: content, outDir: path.join(root, 'almamel-tasjeel'), repo: 'u/almamel', quiet: true,
    supabase: { url: mockUrl, key: 'test-anon-key' }, register: { publicUrl: siteUrl + '/almamel/' } });
  // موقع المطعم: استلام الطلبات
  await buildStatic({ siteUrl: siteUrl + '/almamel-mat3am', contentDir: content, outDir: path.join(root, 'almamel-mat3am'), repo: 'u/almamel', quiet: true,
    supabase: { url: mockUrl, key: 'test-anon-key' }, kitchen: { publicUrl: siteUrl + '/almamel/' } });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  for (const s of servers) s.close();
  assert.deepEqual(cspErrors, [], 'no Content-Security-Policy violations or page errors');
});

async function open(urlPath: string, w = 390, site = '/almamel'): Promise<Page> {
  const ctx = await browser.newContext(process.env.SHOTS ? { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, locale: 'ar-IQ' } : { viewport: { width: w, height: 900 }, locale: 'ar-IQ' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused/i.test(m.text())) cspErrors.push(m.text()); });
  page.on('pageerror', (e) => cspErrors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'سبب الاختبار' : undefined));
  await page.goto(siteUrl + site + urlPath);
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

test('cart order is logged (amount only) for the monthly 5% commission', async () => {
  const page = await open('/businesses/1000001/');
  await page.context().route('https://wa.me/**', (r) => r.abort());
  await page.locator('.add-btn[data-name="تكة لحم"]').click();
  await page.locator('.add-btn[data-name="تكة لحم"]').click();
  await page.locator('.cart-bar').click();
  await page.locator('.cart-send').click();
  await page.waitForTimeout(500);
  const call = log.filter((r) => r.path === '/rest/v1/rpc/log_order').at(-1);
  assert.ok(call, 'log_order called');
  const body = JSON.parse(call.body.toString());
  assert.equal(body.p_business, 1000001);
  assert.equal(body.p_items, 2);
  assert.ok(body.p_total > 0);
  assert.deepEqual(Object.keys(body).sort(), ['p_business', 'p_items', 'p_total'], 'no customer data sent');
  await page.context().close();
});

test('customer orders in-site with phone, landmark and GPS location, then tracks the order', async () => {
  const ctx = await browser.newContext({ ...(process.env.SHOTS ? { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 } : { viewport: { width: 390, height: 900 } }), locale: 'ar-IQ', geolocation: { latitude: 33.41, longitude: 44.32 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => cspErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused/i.test(m.text())) cspErrors.push(m.text()); });
  await page.goto(siteUrl + '/almamel/businesses/1000001/');
  await page.locator('.add-btn[data-name="تكة لحم"]').click();
  await page.locator('.add-btn[data-name="تكة لحم"]').click();
  await page.locator('.cart-bar').click();
  await page.locator('.cart-order').click();
  await page.waitForSelector('.cart-err:has-text("رقم هاتفك")');
  await page.fill('[aria-label="رقم هاتفك"]', '٠٧٧٠١٢٣٤٥٦٧');
  await page.locator('.loc-btn').click();
  await page.waitForSelector('.loc-btn.done');
  await page.fill('[aria-label="أقرب نقطة دالة"]', 'قرب جامع الرحمن');
  await shot(page, 'checkout');
  await page.locator('.cart-order').click();
  await page.waitForURL(/\/almamel\/order\/\?t=/);
  const body = JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/place_order').at(-1)!.body.toString());
  assert.equal(body.p_business, 1000001);
  assert.deepEqual(body.p_items, [{ name: 'تكة لحم', q: 2 }]);
  assert.equal(body.p_phone, '07701234567');
  assert.equal(body.p_landmark, 'قرب جامع الرحمن');
  assert.equal(body.p_lat, 33.41); assert.equal(body.p_lng, 44.32);
  assert.ok(!('p_total' in body), 'price is computed by the server, not sent by the browser');
  await page.waitForSelector('[data-order-box] h2:has-text("بانتظار رد المطعم")');
  assert.ok((await page.textContent('[data-order-box]'))!.includes('تكة لحم'));
  await shot(page, 'order-status');
  await ctx.close();
});

test('restaurant site: login, start receiving, see the new order with phone and map, accept it', async () => {
  const p = await open('/login/', 390, '/almamel-mat3am');
  await p.fill('#f-email', 'owner@x.iq'); await p.fill('#f-password', 'owner-pass-1234');
  await p.click('[data-login] button[type=submit]');
  await p.waitForURL(/\/almamel-mat3am\/owner\/dashboard\//);
  await p.click('.site-header a:has-text("طلبات المطعم")');
  await p.waitForURL(/\/almamel-mat3am\/kitchen\//);
  await p.waitForSelector('[data-list="new"] .order-new');
  const card = (await p.textContent('[data-list="new"]'))!;
  assert.ok(card.includes('تكة لحم') && card.includes('قرب الجامع') && card.includes('07701234567'));
  assert.ok(await p.locator('[data-list="new"] a[href^="https://maps.google.com/?q=33.4,44.3"]').count());
  await p.click('[data-start]');
  await p.waitForSelector('[data-live]:not([hidden])');
  await shot(p, 'kitchen');
  await p.selectOption('[aria-label="وقت التجهيز"]', '45');
  await p.click('[data-list="new"] button:has-text("قبول")');
  await p.waitForSelector('.live-msg.flash-ok:has-text("قبول")');
  const call = JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/decide_order').at(-1)!.body.toString());
  assert.equal(call.p_id, 77); assert.equal(call.p_status, 'accepted'); assert.equal(call.p_eta, 45);
  assert.ok(fs.existsSync(path.join(dist, '..', 'almamel-mat3am', 'sw.js')), 'service worker for notifications');
  await p.context().close();
});

test('no page is wider than the screen (RTL pages must not scroll sideways)', async () => {
  const pages: [string, string][] = [['/almamel', '/submit/'], ['/almamel', '/submit/job/'], ['/almamel', '/submit/help/'], ['/almamel', '/order/'],
    ['/almamel', '/businesses/1000001/'], ['/almamel-admin', '/login/'], ['/almamel-tasjeel', '/'], ['/almamel-mat3am', '/login/']];
  for (const w of [360, 1366]) {
    for (const [site, u] of pages) {
      const p = await open(u, w, site);
      await p.waitForTimeout(300);
      const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(wide <= 1, `${site}${u} at ${w}px is ${wide}px wider than the screen`);
      await p.context().close();
    }
  }
});

test('password reset link: expired link explains itself, valid link shows a new-password form', async () => {
  const bad = await open('/login/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', 390, '/almamel-admin');
  await bad.waitForSelector('.live-msg.flash-error:has-text("انتهت صلاحيته")');
  await bad.context().close();
  const p = await open(`/login/#access_token=tok-${ADMIN}&expires_in=3600&expires_at=${Math.floor(Date.now() / 1000) + 3600}&refresh_token=r-x&token_type=bearer&type=recovery`, 390, '/almamel-admin');
  await p.waitForSelector('#f-new-pw');
  assert.ok(await p.locator('[data-login]').isHidden(), 'login form hidden while resetting');
  await p.fill('#f-new-pw', 'new-pass-12345'); await p.fill('#f-new-pw2', 'new-pass-12345');
  await p.click('button:has-text("حفظ كلمة المرور")');
  await p.waitForURL(/\/almamel-admin\/admin\//);
  const put = log.filter((r) => r.path === '/auth/v1/user' && r.method === 'PUT').at(-1);
  assert.ok(put && JSON.parse(put.body.toString()).password === 'new-pass-12345');
  await p.context().close();
});

test('a listing approved after the last build shows up at once on its section and its own page', async () => {
  // 1000002 منشور بقاعدة البيانات لكن ما دخل نسخة الموقع (تصنيفه غير معروف وقت البناء)
  const page = await open('/jobs/');
  await page.waitForSelector('[data-live-list] .row-link:has-text("وظيفة بتصنيف خاطئ")');
  assert.equal(await page.getAttribute('[data-live-list] .row-link', 'href'), '/almamel/p/?id=1000002');
  assert.equal(await page.locator('[data-live-list] .row-link:has-text("مطعم المحاكاة")').count(), 0, 'only this section');
  await page.click('[data-live-list] .row-link');
  await page.waitForSelector('[data-post-box] h1:has-text("وظيفة بتصنيف خاطئ")');
  assert.ok((await page.textContent('[data-post-box] .facts'))!.includes('الوظائف'));
  const home = await open('/');
  await home.waitForSelector('[data-live-latest] .row-link:has-text("وظيفة بتصنيف خاطئ")');
  await page.context().close(); await home.context().close();
});

test('owner portal: shop owner edits details and photos of their page and opens products and prices', async () => {
  const p = await open('/login/', 390, '/almamel-mat3am');
  await p.fill('#f-email', 'owner@x.iq'); await p.fill('#f-password', 'owner-pass-1234');
  await p.click('[data-login] button[type=submit]');
  await p.waitForURL(/\/almamel-mat3am\/owner\/dashboard\//);
  await p.waitForSelector('.owner-card:has-text("مطعم المحاكاة")');
  assert.equal(await p.getAttribute('.owner-card a.btn-primary', 'href'), '/almamel-mat3am/owner/menu/?b=1000001');
  await p.click('.owner-edit summary');
  await p.fill('[name=hours]', 'يومياً من ١٢ الظهر لـ ١٢ بالليل');
  const img = path.join(os.tmpdir(), 'owner-photo.jpg');
  fs.writeFileSync(img, await sharp({ create: { width: 800, height: 600, channels: 3, background: '#357' } }).jpeg().toBuffer());
  await p.setInputFiles('.owner-edit input[type=file]', img);
  assert.equal(await p.locator('.owner-edit .picked li').count(), 2, 'old photo + new photo');
  await p.fill('.owner-edit input[name=open_from]', '16:00'); await p.fill('.owner-edit input[name=open_to]', '02:00');
  await p.click('.owner-edit button:has-text("حفظ التعديلات")');
  await p.waitForSelector('.live-msg.flash-ok:has-text("تم حفظ معلومات المحل")');
  const call = JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/update_business_info').at(-1)!.body.toString());
  assert.equal(call.p_id, 1000001);
  assert.equal(call.p_details.hours, 'يومياً من ١٢ الظهر لـ ١٢ بالليل');
  assert.deepEqual([call.p_details.open_from, call.p_details.open_to], ['16:00', '02:00']);
  assert.equal(call.p_images.length, 2);
  assert.match(call.p_images[1], new RegExp(`^u/${UID}/[0-9a-f]{32}\\.webp$`));
  await p.context().close();
});

test('«أنا صاحب محل» is the first item of the ☰ menu and leads to the owner sign-in', async () => {
  const p = await open('/', 390);
  await p.click('.menu-toggle');
  const first = p.locator('#site-menu .menu-inner > *').first();
  assert.equal(await first.getAttribute('class'), 'owner-cta');
  assert.ok((await first.textContent())!.includes('أنا صاحب محل'));
  assert.equal(await first.getAttribute('href'), '/almamel/mat3am/');
  await p.context().close();
  const d = await open('/', 1280);
  if (!process.env.SHOTS) assert.ok(await d.locator('.header-actions .btn-owner').isVisible(), 'desktop header button');
  await d.context().close();
});

test('admin approves a product an owner added with its photo', async () => {
  const p = await adminLogin(1280);
  await p.waitForSelector('[data-products] li:has-text("قميص قطن")');
  assert.equal(await p.textContent('[data-stat="products"]'), '١');
  await p.click('[data-products] button:has-text("موافقة ونشر")');
  await p.waitForSelector('.live-msg.flash-ok:has-text("قميص قطن")');
  const call = log.filter((r) => r.path === '/rest/v1/menu_items' && r.method === 'PATCH').at(-1)!;
  assert.equal(call.query.get('id'), 'eq.31');
  assert.deepEqual(JSON.parse(call.body.toString()), { approved: true });
  await p.context().close();
});

test('private link for a shop owner: admin sends it, owner signs up and is linked to the shop', async () => {
  const a = await adminLogin(1280);
  await a.waitForSelector('[data-published] button:has-text("رابط خاص لصاحب المحل")');
  await a.locator('[data-published] button:has-text("رابط خاص لصاحب المحل")').first().click();
  await a.waitForSelector('.invite-box input');
  const link = await a.inputValue('.invite-box input');
  assert.ok(link.endsWith('/mat3am/login/?invite=abc123def4567890'), link);
  const wa = decodeURIComponent((await a.getAttribute('.invite-box a.btn-wa', 'href'))!);
  assert.ok(wa.includes('استاذ هذا الرابط الخاص بصفحة') && wa.includes('?invite=abc123def4567890'));
  await a.context().close();

  const p = await open('/login/?invite=abc123def4567890', 390, '/almamel-mat3am');
  await p.waitForSelector('.live-msg:has-text("مركز حمد فون")');
  assert.ok(await p.locator('#f-su_name').isVisible(), 'sign-up form opened');
  await p.fill('#f-su_name', 'حمد'); await p.fill('#f-su_phone', '07704444444'); await p.fill('#f-su_email', 'hamad@x.iq'); await p.fill('#f-su_password', 'hamad-pass-123');
  await p.click('[data-signup] button[type=submit]');
  await p.waitForURL(/\/almamel-mat3am\/owner\/dashboard\//);
  assert.equal(JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/accept_invite').at(-1)!.body.toString()).p_code, 'abc123def4567890');
  await p.context().close();

  const old = await open('/login/?invite=000000000000', 390, '/almamel-mat3am');
  await old.waitForSelector('.live-msg.flash-error:has-text("انتهت صلاحيته")');
  await old.context().close();
});

test('library category: choosing it shows the services checklist and fills a ready price list', async () => {
  const p = await adminLogin(1280);
  await p.goto(siteUrl + '/almamel-admin/admin/business/');
  await p.waitForSelector('[data-add-business] select[name=category]');
  assert.ok(await p.locator('.kit-services').isHidden());
  await p.selectOption('[data-add-business] select[name=category]', 'مكتبات وخدمات إلكترونية');
  await p.waitForSelector('.kit-services:not([hidden])');
  await p.click('.kit-item:has-text("استنساخ")'); await p.click('.kit-item:has-text("تقديم إلكتروني")');
  assert.equal(await p.inputValue('[data-add-business] [name=services]'), 'الخدمات: استنساخ، تقديم إلكتروني (جامعات، تعيينات، منح)');
  assert.ok((await p.inputValue('[data-add-business] [name=menu]')).startsWith('*طباعة واستنساخ*'));
  if (process.env.SHOTS) { await p.setViewportSize({ width: 390, height: 1500 }); await p.locator('.kit-services').scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.locator('.kit-services').screenshot({ path: path.join(process.env.SHOTS, 'library.png') }); await p.setViewportSize({ width: 1280, height: 900 }); }
  await p.selectOption('[data-add-business] select[name=category]', 'صيدليات');
  await p.waitForSelector('.kit-item:has-text("قياس الضغط")');
  assert.equal(await p.inputValue('[data-add-business] [name=services]'), '', 'previous kit choices cleared');
  assert.ok((await p.inputValue('[data-add-business] [name=menu]')).startsWith('*خدمات*'), 'pharmacy list replaces the library list');
  await p.selectOption('[data-add-business] select[name=category]', 'حلاقة وصالونات تجميل');
  assert.ok((await p.inputValue('[data-add-business] [name=menu]')).startsWith('*حلاقة رجالية*'));
  await p.selectOption('[data-add-business] select[name=category]', 'هواتف وصيانة');
  assert.ok(await p.locator('.kit-item:has-text("تبديل شاشة")').isVisible());
  await p.selectOption('[data-add-business] select[name=category]', 'ملابس');
  assert.equal(await p.inputValue('[data-add-business] [name=menu]'), '', 'untouched ready list removed when switching away');
  assert.ok(await p.locator('.kit-services').isHidden());
  await p.context().close();
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

test('a visitor who owes 3,000 cannot post and gets a WhatsApp button to pay', async () => {
  const p = await open('/submit/market/');
  assert.ok((await p.textContent('.note-price'))!.includes('1,000 د.ع'), 'new price shown');
  await p.waitForFunction(() => (document.querySelector('select[name=category]') as HTMLSelectElement).options.length > 1);
  await p.selectOption('select[name=category]', { index: 1 });
  await p.fill('#f-title', 'ثلاجة مستعملة'); await p.fill('#f-body', 'نظيفة');
  await p.fill('#f-guest_name', 'مستعجل'); await p.fill('#f-contact_phone', '07701000001');
  await p.click('[data-live-submit] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-error:has-text("عليك 3,000 د.ع")');
  assert.match((await p.getAttribute('.live-msg a.btn-wa', 'href'))!, /^https:\/\/wa\.me\/9647763438000\?text=/);
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

test('public site has no shop sign-up: «add your restaurant» opens WhatsApp support', async () => {
  for (const f of ['owner/register/index.html', 'owner/index.html', 'owner/dashboard/index.html', 'login/index.html', 'admin/index.html']) {
    assert.ok(!fs.existsSync(path.join(dist, f)), f + ' must not be on the public site');
  }
  const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.ok(/class="food-card food-add" href="https:\/\/wa\.me\/964/.test(home), 'homepage card goes to WhatsApp');
  assert.ok(!home.includes('/owner/register'));
});

test('private registration link: customer adds shop info, logo, photos and menu for admin approval', async () => {
  const p = await open('/', 390, '/almamel-tasjeel');
  await p.fill('#f-name', 'أبو علي'); await p.fill('#f-phone', '07701111111'); await p.fill('#f-email', 'owner@x.iq'); await p.fill('#f-password', 'owner-pass-1234');
  await p.check('#f-agree');
  await p.click('[data-step=account] button[type=submit]');
  await p.waitForSelector('[data-step=business]:not([hidden])');
  await p.fill('#f-title', 'مطعم أبو علي'); await p.selectOption('#f-category', { label: 'مطاعم' }); await p.fill('#f-address', 'الشارع العام');
  await p.fill('#f-contact_phone', '07705555555'); await p.fill('#f-message', 'اتصلوا على رقم المحل العصر'); await p.check('#f-commission');
  const img = path.join(os.tmpdir(), 'reg-front.png');
  fs.writeFileSync(img, await sharp({ create: { width: 800, height: 600, channels: 3, background: '#963' } }).png().toBuffer());
  await p.setInputFiles('input[name=photos]', [img, img]);
  await p.setInputFiles('input[name=logo]', img);
  await p.fill('#f-menu', '*المشويات*\n• نفر كباب — 12,000');
  await p.click('[data-step=business] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-ok:has-text("وصل طلبك")');
  const biz = JSON.parse(posts().at(-1)!.body.toString());
  assert.equal(biz.type, 'business'); assert.equal(biz.images.length, 2); assert.match(biz.logo, new RegExp(`^u/${UID}/`));
  const claim = JSON.parse(log.filter((r) => r.path === '/rest/v1/claims' && r.method === 'POST').at(-1)!.body.toString());
  assert.equal(claim.business_id, 1000005);
  const items = JSON.parse(log.filter((r) => r.path === '/rest/v1/menu_items' && r.method === 'POST').at(-1)!.body.toString());
  assert.deepEqual(items.map((i: { section: string; name: string; price: number }) => [i.section, i.name, i.price]), [['المشويات', 'نفر كباب', 12000]]);
  assert.ok(!(await p.content()).includes('/owner/dashboard'), 'no owner dashboard link');
  await p.context().close();
});

test('«دلفري حر»: approved riders only, search by area, call and WhatsApp; no address or ID on the page', async () => {
  const p = await open('/delivery/');
  await p.waitForSelector('.rider:has-text("حسين الدراج")');
  await shot(p, 'delivery');
  assert.equal(await p.locator('.rider').count(), 1, 'pending rider hidden');
  await p.waitForSelector('[data-fares]:not([hidden]) [data-fares-zone] div:has-text("داخل نفس المحلة")');
  assert.ok((await p.textContent('[data-fares-zone]'))!.includes('اتفاق'), 'empty price reads «اتفاق»');
  assert.ok((await p.textContent('[data-fares-extra]'))!.includes('+ ١٬٠٠٠ د.ع'));
  assert.ok((await p.textContent('.rider-fare'))!.includes('٣٬٥٠٠'), 'rider own fare on the card');
  await p.waitForSelector('.rider .rating-sum:has-text("٤٫٥")');
  assert.equal(await p.locator('.rider details.rider-more .stars-input .star').count(), 5);
  if (process.env.SHOTS) { await p.evaluate(() => document.querySelectorAll('[data-anim]').forEach((e) => e.removeAttribute('data-anim'))); await p.screenshot({ path: process.env.SHOTS + '/delivery-full.png', fullPage: true }); }
  const html = await p.content();
  assert.ok(!html.includes('محلة ٧٠٣') && !html.includes('rider/'), 'no private data');
  assert.equal(await p.getAttribute('.rider a[href^="tel:"]', 'href'), 'tel:07712345678');
  assert.match((await p.getAttribute('.rider a.btn-wa', 'href'))!, /^https:\/\/wa\.me\/9647712345678\?text=/);
  await p.fill('[data-rider-q]', 'الكرادة');
  await p.waitForSelector('.rider-list .empty');
  await p.fill('[data-rider-q]', 'الحسينيه');
  await p.waitForSelector('.rider:has-text("حسين الدراج")');
  await p.context().close();
});

test('rider sign-up uploads both ID photos to the private bucket and sends the exact address', async () => {
  const p = await open('/delivery/join/');
  await p.fill('#f-name', 'كرار'); await p.fill('#f-phone', '07701230000');
  await p.selectOption('#f-vehicle', 'دراجة نارية');
  await p.fill('#f-areas', 'المعامل'); await p.fill('#f-address', 'المعامل، محلة ٧٠١، زقاق ٣');
  await p.setInputFiles('input[name=id_front]', { name: 'f.png', mimeType: 'image/png', buffer: png });
  await p.setInputFiles('input[name=id_back]', { name: 'b.png', mimeType: 'image/png', buffer: png });
  await shot(p, 'rider-join');
  await p.click('[data-rider-form] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-error');
  await p.check('#f-agree');
  await p.fill('#f-min_fare', '١٬٥٠٠');
  await p.click('[data-rider-form] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-error:has-text("3,000")');
  await p.fill('#f-min_fare', '٣٬٥٠٠');
  await p.click('[data-rider-form] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-ok:has-text("وصل تسجيلك")');
  const ups = log.filter((r) => r.method === 'POST' && /^\/storage\/v1\/object\/proofs\/rider\/[0-9a-f]{32}\.webp$/.test(r.path));
  assert.equal(ups.length, 2, 'two ID photos to proofs/rider/');
  const row = JSON.parse(log.filter((r) => r.path === '/rest/v1/riders' && r.method === 'POST').at(-1)!.body.toString());
  assert.equal(row.phone, '07701230000'); assert.equal(row.address, 'المعامل، محلة ٧٠١، زقاق ٣'); assert.equal(row.vehicle, 'دراجة نارية');
  assert.equal(row.status, undefined, 'status is set by the database');
  assert.equal(row.min_fare, 3500);
  assert.deepEqual([row.id_front, row.id_back], ups.map((u) => u.path.replace('/storage/v1/object/proofs/', '')));
  await p.context().close();
});

test('admin sees rider IDs and address, and approves a pending rider', async () => {
  const p = await adminLogin(1280);
  await p.waitForSelector('[data-riders-admin] li:has-text("عباس الستوتة")');
  assert.equal(await p.textContent('[data-stat="riders"]'), '١');
  const card = p.locator('[data-riders-admin] li.panel', { hasText: 'عباس الستوتة' });
  assert.ok((await card.textContent())!.includes('قرب السيطرة'));
  assert.equal(await card.locator('.id-thumbs img').count(), 2);
  await card.locator('button:has-text("تم التحقق: نشر")').click();
  await p.waitForSelector('.live-msg.flash-ok:has-text("عباس الستوتة")');
  const call = log.filter((r) => r.path === '/rest/v1/riders' && r.method === 'PATCH').at(-1)!;
  assert.equal(call.query.get('id'), 'eq.2');
  assert.equal(JSON.parse(call.body.toString()).status, 'approved');
  // تعديل التسعيرة
  await p.waitForSelector('[data-fares-admin] .fare-row');
  assert.equal(await p.locator('[data-fares-admin] .fare-row').count(), 3);
  await p.locator('[data-fares-admin] .fare-row').nth(0).locator('input').nth(1).fill('1250');
  await p.click('[data-fares-admin] button:has-text("+ سطر جديد")');
  const last = p.locator('[data-fares-admin] .fare-row').last();
  await last.locator('select').selectOption('extra'); await last.locator('input').nth(0).fill('مطر أو برد'); await last.locator('input').nth(1).fill('500');
  await p.click('[data-fares-admin] button:has-text("حفظ التسعيرة")');
  await p.waitForSelector('.live-msg.flash-ok:has-text("تم حفظ التسعيرة")');
  const fares = JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/set_delivery_fares').at(-1)!.body.toString()).p_rows;
  assert.deepEqual(fares, [{ kind: 'zone', label: 'داخل نفس المحلة', price: 1250 }, { kind: 'zone', label: 'أبعد من هيج', price: null },
    { kind: 'extra', label: 'بالليل بعد الساعة ١٢', price: 1000 }, { kind: 'extra', label: 'مطر أو برد', price: 500 }]);
  await p.context().close();
});

test('admin sees debtors with phones and IPs, and «تم الدفع، تنشيط» clears the debt', async () => {
  const p = await adminLogin(1280);
  await p.waitForSelector('[data-debts] li:has-text("مستعجل")');
  await p.waitForFunction(() => document.querySelector('[data-stat="debts"]')!.textContent === '٣٬٠٠٠');
  const card = p.locator('[data-debts] li.panel', { hasText: 'مستعجل' });
  const text = (await card.textContent())!;
  assert.ok(text.includes('ممنوع من النشر') && text.includes('5.6.7.8') && text.includes('07701000002'));
  await card.locator('button:has-text("تم الدفع، تنشيط")').click();
  await p.waitForSelector('.live-msg.flash-ok:has-text("انمسح دين")');
  const call = JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/settle_debt').at(-1)!.body.toString());
  assert.equal(call.p_id, 1000020);
  await p.context().close();
});

test('admin with only a password must set up the two-step code before seeing anything', async () => {
  const p = await open('/login/', 1280, '/almamel-admin');
  await p.fill('#f-email', 'mfa@x.iq'); await p.fill('#f-password', 'admin-pass-1234');
  await p.click('[data-login] button[type=submit]');
  await p.waitForURL(/\/almamel-admin\/admin\//);
  await p.waitForSelector('[data-mfa] img.mfa-qr');
  assert.ok((await p.textContent('[data-mfa]'))!.includes('JBSWY3DPEHPK3PXP'), 'manual key shown');
  assert.equal(await p.isVisible('#pending'), false, 'admin sections hidden until the code is verified');
  await p.fill('.mfa-code', '000000'); await p.click('[data-mfa] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-error:has-text("الكود غلط")');
  await p.fill('.mfa-code', '١٢٣٤٥٦'); await p.click('[data-mfa] button[type=submit]');
  await p.waitForSelector('#pending:not([hidden]) [data-pending] li');
  assert.equal(await p.locator('[data-mfa]').count(), 0);
  await p.context().close();
});

test('business page: view counted once a day, star rating, approved reviews and a report form', async () => {
  const p = await open('/businesses/1000001/');
  await p.waitForSelector('[data-trust]:not([hidden]) .rating-sum:has-text("٤٫٥")');
  assert.equal((await p.textContent('.facts [data-open-hours]'))!.trim(), 'مفتوح الآن', 'open now from the shop hours');
  assert.ok((await p.textContent('[data-trust]'))!.includes('أكل طيب وتوصيل سريع'));
  const hits = () => log.filter((r) => r.path === '/rest/v1/rpc/hit').length;
  const h1 = hits(); assert.ok(h1 >= 1);
  await p.reload(); await p.waitForSelector('[data-trust]:not([hidden])');
  assert.equal(hits(), h1, 'second visit the same day is not counted');
  await p.click('.stars-input .star:nth-child(4)');
  await p.fill('.rate-comment', 'زين');
  await p.click('.rate-form button:has-text("إرسال التقييم")');
  await p.waitForSelector('.rate-form:has-text("وصل تقييمك")');
  const rate = JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/rate').at(-1)!.body.toString());
  assert.equal(rate.p_stars, 4); assert.equal(rate.p_id, 1000001); assert.equal(rate.p_type, 'post'); assert.match(rate.p_device, /^[0-9a-f]{32}$/);
  await p.click('.complain summary');
  await p.selectOption('.complain-form select', 'wrong_info');
  await p.fill('.complain-form input', '٠٧٧٠١٢٣٤٥٦٧');
  await p.click('.complain-form button[type=submit]');
  await p.waitForSelector('.complain:has-text("وصلت شكواك")');
  const c = JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/submit_complaint').at(-1)!.body.toString());
  assert.deepEqual([c.p_type, c.p_id, c.p_reason, c.p_phone], ['post', 1000001, 'wrong_info', '07701234567']);
  await p.context().close();
});

test('a visitor gets a private «إعلاناتي» link: the ad stores only its SHA-256, and the page can renew or delete it', async () => {
  const p = await open('/submit/market/');
  await p.waitForFunction(() => (document.querySelector('select[name=category]') as HTMLSelectElement).options.length > 1);
  await p.selectOption('select[name=category]', { index: 1 });
  await p.fill('#f-title', 'ثلاجة للبيع'); await p.fill('#f-body', 'نظيفة');
  await p.fill('#f-guest_name', 'زائر'); await p.fill('#f-contact_phone', '07701239999');
  await p.click('[data-live-submit] button[type=submit]');
  await p.waitForSelector('.live-msg a:has-text("إعلاناتي")');
  const href = (await p.getAttribute('.live-msg a:has-text("إعلاناتي")', 'href'))!;
  const token = href.match(/t=([0-9a-f]{32})$/)![1];
  const row = JSON.parse(posts().at(-1)!.body.toString());
  assert.equal(row.edit_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(row).includes(token), 'the token itself is never sent');
  await p.goto(siteUrl + '/almamel/my-ads/');
  await p.waitForSelector('[data-my-ads] li:has-text("ثلاجة للبيع")');
  assert.deepEqual(JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/guest_posts').at(-1)!.body.toString()).p_tokens, [token]);
  await p.click('[data-my-ads] button:has-text("تجديد")');
  await p.waitForSelector('.live-msg.flash-ok:has-text("تم التجديد")');
  await p.click('[data-my-ads] button:has-text("حذف الإعلان")');
  await p.waitForSelector('.live-msg.flash-ok:has-text("انحذف")');
  assert.equal(JSON.parse(log.filter((r) => r.path === '/rest/v1/rpc/guest_remove_post').at(-1)!.body.toString()).p_token, token);
  await p.context().close();
});

test('admin: complaints with the reporter\'s phone and IP, expiring ads with a WhatsApp reminder, views per post', async () => {
  const p = await adminLogin(1280);
  await p.waitForSelector('[data-complaints] li:has-text("تأخر ساعتين")');
  const c = (await p.textContent('[data-complaints] li'))!;
  assert.ok(c.includes('حسين الدراج') && c.includes('5.6.7.8') && c.includes('07701231231'));
  await p.click('[data-complaints] button:has-text("تمت المعالجة")');
  await p.waitForSelector('.live-msg.flash-ok:has-text("انغلقت الشكوى")');
  assert.deepEqual(JSON.parse(log.filter((r) => r.path === '/rest/v1/complaints' && r.method === 'PATCH').at(-1)!.body.toString()), { status: 'closed' });
  await p.waitForSelector('[data-expiring] li:has-text("وظيفة تنتهي")');
  assert.match((await p.getAttribute('[data-expiring] a.btn-wa', 'href'))!, /^https:\/\/wa\.me\/9647709990000\?text=/);
  await p.waitForSelector('[data-published] li:has-text("٥٧ مشاهدة")');
  await p.context().close();
});

async function adminLogin(w = 1280): Promise<Page> {
  const p = await open('/login/', w, '/almamel-admin');
  await p.fill('#f-email', 'admin@x.iq'); await p.fill('#f-password', 'admin-pass-1234');
  await p.click('[data-login] button[type=submit]');
  await p.waitForURL(/\/almamel-admin\/admin\//);
  return p;
}

test('admin site: add a restaurant with logo, photos and a pasted menu, published at once', async () => {
  const p = await adminLogin(390);
  await p.goto(siteUrl + '/almamel-admin/admin/business/');
  await p.fill('#f-title', 'مطعم الإدارة'); await p.selectOption('#f-category', { label: 'مطاعم' }); await p.fill('#f-address', 'شارع ٢٠');
  await p.fill('#f-contact_phone', '07705555556');
  const img = path.join(os.tmpdir(), 'admin-shop.jpg');
  fs.writeFileSync(img, await sharp({ create: { width: 900, height: 700, channels: 3, background: '#396' } }).jpeg().toBuffer());
  await p.setInputFiles('input[name=photos]', [img, img]);
  await p.setInputFiles('input[name=logo]', img);
  await p.fill('#f-menu', '*المشويات*\n• نفر كباب — 12,000\n*البيتزا*\n• بيتزا لحم: صغير 5,000 / وسط 7,000\nتكة | 6000');
  await p.click('[data-add-business] button[type=submit]');
  await p.waitForSelector('.live-msg.flash-ok:has-text("مطعم الإدارة")');
  const biz = JSON.parse(posts().at(-1)!.body.toString());
  assert.equal(biz.type, 'business'); assert.equal(biz.images.length, 2);
  for (const im of [...biz.images, biz.logo]) assert.match(im, new RegExp(`^u/${ADMIN}/[0-9a-f]{32}\\.webp$`));
  const rpcs = log.filter((r) => r.path === '/rest/v1/rpc/moderate_post').map((r) => JSON.parse(r.body.toString()).p_action);
  assert.ok(rpcs.includes('approve') && rpcs.includes('verify'), 'published and verified right away');
  const items = JSON.parse(log.filter((r) => r.path === '/rest/v1/menu_items' && r.method === 'POST').at(-1)!.body.toString());
  assert.deepEqual(items.map((i: { section: string; name: string; price: number }) => [i.section, i.name, i.price]), [
    ['المشويات', 'نفر كباب', 12000], ['البيتزا', 'بيتزا لحم (صغير)', 5000], ['البيتزا', 'بيتزا لحم (وسط)', 7000], ['البيتزا', 'تكة', 6000]]);
  await p.context().close();
});

test('admin site: manage a restaurant menu and add an item with a photo', async () => {
  const p = await adminLogin(390);
  await p.goto(siteUrl + '/almamel-admin/admin/menu/?b=1000001');
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
  assert.match(ins.image, new RegExp(`^u/${ADMIN}/[0-9a-f]{32}\\.webp$`));
  await p.context().close();
});

test('admin reviews and approves a pending ad', async () => {
  const p = await adminLogin();
  await p.waitForSelector('[data-pending] .panel');
  assert.ok((await p.textContent('[data-pending]'))!.includes('سلعة بانتظار المراجعة'));
  if (process.env.SHOTS) { await p.setViewportSize({ width: 1366, height: 900 }); await p.waitForTimeout(900); await shot(p, 'admin-desktop'); await p.setViewportSize({ width: 360, height: 640 }); }
  await p.click('[data-pending] button:has-text("موافقة ونشر")');
  await p.waitForSelector('.live-msg.flash-ok');
  const rpc = log.filter((r) => r.path === '/rest/v1/rpc/moderate_post').at(-1)!;
  assert.deepEqual(JSON.parse(rpc.body.toString()), { p_id: 1000009, p_action: 'approve', p_reason: null });
  await p.context().close();
});
