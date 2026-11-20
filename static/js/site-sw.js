/* global self */
// عامل خدمة دليل المعامل: يستلم الإشعارات ويعرضها حتى لو الموقع مسدود، ويفتح الصفحة عند الضغط.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var d;
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  var base = self.registration.scope;
  e.waitUntil(self.registration.showNotification(d.title || 'دليل المعامل', {
    body: d.body || '', icon: base + 'static/img/icon-192.png', badge: base + 'static/img/icon-192.png',
    dir: 'rtl', lang: 'ar', tag: d.tag || 'almamel', renotify: true,
    data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var path = (e.notification.data && e.notification.data.url) || '/';
  var url = /^https:\/\//.test(path) ? path : self.registration.scope + path.replace(/^\//, '');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if (list[i].url === url && 'focus' in list[i]) return list[i].focus();
    return self.clients.openWindow(url);
  }));
});
