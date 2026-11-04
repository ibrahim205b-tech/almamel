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
    Array.prototype.forEach.call(document.querySelectorAll('.tile-count, [data-count-up]'), function (node) {
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

  // ---------- تثبيت الموقع كتطبيق (أندرويد وكروم): زر بالقائمة يظهر فقط إذا الجهاز يدعمه ----------
  (function () {
    var li = document.querySelector('[data-install]'); if (!li) return;
    var prompt = null;
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); prompt = e; li.hidden = false; });
    window.addEventListener('appinstalled', function () { li.hidden = true; prompt = null; });
    li.querySelector('button').addEventListener('click', function () {
      if (!prompt) return;
      prompt.prompt();
      prompt.userChoice.then(function () { prompt = null; li.hidden = true; });
    });
  })();

  // ---------- مشاركة الإعلان ----------
  (function () {
    var side = document.querySelector('.detail-side'); if (!side) return;
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-ghost btn-block share-btn';
    var shareTxt = document.createTextNode(' مشاركة'); btn.appendChild(iconEl('share')); btn.appendChild(shareTxt);
    btn.addEventListener('click', function () {
      var data = { title: document.title, url: location.href };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      var done = function () { shareTxt.textContent = ' تم نسخ الرابط'; setTimeout(function () { shareTxt.textContent = ' مشاركة'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, function () { window.open('https://wa.me/?text=' + encodeURIComponent(location.href), '_blank', 'noopener'); });
      else window.open('https://wa.me/?text=' + encodeURIComponent(location.href), '_blank', 'noopener');
    });
    side.appendChild(btn);
  })();

  // ---------- اقتراحات البحث أثناء الكتابة (نفس بيانات صفحة البحث، بدون تغيير آليته) ----------
  var index = null;
  var loadIndex = function () { return index || (index = fetch(BASE + '/search.json').then(function (r) { return r.json(); }).catch(function () { index = null; return []; })); };
  Array.prototype.forEach.call(document.querySelectorAll('form.search'), function (form, fi) {
    var input = form.querySelector('input[name=q]'), sel = form.querySelector('select[name=type]');
    if (!input) return;
    var list = el('ul', 'suggest'); list.id = 'suggest-' + fi; list.hidden = true; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'اقتراحات');
    form.appendChild(list);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', list.id);
    var active = -1, timer2 = null;
    var close = function () { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
    var mark = function (text, tk) {
      var span = el('span', 's-t');
      var first = tk[0] && norm(text).indexOf(tk[0]);
      if (tk[0] && first >= 0 && norm(text).length === text.length) {
        span.appendChild(document.createTextNode(text.slice(0, first)));
        span.appendChild(el('mark', '', text.slice(first, first + tk[0].length)));
        span.appendChild(document.createTextNode(text.slice(first + tk[0].length)));
      } else span.textContent = text;
      return span;
    };
    var show = function () {
      var tk = tokens(input.value);
      if (!tk.length) return close();
      loadIndex().then(function (items) {
        var type = sel ? sel.value : '';
        var hits = items.filter(function (it) {
          if (type && it.y !== type) return false;
          var words = it.x.split(' ');
          return tk.every(function (t) { return words.some(function (w) { return w.indexOf(t) === 0; }); });
        }).slice(0, 6);
        list.textContent = ''; active = -1;
        hits.forEach(function (it, i) {
          var li = el('li'), a = el('a'); a.href = it.u; a.id = list.id + '-' + i; a.setAttribute('role', 'option');
          var ico = el('span', 's-ico');
          if (it.th) { var im = el('img'); im.src = it.th; im.alt = ''; im.width = 40; im.height = 40; im.loading = 'lazy'; ico.appendChild(im); } else ico.appendChild(iconEl(it.i, 'i i-sm'));
          var txt = el('span'); txt.appendChild(mark(it.t, tk)); txt.appendChild(el('span', 's-m', it.s + ' · ' + it.c + (it.a ? ' · ' + it.a : '')));
          a.appendChild(ico); a.appendChild(txt); li.appendChild(a); list.appendChild(li);
        });
        var all = el('a', 's-all', hits.length ? 'كل النتائج لـ «' + input.value.trim() + '»' : 'ما لگينا اقتراحات. اضغط للبحث الكامل');
        all.href = BASE + '/search/?q=' + encodeURIComponent(input.value.trim()) + (type ? '&type=' + type : '');
        var lia = el('li'); lia.appendChild(all); list.appendChild(lia);
        list.hidden = false; input.setAttribute('aria-expanded', 'true');
      });
    };
    input.addEventListener('focus', loadIndex);
    input.addEventListener('input', function () { window.clearTimeout(timer2); timer2 = window.setTimeout(show, 120); });
    if (sel) sel.addEventListener('change', function () { if (!list.hidden) show(); });
    input.addEventListener('keydown', function (e) {
      var opts = list.querySelectorAll('[role=option]');
      if (e.key === 'Escape') return close();
      if (list.hidden || !opts.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter')) return;
      if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); opts[active].click(); } return; }
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      Array.prototype.forEach.call(opts, function (o, i) { o.setAttribute('aria-selected', i === active ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', opts[active].id);
    });
    document.addEventListener('click', function (e) { if (!form.contains(e.target)) close(); });
  });

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
      results.textContent = '';
      var skel = el('div', 'skeleton'); skel.setAttribute('aria-label', 'جارِ البحث');
      for (var si = 0; si < 4; si++) skel.appendChild(el('span', 'sk'));
      results.appendChild(skel);
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
    // مطعم لو محل ثاني (صيدلية، موبايلات...): الكلام بالسلة يتغير حسبه
    var WHO = shop.getAttribute('data-kind') === 'food' ? 'المطعم' : 'المحل';
    var send = el('a', 'btn btn-wa btn-block cart-send'); send.target = '_blank'; send.rel = 'noopener';
    send.appendChild(iconEl('whatsapp', 'i')); send.appendChild(document.createTextNode('أرسل الطلب عبر واتساب'));
    var clear = el('button', 'btn btn-sm cart-clear', 'إفراغ السلة'); clear.type = 'button';
    // الطلب من داخل الموقع (إذا كان مفعّلاً): يوصل لصاحب المحل مباشرة بإشعار وصوت
    var LOG = document.querySelector('meta[name="order-log"]');
    var phoneF = el('input'); phoneF.type = 'tel'; phoneF.dir = 'ltr'; phoneF.inputMode = 'tel'; phoneF.autocomplete = 'tel';
    phoneF.placeholder = 'رقم هاتفك 07xxxxxxxxx'; phoneF.setAttribute('aria-label', 'رقم هاتفك');
    var locBtn = el('button', 'btn btn-block loc-btn'); locBtn.type = 'button';
    var locTxt = document.createTextNode(' استخدم موقعي الحالي'); locBtn.appendChild(iconEl('pin', 'i')); locBtn.appendChild(locTxt);
    var locNote = el('p', 'hint loc-note', 'يساعد ' + WHO + ' يوصلك بسرعة. موقعك يشوفه ' + WHO + ' فقط.');
    var loc = null;
    var order = el('button', 'btn btn-primary btn-block btn-lg cart-order'); order.type = 'button';
    var orderTxt = document.createTextNode(' أرسل الطلب لل' + WHO.slice(2)); order.appendChild(iconEl('check', 'i')); order.appendChild(orderTxt);
    var err = el('p', 'cart-err'); err.setAttribute('role', 'alert'); err.hidden = true;
    if (LOG) {
      addrF.placeholder = 'أقرب نقطة دالة (مطلوب): مثلاً قرب جامع ...، الزقاق الثاني';
      addrF.setAttribute('aria-label', 'أقرب نقطة دالة');
      send.className = 'btn btn-sm btn-block cart-send cart-send-alt'; send.lastChild.textContent = ' أو أرسل الطلب عبر واتساب';
    }
    try { var saved = JSON.parse(localStorage.getItem('cart-customer')) || {}; nameF.value = saved.n || ''; addrF.value = saved.a || ''; phoneF.value = saved.p || ''; } catch { /* لا شيء */ }
    (LOG ? [head, list, sum, nameF, phoneF, locBtn, locNote, addrF, noteF, err, order, send, clear] : [head, list, sum, nameF, addrF, noteF, send, clear])
      .forEach(function (x) { card.appendChild(x); });
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
      if (LOG && phoneF.value.trim()) lines.push('الهاتف: ' + phoneF.value.trim());
      if (loc) lines.push('الموقع: https://maps.google.com/?q=' + loc.lat + ',' + loc.lng);
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
      // يسجّل الطلب (المبلغ وعدد الأصناف فقط) لحساب نسبة الموقع الشهرية من المطعم
      var log = document.querySelector('meta[name="order-log"]');
      if (log && count()) {
        try {
          window.fetch(log.content + '/rest/v1/rpc/log_order', { method: 'POST', keepalive: true,
            headers: { apikey: log.getAttribute('data-key'), Authorization: 'Bearer ' + log.getAttribute('data-key'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_business: Number(shop.getAttribute('data-shop-id')), p_total: total(), p_items: count() }) }).catch(function () {});
        } catch { /* لا يمنع إرسال الطلب */ }
      }
      try { localStorage.setItem('cart-customer', JSON.stringify({ n: nameF.value.trim(), a: addrF.value.trim(), p: phoneF.value.trim() })); } catch { /* لا شيء */ }
      cart = {}; save(); noteF.value = '';
      setTimeout(function () { refresh(); panel.hidden = true; }, 300);
    });

    // ---------- إرسال الطلب للمطعم من داخل الموقع ----------
    var showErr = function (t) { err.textContent = t; err.hidden = !t; if (t) err.scrollIntoView({ block: 'nearest' }); };
    [phoneF, addrF].forEach(function (f) { f.addEventListener('input', function () { if (!err.hidden) showErr(''); }); });
    locBtn.addEventListener('click', function () {
      if (!navigator.geolocation) { locNote.textContent = 'جهازك ما يدعم تحديد الموقع. اكتب أقرب نقطة دالة بالتفصيل.'; return; }
      locBtn.disabled = true; locNote.textContent = 'جارِ تحديد موقعك...';
      navigator.geolocation.getCurrentPosition(function (pos) {
        loc = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 };
        locBtn.disabled = false; locBtn.classList.add('done');
        locTxt.textContent = ' تم تحديد موقعك ✓';
        locNote.textContent = 'الدقة بحدود ' + Math.round(pos.coords.accuracy) + ' متر. اكتب أقرب نقطة دالة حتى يكون التوصيل أسهل.';
      }, function (e) {
        locBtn.disabled = false;
        locNote.textContent = e.code === 1 ? 'ما سمحت بتحديد الموقع. تكدر تسمح من إعدادات المتصفح، أو اكتب أقرب نقطة دالة بالتفصيل.' : 'ما كدرنا نحدد موقعك. اكتب أقرب نقطة دالة بالتفصيل.';
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
    var normPhone = function (v) {
      v = String(v || '').replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); }).replace(/[^\d+]/g, '');
      if (/^\+?964/.test(v)) v = '0' + v.replace(/^\+?964/, '');
      return /^07\d{9}$/.test(v) ? v : null;
    };
    order.addEventListener('click', function () {
      var ph = normPhone(phoneF.value);
      if (!count()) return showErr('السلة فارغة.');
      if (!ph) { phoneF.focus(); return showErr('اكتب رقم هاتفك (رقم عراقي يبدأ بـ 07).'); }
      if (addrF.value.trim().length < 3) { addrF.focus(); return showErr('اكتب أقرب نقطة دالة حتى يوصلك الطلب.'); }
      showErr(''); order.disabled = true; orderTxt.textContent = ' جارِ الإرسال...';
      var key = LOG.getAttribute('data-key');
      window.fetch(LOG.content + '/rest/v1/rpc/place_order', { method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_business: Number(shop.getAttribute('data-shop-id')), p_items: Object.keys(cart).map(function (k) { return { name: k, q: cart[k].q }; }),
          p_phone: ph, p_name: nameF.value.trim() || null, p_landmark: addrF.value.trim(), p_lat: loc ? loc.lat : null, p_lng: loc ? loc.lng : null, p_note: noteF.value.trim() || null }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || 'تعذّر الإرسال'); return j; }); })
        .then(function (token) {
          try {
            localStorage.setItem('cart-customer', JSON.stringify({ n: nameF.value.trim(), a: addrF.value.trim(), p: ph }));
            localStorage.setItem('last-order', token);
          } catch { /* لا شيء */ }
          cart = {}; save();
          window.location.href = BASE + '/order/?t=' + encodeURIComponent(token);
        })
        .catch(function (e) {
          order.disabled = false; orderTxt.textContent = ' أرسل الطلب لل' + WHO.slice(2);
          var m = e.message || '';
          showErr(/fetch|network|Failed/i.test(m) ? 'ما كدرنا نوصل لل' + WHO.slice(2) + '. تأكد من الإنترنت وحاول مرة ثانية، أو أرسل الطلب عبر واتساب.'
            : /[\u0600-\u06FF]/.test(m) ? m // رسائل قاعدة البيانات العربية (رقم غير صحيح، صنف غير متوفر...)
            : 'الطلب من الموقع متوقف مؤقتاً. أرسل طلبك عبر واتساب من الزر تحت.');
        });
    });
    refresh();
  }

  // ---------- صفحة «حالة طلبك» للزبون ----------
  var track = document.querySelector('[data-order-status]');
  var LOG2 = document.querySelector('meta[name="order-log"]');
  if (track && LOG2) {
    var box = track.querySelector('[data-order-box]');
    var token = new URLSearchParams(location.search).get('t');
    try { token = token || localStorage.getItem('last-order'); } catch { /* لا شيء */ }
    var key2 = LOG2.getAttribute('data-key'), lastStatus = null, timer = null;
    var fmt2 = function (n) { return Number(n).toLocaleString('en-US') + ' د.ع'; };
    var STEPS = { new: ['بانتظار رد صاحب المحل', 'وصل طلبك. راح يوصلك الرد خلال دقائق.'], accepted: ['تم قبول طلبك ✅', 'يجهزون طلبك هسه.'],
      rejected: ['اعتذروا عن الطلب', ''], done: ['تم التوصيل', 'بالعافية! شكراً لطلبك من دليل المعامل.'] };
    var beep = function () {
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch { /* لا شيء */ }
      try {
        var A = window.AudioContext || window.webkitAudioContext; if (!A) return; var ac = new A(), o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.2, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
        o.start(); o.stop(ac.currentTime + 0.6);
      } catch { /* لا شيء */ }
    };
    var render = function (o) {
      box.textContent = '';
      var st = STEPS[o.status] || [o.status, ''];
      box.appendChild(el('p', 'order-shop', o.title));
      var h = el('h2', 'order-state ost-' + o.status, st[0]); box.appendChild(h);
      if (o.status === 'accepted' && o.eta) box.appendChild(el('p', 'order-eta', 'الوقت المتوقع: حوالي ' + o.eta + ' دقيقة'));
      if (o.status === 'rejected' && o.reason) box.appendChild(el('p', 'note', 'السبب: ' + o.reason));
      if (st[1]) box.appendChild(el('p', 'muted', st[1]));
      if (o.status === 'new') { var sp = el('div', 'order-wait'); sp.setAttribute('aria-hidden', 'true'); box.insertBefore(sp, h); }
      var ul = el('ul', 'order-lines');
      (o.lines || []).forEach(function (l) { ul.appendChild(el('li', '', l.q + ' × ' + l.name + (l.price != null ? '  —  ' + fmt2(l.price * l.q) : ''))); });
      box.appendChild(ul);
      box.appendChild(el('p', 'cart-sum', 'المجموع: ' + fmt2(o.total)));
      var mins = (Date.now() - new Date(o.created_at).getTime()) / 60000;
      var row = el('div', 'btn-row');
      if (o.status === 'new' && mins > 4 && o.business_phone) {
        // صاحب المحل ما رد: نعطي الزبون طريق ثاني
        var txt = 'مرحبا، أرسلت طلب من دليل المعامل رقم ' + o.id + ' وما وصلني رد:\n' + (o.lines || []).map(function (l) { return '• ' + l.q + ' × ' + l.name; }).join('\n');
        var wa = el('a', 'btn btn-wa'); wa.href = 'https://wa.me/964' + o.business_phone.slice(1) + '?text=' + encodeURIComponent(txt); wa.target = '_blank'; wa.rel = 'noopener';
        wa.appendChild(iconEl('whatsapp', 'i')); wa.appendChild(document.createTextNode(' ما ردّوا؟ راسلهم على واتساب'));
        row.appendChild(wa);
      }
      if (o.business_phone) { var call = el('a', 'btn'); call.href = 'tel:' + o.business_phone; call.appendChild(iconEl('phone', 'i')); call.appendChild(document.createTextNode(' اتصل بيهم')); row.appendChild(call); }
      var back = el('a', 'btn'); back.href = BASE + '/businesses/' + o.business_id + '/'; back.textContent = o.status === 'rejected' || o.status === 'done' ? 'طلب جديد' : 'رجوع للصفحة'; row.appendChild(back);
      box.appendChild(row);
      box.appendChild(el('p', 'hint', 'رقم الطلب: ' + o.id + ' · هذه الصفحة تتحدث تلقائياً.'));
      if (lastStatus && lastStatus !== o.status) beep();
      lastStatus = o.status;
      document.title = st[0] + ' — ' + o.title;
    };
    var poll = function () {
      window.fetch(LOG2.content + '/rest/v1/rpc/order_status', { method: 'POST',
        headers: { apikey: key2, Authorization: 'Bearer ' + key2, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: token }) })
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          var o = Array.isArray(rows) ? rows[0] : rows;
          if (!o) { box.textContent = ''; box.appendChild(el('p', 'muted', 'ما لكينا هذا الطلب. ممكن صار له أكثر من يومين.')); window.clearInterval(timer); return; }
          render(o);
          if (o.status === 'rejected' || o.status === 'done') window.clearInterval(timer);
        })
        .catch(function () { /* نحاول بالدورة الجاية */ });
    };
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) { box.textContent = ''; box.appendChild(el('p', 'muted', 'ما عندك طلب حالي.')); }
    else { poll(); timer = window.setInterval(poll, 5000); }
  }

  // ---------- الإعلانات الجديدة مباشرة من قاعدة البيانات ----------
  // نسخة الموقع تتحدث كل فترة؛ الإعلان اللي توافق عليه الإدارة يطلع هنا فوراً لحد ما تتحدث.
  var SB = document.querySelector('meta[name="order-log"]');
  var sbGet = function (q) {
    var k = SB.getAttribute('data-key');
    return window.fetch(SB.content + '/rest/v1/' + q, { headers: { apikey: k, Authorization: 'Bearer ' + k } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  };
  var IMG = /^(u|guest)\/[0-9a-f-]*\/?[0-9a-f]{32}\.webp$/;
  var imgUrl = function (p) { return IMG.test(p || '') ? SB.content + '/storage/v1/object/public/media/' + p : ''; };
  var price = function (n) { return n == null ? '' : Number(n).toLocaleString('en-US') + ' د.ع'; };
  var ago = function (iso) { var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? 'قبل ' + Math.max(1, m) + ' دقيقة' : m < 1440 ? 'قبل ' + Math.round(m / 60) + ' ساعة' : 'قبل ' + Math.round(m / 1440) + ' يوم'; };
  var shownIds = function () { var ids = {}; Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) { var m = a.getAttribute('href').match(/\/(\d{5,})\/?(?:[?#]|$)/); if (m) ids[m[1]] = true; }); return ids; };
  var FIELDS = 'id,type,title,category,area,price,images,logo,published_at,verified';
  var liveRow = function (p, types) {
    var t = types[p.type] || { s: '', i: 'tag' };
    var li = el('li', 'row'), a = el('a', 'row-link'); a.href = BASE + '/p/?id=' + p.id;
    var th = el('span', 'row-thumb'), src = imgUrl(p.logo || (p.images || [])[0]);
    if (src) { var im = el('img'); im.src = src; im.alt = ''; im.width = 96; im.height = 72; im.loading = 'lazy'; th.appendChild(im); } else th.appendChild(iconEl(t.i, 'i i-thumb'));
    var b = el('span', 'row-body'); b.appendChild(el('span', 'row-title', p.title));
    b.appendChild(el('span', 'row-meta', t.s + (p.category ? ' / ' + p.category : '')));
    var meta = el('span', 'row-meta'); meta.appendChild(iconEl('pin', 'i i-xs')); meta.appendChild(document.createTextNode((p.area || '') + ' / ' + ago(p.published_at))); b.appendChild(meta);
    if (p.price != null) b.appendChild(el('span', 'row-price', price(p.price)));
    a.appendChild(th); a.appendChild(b); a.appendChild(el('span', 'ribbon ribbon-new', 'جديد')); li.appendChild(a); return li;
  };
  var since = new Date(Date.now() - 14 * 864e5).toISOString();
  if (SB) {
    // صفحة قسم
    var liveList = document.querySelector('[data-live-list]');
    if (liveList) {
      var types1 = JSON.parse(liveList.getAttribute('data-types'));
      sbGet('public_posts?select=' + FIELDS + '&type=eq.' + liveList.getAttribute('data-live-list') + '&published_at=gte.' + since + '&order=published_at.desc&limit=30').then(function (rows) {
        var have = shownIds(), fresh = rows.filter(function (p) { return !have[p.id]; });
        if (!fresh.length) return;
        var ul = liveList.querySelector('ul'); fresh.forEach(function (p) { ul.appendChild(liveRow(p, types1)); });
        liveList.hidden = false;
        var empty = liveList.parentNode.querySelector(':scope > .empty'); if (empty) empty.hidden = true;
      }).catch(function () { /* تبقى الصفحة كما هي */ });
    }
    // الصفحة الرئيسية: أحدث الإعلانات
    var latest = document.querySelector('[data-live-latest]');
    if (latest) {
      var types2 = JSON.parse(latest.getAttribute('data-types'));
      sbGet('public_posts?select=' + FIELDS + '&type=neq.business&published_at=gte.' + since + '&order=published_at.desc&limit=12').then(function (rows) {
        var have = shownIds(), fresh = rows.filter(function (p) { return !have[p.id]; }).slice(0, 6);
        if (!fresh.length) return;
        var ul = latest.querySelector('ul.rows');
        if (!ul) { ul = el('ul', 'rows'); var emp = latest.querySelector('.empty'); if (emp) emp.replaceWith(ul); else latest.appendChild(ul); }
        fresh.reverse().forEach(function (p) { ul.insertBefore(liveRow(p, types2), ul.firstChild); });
        while (ul.children.length > 8) ul.removeChild(ul.lastElementChild);
      }).catch(function () { /* لا شيء */ });
    }
    // أخبار المعامل: الأخبار الي انتشرت بعد آخر تحديث للموقع تطلع فوك مباشرة
    var nfeed = document.querySelector('[data-news-feed][data-cats]');
    if (nfeed) {
      var ncats = JSON.parse(nfeed.getAttribute('data-cats'));
      sbGet('public_posts?select=id,title,body,category,images,published_at,details,is_official&type=eq.community&published_at=gte.' + since + '&order=published_at.desc&limit=30').then(function (rows) {
        var fresh = rows.filter(function (p) { return ncats.indexOf(p.category) !== -1 && !document.getElementById('n' + p.id); }).reverse();
        fresh.forEach(function (p) {
          var d = p.details || {}, src = p.is_official ? '' : (d.source_name || '');
          var art = el('article', 'feed-card'); art.id = 'n' + p.id;
          var head = el('header', 'fc-head'), av = el('span', 'fc-avatar' + (src ? '' : ' fc-site')); av.setAttribute('aria-hidden', 'true');
          if (src) av.textContent = src.replace(/^ال/, '').charAt(0); else { var lg = el('img'); lg.src = BASE + '/static/img/logo.svg'; lg.alt = ''; av.appendChild(lg); }
          var who = el('div', 'fc-who'); who.appendChild(el('b', '', p.is_official ? 'إدارة دليل المعامل' : src || 'من أهل المنطقة'));
          var meta = el('span'), tm = el('time'); tm.setAttribute('datetime', p.published_at); tm.setAttribute('data-ago', ''); tm.textContent = new Date(p.published_at).toLocaleDateString('ar-IQ');
          meta.appendChild(tm); meta.appendChild(document.createTextNode(' · ' + p.category)); who.appendChild(meta);
          head.appendChild(av); head.appendChild(who); art.appendChild(head);
          art.appendChild(el('h2', 'fc-title', p.title));
          if (p.body) {
            var body = el('div', 'fc-body prose'); body.setAttribute('data-clamp', '');
            String(p.body).split(/\n\s*\n/).forEach(function (para) { body.appendChild(el('p', '', para)); });
            art.appendChild(body); var mr = el('button', 'fc-more', 'عرض المزيد'); mr.type = 'button'; mr.hidden = true; art.appendChild(mr);
          }
          var src1 = imgUrl((p.images || [])[0]); if (src1) { var im = el('img', 'fc-img'); im.src = src1; im.alt = ''; im.loading = 'lazy'; art.appendChild(im); }
          var foot = el('footer', 'fc-actions'), sh = el('button', 'fc-act'); sh.type = 'button'; sh.setAttribute('data-share-news', '/community/' + p.id);
          sh.appendChild(iconEl('share', 'i i-sm')); sh.appendChild(document.createTextNode('مشاركة')); foot.appendChild(sh);
          var go = el('a', 'fc-act'); go.appendChild(iconEl('chevron', 'i i-sm'));
          if (d.source_url && /^https?:\/\//.test(d.source_url)) { go.href = d.source_url; go.target = '_blank'; go.rel = 'noopener nofollow'; go.appendChild(document.createTextNode('الخبر الأصلي')); }
          else { go.href = BASE + '/p/?id=' + p.id; go.appendChild(document.createTextNode('صفحة الخبر')); }
          foot.appendChild(go); art.appendChild(foot);
          nfeed.insertBefore(art, nfeed.firstChild);
        });
        if (fresh.length) { var em = nfeed.querySelector('[data-feed-empty]'); if (em) em.remove(); if (window.almamelFeed) window.almamelFeed.prep(nfeed); }
      }).catch(function () { /* تبقى الصفحة كما هي */ });
    }
    // صفحة إعلان جديد (/p/?id=)
    var lp = document.querySelector('[data-live-post]');
    if (lp) {
      var box2 = lp.querySelector('[data-post-box]'), types3 = JSON.parse(lp.getAttribute('data-types')), fieldLabels = JSON.parse(lp.getAttribute('data-labels'));
      var pid = (new URLSearchParams(location.search).get('id') || '').replace(/\D/g, '');
      var gone = function () { box2.textContent = ''; var e = el('div', 'empty'); e.appendChild(el('p', 'empty-title', 'الإعلان غير موجود')); e.appendChild(el('p', '', 'ممكن انتهت مدته أو انحذف.')); box2.appendChild(e); };
      if (!pid) gone();
      else sbGet('public_posts?select=*&id=eq.' + pid).then(function (rows) {
        var p = rows[0]; if (!p) return gone();
        var t = types3[p.type] || { p: '', l: '', s: '' };
        // إذا صفحته الدائمة صارت جاهزة، نروح لها
        window.fetch(BASE + t.p + '/' + p.id + '/', { method: 'HEAD' }).then(function (r) { if (r.ok) location.replace(BASE + t.p + '/' + p.id + '/'); }).catch(function () {});
        document.title = p.title + ' | ' + document.title.split(' | ').pop();
        var crumb = lp.querySelector('[data-crumb]'); crumb.textContent = p.title;
        var sec = el('a'); sec.href = BASE + t.p + '/'; sec.textContent = t.l; crumb.parentNode.insertBefore(sec, crumb); crumb.parentNode.insertBefore(el('span', '', '/'), crumb);
        box2.textContent = '';
        var art = el('article'), head = el('header', 'detail-head'); head.appendChild(el('h1', '', p.title));
        var badges = el('div', 'badges'); badges.appendChild(el('span', 'badge', t.s)); if (p.verified) badges.appendChild(el('span', 'badge badge-ok', 'موثّق')); head.appendChild(badges); art.appendChild(head);
        var grid = el('div', 'detail-grid'), main2 = el('div', 'detail-main'), side = el('aside', 'detail-side'); side.setAttribute('aria-label', 'معلومات وتواصل');
        var imgs = (p.images || []).map(imgUrl).filter(Boolean);
        if (imgs.length) {
          var g = el('div', 'gallery gallery-n' + Math.min(imgs.length, 3));
          imgs.forEach(function (u, k) { var a = el('a', k ? '' : 'g-main'); a.href = u; var im = el('img'); im.src = u; im.alt = 'صورة ' + (k + 1) + ' لـ ' + p.title; im.loading = k ? 'lazy' : 'eager'; a.appendChild(im); g.appendChild(a); });
          main2.appendChild(g);
        }
        if (p.body) { var sct = el('section'); sct.appendChild(el('h2', '', 'التفاصيل')); var pr = el('div', 'prose'); String(p.body).split(/\n\s*\n/).forEach(function (para) { pr.appendChild(el('p', '', para)); }); sct.appendChild(pr); main2.appendChild(sct); }
        if (p.contact_phone) {
          var cr = el('div', 'contact-row'), call = el('a', 'btn btn-primary btn-lg'); call.href = 'tel:' + p.contact_phone; call.appendChild(iconEl('phone', 'i')); call.appendChild(document.createTextNode(' اتصال ' + p.contact_phone)); cr.appendChild(call);
          if (p.whatsapp) { var wa = el('a', 'btn btn-wa btn-lg'); wa.href = 'https://wa.me/964' + p.contact_phone.replace(/^0/, ''); wa.target = '_blank'; wa.rel = 'noopener'; wa.appendChild(iconEl('whatsapp', 'i')); wa.appendChild(document.createTextNode(' واتساب')); cr.appendChild(wa); }
          side.appendChild(cr);
        }
        var dl = el('dl', 'facts'), fact = function (k, v) { if (v === '' || v == null) return; var d = el('div'); d.appendChild(el('dt', '', k)); d.appendChild(el('dd', '', String(v))); dl.appendChild(d); };
        fact('القسم', t.l); fact('التصنيف', p.category); fact('المنطقة', p.area); if (p.price != null) fact('السعر', price(p.price));
        var lab = fieldLabels[p.type] || {}; Object.keys(p.details || {}).forEach(function (k) { var L = lab[k]; if (!L) return; var v = p.details[k]; if (L.c) v = v ? 'نعم' : ''; else if (L.o && L.o[v]) v = L.o[v]; fact(L.l, v); });
        fact('تاريخ النشر', new Date(p.published_at).toLocaleDateString('ar-IQ'));
        side.appendChild(dl);
        grid.appendChild(main2); grid.appendChild(side); art.appendChild(grid); box2.appendChild(art);
      }).catch(function () { box2.textContent = ''; box2.appendChild(el('p', 'muted', 'تعذّر تحميل الإعلان. حدّث الصفحة.')); });
    }
  }

  // ---------- «مفتوح الآن» حسب ساعات المحل (توقيت بغداد UTC+3) ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-open-hours]'), function (node) {
    var m = node.getAttribute('data-open-hours').match(/^(\d\d):(\d\d)-(\d\d):(\d\d)$/); if (!m) return;
    var from = +m[1] * 60 + +m[2], to = +m[3] * 60 + +m[4];
    var now = new Date(Date.now() + 3 * 3600e3), t = now.getUTCHours() * 60 + now.getUTCMinutes();
    var open = from === to || (from < to ? t >= from && t < to : t >= from || t < to);
    if (node.getAttribute('data-state') === 'closed') open = false; // صاحب المحل سدّه (عطلة مثلاً)
    node.textContent = open ? 'مفتوح الآن' : 'مغلق الآن';
    node.className = open ? 'food-open' : 'food-closed';
  });

  // ---------- الثقة: المشاهدات والتقييم والشكاوى ----------
  // live.js يستخدم نفس الأدوات لبطاقات «دلفري حر» (window.almamelTrust).
  if (SB) {
    var sbRpc = function (fn, body) {
      var k = SB.getAttribute('data-key');
      return window.fetch(SB.content + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.text().then(function (t) { var j; try { j = t ? JSON.parse(t) : null; } catch { j = null; } if (!r.ok) throw new Error((j && j.message) || 'تعذّر الإرسال. تأكد من الاتصال.'); return j; }); });
    };
    var ls = {
      get: function (k) { try { return window.localStorage.getItem(k); } catch { return null; } },
      set: function (k, v) { try { window.localStorage.setItem(k, v); } catch { /* وضع خاص */ } },
    };
    var hex32 = function () { var a = new Uint8Array(16); window.crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };
    var device = function () { var d = ls.get('almamel-device'); if (!/^[0-9a-f]{32}$/.test(d || '')) { d = hex32(); ls.set('almamel-device', d); } return d; };
    var nfa = new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 1 });
    var REASONS = [['scam', 'نصب أو احتيال'], ['bad_service', 'خدمة سيئة أو تأخير'], ['wrong_info', 'معلومات أو رقم غلط'], ['abuse', 'إساءة أو كلام غير لائق'], ['other', 'شي ثاني']];
    var starsText = function (avg) { var n = Math.round(avg); return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); };

    var summaryEl = function (sum) {
      var p = el('p', 'rating-sum');
      if (!sum || !sum.n) { p.textContent = 'ما عنده تقييم بعد. كون أول واحد يقيّم.'; return p; }
      p.appendChild(el('span', 'stars-view', starsText(sum.avg)));
      p.appendChild(el('b', 'num', ' ' + nfa.format(sum.avg) + ' '));
      p.appendChild(el('span', 'muted', '(' + nfa.format(sum.n) + ' تقييم)'));
      return p;
    };
    var ratingWidget = function (type, id, sum) {
      var box = el('div', 'rating-box');
      box.appendChild(summaryEl(sum));
      var key = 'almamel-rated-' + type + '-' + id, mine = Number(ls.get(key) || 0), pick = mine;
      var row = el('div', 'stars-input'); row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', 'قيّم من ١ لـ ٥');
      var btns = [];
      var paint = function () { btns.forEach(function (b, i) { b.textContent = i < pick ? '★' : '☆'; b.setAttribute('aria-checked', String(i + 1 === pick)); }); };
      for (var i = 1; i <= 5; i++) (function (n) {
        var b = el('button', 'star'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', n + ' من ٥');
        b.addEventListener('click', function () { pick = n; paint(); });
        btns.push(b); row.appendChild(b);
      })(i);
      paint();
      var ta = el('textarea', 'rate-comment'); ta.maxLength = 300; ta.rows = 2; ta.placeholder = 'تعليق قصير (اختياري، يظهر بعد المراجعة)'; ta.setAttribute('aria-label', 'تعليق');
      var send = el('button', 'btn btn-sm btn-primary', mine ? 'تعديل تقييمي' : 'إرسال التقييم'); send.type = 'button';
      var msg = el('p', 'muted'); msg.setAttribute('role', 'status');
      send.addEventListener('click', function () {
        if (!pick) { msg.textContent = 'اختار عدد النجوم أول.'; return; }
        send.disabled = true;
        sbRpc('rate', { p_type: type, p_id: id, p_stars: pick, p_comment: ta.value.trim() || null, p_device: device() })
          .then(function () { ls.set(key, String(pick)); msg.textContent = 'شكراً، وصل تقييمك ✅'; send.textContent = 'تعديل تقييمي'; })
          .catch(function (e) { msg.textContent = e.message; })
          .then(function () { send.disabled = false; });
      });
      var head = el('p', 'rate-label', mine ? 'تقييمك:' : 'قيّم:');
      var wrap = el('div', 'rate-form'); wrap.appendChild(head); wrap.appendChild(row); wrap.appendChild(ta); wrap.appendChild(send); wrap.appendChild(msg);
      box.appendChild(wrap);
      return box;
    };
    var complaintForm = function (type, id, label) {
      var d = el('details', 'complain'), sm = el('summary', '', label || 'إبلاغ عن مشكلة'); d.appendChild(sm);
      var f = el('form', 'form complain-form');
      var sel = el('select'); sel.setAttribute('aria-label', 'نوع المشكلة'); sel.required = true;
      var o0 = el('option', '', 'شنو المشكلة؟'); o0.value = ''; sel.appendChild(o0);
      REASONS.forEach(function (r) { var o = el('option', '', r[1]); o.value = r[0]; sel.appendChild(o); });
      var ta = el('textarea'); ta.maxLength = 500; ta.rows = 3; ta.placeholder = 'اشرح شنو صار (اختياري)'; ta.setAttribute('aria-label', 'التفاصيل');
      var ph = el('input'); ph.type = 'tel'; ph.dir = 'ltr'; ph.inputMode = 'tel'; ph.placeholder = 'رقمك حتى نتواصل وياك (اختياري)'; ph.setAttribute('aria-label', 'رقمك');
      var b = el('button', 'btn btn-sm', 'إرسال للإدارة'); b.type = 'submit';
      var msg = el('p', 'muted'); msg.setAttribute('role', 'status');
      f.appendChild(sel); f.appendChild(ta); f.appendChild(ph); f.appendChild(b); f.appendChild(msg);
      f.addEventListener('submit', function (e) {
        e.preventDefault(); delete f.dataset.submitting;
        var phone = (ph.value || '').replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); }).replace(/\D/g, '').replace(/^964/, '0');
        if (!sel.value) { msg.textContent = 'اختار نوع المشكلة.'; return; }
        if (phone && !/^07\d{9}$/.test(phone)) { msg.textContent = 'الرقم لازم يبدي بـ 07 ومن ١١ رقم.'; return; }
        b.disabled = true;
        sbRpc('submit_complaint', { p_type: type, p_id: id, p_reason: sel.value, p_details: ta.value.trim() || null, p_phone: phone || null })
          .then(function () { f.textContent = ''; f.appendChild(el('p', 'flash flash-ok', 'وصلت شكواك للإدارة ✅ نتابعها ونتصرف.')); })
          .catch(function (er) { msg.textContent = er.message; b.disabled = false; });
      });
      d.appendChild(f);
      return d;
    };
    var summaries = function (type, ids) {
      if (!ids.length) return Promise.resolve({});
      return sbGet('rating_summary?select=target_id,avg,n&target_type=eq.' + type + '&target_id=in.(' + ids.join(',') + ')')
        .then(function (rows) { var m = {}; rows.forEach(function (r) { m[r.target_id] = r; }); return m; }).catch(function () { return {}; });
    };
    // ---------- دليل المهندسين: المسجلين بأنفسهم (بعد موافقة الإدارة) ----------
    var engWa = function (e) {
      if (!e.whatsapp || !/^07\d{9}$/.test(e.phone || '')) return '';
      var msg = 'مرحباً ' + e.name + '، شفت صفحتك بدليل المهندسين على دليل المعامل وأريد أستفسر عن خدماتك' + (e.services && e.services[0] ? ' (' + e.services[0] + ')' : '') + '.';
      return 'https://wa.me/964' + e.phone.slice(1) + '?text=' + encodeURIComponent(msg);
    };
    var engInitial = function (n) { return (String(n || '').replace(/^(المهندس|م\.)\s*/, '').trim().charAt(0)) || '؟'; };
    var engContact = function (e, big) {
      var row = el('div', 'btn-row ' + (big ? 'eng-contact' : 'eng-actions')), wa = engWa(e), lg = big ? ' btn-lg' : '';
      if (!big) { var d = el('a', 'btn', 'عرض التفاصيل'); d.href = BASE + '/engineers/e/?id=' + e.id; d.appendChild(iconEl('chevron', 'i i-sm')); row.appendChild(d); }
      if (wa) { var a = el('a', 'btn btn-wa' + lg); a.href = wa; a.target = '_blank'; a.rel = 'noopener'; a.appendChild(iconEl('whatsapp', 'i')); a.appendChild(document.createTextNode('تواصل مع المهندس')); row.appendChild(a); }
      if (big || !wa) { var t = el('a', (wa ? 'btn' : 'btn btn-primary') + lg); t.href = 'tel:' + e.phone; t.appendChild(iconEl('phone', 'i')); t.appendChild(document.createTextNode(wa ? 'اتصال ' : 'تواصل مع المهندس ')); if (wa) { var n = el('span', '', e.phone); n.dir = 'ltr'; t.appendChild(n); } row.appendChild(t); }
      return row;
    };
    var engHead = function (e, big) {
      var h = el(big ? 'header' : 'div', 'eng-head' + (big ? ' eng-head-lg' : ''));
      var av = el('span', 'eng-avatar', engInitial(e.name)); av.setAttribute('aria-hidden', 'true'); h.appendChild(av);
      var box = el('div'), nm = el(big ? 'h1' : 'h2', 'eng-name');
      if (big) nm.textContent = e.name; else { var a = el('a', '', e.name); a.href = BASE + '/engineers/e/?id=' + e.id; nm.appendChild(a); }
      if (e.verified) { var vb = el('span', 'eng-ver', 'موثّق'); vb.title = 'تحققت الإدارة من بياناته'; nm.appendChild(document.createTextNode(' ')); nm.appendChild(vb); }
      box.appendChild(nm); box.appendChild(el('span', 'eng-spec', e.specialty)); h.appendChild(box);
      return h;
    };
    var engList = document.querySelector('[data-live-engineers]');
    if (engList) {
      sbGet('public_engineers?select=*&order=featured.desc,decided_at.desc&limit=500').then(function (rows) {
        rows.forEach(function (e) {
          var li = el('li', 'eng-card' + (e.featured ? ' is-featured' : '')); li.setAttribute('data-specialty', e.specialty);
          if (e.featured) li.appendChild(el('span', 'eng-ribbon', 'مميز'));
          li.appendChild(engHead(e, false));
          if ((e.services || []).length) { var ul = el('ul', 'eng-services'); ul.setAttribute('aria-label', 'الخدمات'); e.services.forEach(function (x) { ul.appendChild(el('li', '', x)); }); li.appendChild(ul); }
          if (e.location) { var loc = el('p', 'eng-loc'); loc.appendChild(iconEl('pin', 'i i-sm')); loc.appendChild(document.createTextNode(e.location)); li.appendChild(loc); }
          li.appendChild(engContact(e, false));
          engList.appendChild(li);
        });
        var cards = engList.querySelectorAll('.eng-card');
        var empty = document.querySelector('[data-eng-empty]'); if (empty) empty.hidden = cards.length > 0;
        var specs = []; Array.prototype.forEach.call(cards, function (c) { var v = c.getAttribute('data-specialty'); if (specs.indexOf(v) === -1) specs.push(v); });
        var bar = document.querySelector('[data-eng-filter-live]');
        if (bar && specs.length > 1) {
          [''].concat(specs).forEach(function (v) { var b = el('button', 'chip', v || 'الكل'); b.type = 'button'; b.setAttribute('data-value', v); b.setAttribute('aria-pressed', String(!v)); bar.appendChild(b); });
          bar.hidden = false;
          bar.addEventListener('click', function (ev) {
            var b = ev.target.closest('button'); if (!b) return; var v = b.getAttribute('data-value');
            Array.prototype.forEach.call(bar.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            Array.prototype.forEach.call(engList.querySelectorAll('.eng-card'), function (c) { c.hidden = !!v && c.getAttribute('data-specialty') !== v; });
          });
        }
      }).catch(function () { var empty = document.querySelector('[data-eng-empty]'); if (empty && !engList.children.length) empty.hidden = false; });
    }
    var engPage = document.querySelector('[data-live-engineer]');
    if (engPage) {
      var ebox = engPage.querySelector('[data-eng-box]'), eid = (new URLSearchParams(location.search).get('id') || '').replace(/\D/g, '');
      var egone = function () { ebox.textContent = ''; var x = el('div', 'empty'); x.appendChild(el('p', 'empty-title', 'المهندس غير موجود')); x.appendChild(el('p', '', 'ممكن انحذف أو بعده بانتظار المراجعة.')); ebox.appendChild(x); };
      if (!eid) egone();
      else sbGet('public_engineers?select=*&id=eq.' + eid).then(function (rows) {
        var e = rows[0]; if (!e) return egone();
        document.title = e.name + ': ' + e.specialty + ' | ' + document.title.split(' | ').pop();
        engPage.querySelector('[data-crumb]').textContent = e.name;
        ebox.textContent = '';
        var art = el('article', 'eng-detail'); art.appendChild(engHead(e, true));
        var dl = el('dl', 'facts'), fact = function (k, v) { if (!v) return; var d = el('div'); d.appendChild(el('dt', '', k)); d.appendChild(el('dd', '', v)); dl.appendChild(d); };
        fact('الاختصاص', e.specialty); fact('الموقع', e.location); art.appendChild(dl);
        if ((e.services || []).length) {
          var sec = el('section'); sec.appendChild(el('h2', '', 'الخدمات'));
          var ul = el('ul', 'eng-services eng-services-lg'); e.services.forEach(function (x) { var li = el('li'); li.appendChild(iconEl('check', 'i i-sm')); li.appendChild(document.createTextNode(x)); ul.appendChild(li); });
          sec.appendChild(ul); art.appendChild(sec);
        }
        if (e.about) { var ab = el('section'); ab.appendChild(el('h2', '', 'نبذة')); var pr = el('div', 'prose'); e.about.split(/\n\s*\n/).forEach(function (para) { pr.appendChild(el('p', '', para)); }); ab.appendChild(pr); art.appendChild(ab); }
        art.appendChild(engContact(e, true));
        art.appendChild(el('p', 'muted eng-note', 'دليل المعامل يعرض معلومات المهندس كما سجّلها وراجعتها الإدارة. اتفق على تفاصيل العمل والسعر مع المهندس مباشرة.'));
        ebox.appendChild(art);
      }).catch(function () { ebox.textContent = ''; ebox.appendChild(el('p', 'muted', 'تعذّر تحميل الصفحة. حدّث الصفحة.')); });
    }

    window.almamelTrust = { ratingWidget: ratingWidget, complaintForm: complaintForm, summaries: summaries, summaryEl: summaryEl };

    // صفحة الإعلان أو المحل: مشاهدة (مرة باليوم لكل جهاز)، تقييم المحل، وزر الإبلاغ
    var trust = document.querySelector('[data-trust]');
    if (trust) {
      var tid = Number(trust.getAttribute('data-id')), biz = trust.getAttribute('data-kind') === 'business';
      var today = new Date().toISOString().slice(0, 10), seenKey = 'almamel-seen-' + tid;
      if (ls.get(seenKey) !== today) { ls.set(seenKey, today); sbRpc('hit', { p_id: tid }).catch(function () {}); }
      var fill = function (sum, reviews) {
        trust.textContent = '';
        if (biz) {
          trust.appendChild(el('h2', '', 'التقييم'));
          trust.appendChild(ratingWidget('post', tid, sum));
          if (reviews.length) {
            var ul = el('ul', 'reviews');
            reviews.forEach(function (r) { var li = el('li'); li.appendChild(el('span', 'stars-view', starsText(r.stars))); li.appendChild(el('p', '', r.comment)); li.appendChild(el('span', 'muted', new Date(r.created_at).toLocaleDateString('ar-IQ'))); ul.appendChild(li); });
            trust.appendChild(ul);
          }
        }
        trust.appendChild(complaintForm('post', tid, biz ? 'عندك مشكلة وية هذا المحل؟ بلّغنا' : 'إبلاغ عن هذا الإعلان'));
        trust.hidden = false;
      };
      if (biz) Promise.all([summaries('post', [tid]), sbGet('public_reviews?select=stars,comment,created_at&target_type=eq.post&target_id=eq.' + tid + '&order=created_at.desc&limit=20').catch(function () { return []; })])
        .then(function (r) { fill(r[0][tid], r[1]); });
      else fill(null, []);
    }
  }
})();
