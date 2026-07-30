/* Install prompt and service worker registration. */
(() => {
  let deferred = null;
  const btn = document.getElementById('install');
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    if (btn) btn.hidden = false;
  });
  if (btn){
    btn.onclick = async () => {
      if (!deferred) return;
      btn.hidden = true;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
    };
  }
  addEventListener('appinstalled', () => { if (btn) btn.hidden = true; deferred = null; });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
    addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
