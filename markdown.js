// Small, safe Markdown renderer for AI answers. Builds DOM nodes only (never innerHTML),
// so model output cannot inject markup. Supports headings, lists, quotes, tables,
// fenced code blocks with a copy button, inline code, bold, italic, links and [n] citations.
import { downloadText, codeFilename, openCodePreview } from './code-artifacts.js';
const make = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function inline(text, sources, parent) {
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|((?<![\w*])\*[^*\s][^*\n]*\*|(?<!\w)_[^_\s][^_\n]*_(?!\w))|(\[[^\]\n]+\]\((https:\/\/[^)\s]+)\))|(\[(\d{1,3})\])/g;
  let offset = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > offset) parent.append(document.createTextNode(text.slice(offset, m.index)));
    const [token] = m;
    if (m[1]) parent.append(make('code', token.slice(1, -1)));
    else if (m[2]) { const b = make('strong'); inline(token.slice(2, -2), sources, b); parent.append(b); }
    else if (m[3]) { const i = make('em'); inline(token.slice(1, -1), sources, i); parent.append(i); }
    else if (m[4]) {
      const href = safeUrl(m[5]);
      if (href) { const a = make('a', token.slice(1, token.indexOf('](')), 'md-link'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a); }
      else parent.append(document.createTextNode(token));
    } else if (m[6]) {
      const source = sources?.[Number(m[7]) - 1];
      const href = source && safeUrl(source.url);
      if (href) {
        const a = make('a', token, 'assistant-citation'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', 'Source ' + m[7] + ': ' + (source.title || new URL(href).hostname)); parent.append(a);
      } else parent.append(document.createTextNode(token));
    }
    offset = m.index + token.length;
  }
  if (offset < text.length) parent.append(document.createTextNode(text.slice(offset)));
  return parent;
}

function codeBlock(code, language) {
  const wrap = make('div', '', 'md-code');
  const bar = make('div', '', 'md-code-bar');
  const copy = make('button', 'Copy code'); copy.type = 'button';
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(code); copy.textContent = 'Copied'; }
    catch { copy.textContent = 'Copy unavailable'; }
    setTimeout(() => { copy.textContent = 'Copy code'; }, 1800);
  };
  bar.append(make('span', language || 'code'), copy);
  const download = make('button', 'Download'); download.type = 'button';
  download.onclick = () => downloadText(code, codeFilename(language)); bar.append(download);
  if (['html', 'svg'].includes(language.toLowerCase())) {
    const preview = make('button', 'Open workspace'); preview.type = 'button';
    preview.onclick = () => openCodePreview(code, language); bar.append(preview);
  }
  const pre = make('pre'); pre.append(make('code', code));
  wrap.append(bar, pre);
  return wrap;
}

const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function renderMarkdown(text, sources = []) {
  const root = make('div', '', 'md');
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0, paragraph = [];
  const flush = () => { if (paragraph.length) { root.append(inline(paragraph.join('\n'), sources, make('p'))); paragraph = []; } };
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; root.append(codeBlock(body.join('\n'), fence[2])); continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flush(); root.append(inline(heading[2].replace(/\s#+$/, ''), sources, make('h' + Math.min(heading[1].length + 2, 6)))); i++; continue; }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { flush(); root.append(make('hr')); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const table = make('table'), head = make('thead'), row = make('tr');
      cells(line).forEach(c => row.append(inline(c, sources, make('th'))));
      head.append(row); table.append(head);
      const tbody = make('tbody'); i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const tr = make('tr'); cells(lines[i++]).forEach(c => tr.append(inline(c, sources, make('td')))); tbody.append(tr);
      }
      table.append(tbody);
      const scroll = make('div', '', 'md-table'); scroll.append(table); root.append(scroll); continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const quote = []; while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      const block = make('blockquote'); block.append(renderMarkdown(quote.join('\n'), sources)); root.append(block); continue;
    }
    const item = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[1]);
      const list = make(ordered ? 'ol' : 'ul');
      if (ordered && parseInt(item[1], 10) !== 1) list.start = parseInt(item[1], 10);
      while (i < lines.length) {
        const current = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(lines[i]);
        if (!current || /\d/.test(current[2]) !== ordered) break;
        const li = make('li');
        const task = /^\[([ xX])\]\s+(.*)$/.exec(current[3]);
        if (task) { li.append(document.createTextNode(task[1] === ' ' ? '☐ ' : '☑ ')); inline(task[2], sources, li); }
        else inline(current[3], sources, li);
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d{1,3}[.)])\s+/.test(lines[i])) inline(' ' + lines[i++].trim(), sources, li);
        list.append(li);
      }
      root.append(list); continue;
    }
    paragraph.push(line.trim()); i++;
  }
  flush();
  return root;
}
