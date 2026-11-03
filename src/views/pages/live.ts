// صفحات النسخة الثابتة التفاعلية (تعمل عبر Supabase من المتصفح). الصفحة نفسها هيكل ثابت،
// و/static/js/live.js يملؤها. كل ما يُعرض من البيانات يُكتب كنص (textContent) لا كـ HTML.
import { kitsJson } from '../category-kits.ts';
import { html, type SafeHtml } from '../../lib/html.ts';
import { TYPES, TYPE_KEYS, type PostType } from '../../domain/types.ts';
import { checkbox, field, select, textarea } from '../components.ts';
import { icon } from '../layout.ts';
import { typeFieldGroup, typeTextJson } from '../type-fields.ts';

export interface LiveCfg { url: string; key: string; v: string; wa?: string; admin?: boolean; register?: boolean; kitchen?: boolean }

/** وسوم الإعداد ومكتبة Supabase وسكربت الصفحات التفاعلية. */
export const liveHead = (c: LiveCfg) => html`<meta name="sb-url" content="${c.url}"><meta name="sb-key" content="${c.key}"><meta name="support-wa" content="${c.wa ?? ''}"><meta name="admin-site" content="${c.admin ? '1' : '0'}"><meta name="register-site" content="${c.register ? '1' : '0'}"><meta name="kitchen-site" content="${c.kitchen ? '1' : '0'}">
<script src="/static/vendor/supabase.js?v=${c.v}" defer></script><script src="/static/js/live.js?v=${c.v}" defer></script>`;

const msg = html`<div class="live-msg" data-msg role="status" aria-live="polite"></div>`;
const noJs = html`<noscript><p class="note">هذه الصفحة تحتاج تفعيل JavaScript.</p></noscript>`;
const PRICE_TYPES: PostType[] = ['job', 'property', 'market', 'offer'];
/** أسعار الإعلانات والتمييز (تطابق ad_fee و feature_fee في supabase/schema.sql). */
export const pricingNote = html`<p class="note note-price">${icon('tag', 'i i-sm')}<strong>الإعلان الأول مجاني.</strong> كل إعلان بعده 3,000 د.ع، ويُنشر بعد الدفع. وتگدر تميّز إعلانك أو مطعمك بأول الصفحة لمدة 10 أيام بـ 3,000 د.ع.</p>`;

export function liveSubmitPage(type: PostType | '', cats: Record<string, string[]>, areas: string[], addShop = '/contact'): SafeHtml {
  const guestTypes = TYPE_KEYS.filter((t) => t !== 'business');
  return html`<div class="wrap narrow" data-page="submit">
    <h1>أضف إعلانك</h1>
    <p class="lede">املأ الإعلان وأرسله مباشرة. ما تحتاج حساب، والإعلان يظهر بعد مراجعة الإدارة.</p>
    <p class="note">${icon('store', 'i i-sm')}عندك مطعم أو محل؟ <a href="${addShop}" target="_blank" rel="noopener">راسل خدمة العملاء على واتساب</a> ونضيفه لك مع صوره وقائمة أسعاره.</p>
    ${pricingNote}
    ${msg}${noJs}
    <form class="form" data-live-submit data-cats="${JSON.stringify(cats)}" data-texts="${typeTextJson()}" novalidate>
      ${select({ name: 'type', label: 'نوع الإعلان', required: true, value: type === 'business' ? '' : type, placeholder: 'اختر', options: guestTypes.map((t) => [t, TYPES[t].single]) })}
      ${select({ name: 'category', label: 'التصنيف', required: true, placeholder: 'اختر نوع الإعلان أولاً', options: [] })}
      ${field({ name: 'title', label: 'العنوان', required: true, max: 100 })}
      ${select({ name: 'area', label: 'المنطقة', required: true, value: areas[0] ?? 'المعامل', options: areas.map((a) => [a, a]) })}
      <div data-for="${PRICE_TYPES.join(' ')}" hidden>${field({ name: 'price', label: 'السعر أو الراتب (د.ع)', attrs: 'inputmode="numeric"', hint: 'اتركه فارغاً إذا يحدد عند التواصل' })}</div>
      ${guestTypes.map((t) => typeFieldGroup(t, `d_${t}_`))}
      <div data-for="help" hidden><p class="note note-warn">${icon('shield', 'i i-sm')}لا ترفع وثائق طبية ولا تكتب اسم المريض الكامل أو عنوانه.</p></div>
      ${textarea({ name: 'body', label: 'التفاصيل', required: true, max: 4000, rows: 5 })}
      <fieldset class="group"><legend>التواصل</legend>
        <div data-guest-only>${field({ name: 'guest_name', label: 'اسمك', required: true, max: 60, hint: 'للإدارة فقط، ما يظهر بالإعلان' })}</div>
        ${field({ name: 'contact_phone', label: 'رقم التواصل', type: 'tel', dir: 'ltr', required: true, attrs: 'inputmode="tel"' })}
        ${checkbox({ name: 'show_phone', label: 'إظهار الرقم بالإعلان', checked: true })}
        ${checkbox({ name: 'whatsapp', label: 'الرقم عليه واتساب', checked: true })}
      </fieldset>
      <fieldset class="group"><legend>الصور <span class="opt">(اختياري، حتى ٣)</span></legend>
        <input id="f-images" type="file" name="images" accept="image/*" multiple data-max="3" aria-label="الصور">
        <ul class="thumbs" data-preview aria-live="polite"></ul>
      </fieldset>
      <div class="hp" aria-hidden="true"><label>اتركه فارغاً <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <button class="btn btn-primary btn-lg" type="submit">إرسال الإعلان</button>
    </form></div>`;
}

export function ownerLandingPage(): SafeHtml {
  return html`<div class="wrap narrow">
    <h1>أضف مطعمك أو محلك</h1>
    <p class="lede">صفحة خاصة بأصحاب المطاعم والمحلات والخدمات في المعامل. تسجل مرة وحدة، نتحقق إنك صاحب النشاط، وبعدها تدير صفحتك بنفسك.</p>
    <ol class="steps">
      <li>سوّي حسابك ومعلومات محلك (دقيقتين).</li>
      <li>الإدارة تتحقق إن المحل إلك فعلاً، عادةً باتصال على رقم المحل.</li>
      <li>بعد الاعتماد تنشر صفحتك، وتدير قائمة الطعام أو المنتجات بالأسعار والصور، وحالة المحل.</li>
    </ol>
    <div class="owner-features">
      <p>${icon('utensils', 'i i-sm')}قائمة طعام كاملة بأقسام وصور وأسعار، وزر «اطلب عبر واتساب» لكل صنف</p>
      <p>${icon('tag', 'i i-sm')}عروض ووظائف لمحلك</p>
      <p>${icon('clock', 'i i-sm')}حالة المحل: مفتوح أو مغلق</p>
      <p>${icon('badge', 'i i-sm')}شارة «موثّق» بعد التحقق من بياناتك</p>
      <p>${icon('percent', 'i i-sm')}التسجيل مجاني، ونسبة ٥٪ فقط على الطلبات اللي توصلك من الموقع</p>
    </div>
    <p class="btn-row"><a class="btn btn-sign btn-lg" href="/owner/register">${icon('plus')}سجّل مطعمك أو محلك</a><a class="btn btn-lg" href="/login">عندي حساب: دخول</a></p>
  </div>`;
}

export function ownerRegisterPage(cats: string[], areas: string[], publicUrl = ''): SafeHtml {
  const pol = (k: string) => publicUrl ? `${publicUrl.replace(/\/+$/, '')}/policies/${k}/` : `/policies/${k}`;
  return html`<div class="wrap narrow" data-page="register">
    <h1>سجّل مطعمك أو محلك في دليل المعامل</h1>
    <p class="lede">سوّي حساب، واكتب معلومات محلك، وأضف شعارك وصورك وقائمة أسعارك. بعد موافقة الإدارة تنشر صفحتك بالموقع.</p>
    <p class="note">${icon('shield', 'i i-sm')}صفحتك ما تظهر للناس إلا بعد ما نتحقق إنك صاحب النشاط. صورة الإثبات لا يراها إلا مدير الموقع.</p>
    ${msg}${noJs}
    <form class="form" data-step="account" novalidate>
      <fieldset class="group"><legend>١. حسابك</legend>
        ${field({ name: 'name', label: 'اسمك', required: true, max: 60, attrs: 'autocomplete="name"' })}
        ${field({ name: 'phone', label: 'رقم هاتفك', required: true, type: 'tel', dir: 'ltr', attrs: 'autocomplete="tel" inputmode="tel"' })}
        ${field({ name: 'email', label: 'البريد الإلكتروني (للدخول)', required: true, type: 'email', dir: 'ltr', attrs: 'autocomplete="email"' })}
        ${field({ name: 'password', label: 'كلمة المرور', required: true, type: 'password', hint: '١٠ أحرف على الأقل', attrs: 'autocomplete="new-password" minlength="10"' })}
        <div class="check"><input type="checkbox" id="f-agree" name="agree" required><label for="f-agree">قرأت <a href="${pol('terms')}" target="_blank" rel="noopener">شروط الاستخدام</a> و<a href="${pol('privacy')}" target="_blank" rel="noopener">سياسة الخصوصية</a> وأوافق عليها</label></div>
        <button class="btn btn-primary btn-lg" type="submit">التالي</button>
      </fieldset>
    </form>
    <form class="form" data-step="business" data-kits="${kitsJson()}" hidden novalidate>
      <fieldset class="group"><legend>٢. معلومات المحل</legend>
        ${field({ name: 'title', label: 'اسم المطعم أو المحل', required: true, max: 100 })}
        ${select({ name: 'category', label: 'نوع النشاط', required: true, placeholder: 'اختر', options: cats.map((c) => [c, c]) })}
        ${select({ name: 'area', label: 'المنطقة', required: true, value: areas[0], options: areas.map((a) => [a, a]) })}
        ${field({ name: 'address', label: 'العنوان', required: true, max: 200, hint: 'الشارع أو أقرب نقطة دالة' })}
        ${field({ name: 'hours', label: 'ساعات العمل', max: 200 })}
        ${field({ name: 'delivery', label: 'مناطق التوصيل', max: 300 })}
        ${field({ name: 'contact_phone', label: 'رقم المحل للطلبات', required: true, type: 'tel', dir: 'ltr', attrs: 'inputmode="tel"' })}
        ${checkbox({ name: 'whatsapp', label: 'رقم المحل عليه واتساب', checked: true })}
        ${textarea({ name: 'services', label: 'الخدمات أو الأطباق الرئيسية', max: 1000, rows: 3 })}
        ${textarea({ name: 'body', label: 'وصف قصير', max: 2000, rows: 3 })}
      </fieldset>
      <fieldset class="group"><legend>الصور <span class="opt">(اختياري)</span></legend>
        <label class="btn btn-pick">${icon('store')}شعار المحل<input type="file" name="logo" accept="image/*" aria-label="شعار المحل" data-preview-into="logo-preview"></label>
        <ul class="thumbs picked" id="logo-preview" aria-live="polite"></ul>
        <label class="btn btn-pick">${icon('image')}صور المحل من المعرض (حتى ٦)<input type="file" name="photos" accept="image/*" multiple aria-label="صور المحل" data-preview-into="photos-preview"></label>
        <ul class="thumbs picked" id="photos-preview" aria-live="polite"></ul>
      </fieldset>
      <fieldset class="group"><legend>القائمة والأسعار <span class="opt">(اختياري)</span></legend>
        ${textarea({ name: 'menu', label: 'اكتب أو الصق قائمتك', rows: 8, max: 30000, hint: 'كل قسم بسطر مثل «*المشويات*»، وتحته الأصناف مثل «• نفر كباب — 12,000». أو «الاسم | السعر».' })}
      </fieldset>
      <fieldset class="group"><legend>٣. إثبات الملكية</legend>
        ${textarea({ name: 'message', label: 'كيف نتأكد إن المحل إلك؟', required: true, max: 1000, rows: 3, hint: 'مثلاً: اتصلوا على رقم المحل بين ٤ و٦ العصر.' })}
        <label for="f-proof">صورة واجهة المحل أو لافتته <span class="opt">(اختياري، لا تُنشر)</span></label>
        <input id="f-proof" type="file" name="proof" accept="image/*">
      </fieldset>
      <p class="note">${icon('info', 'i i-sm')}التسجيل بالموقع مجاني. على الطلبات اللي توصلك من سلة الموقع نسبة <b>٥٪</b> من مجموعها، تُدفع آخر كل شهر. تشوف كشف طلباتك بلوحة التحكم، وسعر الأكل للزبون ما يتغير.</p>
      <div class="check"><input type="checkbox" id="f-commission" name="commission" required><label for="f-commission">أوافق على نسبة ٥٪ من الطلبات اللي تجي من الموقع</label></div>
      <button class="btn btn-primary btn-lg" type="submit">إرسال للتحقق</button>
    </form></div>`;
}

export function liveLoginPage(admin = false, kitchen = false, publicUrl = ''): SafeHtml {
  return html`<div class="wrap narrow" data-page="login">
    <h1>${admin ? 'دخول الإدارة' : kitchen ? 'دخول أصحاب المحلات' : 'دخول أصحاب المحلات'}</h1>
    ${admin ? '' : kitchen ? html`<p class="lede">لوحة صاحب المحل أو المطعم: أضف منتجاتك وأسعارك وصورك، عدّل معلومات محلك، واستلم الطلبات.</p>` : html`<p class="lede">لنشر إعلان عادي ما تحتاج حساب: <a href="/submit">أضف إعلانك</a>.</p>`}
    ${msg}${noJs}
    <form class="form" data-login novalidate>
      ${field({ name: 'email', label: 'البريد الإلكتروني', required: true, type: 'email', dir: 'ltr', attrs: 'autocomplete="email"' })}
      ${field({ name: 'password', label: 'كلمة المرور', required: true, type: 'password', attrs: 'autocomplete="current-password"' })}
      <button class="btn btn-primary btn-block" type="submit">دخول</button>
    </form>
    <p><button class="linklike link" type="button" data-reset>نسيت كلمة المرور؟</button></p>
    ${kitchen ? html`<div class="owner-join"><p><b>ما عندك حساب؟</b> سجّل محلك أو مطعمك، وبعد موافقة الإدارة تدير صفحتك من هنا.</p><a class="btn btn-sign btn-lg btn-block" href="${(publicUrl || '/').replace(/\/+$/, '')}/tasjeel/">${icon('plus')}سجّل محلك الآن</a></div>` : ''}
    ${admin || kitchen ? html`<details class="panel"><summary>${admin ? 'أول مرة؟ إنشاء حساب الإدارة' : 'محلك مضاف من الإدارة؟ أنشئ حسابك هنا'}</summary>
      <p class="hint">${admin ? html`بعد إنشاء الحساب، شغّل في Supabase ← SQL Editor: <code dir="ltr">select public.make_admin('بريدك');</code> ثم سجّل الدخول.` : 'بعد إنشاء الحساب، أرسل بريدك لخدمة العملاء حتى نربطه بمطعمك، وبعدها سجّل الدخول.'}</p>
      <form class="form" data-signup novalidate>
        ${field({ name: 'su_name', label: 'الاسم', required: true, max: 60 })}
        ${field({ name: 'su_phone', label: 'رقم الهاتف', required: true, type: 'tel', dir: 'ltr', attrs: 'inputmode="tel"' })}
        ${field({ name: 'su_email', label: 'البريد الإلكتروني', required: true, type: 'email', dir: 'ltr' })}
        ${field({ name: 'su_password', label: 'كلمة المرور', required: true, type: 'password', hint: '١٠ أحرف على الأقل', attrs: 'minlength="10" autocomplete="new-password"' })}
        <button class="btn" type="submit">إنشاء الحساب</button>
      </form></details>` : html`<p>عندك مطعم أو محل؟ راسل خدمة العملاء على واتساب ونضيفه لك.</p>`}
  </div>`;
}

export function dashboardPage(publicUrl = '', support = ''): SafeHtml {
  const pub = (p: string) => (publicUrl ? publicUrl.replace(/\/+$/, '') + p : p);
  return html`<div class="wrap" data-page="dashboard" data-kits="${kitsJson()}">
    <div class="page-head"><div><h1>صفحتي</h1><p class="lede" data-who></p></div>
      <div class="btn-row">${publicUrl ? html`<a class="btn btn-sign" href="${support}" target="_blank" rel="noopener">${icon('whatsapp')}خدمة العملاء</a>` : html`<a class="btn btn-sign" href="/owner/register">${icon('plus')}إضافة مطعم أو محل</a>`}<button class="btn" type="button" data-logout>${icon('logout')}خروج</button></div></div>
    ${msg}${noJs}
    <section aria-labelledby="h-biz"><h2 id="h-biz">محلاتي</h2><div data-businesses><div class="skeleton" aria-label="جارِ التحميل"><span class="sk"></span><span class="sk"></span><span class="sk"></span></div></div></section>
    <section class="block" aria-labelledby="h-ads"><h2 id="h-ads">إعلاناتي</h2>
      <p class="btn-row"><a class="btn btn-sm" href="${pub('/submit/offer/')}">${icon('percent', 'i i-sm')}أضف عرضاً</a><a class="btn btn-sm" href="${pub('/submit/job/')}">${icon('briefcase', 'i i-sm')}أضف وظيفة</a></p>
      <div data-ads></div></section>
    <section class="block" aria-labelledby="h-orders"><h2 id="h-orders">الطلبات من الموقع</h2>
      <p class="muted">الطلبات اللي أرسلها الزبائن من سلة الموقع إلى واتسابك. نسبة الموقع ٥٪ من مجموعها، تُدفع آخر كل شهر.</p>
      <div data-commission></div></section>
    <p class="hint">التعديلات تظهر بصفحتك بالموقع بعد التحديث التلقائي.</p>
  </div>`;
}

export function menuManagerPage(back = '/owner/dashboard'): SafeHtml {
  return html`<div class="wrap narrow" data-page="menu" data-kits="${kitsJson()}">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="${back}">${back === '/admin' ? 'لوحة الإدارة' : 'لوحة التحكم'}</a><span aria-hidden="true">/</span><span aria-current="page" data-biz-name>القائمة</span></nav>
    <h1>القائمة والأسعار</h1>
    ${msg}${noJs}
    <section class="panel" aria-labelledby="h-add"><h2 id="h-add">إضافة صنف</h2>
      <form class="form" data-add-item novalidate>
        ${field({ name: 'section', label: 'القسم', max: 60, hint: 'مثل: مشويات، سندويشات، مشروبات', attrs: 'list="sections"' })}
        <datalist id="sections"></datalist>
        <div class="two">${field({ name: 'name', label: 'اسم الصنف', required: true, max: 80 })}${field({ name: 'price', label: 'السعر (د.ع)', attrs: 'inputmode="numeric"' })}</div>
        ${field({ name: 'note', label: 'وصف قصير', max: 200 })}
        <label for="f-image">صورة الصنف <span class="opt">(اختياري)</span></label><input id="f-image" type="file" name="image" accept="image/*">
        <button class="btn btn-primary" type="submit">${icon('plus')}إضافة</button>
      </form></section>
    <div data-items></div>
    <p class="hint">التغييرات تظهر بصفحة المحل خلال ربع ساعة تقريباً.</p>
  </div>`;
}

export function adminLivePage(): SafeHtml {
  return html`<div class="wrap" data-page="admin">
    <div class="page-head"><div><h1>لوحة الإدارة</h1><p class="lede">المعتمد يظهر بالموقع خلال ربع ساعة تقريباً.</p></div>
      <div class="btn-row"><a class="btn btn-sign" href="/admin/business">${icon('plus')}إضافة مطعم أو محل</a><button class="btn" type="button" data-logout>${icon('logout')}خروج</button></div></div>
    ${msg}${noJs}
    <ul class="stats" aria-label="ملخص">
      <li class="stat"><a href="#pending"><span class="stat-ico">${icon('clock')}</span><b class="stat-n" data-stat="pending">—</b>بانتظار المراجعة</a></li>
      <li class="stat"><a href="#claims"><span class="stat-ico">${icon('store')}</span><b class="stat-n" data-stat="claims">—</b>طلبات أصحاب المحلات</a></li>
      <li class="stat"><a href="#products"><span class="stat-ico">${icon('image')}</span><b class="stat-n" data-stat="products">—</b>منتجات بانتظار الموافقة</a></li>
      <li class="stat"><a href="#riders"><span class="stat-ico">${icon('bike')}</span><b class="stat-n" data-stat="riders">—</b>تسجيلات دلفري جديدة</a></li>
      <li class="stat"><a href="#published"><span class="stat-ico">${icon('check')}</span><b class="stat-n" data-stat="published">—</b>منشور حالياً</a></li>
      <li class="stat stat-gold"><a href="#commission"><span class="stat-ico">${icon('percent')}</span><b class="stat-n" data-stat="due">—</b>نسبة مستحقة هذا الشهر (د.ع)</a></li>
    </ul>
    <nav class="menu-tabs" aria-label="أقسام الإدارة">
      <a href="#pending">بانتظار المراجعة <span class="count" data-count="pending"></span></a>
      <a href="#claims">طلبات أصحاب المحلات <span class="count" data-count="claims"></span></a>
      <a href="#products">منتجات جديدة <span class="count" data-count="products"></span></a>
      <a href="#riders">دلفري حر <span class="count" data-count="riders"></span></a>
      <a href="#published">المنشور حالياً</a>
      <a href="#commission">نسبة الطلبات</a>
    </nav>
    <section id="pending" class="block"><h2>بانتظار المراجعة</h2><div data-pending><div class="skeleton" aria-label="جارِ التحميل"><span class="sk"></span><span class="sk"></span><span class="sk"></span></div></div></section>
    <section id="claims" class="block"><h2>طلبات أصحاب المحلات</h2><div data-claims></div></section>
    <section id="products" class="block"><h2>منتجات جديدة بانتظار الموافقة</h2><p class="muted">منتجات أضافها أصحاب المحلات بصورها. السعر والتوفر يتعدلون بدون موافقة.</p><div data-products></div></section>
    <section id="riders" class="block"><h2>دلفري حر</h2><p class="muted">قبل الموافقة: اتصل بيه، وطابق الاسم وية الهوية. الهوية والعنوان يظهرون هنا فقط.</p><div data-riders-admin></div>
      <h3>تسعيرة الكروة</h3><p class="muted">تطلع للكل بصفحة «دلفري حر». خلي السعر فارغ إذا «اتفاق».</p><div data-fares-admin></div></section>
    <section id="published" class="block"><h2>المنشور حالياً</h2><div data-published></div></section>
    <section id="commission" class="block"><h2>نسبة الطلبات (٥٪)</h2>
      <p class="muted">كل طلب يُرسل من سلة الموقع إلى واتساب المطعم يُسجَّل هنا. استلم النسبة من كل مطعم آخر الشهر واضغط «تم الدفع».</p>
      <div data-commission></div></section>
  </div>`;
}

/** موقع الإدارة: إضافة مطعم أو محل كاملاً (معلومات، شعار، صور، قائمة) ونشره مباشرة. */
export function adminBusinessPage(cats: string[], areas: string[]): SafeHtml {
  return html`<div class="wrap narrow" data-page="add-business">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/admin">لوحة الإدارة</a><span aria-hidden="true">/</span><span aria-current="page">إضافة مطعم أو محل</span></nav>
    <h1>إضافة مطعم أو محل</h1>
    <p class="lede">املأ معلومات المحل وأضف صوره وقائمته، ويُنشر بالموقع مباشرة (خلال ربع ساعة تقريباً).</p>
    ${msg}${noJs}
    <form class="form" data-add-business data-kits="${kitsJson()}" novalidate>
      <fieldset class="group"><legend>معلومات المحل</legend>
        ${field({ name: 'title', label: 'اسم المطعم أو المحل', required: true, max: 100 })}
        ${select({ name: 'category', label: 'نوع النشاط', required: true, placeholder: 'اختر', options: cats.map((c) => [c, c]) })}
        ${select({ name: 'area', label: 'المنطقة', required: true, value: areas[0], options: areas.map((a) => [a, a]) })}
        ${field({ name: 'address', label: 'العنوان', required: true, max: 200, hint: 'الشارع أو أقرب نقطة دالة' })}
        ${field({ name: 'hours', label: 'ساعات العمل', max: 200 })}
        ${field({ name: 'delivery', label: 'مناطق التوصيل', max: 300 })}
        ${textarea({ name: 'services', label: 'الخدمات أو الأطباق الرئيسية', max: 1000, rows: 2 })}
        ${field({ name: 'contact_phone', label: 'رقم المحل للطلبات', required: true, type: 'tel', dir: 'ltr', attrs: 'inputmode="tel"' })}
        ${checkbox({ name: 'whatsapp', label: 'رقم المحل عليه واتساب (يفعّل سلة الطلب)', checked: true })}
        ${textarea({ name: 'body', label: 'وصف قصير', max: 2000, rows: 3 })}
        ${checkbox({ name: 'verified', label: 'تم التحقق من بيانات المحل (شارة «موثّق»)', checked: true })}
      </fieldset>
      <fieldset class="group"><legend>الصور</legend>
        <label class="btn btn-pick">${icon('store')}شعار المحل<input type="file" name="logo" accept="image/*" aria-label="شعار المحل" data-preview-into="logo-preview"></label>
        <ul class="thumbs picked" id="logo-preview" aria-live="polite"></ul>
        <label class="btn btn-pick">${icon('image')}صور المحل من المعرض (حتى ٦)<input type="file" name="photos" accept="image/*" multiple aria-label="صور المحل" data-preview-into="photos-preview"></label>
        <ul class="thumbs picked" id="photos-preview" aria-live="polite"></ul>
      </fieldset>
      <fieldset class="group"><legend>القائمة والأسعار <span class="opt">(اختياري)</span></legend>
        ${textarea({ name: 'menu', label: 'الصق القائمة', rows: 10, max: 30000, hint: 'بصيغة واتساب: سطر القسم «*المشويات*» ثم «• نفر كباب — 12,000». الأحجام: «• بيتزا: صغير 5,000 / وسط 7,000». أو «الاسم | السعر». تقدر تعدّل الأصناف وتضيف صورها بعد الحفظ.' })}
      </fieldset>
      <button class="btn btn-primary btn-lg" type="submit">${icon('check')}حفظ ونشر المحل</button>
    </form>
  </div>`;
}

export function notConfiguredPage(wa: string): SafeHtml {
  return html`<div class="wrap narrow"><h1>هذه الخدمة قيد الإعداد</h1><p>أرسل طلبك على <a href="${wa}">واتساب الدعم</a> وراح نضيفه.</p></div>`;
}

/** موقع المطعم: استلام الطلبات مباشرة بإشعار وصوت، مع القبول والرفض. */
export function kitchenPage(): SafeHtml {
  return html`<div class="wrap" data-page="kitchen">
    <div class="page-head"><div><h1>الطلبات</h1><p class="lede" data-who></p></div>
      <div class="btn-row"><button class="btn" type="button" data-logout>${icon('logout')}خروج</button></div></div>
    ${msg}${noJs}
    <div class="kitchen-bar" data-kitchen-bar hidden>
      <button class="btn btn-primary btn-lg" type="button" data-start>${icon('bell')}ابدأ استلام الطلبات</button>
      <p class="hint">اضغط حتى يشتغل صوت التنبيه والإشعارات. خلي هذه الصفحة مفتوحة والشاشة شغالة.</p>
    </div>
    <p class="kitchen-live" data-live hidden><span class="dot" aria-hidden="true"></span><span data-live-text>متصل، بانتظار الطلبات</span>
      <button class="linklike" type="button" data-test-sound>تجربة الصوت</button></p>
    <section class="block" aria-labelledby="h-new"><h2 id="h-new">طلبات جديدة <span class="count" data-n="new">٠</span></h2><ul class="orders" data-list="new"></ul></section>
    <section class="block" aria-labelledby="h-acc"><h2 id="h-acc">قيد التجهيز والتوصيل <span class="count" data-n="accepted">٠</span></h2><ul class="orders" data-list="accepted"></ul></section>
    <details class="block panel"><summary>طلبات منتهية (آخر يومين) <span class="count" data-n="closed">٠</span></summary><ul class="orders" data-list="closed"></ul></details>
    <section class="block" aria-labelledby="h-orders"><h2 id="h-orders">كشف الطلبات الشهري</h2>
      <p class="muted">نسبة الموقع ٥٪ من مجموع الطلبات المقبولة، تُدفع آخر كل شهر.</p>
      <div data-commission></div></section>
  </div>`;
}

/** صفحة الزبون: متابعة حالة الطلب بعد إرساله للمطعم. */
export function orderStatusPage(): SafeHtml {
  return html`<div class="wrap narrow" data-order-status>
    <h1>حالة طلبك</h1>
    <div class="order-card panel" data-order-box aria-live="polite"><div class="skeleton" aria-label="جارِ التحميل"><span class="sk sk-sm"></span><span class="sk"></span><span class="sk sk-sm"></span></div></div>
    <noscript><p class="note">هذه الصفحة تحتاج JavaScript.</p></noscript>
  </div>`;
}

// ---------- دلفري حر ----------
export const VEHICLES = ['دراجة نارية', 'ستوتة', 'سيارة', 'دراجة هوائية'];

/** قائمة أصحاب التوصيل المعتمدين: تُحمّل من public_riders (بدون العنوان والهوية). */
export function deliveryPage(): SafeHtml {
  return html`<div class="wrap" data-page="delivery">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span aria-hidden="true">/</span><span aria-current="page">دلفري حر</span></nav>
    <div class="page-head"><div><h1>دلفري حر</h1>
      <p class="lede">تحتاج أحد يوصلك غرض؟ أكل، أدوية، أغراض من السوق، أو تسلم وتستلم. اتصل مباشرة بصاحب الدراجة القريب منك، والكروة حسب التسعيرة المعتمدة جوة.</p></div>
      <a class="btn btn-sign" href="/delivery/join">${icon('plus')}سجّل كدلفري</a></div>
    <p class="note">${icon('shield', 'i i-sm')}كل واحد بالقائمة سلّم هويته الوطنية وعنوانه للإدارة قبل ما ينشر، حتى تتعامل وياه وانت مطمّن.</p>
    ${msg}${noJs}
    <section class="fares" data-fares aria-labelledby="h-fares" hidden><h2 id="h-fares">الكروة المعتمدة</h2>
      <p class="muted">هاي التسعيرة الي يلتزم بيها كل دلفري بالقائمة. إذا واحد كاتب كروة أقل على بطاقته، تاخذ الأقل.</p>
      <div class="fares-grid"><div><h3>حسب المسافة</h3><dl data-fares-zone></dl></div><div><h3>إضافات</h3><dl data-fares-extra></dl></div></div></section>
    <div class="field rider-filter"><label for="rider-q" class="sr">ابحث بالمنطقة أو الاسم</label>
      <input id="rider-q" type="search" placeholder="ابحث بالمنطقة أو الاسم" data-rider-q autocomplete="off"></div>
    <ul class="rider-list" data-riders aria-live="polite"><li class="skeleton" aria-label="جارِ التحميل"><span class="sk"></span><span class="sk"></span></li></ul>
  </div>`;
}

/** تسجيل صاحب دراجة: البيانات العامة + العنوان والهوية (للإدارة فقط). */
export function riderJoinPage(areas: string[]): SafeHtml {
  return html`<div class="wrap narrow" data-page="rider-join">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/delivery">دلفري حر</a><span aria-hidden="true">/</span><span aria-current="page">التسجيل</span></nav>
    <h1>سجّل كدلفري حر</h1>
    <p class="lede">عندك دراجة أو ستوتة أو سيارة وتريد تشتغل توصيل؟ سجّل هنا، وبعد ما تتأكد الإدارة من هويتك يطلع اسمك ورقمك للزبائن.</p>
    ${msg}${noJs}
    <form class="form" data-rider-form novalidate>
      <fieldset class="group"><legend>معلوماتك اللي تطلع للزبائن</legend>
        ${field({ name: 'name', label: 'اسمك', required: true, max: 60 })}
        ${field({ name: 'phone', label: 'رقمك', type: 'tel', dir: 'ltr', required: true, attrs: 'inputmode="tel"', hint: 'يطلع للزبائن حتى يتصلون بيك' })}
        ${checkbox({ name: 'whatsapp', label: 'رقمي عليه واتساب', checked: true })}
        ${select({ name: 'vehicle', label: 'شنو تستخدم للتوصيل', required: true, placeholder: 'اختر', options: VEHICLES.map((v) => [v, v]) })}
        ${field({ name: 'areas', label: 'وين تكدر توصل', required: true, max: 200, hint: `مثلاً: ${areas.slice(0, 3).join('، ') || 'المعامل'} وكل قضاء الزوراء` })}
        ${field({ name: 'hours', label: 'أوقات الشغل', max: 80, hint: 'مثلاً: من ٩ الصبح لـ ١٢ بالليل' })}
        ${textarea({ name: 'note', label: 'ملاحظة للزبائن', max: 300, rows: 2, hint: 'مثلاً: أوصل أكل وأدوية وأغراض' })}
      </fieldset>
      <section class="fares" data-fares aria-labelledby="h-fares" hidden><h2 id="h-fares">الكروة المعتمدة</h2>
      <p class="muted">بالتسجيل تلتزم بهاي التسعيرة. إذا تريد تشتغل بأقل منها اكتب كروتك تحت وتطلع على بطاقتك.</p>
      <div class="fares-grid"><div><h3>حسب المسافة</h3><dl data-fares-zone></dl></div><div><h3>إضافات</h3><dl data-fares-extra></dl></div></div></section>
      <fieldset class="group"><legend>كروتك</legend>
        ${field({ name: 'min_fare', label: 'أقل كروة تاخذها (د.ع)', max: 6, attrs: 'inputmode="numeric"', hint: 'اختياري: إذا تريد تشتغل بأقل من التسعيرة، مثلاً 1500. تطلع على بطاقتك للزبائن.' })}
      </fieldset>
      <fieldset class="group"><legend>للإدارة فقط (ما تطلع لأي أحد)</legend>
        <p class="note">${icon('shield', 'i i-sm')}هويتك وعنوانك تنحفظ عند الإدارة بمكان خاص للأمان فقط، وما تنعرض بالموقع ولا تنطي لأي زبون.</p>
        ${field({ name: 'address', label: 'عنوانك بالضبط', required: true, max: 300, hint: 'المنطقة، المحلة، الزقاق، الدار، وأقرب نقطة دالة' })}
        <div class="field"><span class="label">صورة الهوية الوطنية (الوجه)</span>
          <label class="btn btn-pick">${icon('image')}اختار صورة الوجه<input type="file" name="id_front" accept="image/*" required aria-label="صورة الهوية الوطنية من الوجه" data-preview-into="idf-preview"></label>
          <ul class="thumbs picked" id="idf-preview" aria-live="polite"></ul></div>
        <div class="field"><span class="label">صورة الهوية الوطنية (الظهر)</span>
          <label class="btn btn-pick">${icon('image')}اختار صورة الظهر<input type="file" name="id_back" accept="image/*" required aria-label="صورة الهوية الوطنية من الظهر" data-preview-into="idb-preview"></label>
          <ul class="thumbs picked" id="idb-preview" aria-live="polite"></ul></div>
      </fieldset>
      ${checkbox({ name: 'agree', label: 'أتعهد إن المعلومات صحيحة، وألتزم بالكروة المعتمدة (أو كروتي إذا أقل)، وأوافق إن الإدارة تحتفظ بهويتي وعنواني للأمان وتلغي تسجيلي إذا وصلت شكوى' })}
      <div class="hp" aria-hidden="true"><label for="f-website">اتركه فارغاً</label><input id="f-website" name="website" tabindex="-1" autocomplete="off"></div>
      <button class="btn btn-primary btn-lg" type="submit">${icon('check')}إرسال التسجيل</button>
    </form>
  </div>`;
}
