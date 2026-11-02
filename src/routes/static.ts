import type { FastifyInstance } from 'fastify';
import { html } from '../lib/html.ts';
import { addShopLink, searchText, waLink } from '../lib/arabic.ts';
import { fmtPrice } from '../lib/format.ts';
import { TYPES, TYPE_KEYS, isPostType, type PostType } from '../domain/types.ts';
import { listPublic } from '../domain/posts.ts';
import { sectionEnabled } from '../domain/settings.ts';
import { livePostPage, staticSearchPage } from '../views/pages/public.ts';
import { checkbox, field, select, textarea, postUrl } from '../views/components.ts';
import { icon } from '../views/layout.ts';
import { adminBusinessPage, adminLivePage, dashboardPage, liveHead, pricingNote, liveLoginPage, liveSubmitPage, menuManagerPage, kitchenPage, orderStatusPage, notConfiguredPage, ownerLandingPage, ownerRegisterPage } from '../views/pages/live.ts';
import { assetVersion } from '../app.ts';
import { typeFieldGroup, typeLabelsJson, typeTextJson } from '../views/type-fields.ts';

/**
 * صفحات النسخة الثابتة (GitHub Pages). لا شيء هنا يرسل بيانات إلى خادم:
 * «أضف إعلانك» يجهّز رسالة واتساب، وصفحة النشر تجهّز ملف إعلان يُحفظ في GitHub.
 */
export async function staticRoutes(app: FastifyInstance) {
  const db = app.db;

  app.get('/search', (req, reply) => reply.page(req, { title: 'البحث', canonical: '/search' }, staticSearchPage()));

  app.get('/search.json', (_req, reply) => {
    const items = listPublic(db, { types: [...TYPE_KEYS], perPage: 1000 }).items.map((p) => ({
      u: postUrl(p), t: p.title, y: p.type, s: TYPES[p.type].single, c: p.category_name, a: p.area_name,
      p: p.price !== null ? fmtPrice(p.price) : '', th: p.thumb ? `/media/${p.thumb}` : '', i: TYPES[p.type].icon,
      x: searchText(`${p.title} ${p.category_name} ${p.area_name} ${p.body}`),
    }));
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(items));
  });

  const PRICED: PostType[] = ['job', 'property', 'market', 'offer'];
  const submitPage = (type: PostType | '', wa: string, cats: Record<string, string[]>) => html`<div class="wrap narrow">
    <h1>أضف إعلانك</h1>
    <p class="lede">اختر القسم وراح تظهر حقوله الخاصة. بعد الإرسال تنفتح رسالة واتساب جاهزة لإدارة الموقع، والإعلان ينشر بعد المراجعة.</p>
    <p class="note">${icon('shield', 'i i-sm')}لا ترسل وثائق شخصية أو طبية، ولا رقم أي شخص بدون موافقته. اقرأ <a href="/policies/posting">سياسة النشر</a>.</p>
    ${pricingNote}
    <form class="form" data-wa-form data-wa="${wa}" data-cats="${JSON.stringify(cats)}" data-labels="${typeLabelsJson()}" data-texts="${typeTextJson()}" novalidate>
      ${select({ name: 'type', label: 'القسم', required: true, value: type, placeholder: 'اختر القسم', options: TYPE_KEYS.filter((t) => t !== 'business').map((t) => [t, TYPES[t].single]) })}
      <div data-for-any hidden>
        ${select({ name: 'category', label: 'التصنيف', required: true, placeholder: 'اختر', options: [] })}
        ${field({ name: 'title', label: 'العنوان', required: true, max: 100 })}
        ${field({ name: 'area', label: 'المنطقة', value: 'المعامل', required: true, max: 60 })}
        ${TYPE_KEYS.filter((t) => t !== 'business').map((t) => typeFieldGroup(t, `d_${t}_`))}
        <div data-for="${PRICED.join(' ')}" hidden>${field({ name: 'price', label: 'السعر (د.ع)', attrs: 'inputmode="numeric"', hint: 'اتركه فارغاً إذا يحدد عند التواصل' })}</div>
        ${textarea({ name: 'details', label: 'التفاصيل', required: true, max: 1500, rows: 5 })}
        <fieldset class="group"><legend>التواصل</legend>
          ${field({ name: 'name', label: 'اسمك', required: true, max: 60, hint: 'للإدارة فقط' })}
          ${field({ name: 'phone', label: 'رقم التواصل', type: 'tel', dir: 'ltr', required: true, attrs: 'inputmode="tel"' })}
          ${checkbox({ name: 'show_phone', label: 'أوافق على عرض رقمي في الإعلان', checked: true })}
        </fieldset>
        <p class="hint">إذا عندك صور، أرسلها بنفس محادثة الواتساب بعد الرسالة.</p>
        <button class="btn btn-primary btn-lg" type="submit">${icon('whatsapp')}إرسال عبر واتساب</button>
      </div>
    </form>
    <noscript><p class="note">أرسل تفاصيل إعلانك على <a href="${wa}">واتساب الدعم</a>.</p></noscript>
  </div>`;

  const live = !!(app.cfg.supabaseUrl && app.cfg.supabaseAnonKey);
  const v = assetVersion();
  const head = (req?: { settings: Record<string, string> }) => liveHead({ url: app.cfg.supabaseUrl, key: app.cfg.supabaseAnonKey, v, wa: req ? waLink(req.settings.whatsapp_phone ?? '') : '', admin: app.cfg.adminSite, register: app.cfg.registerSite, kitchen: app.cfg.kitchenSite });
  const catsBySection = () => {
    const out: Record<string, string[]> = {};
    for (const r of db.prepare('SELECT section, name FROM categories WHERE active = 1 ORDER BY section, sort').all() as { section: string; name: string }[]) (out[r.section] ??= []).push(r.name);
    return out;
  };
  const areaNames = () => db.prepare('SELECT name FROM areas WHERE active = 1 ORDER BY sort, name').pluck().all() as string[];

  if (live) {
    // النماذج والحسابات عبر Supabase: الإرسال مباشر، والنشر بعد موافقة الإدارة
    app.get('/submit', (req, reply) => reply.page(req, { title: 'أضف إعلانك', head: head() }, liveSubmitPage('', catsBySection(), areaNames(), addShopLink(req.settings.whatsapp_phone ?? ''))));
    app.get('/submit/:type', (req, reply) => {
      const type = (req.params as { type: string }).type;
      if (!isPostType(type) || !sectionEnabled(req.settings, type)) return reply.callNotFound();
      if (type === 'business') return reply.redirect(addShopLink(req.settings.whatsapp_phone ?? ''));
      return reply.page(req, { title: `أضف ${TYPES[type].single}`, canonical: '/submit', head: head() }, liveSubmitPage(type, catsBySection(), areaNames(), addShopLink(req.settings.whatsapp_phone ?? '')));
    });
    app.get('/owner', (req, reply) => reply.page(req, { title: 'أضف مطعمك أو محلك', description: 'سجّل مطعمك أو محلك في دليل المعامل وأدر قائمة الطعام والأسعار بنفسك.' }, ownerLandingPage()));
    app.get('/owner/register', (req, reply) => reply.page(req, { title: 'سجّل مطعمك أو محلك', noindex: true, head: head() }, ownerRegisterPage(catsBySection().business ?? [], areaNames(), app.cfg.publicUrl)));
    app.get('/login', (req, reply) => reply.page(req, { title: app.cfg.adminSite ? 'دخول الإدارة' : app.cfg.kitchenSite ? 'دخول المطعم' : 'دخول أصحاب المحلات', noindex: true, head: head(req) }, liveLoginPage(app.cfg.adminSite, app.cfg.kitchenSite)));
    app.get('/kitchen', (req, reply) => reply.page(req, { title: 'طلبات المطعم', noindex: true, canonical: null, head: html`${head(req)}<link rel="manifest" href="/manifest.webmanifest">` }, kitchenPage()));
    // صفحة متابعة الطلب للزبون (الموقع العام)
    app.get('/order', (req, reply) => reply.page(req, { title: 'حالة طلبك', noindex: true, canonical: null }, orderStatusPage()));
    app.get('/p', (req, reply) => reply.page(req, { title: 'إعلان جديد', noindex: true, canonical: null }, livePostPage(typeLabelsJson())));
    app.get('/owner/dashboard', (req, reply) => reply.page(req, { title: 'لوحة التحكم', noindex: true, canonical: null, head: head(req) }, dashboardPage()));
    app.get('/owner/menu', (req, reply) => reply.page(req, { title: 'القائمة والأسعار', noindex: true, canonical: null, head: head() }, menuManagerPage(app.cfg.kitchenSite ? '/kitchen' : '/owner/dashboard')));
    app.get('/admin', (req, reply) => reply.page(req, { title: 'لوحة الإدارة', noindex: true, canonical: null, head: head() }, adminLivePage()));
    // موقع الإدارة: إضافة المطاعم والمحلات بصورها وقائمتها، وإدارة قائمة أي محل
    app.get('/admin/business', (req, reply) => reply.page(req, { title: 'إضافة مطعم أو محل', noindex: true, canonical: null, head: head() }, adminBusinessPage(catsBySection().business ?? [], areaNames())));
    app.get('/admin/menu', (req, reply) => reply.page(req, { title: 'القائمة والأسعار', noindex: true, canonical: null, head: head() }, menuManagerPage('/admin')));
  } else {
    app.get('/submit', (req, reply) => reply.page(req, { title: 'أضف إعلانك' }, submitPage('', waLink(req.settings.whatsapp_phone), catsBySection())));
    app.get('/submit/:type', (req, reply) => {
      const type = (req.params as { type: string }).type;
      if (!isPostType(type) || !sectionEnabled(req.settings, type)) return reply.callNotFound();
      return reply.page(req, { title: `أضف ${TYPES[type].single}`, canonical: '/submit' }, submitPage(type, waLink(req.settings.whatsapp_phone), catsBySection()));
    });
    app.get('/owner', (req, reply) => reply.page(req, { title: 'أضف مطعمك أو محلك' }, notConfiguredPage(waLink(req.settings.whatsapp_phone))));
  }

  app.get('/publish', (req, reply) => {
    const cats = db.prepare('SELECT section, name FROM categories WHERE active = 1 ORDER BY section, sort').all() as { section: PostType; name: string }[];
    return reply.page(req, { title: 'نشر إعلان (للإدارة)', noindex: true, canonical: null }, html`<div class="wrap narrow">
      <h1>نشر إعلان على الموقع</h1>
      <p class="lede">هذه الصفحة لصاحب الموقع. تملأ الحقول، فيتجهز ملف الإعلان وتنفتح صفحة GitHub لحفظه. بعد الحفظ بدقيقة أو دقيقتين يظهر الإعلان في الموقع.</p>
      <p class="note">${icon('shield', 'i i-sm')}لا أحد يقدر ينشر إلا من عنده صلاحية الكتابة على مستودع GitHub. هذه الصفحة تجهّز الملف فقط.</p>
      <form class="form" data-publish data-repo="${app.cfg.repo}" novalidate>
        ${select({ name: 'type', label: 'القسم', required: true, placeholder: 'اختر', options: TYPE_KEYS.map((t) => [t, TYPES[t].label]) })}
        ${TYPE_KEYS.map((t) => html`<div data-for="${t}" hidden>${select({ name: `category_${t}`, label: 'التصنيف', required: true, placeholder: 'اختر', options: cats.filter((c) => c.section === t).map((c) => [c.name, c.name]) })}</div>`)}
        ${field({ name: 'title', label: 'العنوان', required: true, max: 100 })}
        ${field({ name: 'area', label: 'المنطقة', value: 'المعامل', required: true, max: 60 })}
        <div data-for="job property market offer" hidden>${field({ name: 'price', label: 'السعر أو الراتب (د.ع)', attrs: 'inputmode="numeric"' })}</div>
        ${TYPE_KEYS.map((t) => typeFieldGroup(t, `${t}_`))}
        <div data-for="business" hidden><div class="two">${field({ name: 'business_lat', label: 'خط العرض', dir: 'ltr', attrs: 'inputmode="decimal"' })}${field({ name: 'business_lng', label: 'خط الطول', dir: 'ltr', attrs: 'inputmode="decimal"' })}</div></div>
        <div data-for="business" hidden>${textarea({ name: 'menu', label: 'قائمة الأسعار', required: false, rows: 8, hint: 'كل صنف بسطر: «الاسم | السعر» مثل «تكة لحم | 6000»، أو الصق المنيو بصيغة واتساب: سطر القسم «*المشويات*» ثم «• نفر كباب — 12,000». الأحجام: «• بيتزا: صغير 5,000 / وسط 7,000».' })}</div>
        ${textarea({ name: 'body', label: 'الوصف', required: false, rows: 6, max: 4000 })}
        ${field({ name: 'phone', label: 'رقم التواصل', type: 'tel', dir: 'ltr', required: false, attrs: 'inputmode="tel"' })}
        ${checkbox({ name: 'show_phone', label: 'إظهار الرقم', checked: true })}
        ${checkbox({ name: 'whatsapp', label: 'الرقم عليه واتساب', checked: true })}
        <fieldset class="group"><legend>الصور <span class="opt">(اختياري، حتى ٦)</span></legend>
          <label class="btn btn-pick">${icon('image')}إضافة صور من المعرض<input type="file" accept="image/*" multiple data-pick-images aria-label="اختيار صور من المعرض"></label>
          <ul class="thumbs picked" data-picked aria-live="polite"></ul>
          <p class="hint">تُصغَّر الصور تلقائياً وتُحفظ مع الإعلان. أول صورة تظهر كصورة رئيسية.</p>
          <div data-for="business" hidden>
            <label class="btn btn-pick">${icon('store')}إضافة شعار المحل<input type="file" accept="image/*" data-pick-logo aria-label="اختيار شعار المحل"></label>
            <ul class="thumbs picked" data-picked-logo aria-live="polite"></ul>
          </div>
          <details><summary>صور مرفوعة مسبقاً على GitHub (متقدم)</summary>
            ${field({ name: 'images', label: 'أسماء الصور', required: false, hint: 'أسماء ملفات موجودة في مجلد content/images مفصولة بفاصلة: shop.jpg, menu.jpg', dir: 'ltr' })}
          </details>
        </fieldset>
        ${field({ name: 'expires', label: 'تاريخ انتهاء الإعلان', type: 'date', required: false, hint: 'اتركه فارغاً للمدة الافتراضية للقسم' })}
        ${checkbox({ name: 'featured', label: 'إعلان مميز (يظهر بالصفحة الرئيسية)' })}
        <div data-for="business help" hidden>${checkbox({ name: 'verified', label: 'تم التحقق فعلياً من البيانات (يظهر شارة موثّق)' })}</div>
        <div data-for="community" hidden>${checkbox({ name: 'official', label: 'خبر مؤكد من الإدارة' })}</div>
        <button class="btn btn-primary btn-lg" type="submit">تجهيز الإعلان</button>
      </form>
      <div data-publish-out hidden>
        <h2>ملف الإعلان جاهز</h2>
        <ol class="steps"><li>اضغط «حفظ في GitHub»، وراح تنفتح صفحة الملف وفيها النص جاهز.</li><li>انزل لآخر الصفحة واضغط <strong>Commit changes</strong>.</li><li>بعد دقيقة أو دقيقتين حدّث الموقع.</li></ol>
        <p class="flash flash-ok" data-paste-note hidden>الإعلان طويل (مثل منيو كامل)، لذلك تنفتح صفحة الملف فارغة والنص يُنسخ تلقائياً عند الضغط على «حفظ في GitHub». اضغط داخل مربع الكتابة في GitHub والصق النص (Ctrl+V)، ثم اضغط «Commit changes». إذا لم يُلصق شيء اضغط «نسخ النص» هنا أولاً.</p>
        <p class="btn-row"><a class="btn btn-sign" data-publish-link target="_blank" rel="noopener">حفظ في GitHub</a><button class="btn" type="button" data-copy>نسخ النص</button></p>
        <label for="publish-text">نص الملف</label>
        <textarea id="publish-text" rows="14" dir="ltr" readonly data-publish-text></textarea>
        <p class="hint">لحذف إعلان: افتح ملفه في مجلد content/listings على GitHub واحذفه. لتعديله: عدّل الملف.</p>
      </div>
    </div>`);
  });
}
