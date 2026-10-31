// صفحات النسخة الثابتة التفاعلية (تعمل عبر Supabase من المتصفح). الصفحة نفسها هيكل ثابت،
// و/static/js/live.js يملؤها. كل ما يُعرض من البيانات يُكتب كنص (textContent) لا كـ HTML.
import { html, type SafeHtml } from '../../lib/html.ts';
import { TYPES, TYPE_KEYS, type PostType } from '../../domain/types.ts';
import { checkbox, field, select, textarea } from '../components.ts';
import { icon } from '../layout.ts';
import { typeFieldGroup, typeTextJson } from '../type-fields.ts';

export interface LiveCfg { url: string; key: string; v: string; wa?: string }

/** وسوم الإعداد ومكتبة Supabase وسكربت الصفحات التفاعلية. */
export const liveHead = (c: LiveCfg) => html`<meta name="sb-url" content="${c.url}"><meta name="sb-key" content="${c.key}"><meta name="support-wa" content="${c.wa ?? ''}">
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
    <p class="note">${icon('store', 'i i-sm')}عندك مطعم أو محل؟ <a href="${addShop}">سجّله من هنا</a>: تكتب معلوماته وتضيف صوره وقائمة أسعاره بنفسك، ويُنشر بعد موافقة الإدارة.</p>
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
    </div>
    <p class="btn-row"><a class="btn btn-sign btn-lg" href="/owner/register">${icon('plus')}سجّل مطعمك أو محلك</a><a class="btn btn-lg" href="/login">عندي حساب: دخول</a></p>
  </div>`;
}

export function ownerRegisterPage(cats: string[], areas: string[]): SafeHtml {
  return html`<div class="wrap narrow" data-page="register">
    <h1>سجّل مطعمك أو محلك</h1>
    <p class="note">${icon('shield', 'i i-sm')}صفحتك ما تظهر للناس إلا بعد ما نتحقق إنك صاحب النشاط. صورة الإثبات لا يراها إلا مدير الموقع.</p>
    ${msg}${noJs}
    <form class="form" data-step="account" novalidate>
      <fieldset class="group"><legend>١. حسابك</legend>
        ${field({ name: 'name', label: 'اسمك', required: true, max: 60, attrs: 'autocomplete="name"' })}
        ${field({ name: 'phone', label: 'رقم هاتفك', required: true, type: 'tel', dir: 'ltr', attrs: 'autocomplete="tel" inputmode="tel"' })}
        ${field({ name: 'email', label: 'البريد الإلكتروني (للدخول)', required: true, type: 'email', dir: 'ltr', attrs: 'autocomplete="email"' })}
        ${field({ name: 'password', label: 'كلمة المرور', required: true, type: 'password', hint: '١٠ أحرف على الأقل', attrs: 'autocomplete="new-password" minlength="10"' })}
        <div class="check"><input type="checkbox" id="f-agree" name="agree" required><label for="f-agree">قرأت <a href="/policies/terms" target="_blank">شروط الاستخدام</a> و<a href="/policies/privacy" target="_blank">سياسة الخصوصية</a> وأوافق عليها</label></div>
        <button class="btn btn-primary btn-lg" type="submit">التالي</button>
        <p>عندك حساب؟ <a href="/login">سجّل الدخول</a></p>
      </fieldset>
    </form>
    <form class="form" data-step="business" hidden novalidate>
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
        <p class="hint">بعد الموافقة تگدر تضيف صور الأطباق وأسعارها من لوحة التحكم.</p>
      </fieldset>
      <fieldset class="group"><legend>٣. إثبات الملكية</legend>
        ${textarea({ name: 'message', label: 'كيف نتأكد إن المحل إلك؟', required: true, max: 1000, rows: 3, hint: 'مثلاً: اتصلوا على رقم المحل بين ٤ و٦ العصر.' })}
        <label for="f-proof">صورة واجهة المحل أو لافتته <span class="opt">(اختياري، لا تُنشر)</span></label>
        <input id="f-proof" type="file" name="proof" accept="image/*">
      </fieldset>
      <button class="btn btn-primary btn-lg" type="submit">إرسال للتحقق</button>
    </form></div>`;
}

export function liveLoginPage(): SafeHtml {
  return html`<div class="wrap narrow" data-page="login">
    <h1>دخول أصحاب المحلات</h1>
    <p class="lede">لنشر إعلان عادي ما تحتاج حساب: <a href="/submit">أضف إعلانك</a>.</p>
    ${msg}${noJs}
    <form class="form" data-login novalidate>
      ${field({ name: 'email', label: 'البريد الإلكتروني', required: true, type: 'email', dir: 'ltr', attrs: 'autocomplete="email"' })}
      ${field({ name: 'password', label: 'كلمة المرور', required: true, type: 'password', attrs: 'autocomplete="current-password"' })}
      <button class="btn btn-primary btn-block" type="submit">دخول</button>
    </form>
    <p><button class="linklike link" type="button" data-reset>نسيت كلمة المرور؟</button></p>
    <p>عندك مطعم أو محل؟ <a href="/owner/register">سجّله هنا</a></p>
  </div>`;
}

export function dashboardPage(): SafeHtml {
  return html`<div class="wrap" data-page="dashboard">
    <div class="page-head"><div><h1>لوحة التحكم</h1><p class="lede" data-who></p></div>
      <div class="btn-row"><a class="btn btn-sign" href="/owner/register">${icon('plus')}إضافة مطعم أو محل</a><button class="btn" type="button" data-logout>${icon('logout')}خروج</button></div></div>
    ${msg}${noJs}
    <section aria-labelledby="h-biz"><h2 id="h-biz">محلاتي</h2><div data-businesses><p class="muted">جارِ التحميل...</p></div></section>
    <section class="block" aria-labelledby="h-ads"><h2 id="h-ads">إعلاناتي</h2>
      <p class="btn-row"><a class="btn btn-sm" href="/submit/offer">${icon('percent', 'i i-sm')}أضف عرضاً</a><a class="btn btn-sm" href="/submit/job">${icon('briefcase', 'i i-sm')}أضف وظيفة</a></p>
      <div data-ads></div></section>
    <p class="hint">التغييرات المعتمدة تظهر بالموقع خلال ربع ساعة تقريباً.</p>
  </div>`;
}

export function menuManagerPage(): SafeHtml {
  return html`<div class="wrap narrow" data-page="menu">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/owner/dashboard">لوحة التحكم</a><span aria-hidden="true">/</span><span aria-current="page" data-biz-name>القائمة</span></nav>
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
    <div class="page-head"><div><h1>لوحة الإدارة</h1><p class="lede">المعتمد يظهر بالموقع خلال ربع ساعة تقريباً.</p></div><button class="btn" type="button" data-logout>${icon('logout')}خروج</button></div>
    ${msg}${noJs}
    <nav class="menu-tabs" aria-label="أقسام الإدارة">
      <a href="#pending">بانتظار المراجعة <span class="count" data-count="pending"></span></a>
      <a href="#claims">طلبات أصحاب المحلات <span class="count" data-count="claims"></span></a>
      <a href="#published">المنشور حالياً</a>
    </nav>
    <section id="pending" class="block"><h2>بانتظار المراجعة</h2><div data-pending><p class="muted">جارِ التحميل...</p></div></section>
    <section id="claims" class="block"><h2>طلبات أصحاب المحلات</h2><div data-claims></div></section>
    <section id="published" class="block"><h2>المنشور حالياً</h2><div data-published></div></section>
  </div>`;
}

export function notConfiguredPage(wa: string): SafeHtml {
  return html`<div class="wrap narrow"><h1>هذه الخدمة قيد الإعداد</h1><p>أرسل طلبك على <a href="${wa}">واتساب الدعم</a> وراح نضيفه.</p></div>`;
}
