/* global self */
// عامل خدمة موقع المطعم: يسمح بإشعارات النظام (أندرويد يحتاجه)، ويفتح صفحة الطلبات عند الضغط على الإشعار.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if (/\/kitchen\//.test(list[i].url)) return list[i].focus();
    return self.clients.openWindow(self.registration.scope + 'kitchen/');
  }));
});
