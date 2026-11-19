/* GG for iOS: registers the service worker and shows a one-time
   "Add to Home Screen" guide for iPhone/iPad Safari visitors. */
(() => {
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (standalone) { document.documentElement.classList.add('gg-standalone'); return; }

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  const KEY = 'gg-ios-install-dismissed';
  let dismissed = false;
  try { dismissed = localStorage.getItem(KEY) === '1'; } catch {}
  if (!isIOS || dismissed) return;

  const show = () => {
    const box = document.createElement('aside');
    box.id = 'gg-ios-install';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Install GG on your iPhone');
    const icon = document.createElement('img');
    icon.src = '/apple-touch-icon.png'; icon.alt = ''; icon.width = 48; icon.height = 48;
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'Get the GG app';
    const steps = document.createElement('p');
    if (isSafari) {
      steps.append('Tap ');
      const share = document.createElement('span');
      share.className = 'gg-share-glyph'; share.setAttribute('aria-label', 'Share');
      share.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg>';
      steps.append(share, ' then “Add to Home Screen”.');
    } else {
      steps.textContent = 'Open this page in Safari, tap Share, then “Add to Home Screen”.';
    }
    const more = document.createElement('a');
    more.href = '/app'; more.textContent = 'More about the app';
    more.className = 'gg-ios-more';
    text.append(title, steps, more);
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss');
    close.onclick = () => { box.remove(); try { localStorage.setItem(KEY, '1'); } catch {} };
    box.append(icon, text, close);
    document.body.append(box);
  };
  if (document.readyState === 'complete') setTimeout(show, 1500);
  else addEventListener('load', () => setTimeout(show, 1500));
})();
