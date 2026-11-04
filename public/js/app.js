// تحسينات تدريجية فقط: الموقع يعمل كاملاً من دون JavaScript.
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  // قائمة الأقسام على الهاتف
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('site-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  // دليل المهندسين: تصفية البطاقات حسب الاختصاص
  var engFilter = document.querySelector('[data-eng-filter]');
  if (engFilter) {
    engFilter.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-value]'); if (!b) return;
      var v = b.getAttribute('data-value');
      Array.prototype.forEach.call(engFilter.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      Array.prototype.forEach.call(document.querySelectorAll('.eng-card'), function (c) { c.hidden = !!v && c.getAttribute('data-specialty') !== v; });
    });
  }

  // ---------- أخبار المعامل (مثل الفيسبوك) ----------
  var AR = function (n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); };
  function ago(iso) {
    var m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return 'قبل ' + AR(m) + ' دقيقة';
    var h = Math.round(m / 60); if (h < 24) return 'قبل ' + AR(h) + ' ساعة';
    var d = Math.round(h / 24); if (d < 30) return d === 1 ? 'أمس' : 'قبل ' + AR(d) + ' يوم';
    return null;
  }
  function feedPrep(root) {
    Array.prototype.forEach.call(root.querySelectorAll('time[data-ago]'), function (t) { var a = ago(t.getAttribute('datetime')); if (a) t.textContent = a; });
    Array.prototype.forEach.call(root.querySelectorAll('[data-clamp]'), function (b) {
      var more = b.nextElementSibling; if (!more || !more.classList.contains('fc-more')) return;
      var long = b.scrollHeight > b.clientHeight + 4; more.hidden = !long; b.classList.toggle('clamped', long);
    });
  }
  window.almamelFeed = { prep: feedPrep };
  var feed = document.querySelector('[data-news-feed]');
  if (feed) {
    feedPrep(feed);
    feed.addEventListener('click', function (e) {
      var more = e.target.closest('.fc-more');
      if (more) { var b = more.previousElementSibling; var open = b.classList.toggle('open'); more.textContent = open ? 'عرض أقل' : 'عرض المزيد'; return; }
      var sh = e.target.closest('[data-share-news]');
      if (sh) {
        var url = location.origin + (document.documentElement.getAttribute('data-base') || '') + sh.getAttribute('data-share-news') + '/';
        var title = (sh.closest('.feed-card').querySelector('.fc-title') || {}).textContent || document.title;
        if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
        var label = sh.lastChild, old = label.textContent;
        var done = function () { label.textContent = 'تم نسخ الرابط'; setTimeout(function () { label.textContent = old; }, 2000); };
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.open('https://wa.me/?text=' + encodeURIComponent(url), '_blank', 'noopener'); });
        else window.open('https://wa.me/?text=' + encodeURIComponent(url), '_blank', 'noopener');
      }
    });
  }

  // نقل التركيز إلى ملخص الأخطاء حتى يسمعه قارئ الشاشة
  var errors = document.getElementById('form-errors');
  if (errors) errors.focus();

  // منع الإرسال المزدوج من دون تعطيل الزر (حتى تصل قيمة الزر المضغوط)
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.dataset.submitting) { e.preventDefault(); return; }
    form.dataset.submitting = '1';
    form.setAttribute('aria-busy', 'true');
    setTimeout(function () { delete form.dataset.submitting; form.removeAttribute('aria-busy'); }, 8000);
  });

  // معاينة الصور المختارة والتنبيه عند تجاوز العدد أو الحجم
  var input = document.querySelector('input[type=file][name=images]');
  var preview = document.querySelector('[data-preview]');
  if (input && preview) {
    input.addEventListener('change', function () {
      preview.textContent = '';
      var max = Number(input.dataset.max || 6);
      var files = Array.prototype.slice.call(input.files || []);
      var msg = '';
      if (files.length > max) msg = 'تقدر تضيف ' + max + ' صور كحد أقصى.';
      files.forEach(function (f) { if (f.size > 5 * 1024 * 1024) msg = 'الصورة «' + f.name + '» أكبر من ٥ ميغابايت.'; });
      input.setCustomValidity(msg);
      if (msg) { input.reportValidity(); return; }
      files.forEach(function (f) {
        var li = document.createElement('li');
        var img = document.createElement('img');
        img.alt = '';
        img.width = 120; img.height = 90;
        img.src = URL.createObjectURL(f);
        img.onload = function () { URL.revokeObjectURL(img.src); };
        li.appendChild(img);
        preview.appendChild(li);
      });
    });
  }

  // زر «موقعي الحالي» في نموذج النشاط التجاري
  var geo = document.querySelector('[data-geo]');
  if (geo && 'geolocation' in navigator) {
    geo.hidden = false;
    geo.addEventListener('click', function () {
      geo.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        document.getElementById('f-d_lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('f-d_lng').value = pos.coords.longitude.toFixed(6);
        geo.disabled = false;
      }, function () { geo.disabled = false; alert('تعذّر تحديد الموقع. اسمح للموقع باستخدام الموقع الجغرافي أو اكتب الإحداثيات يدوياً.'); }, { enableHighAccuracy: true, timeout: 15000 });
    });
  }
})();
