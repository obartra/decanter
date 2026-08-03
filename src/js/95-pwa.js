/* Install prompt and service worker registration. */
import { App } from './90-app.js';

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
  /* Picking up a new build.

     Revalidating the page only helps someone who navigates. A tab that is
     already open never navigates again, so without this it runs whatever build
     it started with for as long as it stays open, which is how a fix can be
     live and invisible at the same time.

     So the worker is asked for a new build periodically and whenever the tab
     comes back to the front, and when one takes over, the page reloads itself.
     Not mid-pour though: App decides when that is polite. */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
    addEventListener('load', async () => {
      let reg = null;
      try { reg = await navigator.serviceWorker.register('./sw.js'); } catch (e) { return; }

      const check = () => { try { reg.update(); } catch (e) {} };
      setInterval(check, 5 * 60 * 1000);
      addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      addEventListener('focus', check);
      addEventListener('online', check);

      /* A page that starts uncontrolled gets claimed once as its worker installs.
         That first claim is an install, not an update, and must not reload. What
         it must not do either is disqualify the tab forever: tracking the
         controller rather than remembering a flag from load time means the
         second change is still recognized as the update it is. */
      let controller = navigator.serviceWorker.controller;
      let taken = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const had = controller;
        controller = navigator.serviceWorker.controller;
        if (!had || taken) return;
        taken = true;
        App.updateReady();
      });
    });
  }
})();
