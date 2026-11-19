// Builds real Office files (Word .docx, Excel .xlsx, PowerPoint .pptx) in the browser from the
// JSON outline the chat AI returns. Uses the bundled PptxGenJS, which also provides JSZip.
let library;
function loadLibrary() {
  return library ||= new Promise((resolve, reject) => {
    if (window.PptxGenJS && window.JSZip) { resolve(); return; }
    const script = document.createElement('script'); script.src = 'vendor/pptxgen.bundle.js';
    script.onload = () => resolve();
    script.onerror = () => { library = null; script.remove(); reject(Error('The file builder could not load. Check your connection and retry.')); };
    document.head.append(script);
  });
}
const esc = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const FILE_TYPES = {
  docx: { label: 'Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { label: 'Excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { label: 'PowerPoint', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
};
function coreProps(title) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>GG</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}
const rootRels = main => XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

// ---------- Word ----------
// Text runs with **bold** segments.
function runs(text, bold = false) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => {
    const strong = bold || /^\*\*[^*]+\*\*$/.test(part);
    const value = strong && !bold ? part.slice(2, -2) : part;
    return value.split('\n').map((line, i) => (i ? '<w:br/>' : '') + `<w:r>${strong ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join('');
  }).join('');
}
const para = (text, style, extra = '') => `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>` : ''}${runs(text)}</w:p>`;
function docxBody(spec) {
  let numbered = 0; const parts = [];
  parts.push(para(spec.title, 'Title'));
  for (const [index, block] of spec.blocks.entries()) {
    if (index === 0 && block.type === 'heading' && block.text.trim().toLowerCase() === String(spec.title).trim().toLowerCase()) continue;
    if (block.type === 'heading') parts.push(para(block.text, 'Heading' + block.level));
    else if (block.type === 'paragraph') parts.push(para(block.text));
    else if (block.type === 'bullets' || block.type === 'numbered') {
      const id = block.type === 'bullets' ? 1 : 2 + numbered++;
      for (const item of block.items) parts.push(para(item, 'ListParagraph', `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr>`));
    } else if (block.type === 'table') {
      const cols = Math.max(...block.rows.map(r => r.length)), width = Math.floor(9360 / cols);
      const rows = block.rows.map((row, r) => `<w:tr>${r === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from({ length: cols }, (_, c) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${r === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="EDEDED"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${runs(row[c] ?? '', r === 0)}</w:p></w:tc>`).join('')}</w:tr>`).join('');
      const border = side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
      parts.push(`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`, '<w:p/>');
    }
  }
  return { body: parts.join(''), numbered };
}
function docxNumbering(numbered) {
  const level = (fmt, text) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>${fmt === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>' : ''}</w:lvl>`;
  let nums = '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
  for (let i = 0; i < numbered; i++) nums += `<w:num w:numId="${2 + i}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;
  return XML + `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>${level('bullet', '')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>${level('decimal', '%1.')}</w:abstractNum>${nums}</w:numbering>`;
}
const DOCX_STYLES = XML + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="300"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="111111"/><w:sz w:val="52"/></w:rPr></w:style>${[1, 2, 3].map(l => `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${[360, 240, 200][l - 1]}" w:after="120"/><w:outlineLvl w:val="${l - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="${['1F1F1F', '333333', '444444'][l - 1]}"/><w:sz w:val="${[32, 28, 24][l - 1]}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/><w:ind w:left="720"/></w:pPr></w:style></w:styles>`;
async function buildDocx(spec) {
  const zip = new window.JSZip(), { body, numbered } = docxBody(spec);
  zip.file('[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.file('_rels/.rels', rootRels('word/document.xml'));
  zip.file('docProps/core.xml', coreProps(spec.title));
  zip.file('word/_rels/document.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>');
  zip.file('word/styles.xml', DOCX_STYLES);
  zip.file('word/numbering.xml', docxNumbering(numbered));
  zip.file('word/document.xml', XML + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1274" w:bottom="1440" w:left="1274" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', mimeType: FILE_TYPES.docx.mime, compression: 'DEFLATE' });
}

// ---------- Excel ----------
const column = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
function cellXml(value, ref, header) {
  const style = header ? ' s="1"' : '';
  if (value === null || value === undefined || value === '') return header ? `<c r="${ref}"${style}/>` : '';
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"${style}><v>${value ? 1 : 0}</v></c>`;
  if (typeof value === 'number') return `<c r="${ref}"${style}><v>${value}</v></c>`;
  if (!header && /^=[^=]/.test(value)) return `<c r="${ref}"><f>${esc(value.slice(1))}</f></c>`;
  // Numbers the model sent as text, without leading zeros that matter (codes, phone numbers).
  if (!header && /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(value)) return `<c r="${ref}"><v>${Number(value)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}
function sheetXml(sheet) {
  const cols = Math.max(1, ...sheet.rows.map(r => r.length));
  const widths = Array.from({ length: cols }, (_, c) => Math.min(60, Math.max(9, ...sheet.rows.map(r => String(r[c] ?? '').length + 2))));
  const rows = sheet.rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cellXml(v, column(c) + (r + 1), r === 0)).join('')}</row>`).join('');
  const frozen = sheet.rows.length > 1 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  return XML + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${frozen}<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData></worksheet>`;
}
function sheetNames(sheets) {
  const used = new Set();
  return sheets.map((s, i) => {
    let base = String(s.name || 'Sheet').replace(/[\[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet ' + (i + 1), name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = base.slice(0, 28) + ' ' + n;
    used.add(name.toLowerCase()); return name;
  });
}
async function buildXlsx(spec) {
  const zip = new window.JSZip(), names = sheetNames(spec.sheets);
  zip.file('[Content_Types].xml', XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${spec.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', rootRels('xl/workbook.xml'));
  zip.file('docProps/core.xml', coreProps(spec.title));
  zip.file('xl/workbook.xml', XML + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${spec.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${spec.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', XML + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  spec.sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)));
  return zip.generateAsync({ type: 'blob', mimeType: FILE_TYPES.xlsx.mime, compression: 'DEFLATE' });
}

// ---------- PowerPoint ----------
async function buildPptx(spec) {
  const Ppt = window.PptxGenJS || window.pptxgen; const ppt = new Ppt();
  ppt.layout = 'LAYOUT_WIDE'; ppt.author = 'GG'; ppt.title = spec.title; ppt.subject = spec.title; ppt.lang = document.documentElement.lang || 'en-US';
  const total = spec.slides.length;
  spec.slides.forEach((s, i) => {
    const slide = ppt.addSlide();
    if (i === 0) {
      slide.background = { color: '111111' };
      slide.addText(s.title || spec.title, { x: 0.8, y: 2.3, w: 11.7, h: 1.6, fontFace: 'Arial', fontSize: 40, bold: true, color: 'FFFFFF', fit: 'shrink' });
      const sub = s.subtitle || s.bullets.join(' · ');
      if (sub) slide.addText(sub, { x: 0.8, y: 4.0, w: 11.7, h: 1.0, fontFace: 'Arial', fontSize: 20, color: 'BBBBBB', fit: 'shrink' });
    } else {
      slide.background = { color: 'FFFFFF' };
      slide.addShape(ppt.ShapeType ? ppt.ShapeType.rect : 'rect', { x: 0.7, y: 0.55, w: 0.6, h: 0.08, fill: { color: '111111' }, line: { color: '111111' } });
      slide.addText(s.title, { x: 0.7, y: 0.8, w: 11.9, h: 1.1, fontFace: 'Arial', fontSize: 30, bold: true, color: '111111', fit: 'shrink' });
      if (s.bullets.length) slide.addText(s.bullets.map(b => ({ text: b, options: { bullet: true, breakLine: true } })), { x: 0.8, y: 2.1, w: 11.7, h: 4.6, fontFace: 'Arial', fontSize: 20, color: '333333', valign: 'top', paraSpaceAfter: 10, fit: 'shrink' });
      else if (s.subtitle) slide.addText(s.subtitle, { x: 0.8, y: 2.1, w: 11.7, h: 4.6, fontFace: 'Arial', fontSize: 22, color: '333333', valign: 'top', fit: 'shrink' });
      slide.addText(`${i + 1} / ${total}`, { x: 11.6, y: 7.0, w: 1.2, h: 0.3, fontSize: 10, color: '888888', align: 'right' });
    }
    if (s.notes) slide.addNotes(s.notes);
  });
  return ppt.write({ outputType: 'blob', compression: true });
}

export async function buildOfficeFile(spec) {
  if (!FILE_TYPES[spec?.format]) throw Error('Unsupported file type.');
  await loadLibrary();
  const blob = await (spec.format === 'docx' ? buildDocx(spec) : spec.format === 'xlsx' ? buildXlsx(spec) : buildPptx(spec));
  return new Blob([blob], { type: FILE_TYPES[spec.format].mime });
}
export const fileName = spec => (spec.filename || 'GG-file') + '.' + spec.format;
export function describeFile(spec) {
  if (spec.format === 'docx') { const h = spec.blocks.filter(b => b.type === 'heading').length; return `Word document · ${h ? h + ' sections' : spec.blocks.length + ' blocks'}`; }
  if (spec.format === 'xlsx') return `Excel workbook · ${spec.sheets.length} ${spec.sheets.length === 1 ? 'sheet' : 'sheets'} · ${spec.sheets.reduce((n, s) => n + Math.max(0, s.rows.length - 1), 0)} rows`;
  return `PowerPoint presentation · ${spec.slides.length} slides`;
}
// Detects a request to create a Word, Excel or PowerPoint file. When several formats are named
// ("turn this Word document into a PowerPoint"), the last one mentioned is the target.
export function detectFileFormat(prompt) {
  const text = String(prompt || '');
  const intent = /\b(crea|creare|creami|creiamo|fammi|fai|fare|genera|generare|generami|prepara|preparami|preparare|scrivi|scrivimi|realizza|realizzami|costruisci|produci|esporta|converti|trasforma|metti|dammi|voglio|vorrei|serve|mi serve|build|create|make|generate|prepare|write|draft|produce|export|convert|turn|put|give me|need|want|design|erstelle|erstellen|mach|crée|créer|fais|genere|haz|hazme|prepárame|crie|faça)\b/i;
  const patterns = {
    pptx: /\b(power\s?points?|pptx?|slides?|slideshow|diapositiv\w*|presentazion\w*|presentations?|präsentation\w*|présentation\w*|presentaci[oó]n\w*|apresenta[cç][aã]o)\b|\.pptx\b/gi,
    xlsx: /\b(excel|xlsx|xls|spreadsheets?|fogli[oe]? (di calcolo|excel)|cartella di lavoro|workbook|hoja de c[aá]lculo|tableur|tabellenkalkulation|planilha)\b|\.xlsx\b/gi,
    docx: /\b(docx|ms word|microsoft word|word (file|document|doc)\w*|(file|documento|document|doc|formato|format|in|su|en|as|als|come) word|dokument)\b|\.docx\b/gi,
  };
  let best = null, at = -1;
  for (const [format, re] of Object.entries(patterns)) for (const m of text.matchAll(re)) if (m.index > at) { at = m.index; best = format; }
  if (!best) return null;
  // "dokument" alone is too generic; require an explicit Word mention for Word files.
  if (best === 'docx' && !/\b(docx|word)\b|\.docx\b/i.test(text)) return null;
  return intent.test(text) ? best : null;
}
