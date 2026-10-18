// 廃止済みサイトの後始末。アプリは二度と登録しない。
(function () {
  'use strict';

  var knownKeys = [
    'holodori_owned_v2',
    'holodori_team_v2',
    'holodori_board_v2',
    'holodori_settings_v2',
    'holodori_compare_v2',
    'holodori_owned_v3',
    'holodori_team_v3',
    'holodori_board_v3',
    'holodori_settings_v3',
    'holodori_compare_v3'
  ];

  function removeStoredKeys() {
    try {
      knownKeys.forEach(function (key) {
        localStorage.removeItem(key);
      });
      var extra = [];
      var i;
      for (i = 0; i < localStorage.length; i += 1) {
        var name = localStorage.key(i);
        if (name && name.indexOf('holodori_') === 0) extra.push(name);
      }
      extra.forEach(function (key) {
        localStorage.removeItem(key);
      });
    } catch (error) {
      // 保存領域が使えないブラウザでも、終了画面はそのまま出す
    }
  }

  function clearCaches() {
    if (!('caches' in window)) return Promise.resolve();
    return caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return caches.delete(key);
      }));
    });
  }

  function unregisterWorkers() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (reg) {
        return reg.unregister();
      }));
    });
  }

  removeStoredKeys();
  unregisterWorkers().then(clearCaches).catch(function () {
    // 解除に失敗しても、終了の表示は残す
  });
})();
