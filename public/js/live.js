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
  var ADMIN_SITE = meta('admin-site') === '1', REGISTER_SITE = meta('register-site') === '1';
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
  function say(text, kind) {
    var box = $('[data-msg]');
    if (!box) return alert(text);
    box.textContent = '';
    box.className = 'live-msg flash flash-' + (kind || 'ok');
    box.textContent = text;
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    box.scrollIntoView({ block: 'center' });
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
        var row = { type: t, category: f.category.value, title: title, body: body, area: f.area.value, contact_phone: ph,
          show_phone: f.show_phone.checked, whatsapp: f.whatsapp.checked, details: details, images: images,
          price: f.price && !f.price.disabled ? money(f.price.value) : null };
        if (!s) row.guest_name = name;
        var r = await sb.from('posts').insert(row);
        if (r.error) throw r.error;
        form.reset(); fill(); if ($('[data-preview]')) $('[data-preview]').textContent = '';
        say('وصل إعلانك. راح يظهر بالموقع بعد مراجعة الإدارة.', 'ok');
      } catch (err) { say(err.message && /[؀-ۿ]/.test(err.message) ? err.message : errText(err), 'error'); }
      finally { busy(form, false); }
    });
  }

  // ---------- تسجيل صاحب محل ----------
  async function initRegister() {
    var acc = $('[data-step=account]'), biz = $('[data-step=business]');
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
          say('وصل طلبك ✅ راح نتصل بيك للتحقق، وبعد الموافقة تنشر صفحة محلك بالموقع.', 'ok');
          return;
        }
        go('/owner/dashboard/?sent=1');
      } catch (err) { say(errText(err), 'error'); busy(biz, false); }
    });
  }

  // ---------- الدخول ----------
  function initLogin() {
    var form = $('[data-login]');
    form.addEventListener('submit', async function (e) {
      e.preventDefault(); delete form.dataset.submitting;
      busy(form, true);
      var r = await sb.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
      busy(form, false);
      if (r.error) return say(errText(r.error), 'error');
      var p = await profile(r.data.user.id);
      var next = new URLSearchParams(location.search).get('next');
      if (ADMIN_SITE && !(p && p.role === 'admin')) { await sb.auth.signOut(); return say('هذا الحساب ليس حساب إدارة. شغّل make_admin لبريدك في Supabase أولاً.', 'error'); }
      go(next && /^\/[\w\-/?=&%.]*$/.test(next) ? next : p && p.role === 'admin' ? '/admin/' : '/owner/dashboard/');
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
      await sb.auth.signOut();
      say('تم إنشاء الحساب. الآن شغّل في Supabase ← SQL Editor: select public.make_admin(\'' + f.su_email.value.trim() + '\'); ثم سجّل الدخول.', 'ok');
    });
    $('[data-reset]').addEventListener('click', async function () {
      var email = form.elements.email.value.trim();
      if (!email) return say('اكتب بريدك الإلكتروني فوق، ثم اضغط «نسيت كلمة المرور».', 'error');
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + BASE + '/login/' });
      say(r.error ? errText(r.error) : 'إذا البريد مسجل، راح توصلك رسالة لإعادة تعيين كلمة المرور.', r.error ? 'error' : 'ok');
    });
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') {
        var pw = prompt('اكتب كلمة المرور الجديدة (١٠ أحرف على الأقل):');
        if (pw && pw.length >= 10) sb.auth.updateUser({ password: pw }).then(function (r) { say(r.error ? errText(r.error) : 'تم تغيير كلمة المرور.', r.error ? 'error' : 'ok'); });
      }
    });
  }

  // ---------- لوحة التحكم ----------
  var STATUS = { pending: 'بانتظار المراجعة', published: 'منشور', rejected: 'مرفوض', hidden: 'مخفي', removed: 'محذوف' };
  function badge(st, text) { return el('span', { class: 'status status-' + st, text: text || STATUS[st] || st }); }

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
      var row = el('div', { class: 'btn-row' }, [el('a', { class: 'btn btn-primary', href: BASE + '/owner/menu/?b=' + b.id, text: /مطاعم|أفران/.test(b.category) ? 'قائمة الطعام' : 'المنتجات والأسعار' })]);
      if (b.status === 'published') row.appendChild(el('a', { class: 'btn', href: BASE + PATHS.business + '/' + b.id + '/', text: 'عرض الصفحة' }));
      card.appendChild(row);
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

        // التمييز المدفوع: أول الصفحة الرئيسية وأول قسم المطاعم
        var featured = b.featured_until && new Date(b.featured_until) > new Date();
        var fx = [el('h4', { text: 'التمييز' })];
        if (featured) fx.push(el('p', {}, [el('span', { class: 'badge badge-ok', text: 'مميز' }), ' حتى ' + dayText(b.featured_until)]));
        fx.push(el('p', { class: 'muted', text: 'مطعمك يظهر بأول الصفحة الرئيسية وأول قسم المطاعم لمدة ' + FEATURE_DAYS + ' أيام بـ ' + nf.format(FEE) + ' د.ع.' }));
        var wa = waTo('أريد تمييز «' + b.title + '» لمدة ' + FEATURE_DAYS + ' أيام بـ ' + nf.format(FEE) + ' د.ع. (رقم المحل في الدليل: ' + b.id + ')');
        if (wa) fx.push(el('a', { class: 'btn btn-sign', href: wa, target: '_blank', rel: 'noopener', text: featured ? 'تمديد التمييز ' + FEATURE_DAYS + ' أيام' : 'ميّز مطعمك ' + FEATURE_DAYS + ' أيام' }));
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
        a.fee_due > 0 && a.status === 'pending' ? el('p', { class: 'note note-price' }, ['رسوم هذا الإعلان ' + nf.format(a.fee_due) + ' د.ع (الإعلان الأول فقط مجاني). يُنشر بعد الدفع. ',
          waTo('أريد دفع رسوم إعلاني «' + a.title + '» (' + nf.format(a.fee_due) + ' د.ع).') ? el('a', { href: waTo('أريد دفع رسوم إعلاني «' + a.title + '» (' + nf.format(a.fee_due) + ' د.ع).'), target: '_blank', rel: 'noopener', text: 'تواصل للدفع' }) : null]) : null,
        el('button', { class: 'btn btn-sm', type: 'button', text: 'حذف', onclick: async function () {
          if (!confirm('حذف الإعلان؟')) return;
          var r = await sb.rpc('remove_own_post', { p_id: a.id });
          if (r.error) return say(errText(r.error), 'error');
          initDashboard();
        } })]));
    });
  }

  // ---------- القائمة ----------
  async function initMenu() {
    var s = await requireLogin(); if (!s) return;
    var bid = Number(new URLSearchParams(location.search).get('b'));
    var b = bid ? (await sb.from('posts').select('id, title, status, owner_id, author_id').eq('id', bid).maybeSingle()).data : null;
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
      if (!items.length) box.appendChild(el('p', { class: 'muted', text: 'القائمة فارغة. أضف أول صنف من فوق.' }));
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
        it.available ? null : el('span', { class: 'badge badge-warn', text: 'غير متوفر' })]);
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
        addForm.reset(); say('تمت إضافة «' + name + '».', 'ok'); load();
      } catch (err) { say(errText(err), 'error'); }
      finally { busy(addForm, false); }
    });
    load();
  }

  // ---------- الإدارة ----------
  async function initAdmin() {
    var s = await requireLogin(); if (!s) return;
    var p = await profile(s.user.id);
    if (!p || p.role !== 'admin') { say('هذه الصفحة للإدارة فقط.', 'error'); $$('section').forEach(function (x) { x.hidden = true; }); return; }
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
            if (x.fee_due > 0 && !confirm('رسوم ' + nf.format(x.fee_due) + ' د.ع لم تُسجَّل كمدفوعة. نشر رغم ذلك؟')) return;
            act(x.id, 'approve'); } }),
          el('button', { class: 'btn', type: 'button', text: 'رفض', onclick: function () { act(x.id, 'reject', true); } })];
        if (x.fee_due > 0) {
          actions.unshift(el('span', { class: 'badge badge-warn', text: 'مستحق ' + nf.format(x.fee_due) + ' د.ع' }));
          actions.push(el('button', { class: 'btn', type: 'button', text: 'تم استلام المبلغ', onclick: async function () {
            var r = await sb.rpc('mark_fee_paid', { p_id: x.id });
            if (r.error) return say(errText(r.error), 'error'); say('سُجّل الدفع.', 'ok'); load();
          } }));
        }
        ul.appendChild(postCard(x, actions));
      });
      $('[data-count=pending]').textContent = String((pend.data || []).length);
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
                if (r.error) return say(errText(r.error), 'error'); say('تم الاعتماد. يظهر المحل خلال ربع ساعة.', 'ok'); load();
              } }),
              el('button', { class: 'btn', type: 'button', text: 'رفض', onclick: async function () {
                var note = prompt('سبب الرفض (يصل لصاحب الطلب):'); if (note === null) return;
                var r = await sb.rpc('decide_claim', { p_id: c.id, p_approve: false, p_note: note });
                if (r.error) return say(errText(r.error), 'error'); load();
              } })])]));
        })(c, bz, ow, proof);
      }
      $('[data-count=claims]').textContent = String((cl.data || []).length);
      if (!(cl.data || []).length) cbox.appendChild(el('p', { class: 'empty-inline', text: 'ما كو طلبات.' }));

      var pub = await sb.from('posts').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(100);
      var pbox = $('[data-published]'); pbox.textContent = '';
      var pul = el('ul', { class: 'manage-list' }); pbox.appendChild(pul);
      (pub.data || []).forEach(function (x) {
        pul.appendChild(el('li', {}, [el('a', { href: BASE + PATHS[x.type] + '/' + x.id + '/', text: x.title }), ' ', el('span', { class: 'muted', text: TYPE_LABEL[x.type] }),
          x.verified ? el('span', { class: 'badge badge-ok', text: 'موثّق' }) : null,
          el('div', { class: 'btn-row' }, [
            x.type === 'business' ? el('a', { class: 'btn btn-sm btn-primary', href: BASE + '/admin/menu/?b=' + x.id, text: 'القائمة والأسعار' }) : null,
            el('button', { class: 'btn btn-sm', type: 'button', text: 'إخفاء', onclick: function () { act(x.id, 'hide', true); } }),
            el('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'حذف', onclick: function () { act(x.id, 'remove', true); } }),
            x.type === 'business' || x.type === 'help' ? el('button', { class: 'btn btn-sm', type: 'button', text: x.verified ? 'إلغاء التوثيق' : 'توثيق (بعد التحقق)', onclick: function () { act(x.id, x.verified ? 'unverify' : 'verify'); } }) : null,
            x.type === 'community' ? el('button', { class: 'btn btn-sm', type: 'button', text: x.is_official ? 'إلغاء «خبر مؤكد»' : 'خبر مؤكد', onclick: function () { act(x.id, x.is_official ? 'unofficial' : 'official'); } }) : null,
            el('button', { class: 'btn btn-sm btn-sign', type: 'button', text: 'تمييز ' + FEATURE_DAYS + ' أيام (مدفوع)', onclick: function () { feature(x, FEATURE_DAYS); } }),
            x.featured_until && new Date(x.featured_until) > new Date() ? el('button', { class: 'btn btn-sm', type: 'button', text: 'مميز حتى ' + dayText(x.featured_until) + ' — إلغاء', onclick: function () { feature(x, 0); } }) : null])]));
      });
    }
    load();
  }

  // ---------- موقع الإدارة: إضافة مطعم أو محل كاملاً ----------
  // نفس قواعد src/static/menu-text.ts: أقسام «*القسم*»، أصناف «• الاسم — السعر»، أحجام «الاسم: صغير 5,000 / وسط 7,000»، أو «الاسم | السعر».
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

  var init = { 'add-business': initAddBusiness, submit: initSubmit, register: initRegister, login: initLogin, dashboard: initDashboard, menu: initMenu, admin: initAdmin }[page.getAttribute('data-page')];
  if (init) Promise.resolve(init()).catch(function (e) { say(errText(e), 'error'); });
})();
