// 以前のアプリ用キャッシュを消し、このサービスワーカー自身を解除する
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (key) {
      return caches.delete(key);
    }));
    await self.registration.unregister();
  })());
});
