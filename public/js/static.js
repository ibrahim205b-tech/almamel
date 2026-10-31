// نسخة GitHub Pages: بحث وتصفية في المتصفح، وإرسال الإعلانات عبر واتساب، وتجهيز ملفات النشر للإدارة.
(function () {
  'use strict';
  var BASE = document.documentElement.getAttribute('data-base') || '';

  // نفس تطبيع الخادم: بلا تشكيل، توحيد الألف والياء والتاء المربوطة، أرقام عربية، وإزالة السوابق
  function norm(s) {
    return String(s || '').normalize('NFKC')
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function stripPrefix(t) { return t.replace(/^(وال|بال|فال|كال|لل|ال)(?=\p{L}{2,})/u, ''); }
  function tokens(q) { return norm(q).split(' ').map(stripPrefix).filter(function (t) { return t.length >= 2; }); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function iconEl(name, cls) {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), use = document.createElementNS(ns, 'use');
    svg.setAttribute('class', cls || 'i'); svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', BASE + '/static/img/icons.svg#' + name); svg.appendChild(use); return svg;
  }

  // ---------- الحركة: ظهور تدريجي للأقسام والبطاقات عند النزول ----------
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-anim');
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: '0px 0px -30px 0px' }); // threshold 0: الأقسام الطويلة جداً (قائمة كاملة) تظهر أيضاً
    var animGroups = ['.home > .block', '.tiles > li', '.food-grid > li', '.rows > li', '.menu-list > li', '.detail-side > *', '.columns > .block'];
    animGroups.forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (node, i) {
        if (node.hasAttribute('data-anim')) return;
        node.setAttribute('data-anim', '');
        node.style.setProperty('--d', (i % 6) * 0.06 + 's'); // تتابع خفيف داخل كل مجموعة
        seen.observe(node);
      });
    });
  }

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // شبكة أمان: لا يبقى شيء مخفياً عند الطباعة أو إذا تأخر المراقب
  function showAll() { Array.prototype.forEach.call(document.querySelectorAll('[data-anim]'), function (n) { n.classList.add('in'); }); }
  window.addEventListener('beforeprint', showAll);
  setTimeout(function () { Array.prototype.forEach.call(document.querySelectorAll('[data-anim]:not(.in)'), function (n) { var r = n.getBoundingClientRect(); if (r.top < window.innerHeight) n.classList.add('in'); }); }, 1500);

  // ---------- عدّاد الأقسام يعدّ من الصفر ----------
  if (!calm && 'IntersectionObserver' in window) {
    var digits = '٠١٢٣٤٥٦٧٨٩';
    var toAr = function (n) { return String(n).replace(/\d/g, function (c) { return digits[+c]; }); };
    var fromAr = function (t) { return parseInt(String(t).replace(/[٠-٩]/g, function (c) { return digits.indexOf(c); }).replace(/[^\d]/g, ''), 10); };
    var counter = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return; counter.unobserve(e.target);
        var node = e.target, end = +node.getAttribute('data-n'), t0 = null, ar = node.getAttribute('data-ar') === '1';
        var step = function (t) { if (t0 === null) t0 = t; var k = Math.min(1, (t - t0) / 700), v = Math.round(end * (1 - Math.pow(1 - k, 3))); node.textContent = ar ? toAr(v) : String(v); if (k < 1) window.requestAnimationFrame(step); };
        window.requestAnimationFrame(step);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tile-count'), function (node) {
      var n = fromAr(node.textContent); if (!(n > 1)) return;
      node.setAttribute('data-n', String(n)); node.setAttribute('data-ar', /[٠-٩]/.test(node.textContent) ? '1' : '0');
      counter.observe(node);
    });
  }

  // ---------- تموّج عند الضغط على الأزرار ----------
  if (!calm) document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.btn, .add-btn, .cart-bar');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2, dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.setProperty('--x', (e.clientX - r.left - size / 2) + 'px'); dot.style.setProperty('--y', (e.clientY - r.top - size / 2) + 'px'); dot.style.setProperty('--s', size + 'px');
    b.appendChild(dot); setTimeout(function () { dot.remove(); }, 600);
  });

  // ---------- زر الرجوع للأعلى ----------
  (function () {
    var up = document.createElement('button'); up.type = 'button'; up.className = 'to-top'; up.setAttribute('aria-label', 'للأعلى');
    up.appendChild(iconEl('arrow-up')); document.body.appendChild(up);
    var tick = function () { up.classList.toggle('show', window.scrollY > 700); };
    window.addEventListener('scroll', tick, { passive: true }); tick();
    up.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }); });
  })();

  // ---------- مشاركة الإعلان ----------
  (function () {
    var side = document.querySelector('.detail-side'); if (!side) return;
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-ghost btn-block share-btn';
    btn.appendChild(iconEl('share')); btn.appendChild(document.createTextNode(' مشاركة'));
    btn.addEventListener('click', function () {
      var data = { title: document.title, url: location.href };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      var done = function () { btn.lastChild.textContent = ' تم نسخ الرابط'; setTimeout(function () { btn.lastChild.textContent = ' مشاركة'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, function () { window.open('https://wa.me/?text=' + encodeURIComponent(location.href), '_blank', 'noopener'); });
      else window.open('https://wa.me/?text=' + encodeURIComponent(location.href), '_blank', 'noopener');
    });
    side.appendChild(btn);
  })();

  // ---------- البحث ----------
  var results = document.querySelector('[data-search-results]');
  if (results) {
    var params = new URLSearchParams(location.search);
    var q = (params.get('q') || '').slice(0, 80), type = params.get('type') || '';
    var input = document.querySelector('form.search input[name=q]');
    var sel = document.querySelector('form.search select[name=type]');
    if (input) input.value = q;
    if (sel) sel.value = type;
    if (q || type) {
      fetch(BASE + '/search.json').then(function (r) { return r.json(); }).then(function (items) {
        var tk = tokens(q);
        var hits = items.filter(function (it) {
          if (type && it.y !== type) return false;
          var words = it.x.split(' ');
          return tk.every(function (t) { return words.some(function (w) { return w.indexOf(t) === 0; }); });
        });
        var count = document.querySelector('[data-search-count]');
        if (count) count.textContent = hits.length ? hits.length + ' نتيجة' : '';
        results.textContent = '';
        if (!hits.length) {
          var empty = el('div', 'empty'); empty.appendChild(el('p', 'empty-title', 'ما لگينا نتائج'));
          empty.appendChild(el('p', '', 'جرّب كلمة أقصر أو تهجئة ثانية، أو ابحث بكل الأقسام.'));
          results.appendChild(empty); return;
        }
        var ul = el('ul', 'rows');
        hits.slice(0, 200).forEach(function (it) {
          var li = el('li', 'row'), a = el('a', 'row-link'); a.href = it.u;
          var th = el('span', 'row-thumb');
          if (it.th) { var img = el('img'); img.src = it.th; img.alt = ''; img.width = 96; img.height = 72; img.loading = 'lazy'; th.appendChild(img); }
          else th.appendChild(iconEl(it.i, 'i i-thumb'));
          var body = el('span', 'row-body');
          body.appendChild(el('span', 'row-title', it.t));
          body.appendChild(el('span', 'row-meta', it.s + ' / ' + it.c));
          body.appendChild(el('span', 'row-meta', it.a));
          if (it.p) body.appendChild(el('span', 'row-price', it.p));
          a.appendChild(th); a.appendChild(body); li.appendChild(a); ul.appendChild(li);
        });
        results.appendChild(ul);
      }).catch(function () { results.textContent = 'تعذّر تحميل البحث. حدّث الصفحة.'; });
    }
  }

  // ---------- تصفية صفحة القسم ----------
  var filter = document.querySelector('[data-filter]');
  if (filter) {
    var rows = Array.prototype.slice.call(document.querySelectorAll('main .rows > li'));
    var texts = rows.map(function (r) { return norm(r.textContent); });
    filter.addEventListener('input', function () {
      var tk = tokens(filter.value);
      rows.forEach(function (r, i) { r.hidden = !tk.every(function (t) { return texts[i].indexOf(t) !== -1; }); });
    });
  }

  // ---------- أضف إعلانك عبر واتساب ----------
  // ---------- نموذج حسب القسم: حقول وتسميات وتصنيفات كل قسم ----------
  function typeForm(form, prefixOf) {
    var typeSel = form.querySelector('select[name=type]');
    var cats = JSON.parse(form.getAttribute('data-cats') || '{}');
    var texts = JSON.parse(form.getAttribute('data-texts') || '{}');
    var setLabel = function (name, text, hint) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return;
      var lab = form.querySelector('label[for="' + input.id + '"]');
      if (lab && text) lab.firstChild.textContent = text;
      if (hint !== undefined) input.placeholder = hint;
    };
    var apply = function () {
      var t = typeSel.value;
      var any = form.querySelector('[data-for-any]');
      if (any) any.hidden = !t;
      Array.prototype.forEach.call(form.querySelectorAll('[data-for]'), function (g) {
        var on = g.getAttribute('data-for').split(' ').indexOf(t) !== -1;
        g.hidden = !on;
        Array.prototype.forEach.call(g.querySelectorAll('input,select,textarea'), function (x) { x.disabled = !on; });
      });
      var cat = form.querySelector('select[name=category]');
      if (cat && cats[t]) {
        cat.textContent = '';
        cat.appendChild(new Option('اختر', ''));
        cats[t].forEach(function (c) { cat.appendChild(new Option(c, c)); });
      }
      var tx = texts[t];
      if (tx) {
        setLabel('title', tx.title, tx.titleHint);
        setLabel(form.querySelector('[name=details]') ? 'details' : 'body', tx.body, tx.bodyHint);
        if (tx.price) setLabel('price', tx.price);
      }
    };
    typeSel.addEventListener('change', apply); apply();
    return { prefix: function () { return prefixOf(typeSel.value); }, type: function () { return typeSel.value; } };
  }

  var wa = document.querySelector('[data-wa-form]');
  if (wa) {
    var waForm = typeForm(wa, function (t) { return 'd_' + t + '_'; });
    var labels = JSON.parse(wa.getAttribute('data-labels') || '{}');
    wa.addEventListener('submit', function (e) {
      e.preventDefault();
      delete wa.dataset.submitting;
      if (!wa.reportValidity()) return;
      var f = new FormData(wa), t = waForm.type(), pre = waForm.prefix();
      var typeName = wa.querySelector('select[name=type]').selectedOptions[0].textContent;
      var lines = ['إعلان جديد لدليل المعامل', 'القسم: ' + typeName, 'التصنيف: ' + f.get('category'), 'العنوان: ' + f.get('title'), 'المنطقة: ' + f.get('area')];
      Object.keys(labels[t] || {}).forEach(function (k) {
        var meta = labels[t][k], v = f.get(pre + k);
        if (!v) return;
        lines.push(meta.l + ': ' + (meta.c ? 'نعم' : meta.o && meta.o[v] ? meta.o[v] : v));
      });
      if (f.get('price')) {
        var priceLabel = wa.querySelector('label[for="' + wa.querySelector('[name=price]').id + '"]').firstChild.textContent.trim();
        lines.push(priceLabel + ': ' + f.get('price'));
      }
      lines.push('التفاصيل: ' + f.get('details'), 'الاسم: ' + f.get('name'), 'رقم التواصل: ' + f.get('phone'),
        f.get('show_phone') ? 'أوافق على عرض الرقم في الإعلان' : 'لا أريد عرض رقمي في الإعلان');
      window.location.href = wa.getAttribute('data-wa') + '?text=' + encodeURIComponent(lines.join('\n'));
    });
  }

  // ---------- تجهيز ملف إعلان للإدارة ----------
  var pub = document.querySelector('[data-publish]');
  if (pub) {
    var typeSel = pub.querySelector('select[name=type]');
    var show = function () {
      var t = typeSel.value;
      Array.prototype.forEach.call(pub.querySelectorAll('[data-for]'), function (g) {
        var on = g.getAttribute('data-for').split(' ').indexOf(t) !== -1;
        g.hidden = !on;
        Array.prototype.forEach.call(g.querySelectorAll('input,select,textarea'), function (x) { x.disabled = !on; });
      });
    };
    typeSel.addEventListener('change', show); show();

    // ---------- صور من معرض الهاتف: تُصغَّر في المتصفح وتُضمَّن في ملف الإعلان ----------
    var picked = [], logo = null, fullText = '';
    var shrink = async function (file, max) {
      var bmp = await createImageBitmap(file);
      var k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      var url = c.toDataURL('image/webp', 0.8);
      return url.indexOf('data:image/webp') === 0 ? url : c.toDataURL('image/jpeg', 0.82);
    };
    var preview = function (list, urls, onRemove) {
      list.textContent = '';
      urls.forEach(function (u, i) {
        var li = el('li'), img = el('img'), x = el('button', 'thumb-x', '×');
        img.src = u; img.alt = 'صورة ' + (i + 1); img.width = 96; img.height = 96;
        x.type = 'button'; x.setAttribute('aria-label', 'إزالة الصورة ' + (i + 1));
        x.addEventListener('click', function () { onRemove(i); });
        li.appendChild(img); li.appendChild(x); list.appendChild(li);
      });
    };
    var pickedList = pub.querySelector('[data-picked]'), logoList = pub.querySelector('[data-picked-logo]');
    var drawPicked = function () { preview(pickedList, picked, function (i) { picked.splice(i, 1); drawPicked(); }); };
    var drawLogo = function () { preview(logoList, logo ? [logo] : [], function () { logo = null; drawLogo(); }); };
    pub.querySelector('[data-pick-images]').addEventListener('change', async function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      for (var i = 0; i < files.length && picked.length < 6; i++) {
        try { picked.push(await shrink(files[i], 1280)); } catch { alert('تعذر قراءة إحدى الصور.'); }
      }
      if (files.length && picked.length >= 6) pickedList.setAttribute('data-full', '1');
      e.target.value = ''; drawPicked();
    });
    pub.querySelector('[data-pick-logo]').addEventListener('change', async function (e) {
      var file = (e.target.files || [])[0];
      if (file) { try { logo = await shrink(file, 600); } catch { alert('تعذر قراءة الصورة.'); } }
      e.target.value = ''; drawLogo();
    });

    pub.addEventListener('submit', function (e) {
      e.preventDefault();
      delete pub.dataset.submitting;
      var f = new FormData(pub), t = f.get('type');
      if (!t || !f.get('title') || !f.get('category_' + t)) { alert('اختر القسم والتصنيف واكتب العنوان.'); return; }
      var q = function (v) { return JSON.stringify(String(v)); };
      var id = Math.floor(Date.now() / 1000) - 1700000000;
      var today = new Date().toISOString().slice(0, 10);
      var out = ['---', 'id: ' + id, 'type: ' + t, 'title: ' + q(f.get('title')), 'category: ' + q(f.get('category_' + t)), 'area: ' + q(f.get('area') || 'المعامل'), 'date: ' + today];
      if (f.get('expires')) out.push('expires: ' + f.get('expires'));
      if (f.get('price')) out.push('price: ' + q(f.get('price')));
      if (f.get('phone')) { out.push('phone: ' + q(f.get('phone')), 'show_phone: ' + !!f.get('show_phone'), 'whatsapp: ' + !!f.get('whatsapp')); }
      // حقول القسم: «<القسم>_<الحقل>»؛ مربعات الاختيار تُكتب true
      f.forEach(function (v, k) {
        if (k.indexOf(t + '_') !== 0 || !v || k === 'category_' + t) return;
        out.push(k.slice(t.length + 1) + ': ' + (v === 'on' ? 'true' : q(v)));
      });
      if (f.get('menu')) { out.push('menu:'); String(f.get('menu')).split('\n').filter(Boolean).forEach(function (l) { out.push('  - ' + q(l.trim())); }); }
      var imgs = picked.concat(String(f.get('images') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean)).slice(0, 6);
      if (imgs.length) { out.push('images:'); imgs.forEach(function (n) { out.push('  - ' + q(n)); }); }
      if (logo && t === 'business') out.push('logo: ' + q(logo));
      ['featured', 'verified', 'official', 'consent', 'phone_consent'].forEach(function (k) { if (f.get(k)) out.push(k + ': true'); });
      out.push('---', '', String(f.get('body') || '').trim(), '');
      var text = out.join('\n');
      fullText = text;
      var file = 'content/listings/' + t + '-' + id + '.md';
      var box = document.querySelector('[data-publish-out]');
      box.hidden = false;
      // العرض بدون نص الصور الطويل؛ النسخ والحفظ يستخدمان النص الكامل
      var n = 0;
      document.querySelector('[data-publish-text]').value = text.replace(/"data:image\/[a-z]+;base64,[^"]+"/g, function () { n++; return '"(صورة ' + n + ' مضمّنة)"'; });
      var base = 'https://github.com/' + pub.getAttribute('data-repo') + '/new/main?filename=' + encodeURIComponent(file);
      var full = base + '&value=' + encodeURIComponent(text);
      // GitHub يرفض الروابط الطويلة («Your request URL is too long»)، وهذا يحدث مع المنيو الطويل.
      // عندها يُفتح الملف فارغاً ويُنسخ النص تلقائياً ليُلصق فيه.
      var long = full.length > 6000;
      document.querySelector('[data-publish-link]').href = long ? base : full;
      document.querySelector('[data-publish-link]').dataset.needsPaste = long ? '1' : '';
      document.querySelector('[data-paste-note]').hidden = !long;
      box.scrollIntoView();
    });
    var copyText = function () {
      var ta = document.querySelector('[data-publish-text]');
      if (navigator.clipboard) navigator.clipboard.writeText(fullText || ta.value).catch(function () {});
      else { ta.value = fullText || ta.value; ta.select(); document.execCommand('copy'); }
    };
    var link = document.querySelector('[data-publish-link]');
    if (link) link.addEventListener('click', function () {
      if (link.dataset.needsPaste) copyText();
    });
    var copy = document.querySelector('[data-copy]');
    if (copy) copy.addEventListener('click', function () {
      copyText();
      copy.textContent = 'تم النسخ';
    });
  }
  // ---------- تصفح القائمة: بحث وأقسام تتبع التمرير ----------
  var menu = document.querySelector('[data-menu]');
  if (menu) {
    var tabs = menu.querySelector('[data-menu-tabs]');
    var groups = Array.prototype.slice.call(menu.querySelectorAll('[data-group]'));
    var setActive = function (id) {
      if (!tabs) return;
      Array.prototype.forEach.call(tabs.querySelectorAll('a'), function (a) {
        var on = a.getAttribute('data-tab') === id;
        a.classList.toggle('active', on);
        if (on) tabs.scrollTo({ left: a.offsetLeft - (tabs.clientWidth - a.clientWidth) / 2, behavior: 'smooth' });
      });
    };
    if (tabs && 'IntersectionObserver' in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
      }, { rootMargin: '-140px 0px -60% 0px' });
      groups.forEach(function (g) { spy.observe(g); });
      if (groups[0]) setActive(groups[0].id);
    }
    var search = menu.querySelector('[data-menu-search]');
    if (search) search.addEventListener('input', function () {
      var t = tokens(search.value), any = false;
      groups.forEach(function (g) {
        var shown = 0;
        Array.prototype.forEach.call(g.querySelectorAll('.menu-item'), function (li) {
          var name = norm(li.getAttribute('data-item-name'));
          var ok = !t.length || t.every(function (w) { return name.indexOf(w) !== -1; });
          li.hidden = !ok; if (ok) shown++;
        });
        g.hidden = !shown; if (shown) any = true;
        var tab = tabs && tabs.querySelector('[data-tab="' + g.id + '"]');
        if (tab) tab.hidden = !shown;
      });
      menu.querySelector('[data-menu-empty]').hidden = any;
      // إذا كان البحث من أسفل الصفحة، ارجع لبداية النتائج
      var top = menu.getBoundingClientRect().top + window.scrollY;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: 'auto' });
    });
  }

  // ---------- سلة الطلب في قائمة المحل ----------
  var shop = document.querySelector('[data-cart]');
  if (shop) {
    var KEY = 'cart-' + shop.getAttribute('data-shop-id');
    var load = function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
    var save = function () { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* التخزين غير متاح */ } };
    var cart = load(); // name -> {p: السعر أو null, q: الكمية}
    var fmt = function (n) { return Number(n).toLocaleString('en-US') + ' د.ع'; };
    var count = function () { return Object.keys(cart).reduce(function (s, k) { return s + cart[k].q; }, 0); };
    var total = function () { return Object.keys(cart).reduce(function (s, k) { return s + (cart[k].p || 0) * cart[k].q; }, 0); };
    var priced = function () { return Object.keys(cart).every(function (k) { return cart[k].p !== null; }); };

    var bar = el('button', 'cart-bar'); bar.type = 'button'; bar.hidden = true;
    var panel = el('div', 'cart-panel'); panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'سلة الطلب');
    var card = el('div', 'cart-card');
    var head = el('div', 'cart-head'); head.appendChild(el('h2', '', 'طلبك من ' + shop.getAttribute('data-shop')));
    var close = el('button', 'btn btn-sm', 'إغلاق'); close.type = 'button'; head.appendChild(close);
    var list = el('ul', 'cart-list');
    var sum = el('p', 'cart-sum');
    var nameF = el('input'); nameF.placeholder = 'اسمك (اختياري)'; nameF.autocomplete = 'name'; nameF.setAttribute('aria-label', 'اسمك');
    var addrF = el('textarea'); addrF.rows = 2; addrF.placeholder = 'العنوان أو أقرب نقطة دالة (للتوصيل)'; addrF.setAttribute('aria-label', 'العنوان');
    var noteF = el('textarea'); noteF.rows = 2; noteF.placeholder = 'ملاحظات (اختياري)'; noteF.setAttribute('aria-label', 'ملاحظات');
    var send = el('a', 'btn btn-wa btn-block cart-send'); send.target = '_blank'; send.rel = 'noopener';
    send.appendChild(iconEl('whatsapp', 'i')); send.appendChild(document.createTextNode('أرسل الطلب عبر واتساب'));
    var clear = el('button', 'btn btn-sm cart-clear', 'إفراغ السلة'); clear.type = 'button';
    try { var saved = JSON.parse(localStorage.getItem('cart-customer')) || {}; nameF.value = saved.n || ''; addrF.value = saved.a || ''; } catch { /* لا شيء */ }
    [head, list, sum, nameF, addrF, noteF, send, clear].forEach(function (x) { card.appendChild(x); });
    panel.appendChild(card);
    document.body.appendChild(bar); document.body.appendChild(panel);

    var message = function () {
      var lines = ['مرحبا، طلب جديد من دليل المعامل — ' + shop.getAttribute('data-shop'), ''];
      Object.keys(cart).forEach(function (k) {
        var it = cart[k];
        lines.push('• ' + it.q + ' × ' + k + (it.p !== null ? ' = ' + fmt(it.p * it.q) : ''));
      });
      lines.push('', 'المجموع: ' + fmt(total()) + (priced() ? '' : ' (بعض الأصناف حسب الطلب)'));
      if (nameF.value.trim()) lines.push('الاسم: ' + nameF.value.trim());
      if (addrF.value.trim()) lines.push('العنوان: ' + addrF.value.trim());
      if (noteF.value.trim()) lines.push('ملاحظات: ' + noteF.value.trim());
      return lines.join('\n');
    };
    var refresh = function () {
      var n = count();
      bar.hidden = !n;
      bar.textContent = '';
      bar.appendChild(iconEl('cart', 'i'));
      bar.appendChild(el('span', 'cart-bar-n', String(n)));
      bar.appendChild(el('span', 'cart-bar-t', 'عرض الطلب'));
      bar.appendChild(el('b', '', fmt(total())));
      list.textContent = '';
      Object.keys(cart).forEach(function (k) {
        var it = cart[k], li = el('li', 'cart-line');
        var info = el('div', 'cart-info'); info.appendChild(el('b', '', k));
        info.appendChild(el('span', 'muted', it.p !== null ? fmt(it.p * it.q) : 'حسب الطلب'));
        var qty = el('div', 'cart-qty');
        var plus = el('button', 'btn btn-sm', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'زيادة ' + k);
        var minus = el('button', 'btn btn-sm', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'إنقاص ' + k);
        plus.addEventListener('click', function () { it.q++; save(); refresh(); });
        minus.addEventListener('click', function () { it.q--; if (it.q <= 0) delete cart[k]; save(); refresh(); if (!count()) panel.hidden = true; });
        qty.appendChild(plus); qty.appendChild(el('b', '', String(it.q))); qty.appendChild(minus);
        li.appendChild(info); li.appendChild(qty); list.appendChild(li);
      });
      sum.textContent = 'المجموع: ' + fmt(total());
      send.href = shop.getAttribute('data-wa') + '?text=' + encodeURIComponent(message());
      Array.prototype.forEach.call(shop.querySelectorAll('[data-add]'), function (a) {
        var q = cart[a.getAttribute('data-name')], end = a.parentNode, item = a.closest('.menu-item');
        end.classList.toggle('has-qty', !!q);
        end.querySelector('.step-n').textContent = q ? String(q.q) : '';
        if (item) item.classList.toggle('in-cart', !!q);
      });
    };
    Array.prototype.forEach.call(shop.querySelectorAll('[data-add]'), function (a) {
      var k = a.getAttribute('data-name'), p = a.getAttribute('data-price');
      // − العدد + : يظهران بعد أول إضافة
      var minus = el('button', 'step-btn', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'إنقاص ' + k);
      var n = el('span', 'step-n'); n.setAttribute('aria-live', 'polite');
      a.parentNode.insertBefore(minus, a); a.parentNode.insertBefore(n, a);
      minus.addEventListener('click', function () {
        if (!cart[k]) return;
        cart[k].q--; if (cart[k].q <= 0) delete cart[k];
        save(); refresh();
      });
      a.addEventListener('click', function () {
        if (!cart[k]) cart[k] = { p: p === '' ? null : Number(p), q: 0 };
        cart[k].q++;
        save(); refresh();
        bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump');
      });
    });
    [nameF, addrF, noteF].forEach(function (f) { f.addEventListener('input', function () { send.href = shop.getAttribute('data-wa') + '?text=' + encodeURIComponent(message()); }); });
    bar.addEventListener('click', function () { panel.hidden = false; document.body.classList.add('no-scroll'); close.focus(); });
    new window.MutationObserver(function () { if (panel.hidden) document.body.classList.remove('no-scroll'); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    close.addEventListener('click', function () { panel.hidden = true; bar.focus(); });
    panel.addEventListener('click', function (e) { if (e.target === panel) panel.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) panel.hidden = true; });
    clear.addEventListener('click', function () { cart = {}; save(); refresh(); panel.hidden = true; });
    send.addEventListener('click', function () {
      try { localStorage.setItem('cart-customer', JSON.stringify({ n: nameF.value.trim(), a: addrF.value.trim() })); } catch { /* لا شيء */ }
      cart = {}; save(); noteF.value = '';
      setTimeout(function () { refresh(); panel.hidden = true; }, 300);
    });
    refresh();
  }
})();
