import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { Agent, areaId, categoryId, createUser, jobForm, lastPostId, makeApp, nextPhone, pngImage, postStatus } from './helpers.ts';

let app: FastifyInstance;
before(async () => { app = await makeApp(); });
after(async () => { await app.close(); });

const foodCategory = () => String(app.db.prepare("SELECT id FROM categories WHERE section = 'business' AND is_food = 1 LIMIT 1").pluck().get());

function ownerForm(extra: Record<string, string> = {}) {
  return {
    name: 'أبو علي', phone: nextPhone(), password: 'my-restaurant-pass', agree: 'on',
    title: 'مطعم أبو علي', category_id: foodCategory(), area_id: String(areaId(app)), d_address: 'الشارع العام', d_hours: '١٢ - ١٢',
    contact_phone: '07705555555', whatsapp: 'on', body: 'مشويات', message: 'اتصلوا على رقم المحل العصر للتأكد', ...extra,
  };
}

test('visitors post ads without an account; they stay hidden until approved', async () => {
  const guest = new Agent(app);
  assert.equal((await guest.get('/submit')).status, 200);
  assert.equal((await guest.get('/submit/job')).status, 200);
  const r = await guest.postMultipart('/submit/job', { ...jobForm(app, 'وظيفة من زائر'), guest_name: 'زائر كريم' }, [{ name: 'images', filename: 'a.png', type: 'image/png', data: await pngImage() }]);
  assert.equal(r.status, 303, r.body.slice(0, 300));
  const id = lastPostId(app);
  assert.equal(postStatus(app, id), 'pending');
  assert.equal(app.db.prepare('SELECT guest_name FROM posts WHERE id = ?').pluck().get(id), 'زائر كريم');
  assert.equal((await new Agent(app).get(`/jobs/${id}`)).status, 404);
  const img = app.db.prepare('SELECT file FROM post_images WHERE post_id = ?').pluck().get(id) as string;
  assert.equal((await guest.get(`/media/${img}`)).status, 404, 'guest cannot see pending images');

  const mod = await createUser(app, 'moderator');
  const m = new Agent(app); await m.login(mod.phone);
  assert.ok((await m.get(`/admin/posts/${id}`)).body.includes('زائر كريم'));
  await m.post(`/admin/posts/${id}/action`, { action: 'approve' });
  assert.equal((await new Agent(app).get(`/jobs/${id}`)).status, 200);
});

test('guest posting: name and phone required, daily limit per network, no businesses, no draft bypass', async () => {
  const g = new Agent(app);
  assert.equal((await g.postMultipart('/submit/market', { title: 'سلعة', category_id: String(categoryId(app, 'market')), area_id: String(areaId(app)), d_condition: 'used', contact_phone: '07701111111' })).status, 400, 'name required');
  assert.equal((await g.get('/submit/business')).status, 303);
  assert.equal((await g.postMultipart('/submit/business', { title: 'محل' })).status, 303);
  // حساب الزائر الداخلي لا يمكن الدخول به
  assert.equal((await new Agent(app).login('07000000009', '!')).status, 401);
  // «مسودة» من زائر تتحول إلى بانتظار المراجعة (لا يبقى شيء عالق بلا مالك)
  const before = lastPostId(app);
  const strict = await makeApp();
  try {
    const s = new Agent(strict);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await s.postMultipart('/submit/job', { ...jobForm(strict, `وظيفة زائر رقم ${i + 1}`), guest_name: 'زائر', action: 'draft' })).status);
    assert.deepEqual(statuses, [303, 303, 303, 400], 'fourth guest post in a day is refused');
    assert.equal(strict.db.prepare("SELECT count(*) FROM posts WHERE status = 'draft'").pluck().get(), 0);
  } finally { await strict.close(); }
  assert.equal(lastPostId(app), before);
});

test('restaurant owner registers with proof, admin verifies, restaurant goes live with a full menu', async () => {
  const o = new Agent(app);
  assert.equal((await o.get('/owner')).status, 200);
  assert.equal((await o.get('/register')).status, 303, 'general sign-up redirects to owners');
  const form = ownerForm();
  const r = await o.request('POST', '/owner/register', { multipart: (await import('./helpers.ts')).multipart({ _csrf: await o.token(), ...form }, [{ name: 'proof', filename: 'front.jpg', type: 'image/png', data: await pngImage(400, 300) }]) });
  assert.equal(r.status, 303, r.body.slice(0, 400));
  const ownerId = app.db.prepare('SELECT id FROM users WHERE phone = ?').pluck().get(form.phone) as number;
  const postId = lastPostId(app);
  assert.equal(postStatus(app, postId), 'pending');
  const claim = app.db.prepare('SELECT id, proof_file FROM business_claims WHERE post_id = ? AND user_id = ?').get(postId, ownerId) as { id: number; proof_file: string };
  assert.match(claim.proof_file, /^[0-9a-f]{32}\.webp$/);

  // قبل الاعتماد: يجهز القائمة لكن الصفحة غير ظاهرة
  assert.ok((await o.get('/owner/dashboard')).body.includes('قيد التحقق من الملكية'));
  const add = await o.request('POST', `/owner/b/${postId}/items`, { multipart: (await import('./helpers.ts')).multipart({ _csrf: await o.token(), section: 'مشويات', name: 'تكة لحم', price: '٦٠٠٠', note: 'نفر' }, [{ name: 'image', filename: 'tikka.png', type: 'image/png', data: await pngImage() }]) });
  assert.equal(add.status, 303, add.body.slice(0, 300));
  await o.request('POST', `/owner/b/${postId}/items`, { multipart: (await import('./helpers.ts')).multipart({ _csrf: await o.token(), section: 'مشروبات', name: 'لبن', price: '1000' }) });
  assert.equal((await new Agent(app).get(`/businesses/${postId}`)).status, 404);

  // صورة الإثبات خاصة: لا للزائر ولا لصاحب الطلب ولا للمشرف، نعم للمدير
  assert.notEqual((await new Agent(app).get(`/admin/proof/${claim.proof_file}`)).status, 200);
  assert.equal((await o.get(`/admin/proof/${claim.proof_file}`)).status, 403);
  assert.equal((await new Agent(app).get(`/media/${claim.proof_file}`)).status, 404);
  const mod = await createUser(app, 'moderator');
  const m = new Agent(app); await m.login(mod.phone);
  assert.equal((await m.get(`/admin/proof/${claim.proof_file}`)).status, 403);
  const admin = await createUser(app, 'admin');
  const ad = new Agent(app); await ad.login(admin.phone);
  const claims = await ad.get('/admin/claims');
  assert.ok(claims.body.includes('مطعم أبو علي') && claims.body.includes(`/admin/proof/${claim.proof_file}`));
  assert.equal((await ad.get(`/admin/proof/${claim.proof_file}`)).status, 200);

  // الاعتماد ينشر المحل ويجعل الطالب مالكاً
  assert.equal((await ad.post(`/admin/claims/${claim.id}`, { decision: 'approve' })).status, 303);
  assert.equal(postStatus(app, postId), 'published');
  assert.equal(app.db.prepare('SELECT owner_id FROM posts WHERE id = ?').pluck().get(postId), ownerId);
  assert.equal(app.db.prepare('SELECT role FROM users WHERE id = ?').pluck().get(ownerId), 'business_owner');

  const page = (await new Agent(app).get(`/businesses/${postId}`)).body;
  assert.ok(page.includes('قائمة الطعام') && page.includes('مشويات') && page.includes('مشروبات') && page.includes('تكة لحم'));
  assert.ok(page.includes('https://wa.me/9647705555555?text='), 'per-item WhatsApp order link');
  const itemImg = app.db.prepare('SELECT image FROM post_items WHERE post_id = ? AND image IS NOT NULL').pluck().get(postId) as string;
  assert.equal((await new Agent(app).get(`/media/${itemImg}`)).status, 200);
  assert.ok((await new Agent(app).get('/restaurants')).body.includes('مطعم أبو علي'));

  // تعديل صنف وجعله غير متوفر، ثم حذفه
  const itemId = app.db.prepare("SELECT id FROM post_items WHERE post_id = ? AND name = 'لبن'").pluck().get(postId) as number;
  await o.post(`/owner/b/${postId}/items/${itemId}`, { section: 'مشروبات', name: 'لبن أربيل', price: '1500', note: '' });
  assert.ok((await new Agent(app).get(`/businesses/${postId}`)).body.includes('غير متوفر حالياً'));
  await o.post(`/owner/b/${postId}/items/${itemId}/delete`);
  assert.ok(!(await new Agent(app).get(`/businesses/${postId}`)).body.includes('لبن أربيل'));

  // مستخدم آخر لا يدير القائمة
  const other = await createUser(app, 'business_owner');
  const x = new Agent(app); await x.login(other.phone);
  assert.equal((await x.get(`/owner/b/${postId}/menu`)).status, 404);
  assert.equal((await x.post(`/owner/b/${postId}/items/${itemId}/delete`)).status, 404);
  assert.equal((await x.request('POST', `/owner/b/${postId}/items`, { multipart: (await import('./helpers.ts')).multipart({ _csrf: await x.token(), name: 'دخيل' }) })).status, 404);
});

test('rejecting an owner request rejects the new business; uploads are validated', async () => {
  const o = new Agent(app);
  const form = ownerForm({ title: 'محل سيتم رفضه' });
  const bad = await o.request('POST', '/owner/register', { multipart: (await import('./helpers.ts')).multipart({ _csrf: await o.token(), ...form }, [{ name: 'proof', filename: 'x.jpg', type: 'image/jpeg', data: Buffer.from('<?php echo 1; ?>'.padEnd(200)) }]) });
  assert.equal(bad.status, 400, 'fake image rejected');
  const extra = await o.request('POST', '/owner/register', { multipart: (await import('./helpers.ts')).multipart({ _csrf: await o.token(), ...form, role: 'admin' }) });
  assert.equal(extra.status, 400, 'unknown fields rejected');
  assert.equal((await o.request('POST', '/owner/register', { multipart: (await import('./helpers.ts')).multipart({ _csrf: await o.token(), ...form }) })).status, 303);
  const postId = lastPostId(app);
  const claimId = app.db.prepare('SELECT id FROM business_claims WHERE post_id = ?').pluck().get(postId) as number;
  const admin = await createUser(app, 'admin');
  const ad = new Agent(app); await ad.login(admin.phone);
  await ad.post(`/admin/claims/${claimId}`, { decision: 'reject', note: 'ما گدرنا نتأكد' });
  assert.equal(postStatus(app, postId), 'rejected');
  assert.equal((await o.get(`/owner/b/${postId}/menu`)).status, 404);
});
