const node = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };

export function downloadText(text, filename, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = node('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function codeFilename(language) {
  const extensions = { javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh', shell: 'sh', html: 'html', svg: 'svg', css: 'css', json: 'json', markdown: 'md', jsx: 'jsx', tsx: 'tsx', sql: 'sql' };
  return 'gg-code.' + (extensions[language.toLowerCase()] || (/^[a-z0-9]{1,10}$/i.test(language) ? language.toLowerCase() : 'txt'));
}

export function previewDocument(code) {
  // Put the restrictive policy first so model-generated markup cannot relax it.
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; base-uri \'none\'; form-action \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1">' + code;
}

export function openCodePreview(code, language) {
  const dialog = node('dialog'); dialog.className = 'code-preview-dialog';
  const title = node('h2', 'Code workspace'); title.id = 'code-workspace-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const close = node('button', 'Close'); close.type = 'button'; close.onclick = () => dialog.close();
  const heading = node('div'); heading.className = 'code-preview-heading'; heading.append(title, close);
  const note = node('p', 'Edit the source, update the preview, or download your changes. Edits stay in this window. Scripts and external resources are disabled.');
  const editor = node('textarea'); editor.value = code; editor.spellcheck = false; editor.setAttribute('aria-label', 'Edit generated code');
  const frame = node('iframe'); frame.title = 'Generated code preview'; frame.setAttribute('sandbox', ''); frame.referrerPolicy = 'no-referrer';
  const update = node('button', 'Update preview'); update.type = 'button';
  const feedback = node('span', ''); feedback.setAttribute('role', 'status');
  update.onclick = () => { frame.srcdoc = previewDocument(editor.value); feedback.textContent = 'Preview updated.'; };
  editor.oninput = () => { feedback.textContent = 'Changes ready to preview.'; };
  const download = node('button', 'Download'); download.type = 'button'; download.onclick = () => downloadText(editor.value, codeFilename(language));
  const actions = node('div'); actions.className = 'code-preview-actions'; actions.append(update, download, feedback);
  const panes = node('div'); panes.className = 'code-preview-panes'; panes.append(editor, frame);
  dialog.append(heading, note, actions, panes); document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  frame.srcdoc = previewDocument(code); dialog.showModal();
}
