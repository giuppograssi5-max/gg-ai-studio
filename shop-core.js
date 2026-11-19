// GG · Fammi la spesa: shared helpers (browser + server) for shopping lists handed off to Amazon.
// Purchases always happen on Amazon itself through its official "add to cart" page:
// GG never sees Amazon credentials or payment data.

export const MARKETPLACES = {
  it: { label: 'Amazon.it', domain: 'www.amazon.it', host: 'webservices.amazon.it', region: 'eu-west-1' },
  de: { label: 'Amazon.de', domain: 'www.amazon.de', host: 'webservices.amazon.de', region: 'eu-west-1' },
  fr: { label: 'Amazon.fr', domain: 'www.amazon.fr', host: 'webservices.amazon.fr', region: 'eu-west-1' },
  es: { label: 'Amazon.es', domain: 'www.amazon.es', host: 'webservices.amazon.es', region: 'eu-west-1' },
  uk: { label: 'Amazon.co.uk', domain: 'www.amazon.co.uk', host: 'webservices.amazon.co.uk', region: 'eu-west-1' },
  us: { label: 'Amazon.com', domain: 'www.amazon.com', host: 'webservices.amazon.com', region: 'us-east-1' },
};
export const market = code => MARKETPLACES[code] || MARKETPLACES.it;
export const MAX_ITEMS = 30;
export const MAX_QTY = 20;

// Strip the spoken invocation before parsing, including in the offline fallback.
export function shoppingRequest(input) {
  return String(input || '').trim().replace(/^(?:hey\s+|ehi\s+)?(?:g\s*g|gi\s*gi)[\s,.:!–-]+/i, '').replace(/^(?:ordinami|ordina(?:\s+per\s+me)?|comprami|compra|order(?:\s+me)?|buy(?:\s+me)?|commande(?:-moi)?|achète(?:-moi)?|bestelle(?:\s+mir)?|cómprame|pídeme)\s+/i, '').trim();
}

const ASIN = /^[A-Z0-9]{10}$/;
// Accepts a bare ASIN or an Amazon product link (/dp/ASIN, /gp/product/ASIN, /gp/aw/d/ASIN).
export function parseAsin(input) {
  const v = String(input || '').trim();
  if (ASIN.test(v.toUpperCase()) && /\d/.test(v)) return v.toUpperCase();
  let url;
  try { url = new URL(v); } catch { return null; }
  if (!/(^|\.)amazon\.(it|de|fr|es|co\.uk|com)$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|o\/ASIN)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

export const clampQty = q => Math.min(MAX_QTY, Math.max(1, Math.round(Number(q)) || 1));
const text = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

// Normalizes items from the AI or the browser.
export function cleanItems(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_ITEMS).map(i => {
    const name = text(i?.name, 80);
    return name ? { name, query: text(i.query, 120) || name, quantity: clampQty(i.quantity), note: text(i.note, 140) } : null;
  }).filter(Boolean);
}

// Simple offline parser used when the AI is unavailable: "2 latte, pasta x3, mele".
export function splitList(input) {
  return cleanItems(shoppingRequest(input).split(/[\n,;]+|\s+e\s+(?=\d)/).map(s => s.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).map(s => {
    let quantity = 1, name = s;
    const lead = s.match(/^(\d{1,2})\s*(?:x\s+)?(.+)$/i);
    const tail = s.match(/^(.+?)\s*x\s*(\d{1,2})$/i);
    if (lead && !/^\d+\s*(kg|g|gr|l|ml|cl|lt)\b/i.test(s)) { quantity = +lead[1]; name = lead[2]; }
    else if (tail) { name = tail[1]; quantity = +tail[2]; }
    return { name, quantity };
  }));
}

export const searchUrl = (code, query, tag) => {
  const u = new URL(`https://${market(code).domain}/s`);
  u.searchParams.set('k', query);
  if (tag) u.searchParams.set('tag', tag);
  return u.toString();
};

// Amazon's official add-to-cart form: the user reviews the cart and checks out on Amazon.
export function cartUrl(code, items, tag) {
  const u = new URL(`https://${market(code).domain}/gp/aws/cart/add.html`);
  items.filter(i => i.asin && ASIN.test(i.asin)).slice(0, MAX_ITEMS).forEach((i, n) => {
    u.searchParams.set(`ASIN.${n + 1}`, i.asin);
    u.searchParams.set(`Quantity.${n + 1}`, String(clampQty(i.quantity)));
  });
  if (tag) u.searchParams.set('AssociateTag', tag);
  return u.toString();
}

// Fresh handoff is deliberately separate from the standard Amazon ASIN cart.
export function freshUrl(query = '') {
  const u = new URL('https://www.amazon.it/alm/storefront');
  u.searchParams.set('almBrandId', 'QW1hem9uIEZyZXNo');
  if (query) {
    u.pathname = '/s';
    u.searchParams.set('i', 'amazonfresh');
    u.searchParams.set('k', query);
  }
  return u.toString();
}

export function shoppingListText(items) {
  return items.filter(i => !i.skip).map(i => `${clampQty(i.quantity)} × ${i.name}${i.note ? ' — ' + i.note : ''}`).join('\n');
}
