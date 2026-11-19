/* GG native iOS bridge. Runs only inside the GG iOS app (Capacitor), where the
   native bridge exposes window.Capacitor. On the regular website it does nothing. */
(() => {
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
  const P = cap.Plugins || {};
  const has = name => typeof cap.isPluginAvailable === 'function' ? cap.isPluginAvailable(name) : !!P[name];
  const safe = fn => { try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch {} };

  document.documentElement.classList.add('gg-standalone', 'gg-native');

  /* Haptics: light tap when sending a message or pressing primary buttons */
  const tap = (style = 'LIGHT') => has('Haptics') && safe(() => P.Haptics.impact({ style }));
  document.addEventListener('submit', () => tap('MEDIUM'), true);
  document.addEventListener('click', e => {
    if (e.target.closest('button.newchat, .composer-bottom button, .modal-action, .nav')) tap();
  }, true);

  /* External links open in the in-app Safari sheet instead of leaving the app */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || !has('Browser')) return;
    let url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch { return; }
    if (!/^https?:$/.test(url.protocol) || url.host === location.host) return;
    e.preventDefault();
    safe(() => P.Browser.open({ url: url.href, presentationStyle: 'popover' }));
  }, true);

  /* Native share sheet on every GG answer */
  const shareIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg>';
  const addShare = el => {
    if (!has('Share') || el.dataset.ggShare) return;
    el.dataset.ggShare = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gg-native-share';
    btn.innerHTML = shareIcon + '<span>Share</span>';
    btn.onclick = () => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('button, .author').forEach(n => n.remove());
      const text = clone.innerText.trim();
      if (!text) return;
      tap();
      safe(() => P.Share.share({ title: 'From GG', text, dialogTitle: 'Share from GG' }));
    };
    el.append(btn);
  };
  const scan = root => root.querySelectorAll && root.querySelectorAll('.message.assistant').forEach(addShare);
  const watch = () => {
    const box = document.getElementById('messages');
    if (!box) return;
    scan(box);
    // Wait until a streamed answer settles before adding the button
    let timer;
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => scan(box), 700); })
      .observe(box, { childList: true, subtree: true, characterData: true });
  };

  /* Status bar follows light/dark appearance */
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const syncBar = () => has('StatusBar') && safe(() => P.StatusBar.setStyle({ style: dark.matches ? 'DARK' : 'LIGHT' }));
  syncBar();
  dark.addEventListener?.('change', syncBar);

  /* Offline / back-online banner */
  const banner = document.createElement('div');
  banner.id = 'gg-native-offline';
  banner.setAttribute('role', 'status');
  banner.textContent = "You're offline. GG reconnects automatically.";
  const setOnline = online => {
    if (!banner.isConnected) document.body.append(banner);
    banner.classList.toggle('show', !online);
  };
  if (has('Network')) {
    safe(() => P.Network.getStatus().then(s => setOnline(s.connected)));
    safe(() => P.Network.addListener('networkStatusChange', s => setOnline(s.connected)));
  } else {
    addEventListener('offline', () => setOnline(false));
    addEventListener('online', () => setOnline(true));
  }

  /* Deep links: gg://chat?prompt=... or https://gg-ai-studio.netlify.app/... */
  const openLink = raw => {
    let url;
    try { url = new URL(raw); } catch { return; }
    const prompt = url.searchParams.get('prompt');
    if (prompt) {
      const field = document.getElementById('prompt');
      if (field) { field.value = prompt; field.focus(); }
      return;
    }
    if (url.protocol.startsWith('http') && url.host === location.host && url.href !== location.href) location.href = url.href;
  };
  if (has('App')) {
    safe(() => P.App.addListener('appUrlOpen', e => openLink(e.url)));
    safe(() => P.App.getLaunchUrl().then(r => r && r.url && openLink(r.url)));
  }

  if (has('SplashScreen')) safe(() => P.SplashScreen.hide());
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', watch); else watch();
})();
