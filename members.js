(() => {
  const counter = document.querySelector('#official-members-count');
  if (!counter) return;
  async function refresh() {
    try {
      const response = await fetch('/gg-members', { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Unavailable');
      const { count } = await response.json();
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid count');
      counter.textContent = new Intl.NumberFormat(document.documentElement.lang).format(count);
      counter.parentElement.removeAttribute('title');
    } catch {
      counter.parentElement.title = 'Member count temporarily unavailable';
    } finally {
      counter.parentElement.setAttribute('aria-busy', 'false');
    }
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
})();
