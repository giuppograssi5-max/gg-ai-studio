// GG · Minimal text PDF writer (A4, Helvetica, WinAnsi). No dependencies; runs in the browser and in Node.

const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '•': 0x95, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '™': 0x99 };

// Map text to single-byte WinAnsi characters; drop emoji and anything the standard fonts can't draw.
export function toWinAnsi(text) {
  let out = '';
  for (const ch of String(text).normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
    else if (c === 9) out += ' ';
    else if ((c >= 32 && c < 127) || (c >= 160 && c < 256)) out += ch;
    else if (c === 0x2212) out += '-';
  }
  return out.replace(/ {2,}/g, ' ').replace(/^ (?=\S)/gm, '');
}

const charWidth = (code, bold) => (code >= 32 && code < 127 ? W[code - 32] : 556) * (bold ? 1.08 : 1);
export const textWidth = (s, size, bold) => [...s].reduce((w, ch) => w + charWidth(ch.charCodeAt(0), bold), 0) * size / 1000;

export function wrap(s, size, bold, max) {
  const lines = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (!line || textWidth(next, size, bold) <= max) { line = next; continue; }
      lines.push(line); line = word;
    }
    lines.push(line);
  }
  return lines;
}

const esc = s => s.replace(/[\\()]/g, m => '\\' + m);
const num = n => (Math.round(n * 100) / 100).toString();

/**
 * blocks: [{ text, size = 11, bold, indent = 0, gap = 0 (space before), color: [r,g,b], rule: true (horizontal line), pageBreak }]
 * Returns the PDF file as a Uint8Array.
 */
export function makePdf(blocks, { title = 'Document', author = 'GG', footer = '' } = {}) {
  const PW = 595.28, PH = 841.89, M = 56, BOTTOM = 64;
  const pages = []; let ops = [], y = PH - M;
  const newPage = () => { pages.push(ops); ops = []; y = PH - M; };
  for (const b of blocks) {
    if (b.pageBreak) { if (ops.length) newPage(); continue; }
    if (b.rule) {
      y -= b.gap ?? 6; if (y < BOTTOM) newPage();
      ops.push(`0.8 0.8 0.8 RG 0.6 w ${num(M)} ${num(y)} m ${num(PW - M)} ${num(y)} l S`); y -= 6; continue;
    }
    const size = b.size || 11, lead = size * 1.4, indent = b.indent || 0, color = (b.color || [0.1, 0.1, 0.1]).map(num).join(' ');
    const lines = wrap(toWinAnsi(b.text ?? ''), size, b.bold, PW - 2 * M - indent);
    y -= b.gap || 0;
    if (b.keep && y - lead * Math.min(lines.length, 2) < BOTTOM) newPage();
    for (const line of lines) {
      if (y - size < BOTTOM) newPage();
      y -= lead;
      if (line) ops.push(`BT /${b.bold ? 'F2' : 'F1'} ${num(size)} Tf ${color} rg ${num(M + indent)} ${num(y + lead - size)} Td (${esc(line)}) Tj ET`);
    }
  }
  if (ops.length || !pages.length) pages.push(ops);

  const objs = [];
  const add = body => { objs.push(body); return objs.length; };
  const catalog = add(''), pagesId = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = pages.map((p, i) => {
    const foot = toWinAnsi(`${footer}${footer ? '  ·  ' : ''}Page ${i + 1} of ${pages.length}`);
    const stream = [...p, `BT /F1 8.5 Tf 0.45 0.45 0.45 rg ${num(M)} 36 Td (${esc(foot)}) Tj ET`].join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const stamp = `D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
  const info = add(`<< /Title (${esc(toWinAnsi(title))}) /Author (${esc(toWinAnsi(author))}) /Producer (GG) /CreationDate (${stamp}) >>`);

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = objs.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
