// Responsive navigation: a collapsible desktop sidebar and an accessible mobile drawer.
(() => {
  const toggle = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const mobile = window.matchMedia('(max-width: 760px)');
  if (!toggle || !sidebar) return;
  let desktopOpen = true;
  const setOpen = (open, moveFocus = true) => {
    document.body.classList.toggle('navigation-open', mobile.matches && open);
    document.body.classList.toggle('navigation-collapsed', !mobile.matches && !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    sidebar.inert = !open;
    if (open && moveFocus && mobile.matches) sidebar.querySelector('a, button')?.focus();
  };
  toggle.addEventListener('click', () => {
    if (mobile.matches) setOpen(!document.body.classList.contains('navigation-open'));
    else { desktopOpen = !desktopOpen; setOpen(desktopOpen); }
  });
  sidebar.addEventListener('click', event => {
    if (mobile.matches && event.target.closest('button, a')) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (mobile.matches && document.body.classList.contains('navigation-open') && !sidebar.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && mobile.matches && document.body.classList.contains('navigation-open')) {
      const stops = [...sidebar.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); toggle.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); toggle.focus(); }
      else if (document.activeElement === toggle) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    }
    if (event.key === 'Escape' && document.body.classList.contains('navigation-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  mobile.addEventListener('change', () => {
    const focusedInside = sidebar.contains(document.activeElement);
    setOpen(mobile.matches ? false : desktopOpen, false);
    if (focusedInside && sidebar.inert) toggle.focus();
  });
  setOpen(!mobile.matches, false);
})();
