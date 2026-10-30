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
  var wa = document.querySelector('[data-wa-form]');
  if (wa) {
    wa.addEventListener('submit', function (e) {
      e.preventDefault();
      delete wa.dataset.submitting;
      if (!wa.reportValidity()) return;
      var f = new FormData(wa);
      var lines = ['إعلان جديد لدليل المعامل', 'النوع: ' + f.get('type'), 'العنوان: ' + f.get('title'), 'المنطقة: ' + f.get('area')];
      if (f.get('price')) lines.push('السعر: ' + f.get('price') + ' د.ع');
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
      ['employment', 'offer', 'condition'].forEach(function (k) { if (f.get(k)) out.push(k + ': ' + f.get(k)); });
      f.forEach(function (v, k) { if (k.indexOf(t + '_') === 0 && v) out.push(k.slice(t.length + 1) + ': ' + q(v)); });
      if (f.get('menu')) { out.push('menu:'); String(f.get('menu')).split('\n').filter(Boolean).forEach(function (l) { out.push('  - ' + q(l.trim())); }); }
      if (f.get('images')) { out.push('images:'); String(f.get('images')).split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (n) { out.push('  - ' + q(n)); }); }
      ['featured', 'verified', 'official', 'consent', 'phone_consent'].forEach(function (k) { if (f.get(k)) out.push(k + ': true'); });
      out.push('---', '', String(f.get('body') || '').trim(), '');
      var text = out.join('\n');
      var file = 'content/listings/' + t + '-' + id + '.md';
      var box = document.querySelector('[data-publish-out]');
      box.hidden = false;
      document.querySelector('[data-publish-text]').value = text;
      document.querySelector('[data-publish-link]').href = 'https://github.com/' + pub.getAttribute('data-repo') + '/new/main?filename=' + encodeURIComponent(file) + '&value=' + encodeURIComponent(text);
      box.scrollIntoView();
    });
    var copy = document.querySelector('[data-copy]');
    if (copy) copy.addEventListener('click', function () {
      var ta = document.querySelector('[data-publish-text]');
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value); else { ta.select(); document.execCommand('copy'); }
      copy.textContent = 'تم النسخ';
    });
  }
})();
