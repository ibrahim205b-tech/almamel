// الصفحات التفاعلية في النسخة الثابتة: إعلانات الزوار، تسجيل أصحاب المحلات، لوحة التحكم، القائمة، والإدارة.
// الأمان الحقيقي في قاعدة البيانات (RLS والدوال)؛ هذا الملف واجهة فقط. كل نص يُعرض عبر textContent.
(function () {
  'use strict';
  var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') : ''; };
  var URL_ = meta('sb-url'), KEY = meta('sb-key');
  var BASE = document.documentElement.getAttribute('data-base') || '';
  var page = document.querySelector('[data-page]');
  if (!page || !URL_ || !window.supabase) return;
  var sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'almamel-auth' } });
  var TYPE_LABEL = { business: 'نشاط تجاري', job: 'وظيفة', property: 'عقار', service: 'خدمة', market: 'إعلان بيع', offer: 'عرض', community: 'خبر أو فعالية', help: 'طلب مساعدة' };
  var PATHS = { business: '/businesses', job: '/jobs', property: '/properties', service: '/services', market: '/market', offer: '/offers', community: '/community', help: '/help' };
  var nf = new Intl.NumberFormat('ar-IQ');
  var ADMIN_SITE = meta('admin-site') === '1', REGISTER_SITE = meta('register-site') === '1', KITCHEN_SITE = meta('kitchen-site') === '1';
  var FEE = 3000, FEATURE_DAYS = 10; // تطابق ad_fee و feature_fee و feature_days في schema.sql
  var SUPPORT_WA = meta('support-wa');
  function waTo(text) { return SUPPORT_WA ? SUPPORT_WA + '?text=' + encodeURIComponent(text) : ''; }
  function dayText(iso) { return new Date(iso).toLocaleDateString('ar-IQ'); }

  // ---------- أدوات ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  // رقم بطاقة الملخص، يعدّ من الصفر بنعومة
  var CALM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stat(name, n) {
    var node = document.querySelector('[data-stat="' + name + '"]'); if (!node) return;
    n = Number(n) || 0;
    if (CALM || n < 2) { node.textContent = nf.format(n); return; }
    var t0 = null, step = function (t) { if (t0 === null) t0 = t; var k = Math.min(1, (t - t0) / 700); node.textContent = nf.format(Math.round(n * (1 - Math.pow(1 - k, 3)))); if (k < 1) window.requestAnimationFrame(step); };
    window.requestAnimationFrame(step);
  }
  function say(text, kind) {
    var box = $('[data-msg]');
    if (!box) return alert(text);
    box.textContent = '';
    box.className = 'live-msg flash flash-' + (kind || 'ok');
    box.textContent = text;
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    box.scrollIntoView({ block: 'center' });
  }
  // رسالة المنع بسبب الدين: نضيف زر واتساب للتسديد
  function debtHelp(msg) {
    if (!/سدّدها/.test(msg || '')) return;
    var wa = waTo('هلو، أريد أسدد رسوم إعلاناتي بدليل المعامل حتى أكدر أنشر. ' + msg);
    if (wa) $('[data-msg]').appendChild(el('p', {}, [el('a', { class: 'btn btn-wa btn-sm', href: wa, target: '_blank', rel: 'noopener', text: 'سدّد على الواتساب' })]));
  }
  function errText(e) {
    var m = (e && (e.message || e.error_description)) || '';
    if (/Invalid login credentials/i.test(m)) return 'البريد أو كلمة المرور غير صحيحة.';
    if (/already registered|already exists/i.test(m)) return 'هذا البريد مسجل مسبقاً. سجّل الدخول.';
    if (/Password should be/i.test(m)) return 'كلمة المرور ضعيفة. استخدم ١٠ أحرف على الأقل.';
    if (/Email not confirmed/i.test(m)) return 'فعّل حسابك من الرسالة اللي وصلت بريدك، ثم سجّل الدخول.';
    if (/rate limit|too many/i.test(m)) return 'محاولات كثيرة. حاول بعد قليل.';
    if (/[؀-ۿ]/.test(m)) return m.replace(/^.*?:\s*/, '');
    return 'تعذّر تنفيذ الطلب. تأكد من الاتصال وحاول مرة ثانية.';
  }
  function digits(s) { return String(s || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); }); }
  function phone(s) {
    var d = digits(s).replace(/[\s\-()]/g, '');
    if (d.indexOf('+964') === 0) d = '0' + d.slice(4); else if (d.indexOf('00964') === 0) d = '0' + d.slice(5); else if (d.indexOf('964') === 0) d = '0' + d.slice(3);
    return /^07\d{9}$/.test(d) ? d : null;
  }
  function money(s) { var d = digits(s).replace(/[,\s٬.]/g, ''); return d && /^\d{1,11}$/.test(d) ? Number(d) : null; }
  function hex() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function sha256(text) {
    var buf = await crypto.subtle.digest('SHA-256', new window.TextEncoder().encode(text));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function myAds() { try { return JSON.parse(window.localStorage.getItem('almamel-my-ads') || '[]').filter(function (t) { return /^[0-9a-f]{32}$/.test(t); }); } catch { return []; } }
  function saveMyAd(t) { var l = myAds(); if (l.indexOf(t) === -1) l.unshift(t); try { window.localStorage.setItem('almamel-my-ads', JSON.stringify(l.slice(0, 50))); } catch { /* وضع خاص */ } }
  function busy(form, on) { $$('button', form).forEach(function (b) { b.disabled = on; }); form.setAttribute('aria-busy', on ? 'true' : 'false'); }
  function mediaUrl(p) { return URL_ + '/storage/v1/object/public/media/' + p; }
  function price(n) { return n == null ? 'حسب الطلب' : nf.format(n) + ' د.ع'; }
  function go(path) { window.location.href = BASE + path; }

  // يعيد ترميز الصورة في المتصفح إلى WebP (يحذف بيانات الموقع الجغرافي ويصغّر الحجم)
  async function toWebp(file, max) {
    if (file.type && !/^image\//.test(file.type)) throw new Error('الملف ليس صورة.');
    if (file.size > 15 * 1024 * 1024) throw new Error('الصورة كبيرة جداً.');
    var bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { // متصفحات أقدم: نقرأ الصورة بعنصر img
      bmp = await new Promise(function (ok, no) { var im = new window.Image(); im.onload = function () { ok(im); }; im.onerror = function () { no(new Error('تعذّر قراءة الصورة. جرّب صورة ثانية.')); }; im.src = URL.createObjectURL(file); });
      bmp.width = bmp.naturalWidth; bmp.height = bmp.naturalHeight;
    }
    var scale = Math.min(1, (max || 1600) / Math.max(bmp.width, bmp.height));
    var c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    // متصفحات الآيفون (Safari وحتى Chrome على الآيفون) ما تكدر تحفظ WebP، فنستخدم JPEG بدلها.
    // الموقع يعيد ترميز كل صورة عند البناء، فالنتيجة النهائية واحدة.
    var webp = true;
    for (var q = 0.82; q >= 0.3; q -= 0.12) {
      var blob = await new Promise(function (r) { c.toBlob(r, webp ? 'image/webp' : 'image/jpeg', q); });
      if (!blob) break;
      if (webp && blob.type !== 'image/webp') { webp = false; q = 0.94; continue; }
      if (blob.size <= 1000 * 1024) return new window.Blob([blob], { type: 'image/webp' }); // المخزن يقبل نوعاً واحداً
    }
    throw new Error('تعذّر تجهيز الصورة. جرّب صورة ثانية.');
  }
  async function upload(bucket, path, blob) {
    var r = await sb.storage.from(bucket).upload(path, blob, { contentType: 'image/webp', upsert: false });
    if (r.error) throw r.error;
    return path;
  }
  async function session() { var r = await sb.auth.getSession(); return r.data.session; }
  async function profile(uid) { var r = await sb.from('profiles').select('name, phone, role').eq('id', uid).maybeSingle(); return r.data; }
  async function requireLogin() {
    var s = await session();
    if (!s) { go('/login/?next=' + encodeURIComponent(location.pathname.replace(BASE, '') + location.search)); return null; }
    return s;
  }
  // ---------- الدخول بخطوتين للإدارة والمشرفين ----------
  // صلاحيات الإدارة بقاعدة البيانات ما تشتغل إلا بجلسة متحققة بكود التطبيق (aal2).
  function jwtPayload(t) { try { return JSON.parse(window.atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } }
  async function ensureMfa() {
    var s = await session(); if (!s) return false;
    if (jwtPayload(s.access_token).aal === 'aal2') return true;
    var root = page;
    Array.prototype.forEach.call(root.children, function (c) { if (!c.hasAttribute('data-msg') && c.tagName !== 'H1' && !c.classList.contains('page-head')) c.hidden = true; });
    var box = el('section', { class: 'panel mfa-box', 'data-mfa': '' }); root.appendChild(box);
    var u = await sb.auth.getUser();
    var factors = ((u.data && u.data.user && u.data.user.factors) || []).filter(function (f) { return f.factor_type === 'totp'; });
    var ok = factors.filter(function (f) { return f.status === 'verified'; })[0];
    var factorId = ok && ok.id;
    if (!ok) {
      for (var i = 0; i < factors.length; i++) await sb.auth.mfa.unenroll({ factorId: factors[i].id });
      var en = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'دليل المعامل ' + Date.now() });
      if (en.error) { say(errText(en.error), 'error'); return false; }
      factorId = en.data.id;
      box.appendChild(el('h2', { text: 'فعّل الدخول بخطوتين (مرة وحدة)' }));
      box.appendChild(el('ol', { class: 'mfa-steps' }, [
        el('li', { text: 'نزّل تطبيق Google Authenticator أو Microsoft Authenticator على موبايلك.' }),
        el('li', { text: 'افتح التطبيق واضغط + ثم «مسح رمز QR» وامسح هذا الرمز:' })]));
      box.appendChild(el('img', { class: 'mfa-qr', src: en.data.totp.qr_code, alt: 'رمز QR للدخول بخطوتين', width: 200, height: 200 }));
      box.appendChild(el('p', { class: 'muted' }, ['ما يشتغل المسح؟ اكتب هذا المفتاح بالتطبيق يدوياً: ', el('code', { dir: 'ltr', text: en.data.totp.secret })]));
      box.appendChild(el('p', { class: 'note', text: 'احتفظ بالموبايل. إذا ضاع، تكدر ترجع الدخول من Supabase (الشرح بملف التحديث).' }));
    } else {
      box.appendChild(el('h2', { text: 'الدخول بخطوتين' }));
      box.appendChild(el('p', { text: 'افتح تطبيق المصادقة على موبايلك واكتب الكود المكوّن من ٦ أرقام.' }));
    }
    var input = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, dir: 'ltr', 'aria-label': 'كود التطبيق', placeholder: '123456', class: 'mfa-code' });
    var form = el('form', { class: 'btn-row' }, [input, el('button', { class: 'btn btn-primary', type: 'submit', text: 'تأكيد' })]);
    box.appendChild(form);
    input.focus();
    return new Promise(function () {
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var code = digits(input.value).replace(/\D/g, '');
        if (code.length !== 6) return say('الكود ٦ أرقام.', 'error');
        busy(form, true);
        var r = await sb.auth.mfa.challengeAndVerify({ factorId: factorId, code: code });
        busy(form, false);
        if (r.error) return say('الكود غلط أو انتهى وقته. جرّب الكود الجديد بالتطبيق.', 'error');
        location.reload();
      });
    });
  }

  $$('[data-logout]').forEach(function (b) { b.addEventListener('click', async function () { await sb.auth.signOut(); go('/'); }); });

  function showFor(form, type) {
    $$('[data-for]', form).forEach(function (g) {
      var on = g.getAttribute('data-for').split(' ').indexOf(type) !== -1;
      g.hidden = !on;
      $$('input,select,textarea', g).forEach(function (x) { x.disabled = !on; });
    });
  }

  // معاينة الصور المختارة من المعرض قبل الإرسال
  $$('input[type=file][data-preview-into]').forEach(function (input) {
    input.addEventListener('change', function () {
      var box = document.getElementById(input.getAttribute('data-preview-into')); box.textContent = '';
      Array.prototype.slice.call(input.files || []).slice(0, 6).forEach(function (file) {
        box.appendChild(el('li', {}, [el('img', { src: URL.createObjectURL(file), alt: '', width: 96, height: 96 })]));
      });
    });
  });

  // ---------- أضف إعلانك ----------
  async function initSubmit() {
    var form = $('[data-live-submit]');
    var cats = JSON.parse(form.getAttribute('data-cats') || '{}');
    var texts = JSON.parse(form.getAttribute('data-texts') || '{}');
    var typeSel = form.elements.type, catSel = form.elements.category;
    var s = await session();
    if (s) $$('[data-guest-only]', form).forEach(function (g) { g.hidden = true; $$('input', g).forEach(function (x) { x.disabled = true; }); });
    var maxImages = s ? 6 : 3;
    var fill = function () {
      var t = typeSel.value;
      catSel.textContent = '';
      catSel.appendChild(el('option', { value: '', text: t ? 'اختر' : 'اختر نوع الإعلان أولاً' }));
      (cats[t] || []).forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
      showFor(form, t);
      // تسميات العنوان والتفاصيل والسعر حسب القسم
      var tx = texts[t];
      [['title', tx && tx.title, tx && tx.titleHint], ['body', tx && tx.body, tx && tx.bodyHint], ['price', tx && tx.price]].forEach(function (a) {
        var input = form.elements[a[0]]; if (!input || !a[1]) return;
        var lab = form.querySelector('label[for="' + input.id + '"]'); if (lab) lab.firstChild.textContent = a[1];
        if (a[2] !== undefined) input.placeholder = a[2];
      });
    };
    typeSel.addEventListener('change', fill); fill();
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); delete form.dataset.submitting;
      if (form.elements.website.value) return; // فخ للبرامج الآلية
      var f = form.elements, t = f.type.value;
      var errs = [];
      if (!t) errs.push('اختر نوع الإعلان.');
      if (!f.category.value) errs.push('اختر التصنيف.');
      var title = f.title.value.trim(); if (title.length < 3 || title.length > 100) errs.push('العنوان من ٣ إلى ١٠٠ حرف.');
      var body = f.body.value.trim(); if (!body) errs.push('اكتب التفاصيل.');
      var ph = phone(f.contact_phone.value); if (!ph) errs.push('رقم التواصل: رقم عراقي يبدأ بـ 07.');
      var name = !s ? f.guest_name.value.trim() : null; if (!s && (name.length < 2 || name.length > 60)) errs.push('اكتب اسمك.');
      var files = Array.prototype.slice.call(f.images.files || []);
      if (files.length > maxImages) errs.push('الحد الأقصى ' + maxImages + ' صور.');
      var pre = 'd_' + t + '_';
      if (t === 'help' && !(f[pre + 'consent'] && f[pre + 'consent'].checked)) errs.push('أكّد موافقة صاحب الحالة.');
      $$('[name^="' + pre + '"][required]', form).forEach(function (x) {
        if (x.type !== 'checkbox' && !x.value.trim()) { var lab = form.querySelector('label[for="' + x.id + '"]'); errs.push('املأ: ' + (lab ? lab.firstChild.textContent.trim() : x.name) + '.'); }
      });
      if (errs.length) return say(errs.join(' '), 'error');
      busy(form, true); say('جارِ الإرسال...', 'ok');
      try {
        var details = {};
        // حقول القسم: «d_<القسم>_<الحقل>»
        $$('[name^="' + pre + '"]', form).forEach(function (x) { if (!x.disabled && (x.type === 'checkbox' ? x.checked : x.value.trim())) details[x.name.slice(pre.length)] = x.type === 'checkbox' ? true : x.value.trim(); });
        ['size', 'rooms', 'positions', 'units', 'old_price', 'valid_days'].forEach(function (k) { if (details[k]) details[k] = Number(digits(details[k]).replace(/[,\s٬]/g, '')) || undefined; });
        var folder = s ? 'u/' + s.user.id + '/' : 'guest/';
        var images = [];
        for (var i = 0; i < files.length; i++) images.push(await upload('media', folder + hex() + '.webp', await toWebp(files[i])));
        var token = hex(), editHash = await sha256(token);
        var row = { type: t, category: f.category.value, title: title, body: body, area: f.area.value, contact_phone: ph, edit_hash: editHash,
          show_phone: f.show_phone.checked, whatsapp: f.whatsapp.checked, details: details, images: images,
          price: f.price && !f.price.disabled ? money(f.price.value) : null };
        if (!s) row.guest_name = name;
        var r = await sb.from('posts').insert(row);
        if (r.error) throw r.error;
        form.reset(); fill(); if ($('[data-preview]')) $('[data-preview]').textContent = '';
        saveMyAd(token);
        say('وصل إعلانك. راح يظهر بالموقع بعد مراجعة الإدارة.', 'ok');
        var my = BASE + '/my-ads/?t=' + token;
        $('[data-msg]').appendChild(el('p', {}, ['تتابع إعلانك وتحذفه أو تجدده من ', el('a', { href: my, text: 'صفحة «إعلاناتي»' }), '. احفظ هذا الرابط إذا تريد تفتحه من جهاز ثاني.']));
      } catch (err) { say(err.message && /[؀-ۿ]/.test(err.message) ? err.message : errText(err), 'error'); debtHelp(err.message); }
      finally { busy(form, false); }
    });
  }

  // ---------- تسجيل صاحب محل ----------
  async function initRegister() {
    var acc = $('[data-step=account]'), biz = $('[data-step=business]');
    kitForm(biz);
    var s = await session();
    var toBusiness = function () { acc.hidden = true; biz.hidden = false; };
    if (s) toBusiness();
    acc.addEventListener('submit', async function (e) {
      e.preventDefault(); delete acc.dataset.submitting;
      var f = acc.elements, errs = [];
      var name = f.name.value.trim(), ph = phone(f.phone.value), email = f.email.value.trim(), pw = f.password.value;
      if (name.length < 2) errs.push('اكتب اسمك.');
      if (!ph) errs.push('رقم الهاتف: رقم عراقي يبدأ بـ 07.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push('البريد الإلكتروني غير صحيح.');
      if (pw.length < 10) errs.push('كلمة المرور ١٠ أحرف على الأقل.');
      if (!f.agree.checked) errs.push('وافق على الشروط.');
      if (errs.length) return say(errs.join(' '), 'error');
      busy(acc, true);
      var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { name: name, phone: ph }, emailRedirectTo: location.origin + BASE + '/login/' } });
      busy(acc, false);
      if (r.error) return say(errText(r.error), 'error');
      if (!r.data.session) return say('تم إنشاء الحساب. افتح بريدك واضغط رابط التفعيل، بعدها سجّل الدخول وكمّل معلومات محلك.', 'ok');
      s = r.data.session; toBusiness(); say('تم إنشاء حسابك. هسه أضف معلومات محلك.', 'ok');
    });
    biz.addEventListener('submit', async function (e) {
      e.preventDefault(); delete biz.dataset.submitting;
      s = await session();
      if (!s) return say('سجّل الدخول أولاً.', 'error');
      var f = biz.elements, errs = [];
      var ph = phone(f.contact_phone.value);
      if (f.title.value.trim().length < 3) errs.push('اكتب اسم المحل.');
      if (!f.category.value) errs.push('اختر نوع النشاط.');
      if (f.address.value.trim().length < 3) errs.push('اكتب العنوان.');
      if (!ph) errs.push('رقم المحل: رقم عراقي يبدأ بـ 07.');
      if (f.message.value.trim().length < 10) errs.push('اكتب كيف نتأكد إن المحل إلك (١٠ أحرف على الأقل).');
      if (f.commission && !f.commission.checked) errs.push('وافق على نسبة الطلبات.');
      if (errs.length) return say(errs.join(' '), 'error');
      busy(biz, true); say('جارِ الإرسال...', 'ok');
      try {
        var details = { address: f.address.value.trim() };
        if (f.hours.value.trim()) details.hours = f.hours.value.trim();
        if (f.services && f.services.value.trim()) details.services = f.services.value.trim();
        // الصور والشعار تُرفع لمجلد صاحب الحساب، وتظهر بعد موافقة الإدارة
        var photos = [], photoFiles = Array.prototype.slice.call((f.photos && f.photos.files) || []).slice(0, 6);
        for (var pi = 0; pi < photoFiles.length; pi++) photos.push(await upload('media', 'u/' + s.user.id + '/' + hex() + '.webp', await toWebp(photoFiles[pi])));
        var logoPath = f.logo && f.logo.files[0] ? await upload('media', 'u/' + s.user.id + '/' + hex() + '.webp', await toWebp(f.logo.files[0], 600)) : null;
        if (f.delivery.value.trim()) details.delivery = f.delivery.value.trim();
        var ins = await sb.from('posts').insert({ type: 'business', title: f.title.value.trim(), category: f.category.value, area: f.area.value,
          body: f.body.value.trim(), contact_phone: ph, show_phone: true, whatsapp: f.whatsapp.checked, details: details, images: photos, logo: logoPath }).select('id').single();
        if (ins.error) throw ins.error;
        var proof = null;
        if (f.proof.files[0]) proof = await upload('proofs', s.user.id + '/' + hex() + '.webp', await toWebp(f.proof.files[0], 1400));
        var c = await sb.from('claims').insert({ business_id: ins.data.id, message: f.message.value.trim(), business_phone: ph, proof_path: proof });
        if (c.error) throw c.error;
        // القائمة: تُحفظ مع الطلب وتظهر بعد الموافقة
        var items = f.menu ? parseMenu(f.menu.value) : [];
        for (var mi = 0; mi < items.length; mi += 100) {
          var mr = await sb.from('menu_items').insert(items.slice(mi, mi + 100).map(function (it, k) { return { business_id: ins.data.id, section: it.section.slice(0, 60), name: it.name, price: it.price, note: it.note, sort: mi + k }; }));
          if (mr.error) throw mr.error;
        }
        if (REGISTER_SITE) {
          biz.hidden = true; await sb.auth.signOut();
          say('وصل طلبك ✅ راح نتصل بيك للتحقق. بعد الموافقة تدير صفحة محلك (المنتجات والأسعار والصور) من: ' + location.origin + BASE.replace(/\/tasjeel$/, '') + '/mat3am/ بنفس البريد وكلمة المرور.', 'ok');
          return;
        }
        go('/owner/dashboard/?sent=1');
      } catch (err) { say(errText(err), 'error'); busy(biz, false); }
    });
  }

  // ---------- الدخول ----------
  function initLogin() {
    var form = $('[data-login]');
    // رابط خاص لصاحب المحل (/mat3am/login/?invite=...): بعد الحساب أو الدخول ينربط بمحله تلقائياً
    var INVITE = KITCHEN_SITE ? (new URLSearchParams(location.search).get('invite') || '').replace(/[^0-9a-f]/gi, '').slice(0, 40) : '';
    async function acceptInvite() {
      var r = await sb.rpc('accept_invite', { p_code: INVITE });
      if (r.error) { say(errText(r.error), 'error'); return false; }
      var row = (r.data || [])[0];
      say('تم ربط حسابك بـ «' + (row ? row.title : 'محلك') + '» ✅ جارِ فتح صفحتك...', 'ok');
      setTimeout(function () { go('/owner/dashboard/'); }, 900);
      return true;
    }
    if (INVITE) (async function () {
      var info = await sb.rpc('invite_info', { p_code: INVITE });
      var shop = info.data && info.data[0];
      if (!shop) return say('هذا الرابط انتهت صلاحيته أو استُخدم قبل. اطلب رابط جديد من إدارة دليل المعامل.', 'error');
      var cur = await session();
      if (cur) { say('جارِ ربط حسابك بـ «' + shop.title + '»...', 'ok'); return acceptInvite(); }
      say('هذا رابط خاص بصفحة «' + shop.title + '». سوّي حسابك تحت (أو سجّل دخول إذا عندك حساب)، وينربط بمحلك تلقائياً.', 'ok');
      var det = $('[data-signup]') && $('[data-signup]').closest('details');
      if (det) { det.open = true; det.querySelector('summary').textContent = 'سوّي حسابك لصفحة «' + shop.title + '»'; var hint = det.querySelector('.hint'); if (hint) hint.hidden = true; det.parentNode.insertBefore(det, form); }
      var join = $('.owner-join'); if (join) join.hidden = true;
    })();
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); delete form.dataset.submitting;
      busy(form, true);
      var r = await sb.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
      busy(form, false);
      if (r.error) return say(errText(r.error), 'error');
      var p = await profile(r.data.user.id);
      var next = new URLSearchParams(location.search).get('next');
      if (ADMIN_SITE && !(p && p.role === 'admin')) { await sb.auth.signOut(); return say('هذا الحساب ليس حساب إدارة. شغّل make_admin لبريدك في Supabase أولاً.', 'error'); }
      if (INVITE) return acceptInvite();
      go(next && /^\/[\w\-/?=&%.]*$/.test(next) ? next : KITCHEN_SITE ? '/owner/dashboard/' : p && p.role === 'admin' ? '/admin/' : '/owner/dashboard/');
    });
    var signup = $('[data-signup]');
    if (signup) signup.addEventListener('submit', async function (e) {
      e.preventDefault(); delete signup.dataset.submitting;
      var f = signup.elements, ph = phone(f.su_phone.value), errs = [];
      if (f.su_name.value.trim().length < 2) errs.push('اكتب الاسم.');
      if (!ph) errs.push('رقم الهاتف: رقم عراقي يبدأ بـ 07.');
      if (f.su_password.value.length < 10) errs.push('كلمة المرور ١٠ أحرف على الأقل.');
      if (errs.length) return say(errs.join(' '), 'error');
      busy(signup, true);
      var r = await sb.auth.signUp({ email: f.su_email.value.trim(), password: f.su_password.value, options: { data: { name: f.su_name.value.trim(), phone: ph } } });
      busy(signup, false);
      if (r.error) return say(errText(r.error), 'error');
      if (INVITE) {
        if (r.data.session) return acceptInvite();
        return say('تم إنشاء الحساب ✅ افتح بريدك واضغط رابط التفعيل، وبعدها ارجع لنفس هذا الرابط وسجّل دخول.', 'ok');
      }
      await sb.auth.signOut();
      if (KITCHEN_SITE) {
        var w = waTo('سويت حساب لمحلي بدليل المعامل. البريد: ' + f.su_email.value.trim() + '\nاسم المحل: ');
        say('تم إنشاء الحساب ✅ أرسل بريدك (' + f.su_email.value.trim() + ') لخدمة العملاء حتى نربطه بمحلك، وبعدها سجّل الدخول.', 'ok');
        if (w) $('[data-msg]').appendChild(el('a', { class: 'btn btn-wa btn-sm', href: w, target: '_blank', rel: 'noopener', text: ' أرسل لخدمة العملاء' }));
        return;
      }
      say('تم إنشاء الحساب. الآن شغّل في Supabase ← SQL Editor: select public.make_admin(\'' + f.su_email.value.trim() + '\'); ثم سجّل الدخول.', 'ok');
    });
    $('[data-reset]').addEventListener('click', async function () {
      var email = form.elements.email.value.trim();
      if (!email) return say('اكتب بريدك الإلكتروني فوق، ثم اضغط «نسيت كلمة المرور».', 'error');
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + BASE + '/login/' });
      say(r.error ? errText(r.error) : 'إذا البريد مسجل، راح توصلك رسالة لإعادة تعيين كلمة المرور.', r.error ? 'error' : 'ok');
    });
    // رابط «نسيت كلمة المرور» من الإيميل: نموذج واضح لكلمة المرور الجديدة
    var hash = new URLSearchParams(location.hash.slice(1)), query = new URLSearchParams(location.search);
    var linkError = hash.get('error_code') || hash.get('error') || query.get('error_code') || query.get('error');
    if (linkError) {
      say(/expired|invalid|otp/i.test(linkError + ' ' + (hash.get('error_description') || query.get('error_description') || ''))
        ? 'رابط إعادة التعيين انتهت صلاحيته أو استُخدم قبل. اكتب بريدك واضغط «نسيت كلمة المرور؟» مرة ثانية، وافتح أحدث رسالة بس.'
        : 'تعذّر فتح رابط إعادة التعيين. اطلب رابط جديد من «نسيت كلمة المرور؟».', 'error');
      window.history.replaceState(null, '', location.pathname);
    }
    var shown = false;
    function recoveryForm() {
      if (shown) return; shown = true;
      form.hidden = true; $$('[data-reset], [data-signup]').forEach(function (x) { (x.closest('p, details') || x).hidden = true; });
      var rf = el('form', { class: 'form', novalidate: true }, [
        el('h2', { text: 'كلمة مرور جديدة' }),
        el('div', { class: 'field' }, [el('label', { for: 'f-new-pw', text: 'كلمة المرور الجديدة' }), el('input', { id: 'f-new-pw', type: 'password', minlength: 10, autocomplete: 'new-password', required: true }), el('span', { class: 'hint', text: '١٠ أحرف على الأقل' })]),
        el('div', { class: 'field' }, [el('label', { for: 'f-new-pw2', text: 'أعد كتابتها' }), el('input', { id: 'f-new-pw2', type: 'password', autocomplete: 'new-password', required: true })]),
        el('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'حفظ كلمة المرور' })]);
      form.parentNode.insertBefore(rf, form);
      rf.addEventListener('submit', async function (e) {
        e.preventDefault();
        var a = rf.querySelector('#f-new-pw').value, b2 = rf.querySelector('#f-new-pw2').value;
        if (a.length < 10) return say('كلمة المرور ١٠ أحرف على الأقل.', 'error');
        if (a !== b2) return say('كلمتا المرور غير متطابقتين.', 'error');
        busy(rf, true);
        var r = await sb.auth.updateUser({ password: a });
        busy(rf, false);
        if (r.error) return say(errText(r.error), 'error');
        window.history.replaceState(null, '', location.pathname);
        say('تم تغيير كلمة المرور ✅ جارِ الدخول...', 'ok');
        var p2 = await profile(r.data.user.id);
        setTimeout(function () { go(KITCHEN_SITE ? '/owner/dashboard/' : p2 && p2.role === 'admin' ? '/admin/' : '/owner/dashboard/'); }, 900);
      });
      rf.querySelector('#f-new-pw').focus();
    }
    sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') recoveryForm(); });
    // إذا وصل الحدث قبل ما نسجّل المستمع: نتعرف على الرابط من العنوان نفسه
    if (hash.get('type') === 'recovery' || query.get('type') === 'recovery') sb.auth.getSession().then(function (r) { if (r.data.session) recoveryForm(); });
  }

  // ---------- لوحة التحكم ----------
  var STATUS = { pending: 'بانتظار المراجعة', published: 'منشور', rejected: 'مرفوض', hidden: 'مخفي', removed: 'محذوف' };
  function badge(st, text) { return el('span', { class: 'status status-' + st, text: text || STATUS[st] || st }); }

  function editInfo(b) {
    var d = b.details || {}, keep = (b.images || []).slice(), fresh = [];
    var f = el('form', { class: 'form', novalidate: true });
    function field(name, label, value, area, hint) {
      var id = 'e' + b.id + '-' + name, inp = el(area ? 'textarea' : 'input', { id: id, name: name, rows: area ? 3 : null, maxlength: name === 'body' ? 2000 : name === 'services' ? 1000 : 300 });
      inp.value = value || '';
      return el('div', { class: 'field' }, [el('label', { for: id, text: label }), inp, hint ? el('span', { class: 'hint', text: hint }) : null]);
    }
    f.appendChild(field('body', 'وصف المحل', b.body, true, 'شنو تبيع أو تقدم، وأي شي يميز محلك'));
    f.appendChild(field('address', 'العنوان', d.address, false, 'الشارع أو أقرب نقطة دالة'));
    f.appendChild(field('hours', 'أوقات الدوام', d.hours, false, 'مثال: يومياً من ٩ الصبح لـ ١١ بالليل'));
    // ساعة الفتح والسد: الموقع يكتب «مفتوح الآن» أو «مغلق الآن» لحاله
    var tf = el('input', { type: 'time', id: 'e' + b.id + '-from', name: 'open_from', value: d.open_from || '' });
    var tt = el('input', { type: 'time', id: 'e' + b.id + '-to', name: 'open_to', value: d.open_to || '' });
    f.appendChild(el('div', { class: 'field' }, [el('span', { class: 'label', text: 'ساعات الفتح (حتى يطلع «مفتوح الآن» تلقائياً)' }),
      el('div', { class: 'time-row' }, [el('label', { for: tf.id, text: 'يفتح' }), tf, el('label', { for: tt.id, text: 'يسد' }), tt]),
      el('span', { class: 'hint', text: 'إذا تسد بعد نص الليل عادي، مثلاً يفتح 16:00 ويسد 02:00.' })]));
    f.appendChild(field('services', 'الخدمات أو المنتجات الرئيسية', d.services, true));
    f.appendChild(field('delivery', 'مناطق التوصيل', d.delivery, false, 'إذا عندك توصيل'));
    var waId = 'e' + b.id + '-wa', wa = el('input', { type: 'checkbox', id: waId, checked: b.whatsapp });
    f.appendChild(el('div', { class: 'check' }, [wa, el('label', { for: waId, text: 'رقم المحل عليه واتساب' })]));
    var pics = el('ul', { class: 'thumbs picked' });
    function drawPics() {
      pics.textContent = '';
      keep.concat(fresh).forEach(function (item) {
        var src = typeof item === 'string' ? mediaUrl(item) : URL.createObjectURL(item);
        pics.appendChild(el('li', {}, [el('img', { src: src, alt: '', width: 96, height: 96 }), el('button', { class: 'thumb-x', type: 'button', 'aria-label': 'حذف الصورة', text: '×', onclick: function () {
          var i = keep.indexOf(item); if (i >= 0) keep.splice(i, 1); else fresh.splice(fresh.indexOf(item), 1); drawPics();
        } })]));
      });
      add.hidden = keep.length + fresh.length >= 6;
    }
    var picker = el('input', { type: 'file', accept: 'image/*', multiple: true, 'aria-label': 'إضافة صور' });
    var add = el('label', { class: 'btn btn-sm btn-pick' }, ['+ إضافة صور من المعرض', picker]);
    picker.addEventListener('change', function () { Array.prototype.slice.call(picker.files || []).forEach(function (x) { if (keep.length + fresh.length < 6) fresh.push(x); }); picker.value = ''; drawPics(); });
    f.appendChild(el('div', { class: 'field' }, [el('span', { class: 'label', text: 'صور المحل (حتى ٦)' }), pics, add]));
    drawPics();
    var save = el('button', { class: 'btn btn-primary', type: 'submit', text: 'حفظ التعديلات' });
    f.appendChild(save);
    f.appendChild(el('p', { class: 'hint', text: 'تريد تغيير اسم المحل أو رقمه أو منطقته؟ راسل خدمة العملاء.' }));
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); busy(f, true);
      try {
        var paths = keep.slice();
        for (var i = 0; i < fresh.length; i++) { say('جارِ رفع الصور (' + (i + 1) + ' من ' + fresh.length + ')...', 'ok'); paths.push(await upload('media', 'u/' + b.owner_id + '/' + hex() + '.webp', await toWebp(fresh[i]))); }
        var r = await sb.rpc('update_business_info', { p_id: b.id, p_body: f.elements.body.value.trim(), p_images: paths, p_whatsapp: wa.checked,
          p_details: { address: f.elements.address.value, hours: f.elements.hours.value, services: f.elements.services.value, delivery: f.elements.delivery.value, open_from: tf.value, open_to: tt.value } });
        if (r.error) throw r.error;
        say('تم حفظ معلومات المحل ✅ تظهر بصفحتك بعد التحديث التلقائي للموقع.', 'ok');
        initDashboard();
      } catch (err) { say(errText(err), 'error'); }
      finally { busy(f, false); }
    });
    return el('details', { class: 'owner-block owner-edit' }, [el('summary', {}, [el('h4', { text: 'تعديل معلومات المحل وصوره' })]), f]);
  }

  var KITS = (function () { var n = document.querySelector('[data-kits]'); try { return n ? JSON.parse(n.getAttribute('data-kits')) : {}; } catch { return {}; } })();

  async function initDashboard() {
    var s = await requireLogin(); if (!s) return;
    if (new URLSearchParams(location.search).get('sent')) say('وصل طلبك. الإدارة راح تتحقق وتتواصل وياك. تگدر من هسه تجهز قائمة الأسعار.', 'ok');
    var p = await profile(s.user.id);
    $('[data-who]').textContent = 'أهلاً ' + (p ? p.name : '') + '. أدر صفحة محلك وقائمة الأسعار.';
    if (p && p.role === 'admin') $('[data-who]').appendChild(el('a', { href: BASE + '/admin/', text: ' (لوحة الإدارة)' }));
    var uid = s.user.id;
    var res = await sb.from('posts').select('*').or('owner_id.eq.' + uid + ',author_id.eq.' + uid).neq('status', 'removed').order('updated_at', { ascending: false });
    var claims = await sb.from('claims').select('business_id, status, note').eq('user_id', uid);
    var claimOf = {}; (claims.data || []).forEach(function (c) { claimOf[c.business_id] = c; });
    var posts = res.data || [];
    var bizBox = $('[data-businesses]'), adsBox = $('[data-ads]');
    bizBox.textContent = ''; adsBox.textContent = '';
    var biz = posts.filter(function (x) { return x.type === 'business'; });
    if (!biz.length) bizBox.appendChild(el('div', { class: 'empty' }, [el('p', { class: 'empty-title', text: 'ما عندك محلات بعد' }), el('a', { class: 'btn btn-primary', href: BASE + '/owner/register', text: 'إضافة مطعم أو محل' })]));
    var list = el('ul', { class: 'owner-cards' }); bizBox.appendChild(list);
    biz.forEach(function (b) {
      var owner = b.owner_id === uid, c = claimOf[b.id];
      var head = el('div', { class: 'owner-card-head' }, [el('h3', { text: b.title }),
        !owner && c && c.status === 'pending' ? badge('pending', 'قيد التحقق من الملكية') : !owner && c && c.status === 'rejected' ? badge('rejected', 'لم يتم الاعتماد') : badge(b.status)]);
      var card = el('li', { class: 'panel owner-card' }, [head, el('p', { class: 'muted', text: b.category + '، ' + b.area })]);
      if (b.status_reason && b.status !== 'published') card.appendChild(el('p', { class: 'note', text: b.status_reason }));
      if (c && c.status === 'rejected' && c.note) card.appendChild(el('p', { class: 'note note-warn', text: c.note }));
      var row = el('div', { class: 'btn-row' }, [el('a', { class: 'btn btn-primary', href: BASE + '/owner/menu/?b=' + b.id, text: /مطاعم|أفران/.test(b.category) ? 'قائمة الطعام' : (KITS[b.category] ? KITS[b.category].label : 'المنتجات والأسعار') })]);
      if (b.status === 'published') row.appendChild(el('a', { class: 'btn', href: BASE + PATHS.business + '/' + b.id + '/', text: 'عرض الصفحة' }));
      card.appendChild(row);
      if (b.status === 'published') {
        var statLine = el('p', { class: 'owner-stats muted', text: 'جارِ حساب المشاهدات...' }); card.appendChild(statLine);
        (async function (b, statLine) {
          var v = await sb.rpc('post_stats', { p_id: b.id });
          var rs = await sb.from('rating_summary').select('avg, n').eq('target_type', 'post').eq('target_id', b.id).maybeSingle();
          var total = (v.data || []).reduce(function (n, d) { return n + d.n; }, 0);
          statLine.textContent = v.error ? '' : 'صفحتك انشافت ' + nf.format(total) + ' مرة خلال آخر ٣٠ يوم' + (rs.data && rs.data.n ? '، وتقييمك ' + rs.data.avg + ' من ٥ (' + nf.format(rs.data.n) + ' تقييم)' : '') + '.';
        })(b, statLine);
      }
      if (owner && b.status === 'published') {
        var st = el('div', { class: 'btn-row' }, [el('span', { text: 'المحل الآن:' })]);
        [['open', 'مفتوح'], ['closed', 'مغلق'], ['unknown', 'غير محدد']].forEach(function (o) {
          st.appendChild(el('button', { class: 'btn btn-sm' + (b.open_state === o[0] ? ' btn-primary' : ''), type: 'button', 'aria-pressed': String(b.open_state === o[0]), text: o[1], onclick: async function () {
            var r = await sb.rpc('set_open_state', { p_id: b.id, p_state: o[0] });
            if (r.error) return say(errText(r.error), 'error');
            say('تم تحديث حالة المحل.', 'ok'); initDashboard();
          } }));
        });
        card.appendChild(st);

        // تعديل معلومات المحل وصوره (بدون مراجعة جديدة)
        card.appendChild(editInfo(b));

        // الشعار: يظهر بجانب اسم المحل في الموقع
        var logoInput = el('input', { type: 'file', accept: 'image/*', 'aria-label': 'صورة الشعار' });
        var logoRow = el('div', { class: 'logo-row' }, [
          b.logo ? el('img', { class: 'biz-logo', src: mediaUrl(b.logo), alt: 'الشعار الحالي', width: 72, height: 72 }) : el('span', { class: 'muted', text: 'ما كو شعار بعد.' }),
          el('label', { class: 'btn btn-sm' }, [b.logo ? 'تغيير الشعار' : 'رفع شعار المحل', logoInput])]);
        logoInput.addEventListener('change', async function () {
          var file = logoInput.files[0]; if (!file) return;
          say('جارِ رفع الشعار...', 'ok');
          try {
            var path = await upload('media', 'u/' + uid + '/' + hex() + '.webp', await toWebp(file, 600));
            var r = await sb.rpc('set_business_logo', { p_id: b.id, p_path: path });
            if (r.error) throw r.error;
            say('تم حفظ الشعار. يظهر بالموقع خلال ربع ساعة.', 'ok'); initDashboard();
          } catch (err) { say(errText(err), 'error'); }
        });
        card.appendChild(el('div', { class: 'owner-block' }, [el('h4', { text: 'شعار المحل' }), logoRow]));

        // التمييز المدفوع: أول الصفحة الرئيسية وأول قسم المحل
        var featured = b.featured_until && new Date(b.featured_until) > new Date();
        var fx = [el('h4', { text: 'التمييز' })];
        if (featured) fx.push(el('p', {}, [el('span', { class: 'badge badge-ok', text: 'مميز' }), ' حتى ' + dayText(b.featured_until)]));
        fx.push(el('p', { class: 'muted', text: 'محلك يظهر بأول الصفحة الرئيسية وأول قسمه لمدة ' + FEATURE_DAYS + ' أيام بـ ' + nf.format(FEE) + ' د.ع.' }));
        var wa = waTo('أريد تمييز «' + b.title + '» لمدة ' + FEATURE_DAYS + ' أيام بـ ' + nf.format(FEE) + ' د.ع. (رقم المحل في الدليل: ' + b.id + ')');
        if (wa) fx.push(el('a', { class: 'btn btn-sign', href: wa, target: '_blank', rel: 'noopener', text: featured ? 'تمديد التمييز ' + FEATURE_DAYS + ' أيام' : 'ميّز محلك ' + FEATURE_DAYS + ' أيام' }));
        card.appendChild(el('div', { class: 'owner-block' }, fx));
      }
      list.appendChild(card);
    });
    var ads = posts.filter(function (x) { return x.type !== 'business'; });
    if (!ads.length) adsBox.appendChild(el('p', { class: 'muted', text: 'ما عندك إعلانات.' }));
    var ul = el('ul', { class: 'manage-list' }); adsBox.appendChild(ul);
    ads.forEach(function (a) {
      ul.appendChild(el('li', {}, [el('strong', { text: a.title }), ' ', el('span', { class: 'muted', text: TYPE_LABEL[a.type] }), ' ', badge(a.status),
        a.status_reason ? el('p', { class: 'reason', text: a.status_reason }) : null,
        a.fee_due > 0 && a.status !== 'rejected' && a.status !== 'removed' ? el('p', { class: 'note note-price' }, ['رسوم هذا الإعلان ' + nf.format(a.fee_due) + ' د.ع (الإعلان الأول فقط مجاني). إذا وصلت رسومك 3,000 د.ع يتوقف النشر لحد ما تسدد. ',
          waTo('أريد دفع رسوم إعلاني «' + a.title + '» (' + nf.format(a.fee_due) + ' د.ع).') ? el('a', { href: waTo('أريد دفع رسوم إعلاني «' + a.title + '» (' + nf.format(a.fee_due) + ' د.ع).'), target: '_blank', rel: 'noopener', text: 'تواصل للدفع' }) : null]) : null,
        el('button', { class: 'btn btn-sm', type: 'button', text: 'حذف', onclick: async function () {
          if (!confirm('حذف الإعلان؟')) return;
          var r = await sb.rpc('remove_own_post', { p_id: a.id });
          if (r.error) return say(errText(r.error), 'error');
          initDashboard();
        } })]));
    });
    var cbox = $('[data-commission]');
    if (cbox) { cbox.closest('section').hidden = !biz.length; if (biz.length) commissionBox(cbox, false); }
  }

  // ---------- القائمة ----------
  async function initMenu() {
    var s = await requireLogin(); if (!s) return;
    if (ADMIN_SITE && !(await ensureMfa())) return;
    var bid = Number(new URLSearchParams(location.search).get('b'));
    var b = bid ? (await sb.from('posts').select('id, title, status, owner_id, author_id, category').eq('id', bid).maybeSingle()).data : null;
    if (!b) { say('المحل غير موجود أو ما تملك صلاحية إدارته.', 'error'); return; }
    $('[data-biz-name]').textContent = b.title;
    var addForm = $('[data-add-item]');
    async function load() {
      var r = await sb.from('menu_items').select('*').eq('business_id', bid).order('section').order('sort').order('id');
      var items = r.data || [], box = $('[data-items]'), dl = $('#sections');
      box.textContent = ''; dl.textContent = '';
      var groups = {};
      items.forEach(function (it) { (groups[it.section || 'بدون قسم'] = groups[it.section || 'بدون قسم'] || []).push(it); });
      Object.keys(groups).forEach(function (sec) {
        if (sec !== 'بدون قسم') dl.appendChild(el('option', { value: sec }));
        var ul = el('ul', { class: 'menu-list' });
        groups[sec].forEach(function (it) { ul.appendChild(itemRow(it)); });
        box.appendChild(el('section', { class: 'block' }, [el('h2', { text: sec }), ul]));
      });
      var kitsAttr = $('[data-page=menu]').getAttribute('data-kits'), kit = kitsAttr ? JSON.parse(kitsAttr)[b.category] : null;
      if (kit) {
        $('h1').textContent = kit.label;
        parseMenu(kit.menu).forEach(function (it) { if (it.section && !groups[it.section] && !dl.querySelector('option[value="' + it.section + '"]')) dl.appendChild(el('option', { value: it.section })); });
      }
      if (!items.length && kit) {
        var ready = parseMenu(kit.menu), secs = ready.map(function (it) { return it.section; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        box.appendChild(el('div', { class: 'empty kit-start' }, [el('p', { class: 'empty-title', text: 'ابدأ بقائمة جاهزة لـ «' + b.category + '»' }),
          el('p', { text: ready.length + ' صنف جاهز: ' + secs.join('، ') + '. عدّل أسعارها بعدين.' }),
          el('button', { class: 'btn btn-sign', type: 'button', text: 'أضف القائمة الجاهزة', onclick: async function (e) {
            e.target.disabled = true;
            var r = await sb.from('menu_items').insert(ready.map(function (it, k) { return { business_id: bid, section: it.section, name: it.name, price: it.price, note: it.note, sort: k }; }));
            if (r.error) { e.target.disabled = false; return say(errText(r.error), 'error'); }
            say('تمت إضافة ' + ready.length + ' صنف ✅ عدّل الأسعار من كل صنف.' + (ADMIN_SITE ? '' : ' تظهر بصفحتك بعد موافقة الإدارة.'), 'ok'); load();
          } })]));
      } else if (!items.length) box.appendChild(el('p', { class: 'muted', text: 'القائمة فارغة. أضف أول صنف من فوق.' }));
    }
    function itemRow(it) {
      var f = el('form', { class: 'form compact' }, [
        labeled('القسم', el('input', { name: 'section', value: it.section, maxlength: 60, list: 'sections' })),
        labeled('الاسم', el('input', { name: 'name', value: it.name, maxlength: 80, required: true })),
        labeled('السعر', el('input', { name: 'price', value: it.price == null ? '' : String(it.price), inputmode: 'numeric' })),
        labeled('الوصف', el('input', { name: 'note', value: it.note, maxlength: 200 })),
        labeled(it.image ? 'تغيير الصورة' : 'إضافة صورة', el('input', { type: 'file', name: 'image', accept: 'image/*' })),
        el('div', { class: 'check' }, [el('input', { type: 'checkbox', name: 'available', id: 'av-' + it.id, checked: it.available }), el('label', { for: 'av-' + it.id, text: 'متوفر حالياً' })]),
        el('div', { class: 'btn-row' }, [el('button', { class: 'btn btn-primary btn-sm', type: 'submit', text: 'حفظ' }),
          el('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'حذف الصنف', onclick: async function () {
            if (!confirm('حذف «' + it.name + '»؟')) return;
            var r = await sb.from('menu_items').delete().eq('id', it.id);
            if (r.error) return say(errText(r.error), 'error');
            if (it.image) await sb.storage.from('media').remove([it.image]);
            load();
          } })])]);
      f.addEventListener('submit', async function (e) {
        e.preventDefault(); delete f.dataset.submitting;
        var name = f.elements.name.value.trim();
        if (name.length < 2) return say('اسم الصنف قصير.', 'error');
        var upd = { section: f.elements.section.value.trim(), name: name, price: money(f.elements.price.value),
          note: f.elements.note.value.trim(), available: f.elements.available.checked };
        busy(f, true);
        try {
          var file = f.elements.image.files[0];
          if (file) { say('جارِ رفع الصورة...', 'ok'); upd.image = await upload('media', 'u/' + s.user.id + '/' + hex() + '.webp', await toWebp(file, 800)); }
          var r = await sb.from('menu_items').update(upd).eq('id', it.id);
          if (r.error) throw r.error;
          if (upd.image && it.image) sb.storage.from('media').remove([it.image]);
          say('تم الحفظ.', 'ok'); load();
        } catch (err) { say(errText(err), 'error'); }
        finally { busy(f, false); }
      });
      var summary = el('summary', {}, [el('span', { class: 'menu-name', text: it.name }), ' ', el('span', { class: 'num menu-price', text: price(it.price) }),
        it.available ? null : el('span', { class: 'badge badge-warn', text: 'غير متوفر' }),
        it.approved === false ? el('span', { class: 'status status-pending', text: 'بانتظار موافقة الإدارة' }) : null]);
      return el('li', { class: 'menu-item' + (it.available ? '' : ' unavailable') }, [
        it.image ? el('img', { src: mediaUrl(it.image), alt: '', width: 72, height: 72, loading: 'lazy' }) : null,
        el('details', { class: 'menu-edit' }, [summary, f])]);
    }
    function labeled(text, input) { var id = 'f' + hex().slice(0, 8); input.id = id; return el('div', { class: 'field' }, [el('label', { for: id, text: text }), input]); }
    addForm.addEventListener('submit', async function (e) {
      e.preventDefault(); delete addForm.dataset.submitting;
      var f = addForm.elements, name = f.name.value.trim();
      if (name.length < 2) return say('اكتب اسم الصنف.', 'error');
      if (f.price.value.trim() && money(f.price.value) == null) return say('السعر أرقام فقط.', 'error');
      busy(addForm, true);
      try {
        if (f.image.files[0]) say('جارِ رفع الصورة...', 'ok');
        var image = f.image.files[0] ? await upload('media', 'u/' + s.user.id + '/' + hex() + '.webp', await toWebp(f.image.files[0], 800)) : null;
        var r = await sb.from('menu_items').insert({ business_id: bid, section: f.section.value.trim(), name: name, price: money(f.price.value), note: f.note.value.trim(), image: image });
        if (r.error) throw r.error;
        addForm.reset(); say(ADMIN_SITE ? 'تمت إضافة «' + name + '».' : 'وصل «' + name + '» ✅ يظهر بصفحتك بعد موافقة الإدارة (تغيير السعر والتوفر ما يحتاج موافقة).', 'ok'); load();
      } catch (err) { say(errText(err), 'error'); }
      finally { busy(addForm, false); }
    });
    load();
  }

  // ---------- نسبة الموقع من طلبات المطاعم (كشف شهري) ----------
  function commissionBox(box, admin) {
    if (!box) return;
    box.textContent = '';
    var now = new Date(), cur = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
    var monthIn = el('input', { type: 'month', id: 'f-month', value: cur, max: cur });
    var out = el('div', { 'aria-live': 'polite' });
    box.appendChild(el('div', { class: 'field month-pick' }, [el('label', { for: 'f-month', text: 'الشهر' }), monthIn]));
    box.appendChild(out);
    async function show() {
      out.textContent = '';
      var r = await sb.rpc('commission_report', { p_month: (monthIn.value || cur) + '-01' });
      if (r.error) { out.appendChild(el('p', { class: 'muted', text: errText(r.error) })); return; }
      var rows = r.data || [];
      if (!rows.length) { if (admin) stat('due', 0); out.appendChild(el('div', { class: 'empty' }, [el('p', { class: 'empty-title', text: 'ما كو طلبات بهذا الشهر' }), el('p', { text: 'الطلبات اللي تجي من سلة الموقع تظهر هنا مع نسبتها.' })])); return; }
      var due = 0, got = 0, top = Math.max.apply(null, rows.map(function (x) { return Number(x.total) || 0; }).concat([1]));
      var tb = el('tbody');
      rows.forEach(function (x) {
        if (x.paid) got += Number(x.paid_amount || 0); else due += Number(x.commission);
        var status = x.paid ? el('span', { class: 'badge badge-ok', text: 'مدفوع' }) : el('span', { class: 'badge badge-warn', text: 'غير مدفوع' });
        var bar = el('span', { class: 'bar', 'aria-hidden': 'true' }, [el('span')]);
        bar.firstChild.style.setProperty('--w', Math.round((Number(x.total) || 0) / top * 100) + '%');
        var cells = [el('td', { text: x.title }), el('td', { class: 'num', text: nf.format(x.orders) }), el('td', { class: 'num' }, [nf.format(x.total) + ' د.ع', bar]),
          el('td', { class: 'num', text: nf.format(x.paid ? x.paid_amount : x.commission) + ' د.ع' }), el('td', {}, [status])];
        if (admin) cells.push(el('td', {}, [el('button', { class: 'btn btn-sm' + (x.paid ? '' : ' btn-primary'), type: 'button', text: x.paid ? 'إلغاء' : 'تم الدفع', onclick: async function () {
          if (!x.paid && !confirm('تأكيد استلام ' + nf.format(x.commission) + ' د.ع من «' + x.title + '»؟')) return;
          var m = await sb.rpc('mark_commission_paid', { p_business: x.business_id, p_month: (monthIn.value || cur) + '-01', p_paid: !x.paid });
          if (m.error) return say(errText(m.error), 'error');
          say(x.paid ? 'أُلغي التأكيد.' : 'تم تسجيل الدفع.', 'ok'); show();
        } })]));
        tb.appendChild(el('tr', {}, cells));
      });
      if (admin) stat('due', due);
      var heads = ['المحل', 'الطلبات', 'مجموع الطلبات', 'النسبة (٥٪)', 'الحالة'].concat(admin ? [''] : []);
      out.appendChild(el('p', { class: 'commission-sum' }, [admin ? 'المستحق غير المدفوع: ' : 'المستحق عليك هذا الشهر: ', el('b', { text: nf.format(due) + ' د.ع' }),
        got ? '  ·  المستلم: ' + nf.format(got) + ' د.ع' : '']));
      out.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [el('thead', {}, [el('tr', {}, heads.map(function (h) { return el('th', { scope: 'col', text: h }); }))]), tb])]));
    }
    monthIn.addEventListener('change', show);
    show();
  }

  // ---------- موقع المطعم: استلام الطلبات ----------
  async function initKitchen() {
    var s = await requireLogin(); if (!s) return;
    var p = await profile(s.user.id);
    var mine = await sb.from('posts').select('id, title, status').eq('type', 'business').or('owner_id.eq.' + s.user.id + ',author_id.eq.' + s.user.id).neq('status', 'removed');
    var shops = (mine.data || []).filter(function (b) { return b.status === 'published'; });
    var isAdmin = p && p.role === 'admin';
    if (!shops.length && !isAdmin) {
      say('حسابك مو مربوط بأي محل بعد. راسل خدمة العملاء وأرسل بريدك حتى نربطه بمحلك.', 'error');
      var w = waTo('أريد ربط حسابي بمحلي في دليل المعامل. البريد: ' + (s.user.email || ''));
      if (w) $('[data-msg]').appendChild(el('a', { class: 'btn btn-wa btn-sm', href: w, target: '_blank', rel: 'noopener', text: ' راسل خدمة العملاء' }));
      $$('section, details').forEach(function (x) { x.hidden = true; });
      return;
    }
    $('[data-who]').textContent = isAdmin && !shops.length ? 'حساب الإدارة: تشوف طلبات كل المطاعم.' : shops.map(function (b) { return b.title; }).join('، ');
    commissionBox($('[data-commission]'), false);

    // الصوت والإشعارات تحتاج ضغطة من المستخدم أولاً (سياسة المتصفحات)
    var bar = $('[data-kitchen-bar]'), live = $('[data-live]'), liveText = $('[data-live-text]');
    var ac = null, started = false, swReg = null;
    bar.hidden = false;
    function tone(f, t0, d) {
      var o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + d); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + d + 0.05);
    }
    function ring() {
      if (!ac) return;
      if (ac.state === 'suspended') ac.resume();
      tone(988, 0, 0.18); tone(1319, 0.2, 0.18); tone(988, 0.4, 0.18); tone(1319, 0.6, 0.3);
      try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); } catch { /* لا شيء */ }
    }
    async function keepAwake() { try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch { /* لا شيء */ } }
    document.addEventListener('visibilitychange', function () { if (started && document.visibilityState === 'visible') keepAwake(); });
    $('[data-start]').addEventListener('click', async function () {
      try { var A = window.AudioContext || window.webkitAudioContext; ac = new A(); await ac.resume(); } catch { /* لا شيء */ }
      ring();
      try { if ('serviceWorker' in navigator) swReg = await navigator.serviceWorker.register(BASE + '/sw.js', { scope: BASE + '/' }); } catch { /* لا شيء */ }
      try { if (window.Notification && window.Notification.permission === 'default') await window.Notification.requestPermission(); } catch { /* لا شيء */ }
      keepAwake();
      started = true; bar.hidden = true; live.hidden = false;
      say('جاهز ✅ راح تسمع صوت وتوصلك إشعار مع كل طلب جديد.', 'ok');
    });
    $('[data-test-sound]').addEventListener('click', ring);
    function notify(o) {
      var title = 'طلب جديد 🔔 ' + nf.format(o.total) + ' د.ع', body = (o.lines || []).map(function (l) { return l.q + '× ' + l.name; }).join('، ') + ' — ' + (o.landmark || '');
      try {
        if (!window.Notification || window.Notification.permission !== 'granted') return;
        if (swReg && swReg.showNotification) swReg.showNotification(title, { body: body, tag: 'order-' + o.id, renotify: true, requireInteraction: true, dir: 'rtl', lang: 'ar', icon: BASE + '/static/img/logo.svg' });
        else new window.Notification(title, { body: body, tag: 'order-' + o.id });
      } catch { /* لا شيء */ }
    }

    var seen = null, rows = [];
    function ago(t) { var m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? 'هسه' : m < 60 ? 'قبل ' + m + ' دقيقة' : 'قبل ' + Math.round(m / 60) + ' ساعة'; }
    async function decide(o, status) {
      var reason = null, eta = null;
      if (status === 'rejected') { reason = prompt('سبب الرفض (يشوفه الزبون):', 'مشغولين حالياً'); if (!reason || reason.trim().length < 2) return; }
      if (status === 'accepted') { eta = Number(o._eta || 30); }
      var r = await sb.rpc('decide_order', { p_id: o.id, p_status: status, p_reason: reason, p_eta: eta });
      if (r.error) return say(errText(r.error), 'error');
      say(status === 'accepted' ? 'تم قبول الطلب. الزبون يشوف الموافقة هسه.' : status === 'rejected' ? 'تم رفض الطلب.' : 'تم.', 'ok');
      load();
    }
    function card(o) {
      var lines = el('ul', { class: 'order-lines' });
      (o.lines || []).forEach(function (l) { lines.appendChild(el('li', {}, [el('b', { text: l.q + ' × ' }), l.name, l.price != null ? el('span', { class: 'muted', text: '  ' + nf.format(l.price * l.q) }) : null])); });
      var facts = el('dl', { class: 'facts' });
      [['الزبون', o.customer_name || '—'], ['أقرب نقطة دالة', o.landmark || '—'], ['ملاحظات', o.note || '']].forEach(function (kv) {
        if (kv[1]) facts.appendChild(el('div', {}, [el('dt', { text: kv[0] }), el('dd', { text: kv[1] })]));
      });
      var acts = el('div', { class: 'btn-row' });
      if (o.customer_phone) acts.appendChild(el('a', { class: 'btn', href: 'tel:' + o.customer_phone, dir: 'ltr', text: '📞 ' + o.customer_phone }));
      if (o.lat && o.lng) acts.appendChild(el('a', { class: 'btn', href: 'https://maps.google.com/?q=' + o.lat + ',' + o.lng, target: '_blank', rel: 'noopener', text: '📍 الموقع على الخريطة' }));
      var decideRow = el('div', { class: 'btn-row order-decide' });
      if (o.status === 'new') {
        var etaSel = el('select', { 'aria-label': 'وقت التجهيز' }, [10, 20, 30, 45, 60, 90].map(function (m) { return el('option', { value: m, text: m + ' دقيقة', selected: m === 30 }); }));
        etaSel.addEventListener('change', function () { o._eta = etaSel.value; });
        decideRow.appendChild(el('button', { class: 'btn btn-primary btn-lg', type: 'button', text: '✓ قبول', onclick: function () { decide(o, 'accepted'); } }));
        decideRow.appendChild(etaSel);
        decideRow.appendChild(el('button', { class: 'btn btn-danger', type: 'button', text: '✕ رفض', onclick: function () { decide(o, 'rejected'); } }));
      } else if (o.status === 'accepted') {
        decideRow.appendChild(el('button', { class: 'btn btn-primary', type: 'button', text: 'تم التوصيل', onclick: function () { decide(o, 'done'); } }));
        decideRow.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: 'إلغاء الطلب', onclick: function () { decide(o, 'rejected'); } }));
      }
      var st = { new: 'جديد', accepted: 'مقبول' + (o.eta ? ' · ' + o.eta + ' د' : ''), rejected: 'مرفوض', done: 'تم التوصيل' }[o.status];
      return el('li', { class: 'panel order order-' + o.status }, [
        el('div', { class: 'order-top' }, [el('b', { text: 'طلب #' + o.id }), el('span', { class: 'status status-' + o.status, text: st }), el('span', { class: 'muted', text: ago(o.created_at) })]),
        shops.length > 1 || isAdmin ? el('p', { class: 'order-shop', text: o.title }) : null,
        lines, el('p', { class: 'cart-sum', text: 'المجموع: ' + nf.format(o.total) + ' د.ع' }),
        o.status === 'rejected' && o.reason ? el('p', { class: 'note', text: 'سبب الرفض: ' + o.reason }) : null,
        facts, acts, decideRow]);
    }
    function draw() {
      var groups = { new: [], accepted: [], closed: [] };
      rows.forEach(function (o) { (o.status === 'new' ? groups.new : o.status === 'accepted' ? groups.accepted : groups.closed).push(o); });
      groups.new.reverse(); // الأقدم أولاً
      Object.keys(groups).forEach(function (k) {
        var ul = $('[data-list="' + k + '"]');
        ul.textContent = '';
        groups[k].forEach(function (o) { ul.appendChild(card(o)); });
        if (!groups[k].length) ul.appendChild(el('li', { class: 'muted', text: k === 'new' ? 'ماكو طلبات جديدة.' : 'ماكو.' }));
        $('[data-n="' + k + '"]').textContent = nf.format(groups[k].length);
      });
      document.title = (groups.new.length ? '(' + groups.new.length + ') ' : '') + 'الطلبات';
      return groups.new.length;
    }
    var etaMemo = {};
    async function load() {
      var r = await sb.rpc('kitchen_orders');
      if (r.error) { liveText.textContent = 'انقطع الاتصال، نحاول مرة ثانية...'; live.classList.add('off'); return; }
      live.classList.remove('off');
      rows.forEach(function (o) { if (o._eta) etaMemo[o.id] = o._eta; });
      rows = r.data || [];
      rows.forEach(function (o) { if (etaMemo[o.id]) o._eta = etaMemo[o.id]; });
      var fresh = rows.filter(function (o) { return o.status === 'new' && seen && !seen[o.id]; });
      seen = seen || {};
      rows.forEach(function (o) { seen[o.id] = true; });
      var pending = draw();
      liveText.textContent = 'متصل · آخر تحديث ' + new Date().toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit' });
      if (fresh.length) { fresh.forEach(notify); say('🔔 وصل طلب جديد!', 'ok'); }
      if (started && pending) ring(); // يرن كل دورة ما دام أكو طلب بانتظار رد
    }
    await load();
    window.setInterval(load, 6000);
  }

  // ---------- الإدارة ----------
  async function initAdmin() {
    var s = await requireLogin(); if (!s) return;
    var p = await profile(s.user.id);
    if (!p || (p.role !== 'admin' && p.role !== 'moderator')) { say('هذه الصفحة للإدارة فقط.', 'error'); $$('section').forEach(function (x) { x.hidden = true; }); return; }
    if (!(await ensureMfa())) return;
    var IS_ADMIN = p.role === 'admin';
    // المشرف: المراجعة والمنتجات والشكاوى بس؛ الهويات والفلوس والمحلات للمدير
    if (!IS_ADMIN) $$('[data-admin-only]').forEach(function (x) { x.hidden = true; });
    async function feature(x, days) {
      if (days && !confirm('تمييز «' + x.title + '» ' + days + ' أيام؟ تأكد من استلام ' + nf.format(FEE) + ' د.ع.')) return;
      var r = await sb.rpc('feature_post', { p_id: x.id, p_days: days });
      if (r.error) return say(errText(r.error), 'error');
      say(days ? 'تم التمييز. يظهر أولاً خلال ربع ساعة.' : 'أُلغي التمييز.', 'ok'); load();
    }
    async function act(id, action, needReason) {
      var reason = null;
      if (needReason) { reason = prompt('السبب (يظهر لصاحب الإعلان):'); if (!reason || reason.trim().length < 3) return; }
      var r = await sb.rpc('moderate_post', { p_id: id, p_action: action, p_reason: reason });
      if (r.error) return say(errText(r.error), 'error');
      say(action === 'approve' ? 'تم النشر. يظهر بالموقع خلال ربع ساعة.' : 'تم.', 'ok'); load();
    }
    function postCard(x, actions) {
      var d = x.details || {};
      var facts = el('dl', { class: 'facts' });
      [['النوع', TYPE_LABEL[x.type]], ['التصنيف', x.category], ['المنطقة', x.area], ['السعر', x.price != null ? price(x.price) : ''], ['الرقم', (x.contact_phone || '') + (x.show_phone ? '' : ' (مخفي)')],
        ['المرسل', x.guest_name ? x.guest_name + ' (زائر)' : 'صاحب حساب'], ['التاريخ', new Date(x.created_at).toLocaleString('ar-IQ')]]
        .concat(Object.keys(d).map(function (k) { return [k, String(d[k])]; }))
        .forEach(function (kv) { if (kv[1]) facts.appendChild(el('div', {}, [el('dt', { text: kv[0] }), el('dd', { text: kv[1] })])); });
      var imgs = el('ul', { class: 'thumbs' });
      (x.images || []).forEach(function (im) { imgs.appendChild(el('li', {}, [el('a', { href: mediaUrl(im), target: '_blank', rel: 'noopener' }, [el('img', { src: mediaUrl(im), alt: 'صورة مرفوعة', width: 120, height: 90, loading: 'lazy' })])])); });
      return el('li', { class: 'panel' }, [el('h3', { text: x.title }), facts, x.body ? el('p', { class: 'prose', text: x.body }) : null, imgs, el('div', { class: 'btn-row' }, actions)]);
    }
    async function load() {
      var pend = await sb.from('posts').select('*').eq('status', 'pending').order('created_at');
      // المحلات الجديدة تُعتمد من «طلبات أصحاب المحلات»؛ هنا الإعلانات وتعديلات المحلات المعتمدة
      pend.data = (pend.data || []).filter(function (x) { return x.type !== 'business' || x.owner_id; });
      var box = $('[data-pending]'); box.textContent = '';
      var ul = el('ul', { class: 'cards-admin' }); box.appendChild(ul);
      (pend.data || []).forEach(function (x) {
        var actions = [el('button', { class: 'btn btn-primary', type: 'button', text: 'موافقة ونشر', onclick: function () {
            act(x.id, 'approve'); } }),
          el('button', { class: 'btn', type: 'button', text: 'رفض', onclick: function () { act(x.id, 'reject', true); } })];
        if (x.fee_due > 0) {
          actions.unshift(el('span', { class: 'badge badge-warn', text: 'دين ' + nf.format(x.fee_due) + ' د.ع (غير مسدد)' }));
          actions.push(el('button', { class: 'btn', type: 'button', text: 'تم استلام المبلغ', onclick: async function () {
            var r = await sb.rpc('mark_fee_paid', { p_id: x.id });
            if (r.error) return say(errText(r.error), 'error'); say('سُجّل الدفع.', 'ok'); load();
          } }));
        }
        ul.appendChild(postCard(x, actions));
      });
      $('[data-count=pending]').textContent = String((pend.data || []).length);
      stat('pending', (pend.data || []).length);
      if (!(pend.data || []).length) box.appendChild(el('p', { class: 'empty-inline', text: 'ما كو إعلانات بانتظار المراجعة.' }));

      var cl = await sb.from('claims').select('*').eq('status', 'pending').order('created_at');
      var cbox = $('[data-claims]'); cbox.textContent = '';
      var cul = el('ul', { class: 'cards-admin' }); cbox.appendChild(cul);
      var ids = (cl.data || []).map(function (c) { return c.business_id; });
      var bizRes = ids.length ? await sb.from('posts').select('*').in('id', ids) : { data: [] };
      var bizById = {}; (bizRes.data || []).forEach(function (bb) { bizById[bb.id] = bb; });
      var owners = {};
      for (var i = 0; i < (cl.data || []).length; i++) { var c0 = cl.data[i]; if (!owners[c0.user_id]) owners[c0.user_id] = await profile(c0.user_id); }
      for (var j = 0; j < (cl.data || []).length; j++) {
        var c = cl.data[j], bz = bizById[c.business_id] || {}, ow = owners[c.user_id] || {};
        var proof = null;
        if (c.proof_path) { var su = await sb.storage.from('proofs').createSignedUrl(c.proof_path, 900); if (su.data) proof = su.data.signedUrl; }
        (function (c, bz, ow, proof) {
          cul.appendChild(el('li', { class: 'panel claim-card' }, [el('div', { class: 'claim-grid' }, [
            el('div', {}, [el('h3', { text: (bz.title || '') + (bz.status === 'pending' ? ' (محل جديد)' : ' (موجود بالدليل)') }),
              el('p', { text: (bz.category || '') + '، ' + (bz.area || '') + (bz.details && bz.details.address ? '، ' + bz.details.address : '') }),
              el('p', {}, ['رقم المحل: ', el('a', { href: 'tel:' + (c.business_phone || bz.contact_phone || ''), dir: 'ltr', text: c.business_phone || bz.contact_phone || '-' })]),
              el('p', {}, ['صاحب الطلب: ', el('strong', { text: ow.name || '' }), ' ', el('a', { href: 'tel:' + (ow.phone || ''), dir: 'ltr', text: ow.phone || '' })]),
              el('p', { class: 'note', text: c.message })]),
            proof ? el('a', { href: proof, target: '_blank', rel: 'noopener', class: 'proof' }, [el('img', { src: proof, alt: 'صورة إثبات', width: 220, height: 165 })]) : el('p', { class: 'muted', text: 'بدون صورة إثبات' })]),
            el('div', { class: 'btn-row' }, [
              el('button', { class: 'btn btn-primary', type: 'button', text: 'تم التحقق: اعتماد ونشر', onclick: async function () {
                var r = await sb.rpc('decide_claim', { p_id: c.id, p_approve: true, p_note: null });
                if (r.error) return say(errText(r.error), 'error'); say('تم الاعتماد ✅ أرسل لصاحب المحل رابط لوحته حتى يضيف منتجاته وأسعاره: ' + location.origin + BASE.replace(/\/idara$/, '') + '/mat3am/', 'ok'); load();
              } }),
              el('button', { class: 'btn', type: 'button', text: 'رفض', onclick: async function () {
                var note = prompt('سبب الرفض (يصل لصاحب الطلب):'); if (note === null) return;
                var r = await sb.rpc('decide_claim', { p_id: c.id, p_approve: false, p_note: note });
                if (r.error) return say(errText(r.error), 'error'); load();
              } })])]));
        })(c, bz, ow, proof);
      }
      $('[data-count=claims]').textContent = String((cl.data || []).length);
      stat('claims', (cl.data || []).length);
      if (!(cl.data || []).length) cbox.appendChild(el('p', { class: 'empty-inline', text: 'ما كو طلبات.' }));

      // منتجات أصحاب المحلات بانتظار الموافقة
      var pr = await sb.from('menu_items').select('id, name, price, note, section, image, business_id, posts(title, status)').eq('approved', false).order('updated_at').limit(200);
      var prows = (pr.data || []).filter(function (x) { return x.posts && x.posts.status === 'published'; });
      var pbx = $('[data-products]'); pbx.textContent = '';
      $('[data-count=products]').textContent = String(prows.length); stat('products', prows.length);
      if (!prows.length) pbx.appendChild(el('p', { class: 'empty-inline', text: 'ما كو منتجات جديدة.' }));
      var prl = el('ul', { class: 'product-review' }); pbx.appendChild(prl);
      prows.forEach(function (it) {
        prl.appendChild(el('li', { class: 'panel' }, [
          it.image ? el('a', { href: mediaUrl(it.image), target: '_blank', rel: 'noopener' }, [el('img', { src: mediaUrl(it.image), alt: 'صورة ' + it.name, width: 120, height: 120, loading: 'lazy' })]) : el('span', { class: 'muted', text: 'بدون صورة' }),
          el('div', { class: 'pr-body' }, [el('b', { text: it.name }), el('span', { class: 'muted', text: it.posts.title + (it.section ? ' · ' + it.section : '') }),
            el('span', { class: 'num', text: price(it.price) }), it.note ? el('span', { text: it.note }) : null,
            el('div', { class: 'btn-row' }, [
              el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'موافقة ونشر', onclick: async function () {
                var r = await sb.from('menu_items').update({ approved: true }).eq('id', it.id);
                if (r.error) return say(errText(r.error), 'error'); say('تمت الموافقة على «' + it.name + '». يظهر بصفحة المحل خلال دقائق.', 'ok'); load();
              } }),
              el('button', { class: 'btn btn-sm', type: 'button', text: 'رفض وحذف', onclick: async function () {
                if (!confirm('حذف «' + it.name + '» من قائمة ' + it.posts.title + '؟')) return;
                var r = await sb.from('menu_items').delete().eq('id', it.id);
                if (r.error) return say(errText(r.error), 'error');
                if (it.image) await sb.storage.from('media').remove([it.image]);
                say('تم الحذف.', 'ok'); load();
              } })])])]));
      });

      var pub = await sb.from('posts').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(100);
      var pbox = $('[data-published]'); pbox.textContent = '';
      stat('published', (pub.data || []).length);
      var pul = el('ul', { class: 'manage-list' }); pbox.appendChild(pul);
      var vw = await sb.rpc('views_30d'), views = {}; (vw.data || []).forEach(function (v) { views[v.post_id] = v.n; });
      (pub.data || []).forEach(function (x) {
        pul.appendChild(el('li', {}, [el('a', { href: BASE + PATHS[x.type] + '/' + x.id + '/', text: x.title }), ' ', el('span', { class: 'muted', text: TYPE_LABEL[x.type] + ' · ' + nf.format(views[x.id] || 0) + ' مشاهدة' }),
          x.verified ? el('span', { class: 'badge badge-ok', text: 'موثّق' }) : null,
          el('div', { class: 'btn-row' }, [
            x.type === 'business' ? el('a', { class: 'btn btn-sm btn-primary', href: BASE + '/admin/menu/?b=' + x.id, text: 'القائمة والأسعار' }) : null,
            IS_ADMIN && x.type === 'business' ? el('button', { class: 'btn btn-sm btn-sign', type: 'button', text: 'رابط خاص لصاحب المحل', onclick: async function () {
              var r = await sb.rpc('create_invite', { p_business: x.id });
              if (r.error) return say(errText(r.error), 'error');
              var link = location.origin + BASE.replace(/\/idara$/, '') + '/mat3am/login/?invite=' + r.data;
              var text = 'استاذ هذا الرابط الخاص بصفحة «' + x.title + '» بدليل المعامل، تكدر تضيف منتجاتك وأسعارك وصورك من خلاله:\n' + link + '\n\nافتح الرابط وسوّي حسابك ببريدك وكلمة مرور، وتنفتحلك صفحتك مباشرة.';
              say('الرابط الخاص بـ «' + x.title + '» (صالح ٣٠ يوم، ولشخص واحد):', 'ok');
              var box = $('[data-msg]');
              box.appendChild(el('div', { class: 'invite-box' }, [el('input', { type: 'text', readonly: true, value: link, dir: 'ltr', 'aria-label': 'الرابط الخاص', onclick: function (e) { e.target.select(); } }),
                el('div', { class: 'btn-row' }, [
                  el('a', { class: 'btn btn-wa btn-sm', href: 'https://wa.me/?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener', text: 'أرسل بالواتساب' }),
                  el('button', { class: 'btn btn-sm', type: 'button', text: 'نسخ الرسالة', onclick: function (e) {
                    var b = e.target; (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { b.textContent = 'تم النسخ ✓'; }, function () { b.textContent = 'انسخ الرابط من المربع'; });
                  } })])]));
              box.scrollIntoView({ block: 'nearest' });
            } }) : null,
            IS_ADMIN && x.type === 'business' ? el('button', { class: 'btn btn-sm', type: 'button', text: x.owner_id ? 'تغيير حساب صاحب المحل' : 'ربط حساب صاحب المحل', onclick: async function () {
              var email = prompt('بريد حساب صاحب المحل (يسويه من /mat3am):');
              if (!email || email.indexOf('@') < 1) return;
              var r = await sb.rpc('assign_owner', { p_business: x.id, p_email: email.trim() });
              if (r.error) return say(errText(r.error), 'error');
              say('تم ربط الحساب بـ «' + x.title + '». صاحب المحل يكدر يستلم الطلبات هسه.', 'ok'); load();
            } }) : null,
            el('button', { class: 'btn btn-sm', type: 'button', text: 'إخفاء', onclick: function () { act(x.id, 'hide', true); } }),
            el('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'حذف', onclick: function () { act(x.id, 'remove', true); } }),
            x.type === 'business' || x.type === 'help' ? el('button', { class: 'btn btn-sm', type: 'button', text: x.verified ? 'إلغاء التوثيق' : 'توثيق (بعد التحقق)', onclick: function () { act(x.id, x.verified ? 'unverify' : 'verify'); } }) : null,
            x.type === 'community' ? el('button', { class: 'btn btn-sm', type: 'button', text: x.is_official ? 'إلغاء «خبر مؤكد»' : 'خبر مؤكد', onclick: function () { act(x.id, x.is_official ? 'unofficial' : 'official'); } }) : null,
            IS_ADMIN ? el('button', { class: 'btn btn-sm btn-sign', type: 'button', text: 'تمييز ' + FEATURE_DAYS + ' أيام (مدفوع)', onclick: function () { feature(x, FEATURE_DAYS); } }) : null,
            IS_ADMIN && x.featured_until && new Date(x.featured_until) > new Date() ? el('button', { class: 'btn btn-sm', type: 'button', text: 'مميز حتى ' + dayText(x.featured_until) + ' — إلغاء', onclick: function () { feature(x, 0); } }) : null])]));
      });
    }
    load();
    trustAdmin();
    engineersAdmin($('[data-engineers-admin]'), IS_ADMIN);
    if (!IS_ADMIN) return;
    debtsAdmin($('[data-debts]'), load);
    ridersAdmin($('[data-riders-admin]'));
    faresAdmin($('[data-fares-admin]'));
    commissionBox($('[data-commission]'), true);
    staffAdmin($('[data-staff]'));
    pushAdmin($('[data-push-admin]'));
  }

  // ---------- الإدارة: إشعارات الموقع ----------
  async function pushAdmin(box) {
    var r = await sb.rpc('push_stats');
    box.textContent = '';
    if (r.error) return box.appendChild(el('p', { class: 'muted', text: 'الإشعارات تحتاج تشغيل تحديث supabase/updates/2026-11-push.sql.' }));
    var st = r.data || {}, KIND = { news: 'خبر', promo: 'تنبيهية', admin: 'منك' };
    box.appendChild(el('p', { class: 'push-count' }, [el('b', { class: 'num', text: nf.format(st.subscribers || 0) }), ' مشترك بالإشعارات']));
    if (!st.ready) box.appendChild(el('p', { class: 'note note-warn', text: 'الإرسال متوقف: ضيف المفتاح السري (vapid_private) وارفع دالة push. الشرح بملف docs/PUSH.md.' }));
    var f = el('form', { class: 'form push-form' });
    var t = el('input', { type: 'text', maxlength: 80, placeholder: 'العنوان (مثلاً: دليل المعامل)', 'aria-label': 'عنوان الإشعار', value: 'دليل المعامل' });
    var b = el('textarea', { rows: 2, maxlength: 200, placeholder: 'نص الإشعار', 'aria-label': 'نص الإشعار' });
    var u = el('select', { 'aria-label': 'يفتح على' }, [['/', 'الصفحة الرئيسية'], ['/news/', 'أخبار المعامل'], ['/submit/property/', 'إضافة عقار'], ['/submit/', 'أضف إعلانك'], ['/jobs/', 'الوظائف'], ['/delivery/', 'دلفري حر'], ['/engineers/', 'دليل المهندسين'], ['/restaurants/', 'المطاعم'], ['/businesses/', 'المحلات']].map(function (o) { return el('option', { value: o[0], text: 'يفتح على: ' + o[1] }); }));
    var send = el('button', { class: 'btn btn-primary', type: 'submit', text: 'إرسال لكل المشتركين' });
    f.appendChild(t); f.appendChild(b); f.appendChild(u); f.appendChild(send);
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); delete f.dataset.submitting;
      if (b.value.trim().length < 2) return say('اكتب نص الإشعار.', 'error');
      if (!confirm('ترسل هذا الإشعار لـ ' + nf.format(st.subscribers || 0) + ' مشترك؟')) return;
      busy(f, true);
      var s2 = await sb.rpc('push_admin_send', { p_title: t.value.trim(), p_body: b.value.trim(), p_url: u.value });
      busy(f, false);
      if (s2.error) return say(errText(s2.error), 'error');
      say('انرسل الإشعار ✅ يوصل للمشتركين خلال دقيقة.', 'ok'); b.value = ''; setTimeout(function () { pushAdmin(box); }, 4000);
    });
    box.appendChild(f);
    if ((st.last || []).length) {
      box.appendChild(el('h3', { text: 'آخر الإشعارات' }));
      var ul = el('ul', { class: 'manage-list' }); box.appendChild(ul);
      st.last.forEach(function (x) { ul.appendChild(el('li', {}, [el('span', { class: 'badge', text: KIND[x.kind] || x.kind }), ' ', el('b', { text: x.title }), ' ', x.body, ' ',
        el('span', { class: 'muted', text: new Date(x.sent_at).toLocaleString('ar-IQ') + (x.sent != null ? ' · وصل ' + nf.format(x.sent) : ' · بالانتظار') })])); });
    }
  }

  // ---------- الإدارة: الشكاوى والتعليقات والإعلانات الي تنتهي ----------
  var REASON = { scam: 'نصب أو احتيال', bad_service: 'خدمة سيئة أو تأخير', wrong_info: 'معلومات أو رقم غلط', abuse: 'إساءة', other: 'شي ثاني' };
  async function trustAdmin() {
    var cbox = $('[data-complaints]'), rbox = $('[data-reviews-admin]'), ebox = $('[data-expiring]');
    var c = await sb.from('complaints').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(100);
    cbox.textContent = '';
    if (c.error) { cbox.appendChild(el('p', { class: 'muted', text: 'الشكاوى تحتاج تشغيل تحديث supabase/updates/2026-11-trust.sql.' })); return; }
    var rows = c.data || [];
    $('[data-count=complaints]').textContent = String(rows.length || ''); stat('complaints', rows.length);
    // أسماء الإعلانات والدلفري المشتكى عليهم
    var pids = rows.filter(function (x) { return x.target_type === 'post'; }).map(function (x) { return x.target_id; });
    var rids = rows.filter(function (x) { return x.target_type === 'rider'; }).map(function (x) { return x.target_id; });
    var names = {};
    if (pids.length) ((await sb.from('posts').select('id, title, type').in('id', pids)).data || []).forEach(function (p) { names['post' + p.id] = p; });
    if (rids.length) ((await sb.from('public_riders').select('id, name, phone').in('id', rids)).data || []).forEach(function (r) { names['rider' + r.id] = { title: 'دلفري: ' + r.name + ' (' + r.phone + ')' }; });
    if (!rows.length) cbox.appendChild(el('p', { class: 'empty-inline', text: 'ما كو شكاوى مفتوحة.' }));
    var ul = el('ul', { class: 'cards-admin' }); cbox.appendChild(ul);
    rows.forEach(function (x) {
      var t = names[x.target_type + x.target_id] || { title: '#' + x.target_id };
      ul.appendChild(el('li', { class: 'panel' }, [
        el('h3', {}, [t.type ? el('a', { href: BASE + PATHS[t.type] + '/' + x.target_id + '/', target: '_blank', rel: 'noopener', text: t.title }) : t.title, ' ', el('span', { class: 'badge badge-warn', text: REASON[x.reason] || x.reason })]),
        x.details ? el('p', { class: 'prose', text: x.details }) : null,
        el('p', { class: 'muted' }, [new Date(x.created_at).toLocaleString('ar-IQ'), x.client_ip ? ' · IP ' + x.client_ip : '', x.phone ? ' · رقم المشتكي ' : '', x.phone ? el('a', { href: 'tel:' + x.phone, dir: 'ltr', text: x.phone }) : null]),
        el('div', { class: 'btn-row' }, [
          x.phone ? el('a', { class: 'btn btn-wa btn-sm', href: 'https://wa.me/964' + x.phone.replace(/^0/, ''), target: '_blank', rel: 'noopener', text: 'مراسلة المشتكي' }) : null,
          el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تمت المعالجة', onclick: async function () {
            var u = await sb.from('complaints').update({ status: 'closed' }).eq('id', x.id);
            if (u.error) return say(errText(u.error), 'error'); say('انغلقت الشكوى.', 'ok'); trustAdmin();
          } })])]));
    });

    var rv = await sb.from('ratings').select('id, target_type, target_id, stars, comment, created_at').eq('approved', false).not('comment', 'is', null).order('created_at', { ascending: false }).limit(100);
    rbox.textContent = '';
    if (!(rv.data || []).length) rbox.appendChild(el('p', { class: 'empty-inline', text: 'ما كو تعليقات جديدة.' }));
    var rl = el('ul', { class: 'manage-list' }); rbox.appendChild(rl);
    (rv.data || []).forEach(function (x) {
      rl.appendChild(el('li', {}, [el('span', { class: 'stars-view', text: '★★★★★'.slice(0, x.stars) + '☆☆☆☆☆'.slice(0, 5 - x.stars) }), ' ', el('span', { text: x.comment }), ' ',
        el('span', { class: 'muted', text: (x.target_type === 'rider' ? 'دلفري #' : 'محل #') + x.target_id }),
        el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'نشر التعليق', onclick: async function () {
            var u = await sb.from('ratings').update({ approved: true }).eq('id', x.id);
            if (u.error) return say(errText(u.error), 'error'); trustAdmin();
          } }),
          el('button', { class: 'btn btn-sm', type: 'button', text: 'حذف التعليق (تبقى النجوم)', onclick: async function () {
            var u = await sb.from('ratings').update({ comment: null }).eq('id', x.id);
            if (u.error) return say(errText(u.error), 'error'); trustAdmin();
          } })])]));
    });

    var ex = await sb.rpc('expiring_posts');
    ebox.textContent = '';
    var exRows = ex.data || [];
    $('[data-count=expiring]').textContent = String(exRows.length || '');
    if (!exRows.length) ebox.appendChild(el('p', { class: 'empty-inline', text: 'ما كو إعلانات تنتهي قريباً.' }));
    var el2 = el('ul', { class: 'manage-list' }); ebox.appendChild(el2);
    exRows.forEach(function (x) {
      var msg = 'هلو ' + (x.name || '') + '، إعلانك «' + x.title + '» بدليل المعامل ينتهي بتاريخ ' + new Date(x.expires_at).toLocaleDateString('ar-IQ') + '. تريد نجدده؟ التجديد ' + nf.format(1000) + ' د.ع. تكدر تجدده بنفسك من صفحة «إعلاناتي» بالموقع.';
      el2.appendChild(el('li', {}, [el('a', { href: BASE + PATHS[x.type] + '/' + x.id + '/', text: x.title }), ' ', el('span', { class: 'muted', text: 'ينتهي ' + new Date(x.expires_at).toLocaleDateString('ar-IQ') }),
        el('div', { class: 'btn-row' }, [
          x.contact_phone ? el('a', { class: 'btn btn-wa btn-sm', href: 'https://wa.me/964' + x.contact_phone.replace(/^0/, '') + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', text: 'تذكير بالواتساب' }) : null,
          el('button', { class: 'btn btn-sm', type: 'button', text: 'تجديد (يحسب ' + nf.format(1000) + ')', onclick: async function () {
            var r = await sb.rpc('renew_post', { p_id: x.id });
            if (r.error) return say(errText(r.error), 'error'); say('تم التجديد وانحسب ' + nf.format(1000) + ' د.ع على صاحبه.', 'ok'); trustAdmin();
          } })])]));
    });
  }

  // ---------- الإدارة: المشرفين ----------
  async function staffAdmin(box) {
    var r = await sb.rpc('staff_list');
    box.textContent = '';
    if (r.error) return box.appendChild(el('p', { class: 'muted', text: 'المشرفين يحتاجون تشغيل تحديث supabase/updates/2026-11-trust.sql.' }));
    var ul = el('ul', { class: 'manage-list' });
    (r.data || []).forEach(function (x) {
      ul.appendChild(el('li', {}, [el('strong', { text: x.name }), ' ', el('span', { class: 'muted', dir: 'ltr', text: x.email }), ' ',
        el('span', { class: 'badge', text: x.role === 'admin' ? 'مدير' : 'مشرف' }),
        x.role === 'moderator' ? el('button', { class: 'btn btn-sm', type: 'button', text: 'شيله من المشرفين', onclick: async function () {
          if (!confirm('تشيل ' + x.name + ' من المشرفين؟')) return;
          var d = await sb.rpc('set_staff_role', { p_email: x.email, p_role: 'owner' });
          if (d.error) return say(errText(d.error), 'error'); say(d.data, 'ok'); staffAdmin(box);
        } }) : null]));
    });
    box.appendChild(ul);
    var input = el('input', { type: 'email', dir: 'ltr', placeholder: 'بريد المشرف', 'aria-label': 'بريد المشرف', class: 'staff-email' });
    var form = el('form', { class: 'btn-row' }, [input, el('button', { class: 'btn btn-primary', type: 'submit', text: 'إضافة مشرف' })]);
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); delete form.dataset.submitting;
      if (input.value.indexOf('@') < 1) return say('اكتب بريد المشرف.', 'error');
      var a = await sb.rpc('set_staff_role', { p_email: input.value.trim(), p_role: 'moderator' });
      if (a.error) return say(errText(a.error), 'error');
      say(a.data + ' ✅ يدخل من نفس رابط الإدارة، ويفعّل الدخول بخطوتين أول مرة.', 'ok'); staffAdmin(box);
    });
    box.appendChild(form);
    var tg = el('button', { class: 'btn btn-sm', type: 'button', text: 'تجربة تنبيهات تيليغرام', onclick: async function () {
      var t = await sb.rpc('telegram_test');
      if (t.error) return say(errText(t.error), 'error');
      say(t.data ? 'انرسلت رسالة تجربة ✅ إذا ما وصلتك خلال دقيقة، تأكد من رمز البوت ورقم المحادثة.' : 'التنبيهات بعدها مو مفعّلة. شوف خطوات التفعيل بملف التحديث 2026-11-trust.sql.', t.data ? 'ok' : 'error');
    } });
    var nw = el('button', { class: 'btn btn-sm', type: 'button', text: 'جيب الأخبار هسه', onclick: async function () {
      var f = await sb.rpc('news_fetch_now');
      if (f.error) return say(f.error.message && /news_fetch_now/.test(f.error.message) ? 'الأخبار تحتاج تشغيل تحديث supabase/updates/2026-11-news.sql.' : errText(f.error), 'error');
      say('جارِ جلب الأخبار من المصادر...', 'ok');
      setTimeout(async function () {
        var c = await sb.rpc('news_collect_now');
        if (c.error) return say(errText(c.error), 'error');
        say(c.data ? 'انضاف ' + nf.format(c.data) + ' خبر جديد ✅ راح توصلك على تيليغرام حتى توافق عليها.' : 'ما كو أخبار جديدة تخص المنطقة هسه. النظام يفحص لحاله كل ٣ ساعات.', 'ok');
      }, 15000);
    } });
    box.appendChild(el('div', { class: 'btn-row' }, [tg, nw]));
  }

  // ---------- دلفري حر: القائمة العامة ----------
  function waNum(ph) { return 'https://wa.me/964' + String(ph).replace(/^0/, ''); }
  function money2(n) { return n == null ? 'اتفاق' : nf.format(n) + ' د.ع'; }
  async function loadFares() {
    var box = $('[data-fares]'); if (!box) return [];
    var r = await sb.from('delivery_fares').select('kind, label, price, sort').order('sort');
    var rows = r.data || [];
    ['zone', 'extra'].forEach(function (k) {
      var dl = $('[data-fares-' + k + ']', box); dl.textContent = '';
      rows.filter(function (x) { return x.kind === k; }).forEach(function (x) {
        dl.appendChild(el('div', {}, [el('dt', { text: x.label }), el('dd', { class: 'num', text: (k === 'extra' && x.price != null ? '+ ' : '') + money2(x.price) })]));
      });
    });
    box.hidden = !rows.length;
    return rows;
  }
  async function initDelivery() {
    loadFares();
    var ul = $('[data-riders]'), q = $('[data-rider-q]');
    var r = await sb.from('public_riders').select('*').order('decided_at', { ascending: false }).limit(500);
    if (r.error) { ul.textContent = ''; return say(errText(r.error), 'error'); }
    var rows = r.data || [];
    var T = window.almamelTrust, sums = T ? await T.summaries('rider', rows.map(function (x) { return x.id; })) : {};
    function norm(t) { return String(t || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase(); }
    function draw() {
      var term = norm(q.value.trim());
      ul.textContent = '';
      var shown = rows.filter(function (x) { return !term || norm(x.name + ' ' + x.areas + ' ' + x.vehicle).indexOf(term) !== -1; });
      shown.forEach(function (x) {
        ul.appendChild(el('li', { class: 'rider' }, [
          el('div', { class: 'rider-head' }, [el('span', { class: 'rider-ico', 'aria-hidden': 'true', text: (x.name || '؟').trim().charAt(0) }),
            el('div', {}, [el('h2', { class: 'rider-name', text: x.name }), el('span', { class: 'rider-veh', text: x.vehicle }),
              el('span', { class: 'badge badge-ok', text: 'هويته عند الإدارة' })])]),
          el('p', { class: 'rider-areas' }, [el('b', { text: 'يوصل إلى: ' }), x.areas]),
          x.hours ? el('p', { class: 'muted', text: 'الأوقات: ' + x.hours }) : null,
          x.min_fare ? el('p', { class: 'rider-fare' }, ['كروته تبدي من ', el('b', { class: 'num', text: money2(x.min_fare) })]) : null,
          T ? T.summaryEl(sums[x.id]) : null,
          x.note ? el('p', { class: 'rider-note', text: x.note }) : null,
          el('div', { class: 'btn-row' }, [
            el('a', { class: 'btn btn-primary', href: 'tel:' + x.phone }, ['اتصال ', el('span', { dir: 'ltr', text: x.phone })]),
            x.whatsapp ? el('a', { class: 'btn btn-wa', href: waNum(x.phone) + '?text=' + encodeURIComponent('هلو ' + x.name + '، شفت رقمك بدليل المعامل (دلفري حر). أريد توصيل:'), target: '_blank', rel: 'noopener', text: 'واتساب' }) : null]),
          T ? el('details', { class: 'rider-more' }, [el('summary', { text: 'قيّمه أو بلّغ عنه' }), T.ratingWidget('rider', x.id, sums[x.id]), T.complaintForm('rider', x.id, 'صار شي وياه؟ بلّغ الإدارة')]) : null]));
      });
      if (!shown.length) ul.appendChild(el('li', { class: 'empty' }, [el('p', { class: 'empty-title', text: rows.length ? 'ما لكينا أحد بهالبحث' : 'ما كو أحد مسجل بعد' }),
        el('p', { text: rows.length ? 'جرّب اسم منطقة ثانية.' : 'عندك دراجة؟ كون أول واحد يسجّل.' })]));
    }
    q.addEventListener('input', draw); draw();
  }

  // ---------- «إعلاناتي» للزائر ----------
  async function initMyAds() {
    var t = new URLSearchParams(location.search).get('t');
    if (t && /^[0-9a-f]{32}$/.test(t)) { saveMyAd(t); window.history.replaceState(null, '', location.pathname); }
    var box = $('[data-my-ads]'), tokens = myAds();
    box.textContent = '';
    if (!tokens.length) return box.appendChild(el('div', { class: 'empty' }, [el('p', { class: 'empty-title', text: 'ما كو إعلانات على هذا الجهاز' }),
      el('p', { text: 'الإعلانات الي تنشرها من هذا الموبايل تطلع هنا. إذا نشرت من جهاز ثاني افتح الرابط الي طلعلك وقت النشر.' }), el('a', { class: 'btn btn-primary', href: BASE + '/submit/', text: 'أضف إعلان' })]));
    var r = await sb.rpc('guest_posts', { p_tokens: tokens });
    if (r.error) return say(errText(r.error), 'error');
    var LABEL = { pending: 'بانتظار المراجعة', published: 'منشور', rejected: 'مرفوض', hidden: 'مخفي', removed: 'محذوف' };
    var ul = el('ul', { class: 'cards-admin' }); box.appendChild(ul);
    (r.data || []).forEach(function (x) {
      var exp = x.expires_at ? new Date(x.expires_at) : null, soon = exp && x.status === 'published' && exp < new Date(Date.now() + 5 * 864e5);
      ul.appendChild(el('li', { class: 'panel' }, [
        el('h3', {}, [x.status === 'published' ? el('a', { href: BASE + PATHS[x.type] + '/' + x.id + '/', text: x.title }) : x.title, ' ', badge(x.status, LABEL[x.status])]),
        x.status_reason && x.status !== 'published' ? el('p', { class: 'note', text: x.status_reason }) : null,
        exp && x.status === 'published' ? el('p', { class: soon ? 'note note-warn' : 'muted', text: (exp < new Date() ? 'انتهى بتاريخ ' : 'ينتهي بتاريخ ') + exp.toLocaleDateString('ar-IQ') }) : null,
        x.fee_due > 0 && x.status !== 'removed' && x.status !== 'rejected' ? el('p', { class: 'note note-price', text: 'رسوم هذا الإعلان ' + nf.format(x.fee_due) + ' د.ع (غير مسددة).' }) : null,
        el('div', { class: 'btn-row' }, [
          soon ? el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'تجديد (' + nf.format(1000) + ' د.ع)', onclick: async function () {
            var rr = await sb.rpc('guest_renew_post', { p_token: x.token });
            if (rr.error) { say(errText(rr.error), 'error'); debtHelp(rr.error.message); return; }
            say('تم التجديد ✅', 'ok'); initMyAds();
          } }) : null,
          x.status !== 'removed' && x.status !== 'rejected' ? el('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'حذف الإعلان', onclick: async function () {
            if (!confirm('تحذف «' + x.title + '»؟')) return;
            var d = await sb.rpc('guest_remove_post', { p_token: x.token });
            if (d.error) return say(errText(d.error), 'error');
            say('انحذف الإعلان. يختفي من الموقع خلال دقائق.', 'ok'); initMyAds();
          } }) : null])]));
    });
  }

  // ---------- دليل المهندسين: التسجيل ----------
  async function initEngineerJoin() {
    var form = $('[data-engineer-form]'), f = form.elements, other = $('[data-other-specialty]');
    f.specialty.addEventListener('change', function () { other.hidden = f.specialty.value !== 'other'; });
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); delete form.dataset.submitting;
      if (f.website.value) return; // فخ للبرامج الآلية
      var errs = [], name = f.name.value.trim(), ph = phone(f.phone.value), loc = f.location.value.trim();
      var spec = f.specialty.value === 'other' ? f.specialty_other.value.trim() : f.specialty.value;
      var services = f.services.value.split(/\n|،|,/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 2; }).slice(0, 12);
      if (name.length < 2) errs.push('اكتب اسمك.');
      if (!spec || spec.length < 2) errs.push('اختر اختصاصك أو اكتبه.');
      if (!services.length) errs.push('اكتب خدمة وحدة على الأقل.');
      if (loc.length < 2) errs.push('اكتب وين تشتغل.');
      if (!ph) errs.push('رقمك: رقم عراقي يبدأ بـ 07.');
      if (!f.agree.checked) errs.push('وافق على التعهد.');
      if (errs.length) return say(errs.join(' '), 'error');
      busy(form, true); say('جارِ الإرسال...', 'ok');
      try {
        var r = await sb.from('engineers').insert({ name: name, specialty: spec.slice(0, 60), services: services.map(function (x) { return x.slice(0, 120); }), location: loc,
          phone: ph, whatsapp: f.whatsapp.checked, about: f.about.value.trim() || null });
        if (r.error) throw (r.error.code === '23505' ? new Error('هذا الرقم مسجل بالدليل من قبل. إذا تريد تعدّل معلوماتك راسل الإدارة.') : r.error);
        form.hidden = true;
        say('وصل طلبك ✅ بعد ما تراجعه الإدارة تطلع بطاقتك بدليل المهندسين.', 'ok');
      } catch (err) { say(err.message && /[؀-ۿ]/.test(err.message) ? err.message : errText(err), 'error'); }
      finally { busy(form, false); }
    });
  }

  // ---------- الإدارة: المهندسين ----------
  async function engineersAdmin(box, isAdmin) {
    var r = await sb.from('engineers').select('*').order('status').order('created_at', { ascending: false }).limit(300);
    box.textContent = '';
    if (r.error) return box.appendChild(el('p', { class: 'muted', text: 'المهندسين يحتاجون تشغيل تحديث supabase/updates/2026-11-engineers.sql.' }));
    var rows = r.data || [], pending = rows.filter(function (x) { return x.status === 'pending'; }).length;
    $('[data-count=engineers]').textContent = String(pending || ''); stat('engineers', pending);
    if (!rows.length) return box.appendChild(el('p', { class: 'empty-inline', text: 'ما كو مهندسين مسجلين بعد.' }));
    var LABEL = { pending: 'بانتظار المراجعة', approved: 'منشور', hidden: 'مخفي' };
    var ul = el('ul', { class: 'cards-admin' }); box.appendChild(ul);
    async function setFlag(x, patch, msg) {
      var u = await sb.from('engineers').update(patch).eq('id', x.id);
      if (u.error) return say(errText(u.error), 'error'); say(msg, 'ok'); engineersAdmin(box, isAdmin);
    }
    async function setStatus(x, st) {
      var u = await sb.from('engineers').update({ status: st, decided_at: new Date().toISOString() }).eq('id', x.id);
      if (u.error) return say(errText(u.error), 'error');
      say(st === 'approved' ? 'انتشر «' + x.name + '» بدليل المهندسين ✅' : 'انخفى «' + x.name + '».', 'ok'); engineersAdmin(box, isAdmin);
    }
    rows.forEach(function (x) {
      var featured = x.featured_until && new Date(x.featured_until) > new Date();
      var facts = el('dl', { class: 'facts' });
      [['الاختصاص', x.specialty], ['الموقع', x.location], ['الرقم', x.phone + (x.whatsapp ? ' (واتساب)' : '')], ['الخدمات', (x.services || []).join('، ')], ['نبذة', x.about],
        ['IP', x.client_ip], ['تاريخ التسجيل', new Date(x.created_at).toLocaleString('ar-IQ')]]
        .forEach(function (kv) { if (kv[1]) facts.appendChild(el('div', {}, [el('dt', { text: kv[0] }), el('dd', { text: kv[1] })])); });
      ul.appendChild(el('li', { class: 'panel' }, [
        el('h3', {}, [x.name + ' ', badge(x.status === 'approved' ? 'published' : x.status === 'pending' ? 'pending' : 'hidden', LABEL[x.status]),
          x.verified ? el('span', { class: 'badge badge-ok', text: 'موثّق' }) : null,
          featured ? el('span', { class: 'badge badge-gold', text: 'مميز حتى ' + dayText(x.featured_until) }) : null]), facts,
        el('div', { class: 'btn-row' }, [
          el('a', { class: 'btn', href: 'tel:' + x.phone, text: 'اتصال للتحقق' }),
          x.status !== 'approved' ? el('button', { class: 'btn btn-primary', type: 'button', text: 'نشر بالدليل', onclick: function () { setStatus(x, 'approved'); } }) : null,
          x.status === 'approved' ? el('button', { class: 'btn', type: 'button', text: 'إخفاء', onclick: function () { setStatus(x, 'hidden'); } }) : null,
          isAdmin ? el('button', { class: 'btn', type: 'button', text: x.verified ? 'إلغاء التوثيق' : 'توثيق (بعد التحقق)', onclick: function () {
            setFlag(x, { verified: !x.verified }, x.verified ? 'انلغى توثيق «' + x.name + '».' : 'صار «' + x.name + '» موثّق 🏅'); } }) : null,
          isAdmin ? el('button', { class: 'btn btn-sign', type: 'button', text: featured ? 'تمديد التمييز شهر' : 'تمييز لمدة شهر', onclick: function () {
            var from = featured ? new Date(x.featured_until) : new Date(); from.setDate(from.getDate() + 30);
            setFlag(x, { featured_until: from.toISOString() }, '«' + x.name + '» مميز ويطلع أول القائمة لحد ' + dayText(from.toISOString()) + ' ⭐'); } }) : null,
          isAdmin && featured ? el('button', { class: 'btn', type: 'button', text: 'إلغاء التمييز', onclick: function () { setFlag(x, { featured_until: null }, 'انلغى تمييز «' + x.name + '».'); } }) : null,
          el('button', { class: 'btn btn-danger', type: 'button', text: 'حذف', onclick: async function () {
            if (!confirm('حذف «' + x.name + '» نهائياً؟')) return;
            var d = await sb.from('engineers').delete().eq('id', x.id);
            if (d.error) return say(errText(d.error), 'error'); say('انحذف.', 'ok'); engineersAdmin(box, isAdmin);
          } })])]));
    });
  }

  // ---------- دلفري حر: التسجيل ----------
  async function initRiderJoin() {
    var form = $('[data-rider-form]');
    loadFares();
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); delete form.dataset.submitting;
      var f = form.elements, errs = [];
      if (f.website.value) return; // فخ للبرامج الآلية
      var name = f.name.value.trim(), ph = phone(f.phone.value), areas = f.areas.value.trim(), address = f.address.value.trim();
      if (name.length < 2) errs.push('اكتب اسمك.');
      if (!ph) errs.push('رقمك: رقم عراقي يبدأ بـ 07.');
      if (!f.vehicle.value) errs.push('اختر شنو تستخدم للتوصيل.');
      if (areas.length < 2) errs.push('اكتب وين تكدر توصل.');
      if (address.length < 5) errs.push('اكتب عنوانك بالضبط.');
      if (!f.id_front.files[0] || !f.id_back.files[0]) errs.push('أضف صورة الهوية من الوجه ومن الظهر.');
      var minFare = f.min_fare.value.trim() ? money(f.min_fare.value) : null;
      if (f.min_fare.value.trim() && (minFare == null || minFare < 3000 || minFare > 50000)) errs.push('كروتك: أقل كروة 3,000 د.ع (وأكثر شي 50,000).');
      if (!f.agree.checked) errs.push('وافق على التعهد.');
      if (errs.length) return say(errs.join(' '), 'error');
      busy(form, true); say('جارِ رفع الهوية والإرسال...', 'ok');
      try {
        var front = await upload('proofs', 'rider/' + hex() + '.webp', await toWebp(f.id_front.files[0], 1600));
        var back = await upload('proofs', 'rider/' + hex() + '.webp', await toWebp(f.id_back.files[0], 1600));
        var r = await sb.from('riders').insert({ name: name, phone: ph, whatsapp: f.whatsapp.checked, vehicle: f.vehicle.value, areas: areas,
          hours: f.hours.value.trim() || null, note: f.note.value.trim() || null, min_fare: minFare, address: address, id_front: front, id_back: back });
        if (r.error) throw (r.error.code === '23505' ? new Error('هذا الرقم مسجل من قبل. إذا تريد تعدّل معلوماتك راسل الإدارة.') : r.error);
        form.hidden = true;
        say('وصل تسجيلك ✅ الإدارة راح تتصل بيك للتأكد، وبعدها يطلع اسمك ورقمك بصفحة «دلفري حر».', 'ok');
      } catch (err) { say(err.message && /[؀-ۿ]/.test(err.message) ? err.message : errText(err), 'error'); }
      finally { busy(form, false); }
    });
  }

  // ---------- الإدارة: دلفري حر ----------
  async function ridersAdmin(box) {
    var r = await sb.from('riders').select('*').order('status').order('created_at', { ascending: false }).limit(300);
    box.textContent = '';
    if (r.error) return box.appendChild(el('p', { class: 'muted', text: 'قسم الدلفري يحتاج تشغيل تحديث supabase/updates/2026-11-riders.sql.' }));
    var rows = r.data || [], pending = rows.filter(function (x) { return x.status === 'pending'; });
    $('[data-count=riders]').textContent = String(pending.length); stat('riders', pending.length);
    if (!rows.length) return box.appendChild(el('p', { class: 'empty-inline', text: 'ما كو تسجيلات بعد.' }));
    var ul = el('ul', { class: 'cards-admin' }); box.appendChild(ul);
    var LABEL = { pending: 'بانتظار التحقق', approved: 'منشور', suspended: 'موقوف' };
    async function setStatus(x, st) {
      var u = await sb.from('riders').update({ status: st, decided_at: new Date().toISOString() }).eq('id', x.id);
      if (u.error) return say(errText(u.error), 'error');
      say(st === 'approved' ? 'تم النشر ✅ «' + x.name + '» يطلع هسه بصفحة دلفري حر.' : 'تم إيقاف «' + x.name + '».', 'ok'); ridersAdmin(box);
    }
    for (var i = 0; i < rows.length; i++) {
      var x = rows[i];
      var urls = await sb.storage.from('proofs').createSignedUrls([x.id_front, x.id_back], 900);
      var ids = (urls.data || []).map(function (u) { return u.signedUrl; }).filter(Boolean);
      (function (x, ids) {
        var facts = el('dl', { class: 'facts' });
        [['الرقم', x.phone + (x.whatsapp ? ' (واتساب)' : '')], ['المركبة', x.vehicle], ['يوصل إلى', x.areas], ['الأوقات', x.hours], ['ملاحظة', x.note],
          ['أقل كروة', x.min_fare ? money2(x.min_fare) : ''], ['العنوان (خاص)', x.address], ['تاريخ التسجيل', new Date(x.created_at).toLocaleString('ar-IQ')]]
          .forEach(function (kv) { if (kv[1]) facts.appendChild(el('div', {}, [el('dt', { text: kv[0] }), el('dd', { text: kv[1] })])); });
        ul.appendChild(el('li', { class: 'panel' }, [
          el('h3', {}, [x.name + ' ', badge(x.status === 'approved' ? 'published' : x.status === 'pending' ? 'pending' : 'rejected', LABEL[x.status])]),
          facts,
          el('ul', { class: 'thumbs id-thumbs' }, ids.map(function (u, k) { return el('li', {}, [el('a', { href: u, target: '_blank', rel: 'noopener' }, [el('img', { src: u, alt: k ? 'الهوية من الظهر' : 'الهوية من الوجه', width: 200, height: 130 })])]); })),
          el('div', { class: 'btn-row' }, [
            el('a', { class: 'btn', href: 'tel:' + x.phone, text: 'اتصال للتحقق' }),
            x.status !== 'approved' ? el('button', { class: 'btn btn-primary', type: 'button', text: 'تم التحقق: نشر', onclick: function () { setStatus(x, 'approved'); } }) : null,
            x.status === 'approved' ? el('button', { class: 'btn', type: 'button', text: 'إيقاف (شكوى)', onclick: function () { if (confirm('إيقاف «' + x.name + '» وإخفاؤه من الموقع؟')) setStatus(x, 'suspended'); } }) : null,
            el('button', { class: 'btn btn-danger', type: 'button', text: 'حذف نهائي مع الهوية', onclick: async function () {
              if (!confirm('حذف «' + x.name + '» وصور هويته نهائياً؟')) return;
              var d = await sb.from('riders').delete().eq('id', x.id);
              if (d.error) return say(errText(d.error), 'error');
              await sb.storage.from('proofs').remove([x.id_front, x.id_back]);
              say('تم الحذف.', 'ok'); ridersAdmin(box);
            } })])]));
      })(x, ids);
    }
  }

  // ---------- الإدارة: ديون الإعلانات ----------
  async function debtsAdmin(box, after) {
    var r = await sb.rpc('admin_debts');
    box.textContent = '';
    if (r.error) return box.appendChild(el('p', { class: 'muted', text: 'قسم الديون يحتاج تشغيل تحديث supabase/updates/2026-11-ad-credit.sql.' }));
    var rows = r.data || [], total = rows.reduce(function (n, x) { return n + x.total; }, 0);
    $('[data-count=debts]').textContent = String(rows.filter(function (x) { return x.blocked; }).length || '');
    stat('debts', total);
    if (!rows.length) return box.appendChild(el('p', { class: 'empty-inline', text: 'ما كو ديون. كل الناس مسددين.' }));
    var ul = el('ul', { class: 'cards-admin debts' }); box.appendChild(ul);
    rows.forEach(function (x) {
      var ph = (x.phones || [])[0];
      ul.appendChild(el('li', { class: 'panel' + (x.blocked ? ' debt-blocked' : '') }, [
        el('h3', {}, [(x.name || 'بدون اسم') + ' ', x.blocked ? el('span', { class: 'badge badge-warn', text: 'ممنوع من النشر' }) : null]),
        el('dl', { class: 'facts' }, [
          el('div', {}, [el('dt', { text: 'المبلغ' }), el('dd', { class: 'num', text: nf.format(x.total) + ' د.ع' })]),
          el('div', {}, [el('dt', { text: 'إعلانات غير مسددة' }), el('dd', { text: nf.format(x.ads) })]),
          el('div', {}, [el('dt', { text: 'الأرقام' }), el('dd', { dir: 'ltr', text: (x.phones || []).join('، ') || '-' })]),
          el('div', {}, [el('dt', { text: 'عناوين IP' }), el('dd', { dir: 'ltr', text: (x.ips || []).join('، ') || '-' })]),
          el('div', {}, [el('dt', { text: 'آخر إعلان' }), el('dd', { text: new Date(x.last_at).toLocaleString('ar-IQ') })])]),
        el('div', { class: 'btn-row' }, [
          ph ? el('a', { class: 'btn btn-wa', href: 'https://wa.me/964' + ph.replace(/^0/, '') + '?text=' + encodeURIComponent('هلو ' + (x.name || '') + '، عليك ' + nf.format(x.total) + ' د.ع رسوم إعلانات بدليل المعامل.'), target: '_blank', rel: 'noopener', text: 'مراسلة بالواتساب' }) : null,
          el('button', { class: 'btn btn-primary', type: 'button', text: 'تم الدفع، تنشيط', onclick: async function () {
            if (!confirm('استلمت ' + nf.format(x.total) + ' د.ع من ' + (x.name || 'هذا الشخص') + '؟ راح تنمسح ديونه ويكدر ينشر.')) return;
            var s2 = await sb.rpc('settle_debt', { p_id: x.post_id });
            if (s2.error) return say(errText(s2.error), 'error');
            say('تم ✅ انمسح دين ' + (x.name || '') + ' (' + nf.format(s2.data) + ' د.ع) ويكدر ينشر هسه.', 'ok'); debtsAdmin(box, after); if (after) after();
          } })])]));
    });
  }

  async function faresAdmin(box) {
    var r = await sb.from('delivery_fares').select('kind, label, price, sort').order('sort');
    box.textContent = '';
    if (r.error) return;
    var rows = el('div', { class: 'fares-edit' });
    function row(x) {
      var li = el('div', { class: 'fare-row' }, [
        el('select', { 'aria-label': 'النوع' }, [el('option', { value: 'zone', text: 'مسافة' }), el('option', { value: 'extra', text: 'إضافة' })]),
        el('input', { type: 'text', value: x.label || '', maxlength: 80, 'aria-label': 'الوصف', placeholder: 'مثلاً: بين محلات المعامل' }),
        el('input', { type: 'text', value: x.price == null ? '' : String(x.price), inputmode: 'numeric', 'aria-label': 'السعر بالدينار', placeholder: 'اتفاق', dir: 'ltr' }),
        el('button', { class: 'btn btn-sm', type: 'button', text: 'حذف', onclick: function () { li.remove(); } })]);
      li.firstChild.value = x.kind || 'zone';
      rows.appendChild(li);
    }
    (r.data || []).forEach(row);
    box.appendChild(rows);
    box.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', type: 'button', text: '+ سطر جديد', onclick: function () { row({}); } }),
      el('button', { class: 'btn btn-primary', type: 'button', text: 'حفظ التسعيرة', onclick: async function () {
        var out = [], bad = false;
        $$('.fare-row', rows).forEach(function (li) {
          var f = li.querySelectorAll('select, input'), label = f[1].value.trim(), pv = f[2].value.trim();
          if (!label && !pv) return;
          var price = pv ? money(pv) : null;
          if (label.length < 2 || (pv && (price == null || price > 100000))) bad = true;
          out.push({ kind: f[0].value, label: label, price: price });
        });
        if (bad) return say('كل سطر يحتاج وصف (حرفين أو أكثر)، والسعر رقم أو فارغ.', 'error');
        var s2 = await sb.rpc('set_delivery_fares', { p_rows: out });
        if (s2.error) return say(errText(s2.error), 'error');
        say('تم حفظ التسعيرة ✅ تطلع هسه بصفحة «دلفري حر».', 'ok'); faresAdmin(box);
      } })]));
  }

  // ---------- موقع الإدارة: إضافة مطعم أو محل كاملاً ----------
  // نفس قواعد src/static/menu-text.ts: أقسام «*القسم*»، أصناف «• الاسم — السعر»، أحجام «الاسم: صغير 5,000 / وسط 7,000»، أو «الاسم | السعر».
  // أصناف لها محتوى جاهز (مكتبات، صيدليات، حلاقة، هواتف): مربعات اختيار للخدمات + قائمة أسعار يبدأ بيها
  function kitForm(form) {
    if (!form || !form.getAttribute('data-kits') || !form.elements.category) return;
    var kits = JSON.parse(form.getAttribute('data-kits'));
    var cat = form.elements.category, services = form.elements.services, menu = form.elements.menu;
    var templates = Object.keys(kits).map(function (k) { return kits[k].menu; });
    var box = el('fieldset', { class: 'group kit-services' }); box.hidden = true;
    cat.closest('.field').after(box);
    var note = el('p', { class: 'note kit-note' }); note.hidden = true; if (menu) menu.closest('.field').before(note);
    function sync() {
      var picked = Array.prototype.map.call(box.querySelectorAll('input:checked'), function (x) { return x.value; });
      if (services) services.value = picked.length ? 'الخدمات: ' + picked.join('، ') : '';
    }
    cat.addEventListener('change', function () {
      var kit = kits[cat.value];
      box.textContent = ''; box.hidden = !kit; note.hidden = !kit;
      if (services && /^الخدمات: /.test(services.value)) services.value = '';
      if (menu && (!kit || !menu.value.trim() || templates.indexOf(menu.value) !== -1)) menu.value = kit ? kit.menu : (templates.indexOf(menu.value) !== -1 ? '' : menu.value);
      if (!kit) return;
      box.appendChild(el('legend', { text: 'الخدمات اللي تقدمها' }));
      box.appendChild(el('p', { class: 'hint', text: 'اختار كل الخدمات المتوفرة عندك، وتظهر بصفحتك.' }));
      kit.groups.forEach(function (g, gi) {
        var grid = el('div', { class: 'kit-grid' });
        g[1].forEach(function (name, i) {
          var id = 'kit-' + gi + '-' + i, cb = el('input', { type: 'checkbox', id: id, value: name });
          cb.addEventListener('change', sync);
          grid.appendChild(el('label', { class: 'kit-item', for: id }, [cb, el('span', { text: name })]));
        });
        box.appendChild(el('h4', { class: 'kit-group', text: g[0] })); box.appendChild(grid);
      });
      note.textContent = 'حطينالك قائمة جاهزة لـ «' + cat.value + '». عدّل الأسعار حسب محلك، واحذف اللي ما تقدمه، وتكدر تضيف صور بعدين.';
    });
  }

  function parseMenu(text) {
    var items = [], section = '';
    var clean = function (x) { return x.replace(/\*/g, '').replace(/^[^\p{L}\p{N}(]+/u, '').replace(/[^\p{L}\p{N})]+$/u, '').trim(); };
    var num = function (x) { var d = digits(x).replace(/(د\.?\s?ع|دينار)/g, '').replace(/[,\s٬.]/g, ''); return /^\d{1,10}$/.test(d) ? Number(d) : null; };
    String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (raw) {
      if (items.length >= 300) return;
      if (raw.indexOf('|') !== -1) { var p = raw.split('|').map(function (x) { return x.trim(); }); if (p[0].length >= 2) items.push({ section: section, name: p[0].slice(0, 80), price: num(p[1] || ''), note: (p[2] || '').slice(0, 200) }); return; }
      var bullet = /^[•·▪●◦*\-–—]\s*/.test(raw) && !/^\*[^*]+\*$/.test(raw), line = raw.replace(/^[•·▪●◦*\-–—]\s*/, '');
      var dash = line.match(/^(.*\S)\s+[—–-]\s+([\d٠-٩][\d٠-٩,٬.\s]*(?:د\.?\s?ع|دينار)?)$/);
      if (dash && clean(dash[1]).length >= 2) { items.push({ section: section, name: clean(dash[1]).slice(0, 80), price: num(dash[2]), note: '' }); return; }
      var sized = line.match(/^(.*\S)\s*:\s*(.+)$/);
      if (sized && sized[2].indexOf('/') !== -1) {
        var parts = sized[2].split('/').map(function (x) { return x.trim().match(/^(\D*?)\s*([\d٠-٩][\d٠-٩,٬.]*)/); });
        if (parts.every(Boolean)) { parts.forEach(function (m) { items.push({ section: section, name: (clean(sized[1]) + (m[1].trim() ? ' (' + m[1].trim() + ')' : '')).slice(0, 80), price: num(m[2]), note: '' }); }); return; }
      }
      var t = clean(line); if (t.length < 2) return;
      if (bullet) items.push({ section: section, name: t.slice(0, 80), price: null, note: '' });
      else if (!/[\d٠-٩]/.test(t) && t.length <= 60) section = t;
    });
    return items;
  }

  async function initAddBusiness() {
    var s = await requireLogin(); if (!s) return;
    var p = await profile(s.user.id);
    if (!p || p.role !== 'admin') { say('هذه الصفحة للإدارة فقط.', 'error'); $('[data-add-business]').hidden = true; return; }
    if (!(await ensureMfa())) return;
    kitForm($('[data-add-business]'));
    var form = $('[data-add-business]');
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); delete form.dataset.submitting;
      var f = form.elements, errs = [], ph = phone(f.contact_phone.value);
      if (f.title.value.trim().length < 3) errs.push('اكتب اسم المحل.');
      if (!f.category.value) errs.push('اختر نوع النشاط.');
      if (f.address.value.trim().length < 3) errs.push('اكتب العنوان.');
      if (!ph) errs.push('رقم المحل: رقم عراقي يبدأ بـ 07.');
      if (errs.length) return say(errs.join(' '), 'error');
      busy(form, true); say('جارِ رفع الصور والحفظ...', 'ok');
      try {
        var folder = 'u/' + s.user.id + '/';
        var photos = [], files = Array.prototype.slice.call(f.photos.files || []).slice(0, 6);
        for (var i = 0; i < files.length; i++) photos.push(await upload('media', folder + hex() + '.webp', await toWebp(files[i])));
        var logoPath = f.logo.files[0] ? await upload('media', folder + hex() + '.webp', await toWebp(f.logo.files[0], 600)) : null;
        var details = { address: f.address.value.trim() };
        ['hours', 'delivery', 'services'].forEach(function (k) { if (f[k].value.trim()) details[k] = f[k].value.trim(); });
        var ins = await sb.from('posts').insert({ type: 'business', title: f.title.value.trim(), category: f.category.value, area: f.area.value,
          body: f.body.value.trim(), contact_phone: ph, show_phone: true, whatsapp: f.whatsapp.checked, details: details, images: photos, logo: logoPath }).select('id').single();
        if (ins.error) throw ins.error;
        var id = ins.data.id, name = f.title.value.trim();
        var ap = await sb.rpc('moderate_post', { p_id: id, p_action: 'approve', p_reason: null });
        if (ap.error) throw ap.error;
        if (f.verified.checked) await sb.rpc('moderate_post', { p_id: id, p_action: 'verify', p_reason: null });
        var items = parseMenu(f.menu.value);
        for (var j = 0; j < items.length; j += 100) {
          var chunk = items.slice(j, j + 100).map(function (it, k) { return { business_id: id, section: it.section.slice(0, 60), name: it.name, price: it.price, note: it.note, sort: j + k }; });
          var mr = await sb.from('menu_items').insert(chunk);
          if (mr.error) throw mr.error;
        }
        form.reset(); $$('.picked', form).forEach(function (u) { u.textContent = ''; });
        say('تم نشر «' + name + '» مع ' + items.length + ' صنف. يظهر بالموقع خلال ربع ساعة. تقدر تعدّل القائمة وتضيف صور الأطباق من «القائمة والأسعار».', 'ok');
        var a = el('a', { class: 'btn btn-primary', href: BASE + '/admin/menu/?b=' + id, text: 'فتح القائمة والأسعار' });
        $('[data-msg]').appendChild(a);
      } catch (err) { say(errText(err), 'error'); }
      finally { busy(form, false); }
    });
  }

  var init = { 'engineer-join': initEngineerJoin, 'my-ads': initMyAds, delivery: initDelivery, 'rider-join': initRiderJoin, kitchen: initKitchen, 'add-business': initAddBusiness, submit: initSubmit, register: initRegister, login: initLogin, dashboard: initDashboard, menu: initMenu, admin: initAdmin }[page.getAttribute('data-page')];
  if (init) Promise.resolve(init()).catch(function (e) { say(errText(e), 'error'); });
})();
