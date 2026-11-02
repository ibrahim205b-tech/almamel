import { html, raw, type SafeHtml } from '../lib/html.ts';
import { COPYRIGHT, sectionEnabled, type Settings } from '../domain/settings.ts';
import { TYPES, TYPE_KEYS, type User } from '../domain/types.ts';
import { isStaff } from '../auth/rbac.ts';
import { addShopLink, telLink, waLink } from '../lib/arabic.ts';

const s0 = (ctx: ViewCtx) => ctx.settings.whatsapp_phone ?? '';

export interface ViewCtx {
  user: User | null;
  settings: Settings;
  csrf: string;
  path: string;
  baseUrl: string;
  v: string; // إصدار الملفات الثابتة لكسر التخزين المؤقت
  unread: number;
  staticMode?: boolean; // نسخة GitHub Pages الثابتة: بلا حسابات ولا نماذج تُرسل للخادم
  supabaseOrigin?: string; // عند تفعيل Supabase في النسخة الثابتة
  supabaseKey?: string; // المفتاح العام (لتسجيل طلبات السلة)
  adminSite?: boolean; // موقع الإدارة المنفصل
  registerSite?: boolean; // صفحة تسجيل المحلات الخاصة
  kitchenSite?: boolean; // موقع المطعم: استلام الطلبات
  publicUrl?: string;
  flash?: { kind: 'ok' | 'error'; text: string } | null;
}

export interface PageMeta {
  title: string;
  description?: string;
  canonical?: string | null;
  noindex?: boolean;
  image?: string | null;
  head?: SafeHtml;
  bodyClass?: string;
}

export const icon = (name: string, cls = 'i') =>
  raw(`<svg class="${cls}" aria-hidden="true" focusable="false"><use href="/static/img/icons.svg#${name.replace(/[^a-z-]/g, '')}"></use></svg>`);

export const csrfField = (ctx: ViewCtx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

/** رأس صفحة تسجيل المحلات الخاصة: الشعار يفتح الموقع العام فقط. */
/** اسم الموقع بسطرين: «دليل المعامل» وتحته «قضاء الزوراء» (حتى يبقى مقروء على الموبايل). */
function brandName(name: string): SafeHtml {
  const [main, sub] = name.split(/\s+[-–]\s+/);
  return html`<span class="brand-text"><span class="brand-name">${main}</span>${sub ? html`<span class="brand-sub">${sub}</span>` : ''}</span>`;
}

function registerHeader(ctx: ViewCtx): SafeHtml {
  return html`<header class="site-header"><div class="wrap header-row">
    <a class="brand" href="${ctx.publicUrl || '/'}" aria-label="${ctx.settings.site_name}">
      <img src="/static/img/logo.svg" width="40" height="40" alt="">
      ${brandName(ctx.settings.site_name)}
    </a></div></header>`;
}

/** رأس موقع المطعم: الطلبات والقائمة فقط. */
function kitchenHeader(ctx: ViewCtx): SafeHtml {
  const cur = (p: string) => ctx.path === p ? raw('aria-current="page"') : '';
  return html`<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/owner/dashboard" aria-label="لوحة صاحب المحل">
      <img src="/static/img/logo.svg" width="40" height="40" alt="">
      <span class="brand-text"><span class="brand-name">لوحة صاحب المحل</span><span class="brand-sub">دليل المعامل</span></span>
    </a>
  </div>
  <nav class="site-menu admin-menu" aria-label="المطعم"><div class="wrap menu-inner"><ul class="nav-list">
    <li><a href="/owner/dashboard" ${cur('/owner/dashboard')}>${icon('store')}صفحتي</a></li>
    <li><a href="/kitchen" ${cur('/kitchen')}>${icon('bell')}طلبات المطعم</a></li>
    ${ctx.publicUrl ? html`<li><a href="${ctx.publicUrl}" target="_blank" rel="noopener">${icon('home')}الموقع العام</a></li>` : ''}
  </ul></div></nav>
</header>`;
}

/** رأس موقع الإدارة المنفصل: روابط الإدارة فقط، ورابط للموقع العام. */
function adminHeader(ctx: ViewCtx): SafeHtml {
  return html`<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/admin" aria-label="إدارة ${ctx.settings.site_name}">
      <img src="/static/img/logo.svg" width="40" height="40" alt="">
      <span class="brand-name">إدارة ${ctx.settings.site_name.split(/\s+[-–]\s+/)[0]}</span>
    </a>
  </div>
  <nav class="site-menu admin-menu" aria-label="الإدارة"><div class="wrap menu-inner"><ul class="nav-list">
    <li><a href="/admin" ${ctx.path === '/admin' ? raw('aria-current="page"') : ''}>${icon('shield')}المراجعة والمنشور</a></li>
    <li><a href="/admin/business" ${ctx.path === '/admin/business' ? raw('aria-current="page"') : ''}>${icon('store')}إضافة مطعم أو محل</a></li>
    ${ctx.publicUrl ? html`<li><a href="${ctx.publicUrl}" target="_blank" rel="noopener">${icon('home')}فتح الموقع العام</a></li>` : ''}
  </ul></div></nav>
</header>`;
}

const SHORT: Record<string, string> = { business: 'المحلات', job: 'الوظائف', service: 'الخدمات', property: 'العقارات', market: 'بيع وشراء', offer: 'العروض' };
/** ترتيب الأقسام بالقائمة: الأهم أولاً. */
export const SECTION_LINKS: { href: string; label: string; short: string; icon: string }[] = [
  { href: '/restaurants', label: 'المطاعم والتوصيل', short: 'المطاعم', icon: 'utensils' },
  ...(['business', 'job', 'service', 'property', 'market', 'offer'] as const).map((t) => ({ href: TYPES[t].path, label: TYPES[t].label, short: SHORT[t], icon: TYPES[t].icon })),
  { href: '/delivery', label: 'دلفري حر', short: 'دلفري', icon: 'bike' },
  { href: '/news', label: 'أخبار المعامل', short: 'الأخبار', icon: 'bell' },
  { href: TYPES.community.path, label: TYPES.community.label, short: 'مبادرات', icon: TYPES.community.icon },
  { href: TYPES.help.path, label: TYPES.help.label, short: 'المساعدات', icon: TYPES.help.icon },
];

const cur = (ctx: ViewCtx, href: string) => ctx.path.startsWith(href) ? raw('aria-current="page"') : '';

/** «دلفري حر» يشتغل بس وية Supabase (النسخة الثابتة المربوطة). */
export const sectionLinks = (delivery: boolean) => SECTION_LINKS.filter((l) => delivery || l.href !== '/delivery');

function nav(ctx: ViewCtx) {
  return html`<ul class="nav-list nav-sections">${sectionLinks(!!ctx.supabaseOrigin).map((l) => html`<li><a href="${l.href}" ${cur(ctx, l.href)}>${icon(l.icon)}${l.label}</a></li>`)}</ul>`;
}

/** روابط مختصرة بالترويسة على الشاشات العريضة. */
function primaryNav(ctx: ViewCtx) {
  return html`<nav class="primary-nav" aria-label="الأقسام الرئيسية"><ul>${SECTION_LINKS.slice(0, 5).map((l) => html`<li><a href="${l.href}" ${cur(ctx, l.href)}>${l.short}</a></li>`)}</ul></nav>`;
}

export function layout(ctx: ViewCtx, meta: PageMeta, body: SafeHtml): string {
  const s = ctx.settings;
  const title = meta.title === s.site_name || meta.title.startsWith(s.site_name + ' |') ? meta.title : `${meta.title} | ${s.site_name}`;
  const desc = meta.description || s.tagline;
  const canonical = meta.canonical === null ? null : ctx.baseUrl + (meta.canonical ?? ctx.path);
  const ogImage = meta.image ? ctx.baseUrl + meta.image : `${ctx.baseUrl}/static/img/og.png`;
  const u = ctx.user;
  const canPost = TYPE_KEYS.some((t) => sectionEnabled(s, t));
  return '<!doctype html>' + html`<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${ctx.staticMode ? html`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: ${ctx.supabaseOrigin ?? ''}; font-src 'self'; connect-src 'self' ${ctx.supabaseOrigin ? `${ctx.supabaseOrigin} ${ctx.supabaseOrigin.replace('https://', 'wss://')}` : ''}; form-action 'self'; base-uri 'none'; object-src 'none'">` : ''}
<title>${title}</title>
<meta name="description" content="${desc}">
${meta.noindex ? raw('<meta name="robots" content="noindex, nofollow">') : ''}
${canonical ? html`<link rel="canonical" href="${canonical}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${s.site_name}">
<meta property="og:title" content="${meta.title}">
<meta property="og:description" content="${desc}">
<meta property="og:locale" content="ar_IQ">
${canonical ? html`<meta property="og:url" content="${canonical}">` : ''}
<meta property="og:image" content="${ogImage}">
<meta name="theme-color" content="#101B2D">
<meta name="author" content="إبراهيم علي الشويلي">
${ctx.adminSite || ctx.registerSite || ctx.kitchenSite ? '' : raw('<meta name="google-site-verification" content="ibDE5Err5g1BfD-CObu3zPfeN2zR8DFHOfvxgZB8NjI">')}
<link rel="icon" href="/static/img/logo.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/img/icon-180.png">
<meta name="apple-mobile-web-app-title" content="${s.site_name.split(/\s+[-–]\s+/)[0]}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/static/fonts/IBMPlexSansArabic-400-arabic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/static/fonts/Alexandria-arabic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/static/css/app.css?v=${ctx.v}">
<script src="/static/js/app.js?v=${ctx.v}" defer></script>
${ctx.staticMode ? html`<script src="/static/js/static.js?v=${ctx.v}" defer></script>` : ''}
${ctx.supabaseOrigin && ctx.supabaseKey ? html`<meta name="order-log" content="${ctx.supabaseOrigin}" data-key="${ctx.supabaseKey}">` : ''}
${meta.head ?? ''}
</head>
<body class="${meta.bodyClass ?? ''}">
<a class="skip" href="#main">انتقل إلى المحتوى</a>
<div class="creator-bar"><div class="wrap"><span>المُنشئ: <strong>إبراهيم علي</strong></span></div></div>
${s.announcement ? html`<div class="announce" role="note">${s.announcement}</div>` : ''}
${ctx.adminSite ? adminHeader(ctx) : ctx.kitchenSite ? kitchenHeader(ctx) : ctx.registerSite ? registerHeader(ctx) : html`<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${s.site_name}، الصفحة الرئيسية">
      <img src="/static/img/logo.svg" width="40" height="40" alt="">
      ${brandName(s.site_name)}
    </a>
    ${primaryNav(ctx)}
    <div class="header-actions">
      <a class="btn-icon hdr-search" href="/search" aria-label="البحث">${icon('search')}</a>
      ${ctx.staticMode ? html`<a class="btn btn-owner" href="/mat3am/">${icon('store')}<span>أنا صاحب محل</span></a>` : ''}
      ${canPost ? html`<a class="btn btn-sign" href="/submit" aria-label="أضف إعلانك">${icon('plus')}<span>أضف إعلانك</span></a>` : ''}
      <a class="btn-icon menu-toggle" href="#site-menu" role="button" aria-expanded="false" aria-controls="site-menu">${icon('menu')}<span class="sr">القائمة</span></a>
    </div>
  </div>
  <nav id="site-menu" class="site-menu site-drawer" aria-label="الأقسام">
    <div class="wrap menu-inner">
      ${ctx.staticMode ? html`<a class="owner-cta" href="/mat3am/">${icon('store')}<span><b>أنا صاحب محل</b><small>أضف منتجاتك بصورها وأسعارها، وأدر صفحة محلك</small></span>${icon('chevron')}</a>` : ''}
      <p class="drawer-title">الأقسام</p>
      ${nav(ctx)}
      <p class="drawer-title">المزيد</p>
      ${ctx.staticMode ? html`<ul class="nav-list nav-account"><li><a href="/search">${icon('search')}البحث</a></li>
        <li><a href="${addShopLink(s0(ctx))}" target="_blank" rel="noopener">${icon('utensils')}أضف مطعمك أو محلك</a></li>
        <li><a href="/contact">${icon('phone')}تواصل معنا</a></li>
        <li data-install hidden><button class="linklike" type="button">${icon('plus')}ثبّت الموقع على موبايلك</button></li></ul>` : html`<ul class="nav-list nav-account">
        ${u ? html`
          ${isStaff(u.role) ? html`<li><a href="/admin">${icon('shield')}لوحة الإدارة</a></li>` : ''}
          <li><a href="/owner/dashboard">${icon('store')}لوحة التحكم</a></li>
          <li><a href="/account">${icon('user')}حسابي${ctx.unread ? html` <span class="count" aria-label="${ctx.unread} إشعارات غير مقروءة">${ctx.unread}</span>` : ''}</a></li>
          <li><form method="post" action="/logout">${csrfField(ctx)}<button class="linklike" type="submit">${icon('logout')}خروج</button></form></li>`
        : html`<li><a href="/owner">${icon('utensils')}أضف مطعمك أو محلك</a></li><li><a href="/login">${icon('user')}دخول أصحاب المحلات</a></li>`}
      </ul>`}
    </div>
  </nav>
</header>`}
<main id="main" tabindex="-1">
${ctx.flash ? html`<div class="wrap"><p class="flash flash-${ctx.flash.kind}" role="${ctx.flash.kind === 'error' ? 'alert' : 'status'}">${ctx.flash.text}</p></div>` : ''}
${body}
</main>
${ctx.adminSite || ctx.registerSite || ctx.kitchenSite ? html`<footer class="site-footer"><div class="wrap copyright"><p>${COPYRIGHT}</p></div></footer>` : html`<footer class="site-footer">
  <div class="wrap footer-grid">
    <section aria-labelledby="f-about">
      <h2 id="f-about" class="footer-title">${s.site_name}</h2>
      <p>${s.tagline}</p>
      ${s.footer_note ? html`<p>${s.footer_note}</p>` : ''}
    </section>
    <section aria-labelledby="f-support">
      <h2 id="f-support" class="footer-title">الدعم</h2>
      <p class="contact-line"><a href="${telLink(s.support_phone)}">${icon('phone')}<span dir="ltr">${s.support_phone}</span></a></p>
      <p class="contact-line"><a href="${waLink(s.whatsapp_phone)}" rel="noopener" target="_blank">${icon('whatsapp')}واتساب الدعم</a></p>
      ${[['facebook_url', 'فيسبوك'], ['instagram_url', 'إنستغرام'], ['telegram_url', 'تيليغرام']].filter(([k]) => s[k]).map(([k, l]) => html`<p><a href="${s[k]}" rel="noopener" target="_blank">${l}</a></p>`)}
    </section>
    <section aria-labelledby="f-links">
      <h2 id="f-links" class="footer-title">روابط</h2>
      <ul class="footer-links">
        <li><a href="/about">عن المنصة</a></li><li><a href="/contact">تواصل معنا</a></li>${ctx.staticMode ? html`<li><a href="/mat3am/">دخول أصحاب المحلات</a></li>` : ''}
        <li><a href="${ctx.staticMode ? addShopLink(s0(ctx)) : '/owner'}"${ctx.staticMode ? raw(' target="_blank" rel="noopener"') : ''}>أضف مطعمك أو محلك</a></li>
        <li><a href="/policies/privacy">سياسة الخصوصية</a></li><li><a href="/policies/terms">شروط الاستخدام</a></li>
        <li><a href="/policies/posting">سياسة النشر</a></li><li><a href="/policies/ads">سياسة الإعلانات</a></li>
        <li><a href="/policies/reports">سياسة البلاغات</a></li>
      </ul>
    </section>
  </div>
  <div class="wrap copyright"><p>${COPYRIGHT}</p></div>
</footer>`}
</body>
</html>`.value;
}

export function sectionTitle(text: string, href?: string, linkText = 'عرض الكل', id?: string) {
  return html`<div class="section-head"><h2 ${id ? raw(`id="${id}"`) : ''}>${text}</h2>${href ? html`<a class="more" href="${href}">${linkText}${icon('chevron', 'i i-sm')}</a>` : ''}</div>`;
}
