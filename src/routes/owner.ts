import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { csrfValid } from '../auth/csrf.ts';
import { createSession, destroySession, SESSION_COOKIE } from '../auth/sessions.ts';
import { html } from '../lib/html.ts';
import { fmtNumber, fmtPrice } from '../lib/format.ts';
import { normalizePhone } from '../lib/arabic.ts';
import { deleteImageFiles, ImageError, storeImage, type StoredImage } from '../lib/images.ts';
import { hashPassword, passwordProblem } from '../lib/password.ts';
import { audit } from '../domain/audit.ts';
import { addOwnerClaim } from '../domain/engagement.ts';
import { createPost, getPost, parsePostForm, PostError, postItems, reindex, type ItemRow } from '../domain/posts.ts';
import type { Post } from '../domain/types.ts';
import { checkbox, errorList, field, mediaUrl, postUrl, select, statusBadge, textarea } from '../views/components.ts';
import { icon } from '../views/layout.ts';
import { saveImages } from './account.ts';
import { bindOf, csrfInput } from './form.ts';
import { intParam, needUser } from './guards.ts';

type F = Record<string, string | undefined>;
const MAX_ITEMS = 300;

/**
 * «أضف مطعمك أو محلك»: تسجيل أصحاب المحلات مع إثبات الملكية، ولوحة تحكم كاملة لكل نشاط.
 * النشاط الجديد لا يظهر للعامة حتى يتحقق المدير من الملكية ويعتمده.
 */
export async function ownerRoutes(app: FastifyInstance) {
  const db = app.db;
  const proofDir = path.join(app.cfg.uploadDir, 'private');
  const opts = (sql: string, ...a: unknown[]) => (db.prepare(sql).all(...a) as { id: number; name: string }[]).map((r) => [r.id, r.name] as [number, string]);

  // ---------- صفحة التعريف ----------

  app.get('/owner', (req, reply) => reply.page(req, { title: 'أضف مطعمك أو محلك', description: 'سجّل مطعمك أو محلك في دليل المعامل وأدر قائمة الطعام والأسعار والعروض بنفسك.' }, html`<div class="wrap narrow">
    <h1>أضف مطعمك أو محلك</h1>
    <p class="lede">صفحة خاصة بأصحاب المطاعم والمحلات والخدمات في المعامل. تسجل مرة وحدة، نتحقق إنك صاحب النشاط، وبعدها تدير صفحتك بنفسك.</p>
    <ol class="steps">
      <li>سجّل حسابك ومعلومات محلك (دقيقتين).</li>
      <li>الإدارة تتحقق إن المحل إلك فعلاً، عادةً باتصال على رقم المحل.</li>
      <li>بعد الاعتماد تنشر صفحتك، وتضيف قائمة الطعام أو المنتجات بالأسعار والصور، والعروض، وحالة المحل (مفتوح أو مغلق).</li>
    </ol>
    <div class="owner-features">
      <p>${icon('utensils', 'i i-sm')}قائمة طعام كاملة بأقسام وصور وأسعار، وزر «اطلب عبر واتساب» لكل صنف</p>
      <p>${icon('tag', 'i i-sm')}عروض وتخفيضات تظهر بالصفحة الرئيسية وبقسم العروض</p>
      <p>${icon('briefcase', 'i i-sm')}نشر وظائف لمحلك</p>
      <p>${icon('badge', 'i i-sm')}شارة «موثّق» بعد التحقق من بياناتك</p>
    </div>
    <p class="btn-row">${req.user
      ? html`<a class="btn btn-sign btn-lg" href="/owner/new">${icon('plus')}أضف مطعماً أو محلاً</a><a class="btn btn-lg" href="/owner/dashboard">لوحة التحكم</a>`
      : html`<a class="btn btn-sign btn-lg" href="/owner/register">${icon('plus')}سجّل مطعمك أو محلك</a><a class="btn btn-lg" href="/login?next=/owner/dashboard">عندي حساب: دخول</a>`}</p>
    <p class="muted">إذا محلك موجود أصلاً بالدليل، افتح صفحته واضغط «أنا صاحب هذا النشاط».</p>
  </div>`));

  // ---------- التسجيل وإضافة نشاط ----------

  const businessForm = (req: FastifyRequest, reply: FastifyReply, withAccount: boolean, v: F = {}, errors: string[] = []) =>
    reply.page(req, { title: withAccount ? 'سجّل مطعمك أو محلك' : 'إضافة مطعم أو محل', noindex: true }, html`<div class="wrap narrow">
      <h1>${withAccount ? 'سجّل مطعمك أو محلك' : 'إضافة مطعم أو محل'}</h1>
      <p class="note">${icon('shield', 'i i-sm')}صفحتك ما تظهر للناس إلا بعد ما نتحقق إنك صاحب النشاط. صورة الإثبات لا يراها إلا مدير الموقع.</p>
      ${errorList(errors)}
      <form method="post" action="${withAccount ? '/owner/register' : '/owner/new'}" enctype="multipart/form-data" class="form" novalidate>
        ${csrfInput(req)}
        ${withAccount ? html`<fieldset class="group"><legend>حسابك</legend>
          ${field({ name: 'name', label: 'اسمك', value: v.name, required: true, max: 60, attrs: 'autocomplete="name"' })}
          ${field({ name: 'phone', label: 'رقم هاتفك (للدخول)', value: v.phone, required: true, type: 'tel', dir: 'ltr', attrs: 'autocomplete="tel" inputmode="tel"' })}
          ${field({ name: 'password', label: 'كلمة المرور', required: true, type: 'password', hint: '١٠ أحرف على الأقل', attrs: 'autocomplete="new-password" minlength="10" maxlength="128"' })}
        </fieldset>` : ''}
        <fieldset class="group"><legend>معلومات المحل</legend>
          ${field({ name: 'title', label: 'اسم المطعم أو المحل', value: v.title, required: true, max: 100 })}
          ${select({ name: 'category_id', label: 'نوع النشاط', value: v.category_id, required: true, placeholder: 'اختر', options: opts("SELECT id, name FROM categories WHERE section = 'business' AND active = 1 ORDER BY sort") })}
          ${select({ name: 'area_id', label: 'المنطقة', value: v.area_id ?? '', required: true, placeholder: 'اختر', options: opts('SELECT id, name FROM areas WHERE active = 1 ORDER BY sort, name') })}
          ${field({ name: 'd_address', label: 'العنوان', value: v.d_address, required: true, max: 200, hint: 'الشارع أو أقرب نقطة دالة' })}
          ${field({ name: 'd_hours', label: 'ساعات العمل', value: v.d_hours, max: 200 })}
          ${field({ name: 'd_delivery', label: 'مناطق التوصيل', value: v.d_delivery, max: 300 })}
          ${field({ name: 'contact_phone', label: 'رقم المحل للطلبات', value: v.contact_phone, required: true, type: 'tel', dir: 'ltr', attrs: 'inputmode="tel"' })}
          ${checkbox({ name: 'whatsapp', label: 'رقم المحل عليه واتساب (للطلبات)', checked: v.whatsapp !== undefined ? v.whatsapp === 'on' : true })}
          ${textarea({ name: 'body', label: 'وصف قصير', value: v.body, max: 2000, rows: 3 })}
        </fieldset>
        <fieldset class="group"><legend>إثبات الملكية</legend>
          ${textarea({ name: 'message', label: 'كيف نتأكد إن المحل إلك؟', value: v.message, required: true, max: 1000, rows: 3, hint: 'مثلاً: اسمك على إجازة المحل، أو اتصلوا على رقم المحل بين ٤ و٦ العصر.' })}
          <label for="f-proof">صورة واجهة المحل أو لافتته <span class="opt">(اختياري، تساعد بالتحقق ولا تُنشر)</span></label>
          <input id="f-proof" type="file" name="proof" accept="image/jpeg,image/png,image/webp">
        </fieldset>
        ${withAccount ? html`<div class="check"><input type="checkbox" id="f-agree" name="agree" required ${v.agree === 'on' ? html`checked` : ''}><label for="f-agree">قرأت <a href="/policies/terms" target="_blank">شروط الاستخدام</a> و<a href="/policies/privacy" target="_blank">سياسة الخصوصية</a> وأوافق عليها</label></div>` : ''}
        <button class="btn btn-primary btn-lg" type="submit">إرسال للتحقق</button>
      </form></div>`);

  app.get('/owner/register', (req, reply) => (req.user ? reply.redirect('/owner/new', 303) : businessForm(req, reply, true)));
  app.get('/owner/new', (req, reply) => { if (needUser(req, reply)) return; return businessForm(req, reply, false); });

  async function submitBusiness(req: FastifyRequest, reply: FastifyReply, withAccount: boolean) {
    if (!req.isMultipart()) return reply.code(415).send();
    const fields: F = {};
    const files: Buffer[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'proof') { await part.toBuffer(); return reply.code(400).send(); }
        const buf = await part.toBuffer();
        if (part.file.truncated) throw Object.assign(new Error('too large'), { statusCode: 413 });
        if (buf.length) files.push(buf);
      } else if (typeof part.value === 'string') fields[part.fieldname] = part.value;
    }
    if (!csrfValid(app.cfg.sessionSecret, bindOf(req), fields._csrf)) return reply.code(403).send('طلب مرفوض.');
    const errors: string[] = [];
    const allowed = new Set(['_csrf', 'name', 'phone', 'password', 'agree', 'title', 'category_id', 'area_id', 'd_address', 'd_hours', 'd_delivery', 'contact_phone', 'whatsapp', 'body', 'message']);
    if (Object.keys(fields).some((k) => !allowed.has(k))) errors.push('النموذج يحتوي حقولاً غير مسموح بها.');
    let name = '', phone: string | null = null;
    if (withAccount) {
      name = String(fields.name ?? '').trim().replace(/\s+/g, ' ');
      phone = normalizePhone(String(fields.phone ?? ''));
      if (name.length < 2 || name.length > 60 || /[<>]/.test(name)) errors.push('الاسم: من ٢ إلى ٦٠ حرفاً.');
      if (!phone) errors.push('رقم هاتفك: رقم عراقي يبدأ بـ 07 ويتكون من ١١ رقماً.');
      const pw = passwordProblem(String(fields.password ?? ''), phone ?? undefined);
      if (pw) errors.push(pw);
      if (fields.agree !== 'on') errors.push('يجب الموافقة على الشروط وسياسة الخصوصية.');
    }
    const message = String(fields.message ?? '').trim();
    if (message.length < 10 || message.length > 1000) errors.push('إثبات الملكية: اكتب ١٠ أحرف على الأقل.');
    const parsed = parsePostForm('business', {
      action: 'submit', title: fields.title, body: fields.body ?? '', category_id: fields.category_id, area_id: fields.area_id,
      contact_phone: fields.contact_phone, show_phone: 'on', whatsapp: fields.whatsapp, d_address: fields.d_address, d_hours: fields.d_hours ?? '', d_delivery: fields.d_delivery ?? '',
    });
    if (!parsed.ok) errors.push(...parsed.errors);
    const values = { ...fields, password: undefined, _csrf: undefined };
    if (errors.length || !parsed.ok) { reply.code(400); return businessForm(req, reply, withAccount, values, errors); }
    if (files.length > 1) { reply.code(400); return businessForm(req, reply, withAccount, values, ['صورة إثبات واحدة فقط.']); }

    let proof: StoredImage | null = null;
    try {
      if (files[0]) proof = await storeImage(files[0], proofDir);
      const hash = withAccount ? await hashPassword(String(fields.password)) : '';
      const result = db.transaction(() => {
        let userId = req.user?.id ?? 0;
        if (withAccount) {
          if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) throw new PostError('رقم هاتفك مسجل مسبقاً. سجّل الدخول ثم أضف محلك من لوحة التحكم.');
          userId = Number(db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, 'user')").run(name, phone, hash).lastInsertRowid);
        }
        const pending = db.prepare("SELECT count(*) FROM business_claims WHERE user_id = ? AND status = 'pending'").pluck().get(userId) as number;
        if (pending >= 3) throw new PostError('عندك ٣ طلبات قيد التحقق. انتظر مراجعتها قبل إضافة غيرها.');
        const postId = createPost(db, { id: userId, role: 'user' }, 'business', parsed.value, [], 10);
        addOwnerClaim(db, userId, postId, message, parsed.value.contact_phone, proof?.file ?? null);
        return { userId, postId };
      })();
      if (proof) await deleteImageFiles(proofDir, [proof.thumb]);
      if (withAccount) {
        if (req.session) destroySession(db, req.session.id);
        const s = createSession(db, { id: result.userId, role: 'user' }, true);
        reply.setCookie(SESSION_COOKIE, s.token, { path: '/', httpOnly: true, sameSite: 'lax', secure: app.cfg.cookieSecure, maxAge: s.maxAge });
      }
      return reply.flashRedirect('/owner/dashboard', 'ok', 'وصل طلبك. الإدارة راح تتحقق وتتواصل وياك، وبعدها تنشر صفحة محلك. تگدر من هسه تجهز قائمة الأسعار.');
    } catch (e) {
      if (proof) await deleteImageFiles(proofDir, [proof.file, proof.thumb]);
      if (e instanceof ImageError || e instanceof PostError) { reply.code(400); return businessForm(req, reply, withAccount, values, [e.message]); }
      throw e;
    }
  }

  const limit = { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 5, timeWindow: '1 hour' } } };
  app.post('/owner/register', limit, (req, reply) => (req.user ? reply.redirect('/owner/new', 303) : submitBusiness(req, reply, true)));
  app.post('/owner/new', limit, (req, reply) => { if (needUser(req, reply)) return; return submitBusiness(req, reply, false); });

  // ---------- لوحة التحكم ----------

  /** المحلات التي يديرها المستخدم: المعتمدة باسمه، أو التي أضافها وطلب ملكيتها ما زال قيد التحقق. */
  const myBusinesses = (userId: number) => db.prepare(`SELECT p.*, c.name AS category_name,
      (SELECT count(*) FROM post_items i WHERE i.post_id = p.id) AS items,
      (SELECT status FROM business_claims b WHERE b.post_id = p.id AND b.user_id = ? ORDER BY b.id DESC LIMIT 1) AS claim
    FROM posts p JOIN categories c ON c.id = p.category_id
    WHERE p.type = 'business' AND p.status NOT IN ('removed') AND (p.owner_id = ? OR (p.owner_id IS NULL AND p.user_id = ?))
    ORDER BY p.updated_at DESC`).all(userId, userId, userId) as (Post & { category_name: string; items: number; claim: string | null })[];

  /** هل يدير المستخدم قائمة هذا النشاط؟ المالك المعتمد، أو صاحب الطلب أثناء التحقق. */
  function managed(req: FastifyRequest): Post | null {
    const id = intParam((req.params as { id: string }).id);
    const p = id ? getPost(db, id) : undefined;
    const u = req.user;
    if (!p || !u || p.type !== 'business' || ['removed', 'rejected'].includes(p.status)) return null;
    if (p.owner_id === u.id) return p;
    if (p.owner_id === null && p.user_id === u.id && db.prepare("SELECT 1 FROM business_claims WHERE post_id = ? AND user_id = ? AND status = 'pending'").get(p.id, u.id)) return p;
    return null;
  }

  app.get('/owner/dashboard', (req, reply) => {
    if (needUser(req, reply)) return;
    const list = myBusinesses(req.user!.id);
    const csrf = csrfInput(req);
    return reply.page(req, { title: 'لوحة تحكم المحل', noindex: true }, html`<div class="wrap">
      <div class="page-head"><div><h1>لوحة التحكم</h1><p class="lede">أدر صفحة محلك وقائمة الأسعار والعروض.</p></div>
        <a class="btn btn-sign" href="/owner/new">${icon('plus')}إضافة مطعم أو محل</a></div>
      ${list.length ? html`<ul class="owner-cards">${list.map((b) => {
        const waiting = b.owner_id === null;
        return html`<li class="panel owner-card">
          <div class="owner-card-head"><h2>${b.title}</h2>${waiting ? html`<span class="status status-pending">قيد التحقق من الملكية</span>` : statusBadge(b.status)}</div>
          <p class="muted">${b.category_name}، ${fmtNumber(b.items)} صنف بالقائمة</p>
          ${waiting ? html`<p class="note">${icon('clock', 'i i-sm')}الإدارة راح تتواصل وياك للتحقق. تگدر من هسه تجهز قائمة الأسعار، وتظهر للناس بعد الاعتماد.</p>` : ''}
          ${b.status === 'pending' && !waiting ? html`<p class="note">${icon('clock', 'i i-sm')}تعديلاتك على معلومات المحل بانتظار المراجعة.</p>` : ''}
          <div class="btn-row">
            <a class="btn btn-primary" href="/owner/b/${b.id}/menu">${icon('utensils')}${/مطاعم|أفران/.test(b.category_name) ? 'قائمة الطعام' : 'المنتجات والأسعار'}</a>
            ${!waiting ? html`<a class="btn" href="/account/posts/${b.id}/edit">${icon('edit')}تعديل المعلومات والصور</a>` : ''}
            <a class="btn" href="${postUrl(b)}">${icon('info')}${b.status === 'published' ? 'عرض الصفحة' : 'معاينة'}</a>
          </div>
          ${!waiting && b.status === 'published' ? html`
            <form method="post" action="/account/posts/${b.id}/open" class="btn-row" aria-label="حالة المحل الآن">${csrf}<span>المحل الآن:</span>
              ${(['open', 'closed', 'unknown'] as const).map((s) => html`<button class="btn btn-sm ${b.open_state === s ? 'btn-primary' : ''}" type="submit" name="open_state" value="${s}" aria-pressed="${b.open_state === s}">${{ open: 'مفتوح', closed: 'مغلق', unknown: 'غير محدد' }[s]}</button>`)}
            </form>
            <div class="btn-row"><a class="btn btn-sm" href="/submit/offer">${icon('percent', 'i i-sm')}أضف عرضاً</a><a class="btn btn-sm" href="/submit/job">${icon('briefcase', 'i i-sm')}أضف وظيفة</a></div>` : ''}
        </li>`;
      })}</ul>` : html`<div class="empty"><p class="empty-title">ما عندك محلات بعد</p><p>أضف مطعمك أو محلك وراح نتحقق منه وننشره.</p><a class="btn btn-primary" href="/owner/new">إضافة مطعم أو محل</a></div>`}
      <p><a href="/account">الإشعارات وإعدادات الحساب</a></p>
    </div>`);
  });

  // ---------- قائمة الطعام / المنتجات ----------

  const menuPage = (req: FastifyRequest, reply: FastifyReply, p: Post, errors: string[] = []) => {
    const items = postItems(db, p.id);
    const sections = [...new Set(items.map((i) => i.section).filter(Boolean))];
    const csrf = csrfInput(req);
    const grouped = new Map<string, ItemRow[]>();
    for (const it of items) grouped.set(it.section || 'بدون قسم', [...(grouped.get(it.section || 'بدون قسم') ?? []), it]);
    return reply.page(req, { title: `قائمة ${p.title}`, noindex: true }, html`<div class="wrap narrow">
      <nav class="crumbs" aria-label="مسار التنقل"><a href="/owner/dashboard">لوحة التحكم</a><span aria-hidden="true">/</span><span aria-current="page">${p.title}</span></nav>
      <h1>القائمة والأسعار</h1>
      <p class="lede">${p.title}. كل تغيير يظهر بصفحة المحل مباشرة${p.status === 'published' ? '' : ' بعد اعتمادها'}.</p>
      ${errorList(errors)}
      <section class="panel" aria-labelledby="h-add"><h2 id="h-add">إضافة صنف</h2>
        <form method="post" action="/owner/b/${p.id}/items" enctype="multipart/form-data" class="form">${csrf}
          ${field({ name: 'section', label: 'القسم', required: false, max: 60, hint: 'مثل: مشويات، سندويشات، مشروبات', attrs: 'list="sections"' })}
          <datalist id="sections">${sections.map((s) => html`<option value="${s}">`)}</datalist>
          <div class="two">${field({ name: 'name', label: 'اسم الصنف', required: true, max: 80 })}${field({ name: 'price', label: 'السعر (د.ع)', attrs: 'inputmode="numeric"' })}</div>
          ${field({ name: 'note', label: 'وصف قصير', max: 200 })}
          <label for="f-image">صورة الصنف <span class="opt">(اختياري)</span></label><input id="f-image" type="file" name="image" accept="image/jpeg,image/png,image/webp">
          <button class="btn btn-primary" type="submit">${icon('plus')}إضافة</button>
        </form></section>
      ${items.length ? [...grouped.entries()].map(([sec, list]) => html`<section class="block"><h2>${sec}</h2><ul class="menu-list">${list.map((it) => html`<li class="menu-item${it.available ? '' : ' unavailable'}">
        ${it.image ? html`<img src="${mediaUrl(it.image)}" alt="" width="72" height="72">` : ''}
        <details class="menu-edit"><summary><span class="menu-name">${it.name}</span> <span class="num menu-price">${it.price !== null ? fmtPrice(it.price) : 'حسب الطلب'}</span>${it.available ? '' : html` <span class="badge badge-warn">غير متوفر</span>`}</summary>
          <form method="post" action="/owner/b/${p.id}/items/${it.id}" class="form compact">${csrf}
            ${field({ name: 'section', label: 'القسم', value: it.section, max: 60, attrs: 'list="sections"' })}
            <div class="two">${field({ name: 'name', label: 'الاسم', value: it.name, required: true, max: 80 })}${field({ name: 'price', label: 'السعر', value: it.price, attrs: 'inputmode="numeric"' })}</div>
            ${field({ name: 'note', label: 'الوصف', value: it.note, max: 200 })}
            ${checkbox({ name: 'available', label: 'متوفر حالياً', checked: !!it.available })}
            <div class="btn-row"><button class="btn btn-primary btn-sm" type="submit">حفظ</button></div>
          </form>
          <form method="post" action="/owner/b/${p.id}/items/${it.id}/delete">${csrf}<button class="btn btn-sm btn-danger" type="submit">${icon('trash', 'i i-sm')}حذف الصنف</button></form>
        </details></li>`)}</ul></section>`) : html`<p class="muted">القائمة فارغة. أضف أول صنف من فوق.</p>`}
    </div>`);
  };

  app.get('/owner/b/:id/menu', (req, reply) => {
    if (needUser(req, reply)) return;
    const p = managed(req);
    return p ? menuPage(req, reply, p) : reply.callNotFound();
  });

  const cleanItem = (b: F) => {
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
    const section = String(b.section ?? '').trim().replace(/\s+/g, ' ');
    const note = String(b.note ?? '').trim();
    const raw = String(b.price ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[,\s٬]/g, '');
    if (name.length < 2 || name.length > 80 || /[<>]/.test(name)) return { error: 'اسم الصنف من ٢ إلى ٨٠ حرفاً.' };
    if (section.length > 60 || /[<>]/.test(section)) return { error: 'اسم القسم أطول من المسموح.' };
    if (note.length > 200) return { error: 'الوصف أطول من ٢٠٠ حرف.' };
    if (raw && !/^\d{1,10}$/.test(raw)) return { error: 'السعر أرقام فقط بالدينار.' };
    return { name, section, note, price: raw ? Number(raw) : null };
  };

  app.post('/owner/b/:id/items', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 120, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (needUser(req, reply)) return;
    const p = managed(req);
    if (!p) return reply.callNotFound();
    if (!req.isMultipart()) return reply.code(415).send();
    const { fields, files } = await readMultipartImage(req);
    if (!csrfValid(app.cfg.sessionSecret, bindOf(req), fields._csrf)) return reply.code(403).send('طلب مرفوض.');
    const it = cleanItem(fields);
    if ('error' in it) { reply.code(400); return menuPage(req, reply, p, [it.error!]); }
    const count = db.prepare('SELECT count(*) FROM post_items WHERE post_id = ?').pluck().get(p.id) as number;
    if (count >= MAX_ITEMS) { reply.code(400); return menuPage(req, reply, p, [`الحد الأقصى ${MAX_ITEMS} صنف.`]); }
    let img: StoredImage[];
    try { img = await saveImages(files, app.cfg.uploadDir); }
    catch (e) { if (e instanceof ImageError) { reply.code(400); return menuPage(req, reply, p, [e.message]); } throw e; }
    if (img[0]) await deleteImageFiles(app.cfg.uploadDir, [img[0].thumb]);
    db.prepare('INSERT INTO post_items (post_id, name, price, note, section, image, sort) VALUES (?, ?, ?, ?, ?, ?, ?)').run(p.id, it.name, it.price, it.note, it.section, img[0]?.file ?? null, count);
    reindex(db, p.id);
    audit(db, { actorId: req.user!.id, action: 'business.item_add', targetType: 'post', targetId: p.id, meta: { name: it.name }, ipHash: req.ipHash });
    return reply.flashRedirect(`/owner/b/${p.id}/menu`, 'ok', `تمت إضافة «${it.name}».`);
  });

  app.post('/owner/b/:id/items/:item', (req, reply) => {
    if (needUser(req, reply)) return;
    const p = managed(req);
    const itemId = intParam((req.params as { item: string }).item);
    if (!p || !itemId) return reply.callNotFound();
    const b = req.body as F;
    const it = cleanItem(b);
    if ('error' in it) return reply.flashRedirect(`/owner/b/${p.id}/menu`, 'error', it.error!);
    const r = db.prepare('UPDATE post_items SET name = ?, price = ?, note = ?, section = ?, available = ? WHERE id = ? AND post_id = ?')
      .run(it.name, it.price, it.note, it.section, b.available === 'on' ? 1 : 0, itemId, p.id);
    if (!r.changes) return reply.callNotFound();
    reindex(db, p.id);
    return reply.flashRedirect(`/owner/b/${p.id}/menu`, 'ok', 'تم الحفظ.');
  });

  app.post('/owner/b/:id/items/:item/delete', async (req, reply) => {
    if (needUser(req, reply)) return;
    const p = managed(req);
    const itemId = intParam((req.params as { item: string }).item);
    if (!p || !itemId) return reply.callNotFound();
    const row = db.prepare('SELECT image FROM post_items WHERE id = ? AND post_id = ?').get(itemId, p.id) as { image: string | null } | undefined;
    if (!row) return reply.callNotFound();
    db.prepare('DELETE FROM post_items WHERE id = ? AND post_id = ?').run(itemId, p.id);
    if (row.image) await deleteImageFiles(app.cfg.uploadDir, [row.image]);
    reindex(db, p.id);
    return reply.flashRedirect(`/owner/b/${p.id}/menu`, 'ok', 'تم حذف الصنف.');
  });

  /** نموذج صنف: حقول نصية + صورة واحدة اختيارية باسم image. */
  async function readMultipartImage(req: FastifyRequest): Promise<{ fields: F; files: Buffer[] }> {
    const fields: F = {}; const files: Buffer[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buf = await part.toBuffer();
        if (part.fieldname !== 'image' || files.length) throw Object.assign(new Error('unexpected file'), { statusCode: 400 });
        if (part.file.truncated) throw Object.assign(new Error('too large'), { statusCode: 413 });
        if (buf.length) files.push(buf);
      } else if (typeof part.value === 'string') fields[part.fieldname] = part.value;
    }
    return { fields, files };
  }

}
