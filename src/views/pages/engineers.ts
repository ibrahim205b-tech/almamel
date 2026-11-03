// دليل المهندسين: قائمة البطاقات وصفحة كل مهندس.
import { html, paragraphs, type SafeHtml } from '../../lib/html.ts';
import { telLink } from '../../lib/arabic.ts';
import { engineerWhatsApp, type Engineer } from '../../domain/engineers.ts';
import { icon } from '../layout.ts';

const initial = (name: string) => name.replace(/^(المهندس|م\.)\s*/, '').trim().charAt(0) || '؟';
const pageUrl = (e: Engineer) => `/engineers/${e.slug}`;

/** زر التواصل: واتساب برسالة جاهزة، أو اتصال، أو تنبيه إن الرقم يُضاف قريباً (ما نخترع أرقام). */
function contactButtons(e: Engineer, big = false): SafeHtml {
  const wa = engineerWhatsApp(e);
  const cls = big ? ' btn-lg' : '';
  if (wa) return html`<a class="btn btn-wa${cls}" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')}تواصل مع المهندس</a>
    ${big ? html`<a class="btn${cls}" href="${telLink(e.phone!)}">${icon('phone')}اتصال <span dir="ltr">${e.phone}</span></a>` : ''}`;
  if (e.phone) return html`<a class="btn btn-primary${cls}" href="${telLink(e.phone)}">${icon('phone')}تواصل مع المهندس</a>`;
  return html`<span class="btn btn-soon${cls}" aria-disabled="true">${icon('phone')}رقم التواصل يُضاف قريباً</span>`;
}

function card(e: Engineer): SafeHtml {
  return html`<li class="eng-card" data-specialty="${e.specialty}">
    <div class="eng-head">
      <span class="eng-avatar" aria-hidden="true">${initial(e.name)}</span>
      <div><h2 class="eng-name"><a href="${pageUrl(e)}">${e.name}</a></h2><span class="eng-spec">${e.specialty}</span></div>
    </div>
    ${e.services.length ? html`<ul class="eng-services" aria-label="الخدمات">${e.services.map((s) => html`<li>${s}</li>`)}</ul>` : ''}
    ${e.location ? html`<p class="eng-loc">${icon('pin', 'i i-sm')}${e.location}</p>` : ''}
    <div class="btn-row eng-actions">
      <a class="btn" href="${pageUrl(e)}">عرض التفاصيل${icon('chevron', 'i i-sm')}</a>
      ${contactButtons(e)}
    </div>
  </li>`;
}

export function engineersPage(list: Engineer[], joinLink: string): SafeHtml {
  const specs = [...new Set(list.map((e) => e.specialty))];
  return html`<div class="wrap">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span aria-hidden="true">/</span><span aria-current="page">دليل المهندسين</span></nav>
    <div class="page-head"><div><h1>دليل المهندسين</h1>
      <p class="lede">تبني بيت أو ترممه؟ هنا تلكه مهندسين بمختلف الاختصاصات، تشوف خدماتهم وتتواصل وياهم مباشرة.</p></div>
      <a class="btn btn-sign" href="${joinLink}" target="_blank" rel="noopener">${icon('plus')}أضف اسمك كمهندس</a></div>
    ${specs.length > 1 ? html`<div class="chips eng-filter" role="group" aria-label="تصفية حسب الاختصاص" data-eng-filter>
      <button type="button" class="chip" aria-pressed="true" data-value="">الكل</button>
      ${specs.map((s) => html`<button type="button" class="chip" aria-pressed="false" data-value="${s}">${s}</button>`)}
    </div>` : ''}
    ${list.length ? html`<ul class="eng-list">${list.map(card)}</ul>`
      : html`<div class="empty"><p class="empty-title">ما كو مهندسين بالدليل بعد</p><p>إذا انت مهندس وتريد تنضاف، راسلنا.</p></div>`}
  </div>`;
}

export function engineerPage(e: Engineer, joinLink: string): SafeHtml {
  return html`<div class="wrap narrow">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span aria-hidden="true">/</span><a href="/engineers">دليل المهندسين</a><span aria-hidden="true">/</span><span aria-current="page">${e.name}</span></nav>
    <article class="eng-detail">
      <header class="eng-head eng-head-lg">
        <span class="eng-avatar" aria-hidden="true">${initial(e.name)}</span>
        <div><h1 class="eng-name">${e.name}</h1><span class="eng-spec">${e.specialty}</span></div>
      </header>
      <dl class="facts">
        <div><dt>الاختصاص</dt><dd>${e.specialty}</dd></div>
        ${e.location ? html`<div><dt>الموقع</dt><dd>${e.location}</dd></div>` : ''}
      </dl>
      ${e.services.length ? html`<section aria-labelledby="h-eng-services"><h2 id="h-eng-services">الخدمات</h2>
        <ul class="eng-services eng-services-lg">${e.services.map((s) => html`<li>${icon('check', 'i i-sm')}${s}</li>`)}</ul></section>` : ''}
      ${e.about ? html`<section aria-labelledby="h-eng-about"><h2 id="h-eng-about">نبذة</h2><div class="prose">${paragraphs(e.about)}</div></section>` : ''}
      <div class="btn-row eng-contact">${contactButtons(e, true)}</div>
      <p class="muted eng-note">دليل المعامل يعرض معلومات المهندس كما وصلتنا. اتفق على تفاصيل العمل والسعر مع المهندس مباشرة.</p>
    </article>
    <p><a class="more" href="/engineers">${icon('chevron', 'i i-sm')}كل المهندسين</a> · <a class="more" href="${joinLink}" target="_blank" rel="noopener">أضف اسمك كمهندس</a></p>
  </div>`;
}
