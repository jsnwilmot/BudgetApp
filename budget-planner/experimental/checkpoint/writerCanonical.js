// Stateless FP-CJ-1 checking for bounded physical records. No financial packing.
// Character work is metered; semantic visits count records/refs separately.
import { need, plain } from './writerFormat.js';

export function parseCanonical(text, m) {
  need(typeof text === 'string' && text.length <= m.bound.workBytes - m.stats.workBytes, 'RESOURCE_LIMIT');
  m.tick(text.length, 0); let at = 0;
  function string() {
    need(text[at++] === '"', 'INVALID_PAGE'); const start = at - 1; let count = 0;
    while (at < text.length) {
      if (count % 1024 === 0) m.tick(0, 0); const c = text.charCodeAt(at++);
      if (c === 34) return JSON.parse(text.slice(start, at));
      need(c >= 32 && c <= 126, 'INVALID_PAGE');
      if (c === 92) {
        const e = text[at++];
        if (e === 'u') {
          const h = text.slice(at, at + 4); need(/^[0-9a-f]{4}$/.test(h), 'INVALID_PAGE');
          const n = parseInt(h, 16); need(n < 32 || n > 126, 'INVALID_PAGE'); at += 4;
        } else need(e === '"' || e === '\\', 'INVALID_PAGE');
      }
      need(++count <= 1048576, 'RESOURCE_LIMIT');
    }
    need(false, 'INVALID_PAGE');
  }
  function value(depth = 0) {
    m.tick(0, 0); need(depth <= m.bound.depth + 8, 'RESOURCE_LIMIT');
    if (text[at] === '"') { string(); return; }
    if (text[at] === '{' || text[at] === '[') {
      const object = text[at++] === '{', end = object ? '}' : ']'; let previous = null;
      if (text[at] === end) { at++; return; }
      while (at < text.length) {
        if (object) { const key = string(); need(previous === null || previous < key, 'INVALID_PAGE'); previous = key; need(text[at++] === ':', 'INVALID_PAGE'); }
        value(depth + 1); if (text[at] === end) { at++; return; } need(text[at++] === ',', 'INVALID_PAGE');
      }
      need(false, 'INVALID_PAGE');
    }
    for (const word of ['true', 'false', 'null']) if (text.startsWith(word, at)) { at += word.length; return; }
    const start = at; while (text[at] >= '0' && text[at] <= '9') { need(at - start < 128, 'UNSAFE_NUMBER'); at++; }
    const token = text.slice(start, at); need(/^(0|[1-9]\d*)$/.test(token) && Number.isSafeInteger(Number(token)), 'UNSAFE_NUMBER');
  }
  value(); need(at === text.length, 'INVALID_PAGE'); return JSON.parse(text);
}

export function encodeCanonical(value, m) {
  function quote(s) {
    m.tick(s.length, 0); let out = '"';
    for (let i = 0; i < s.length; i++) {
      if (i % 1024 === 0) m.tick(0, 0); const c = s.charCodeAt(i);
      out += c === 34 ? '\\"' : c === 92 ? '\\\\' : c < 32 || c > 126 ? `\\u${c.toString(16).padStart(4, '0')}` : s[i];
      need(out.length <= m.bound.workBytes - m.stats.workBytes, 'RESOURCE_LIMIT');
    }
    return out + '"';
  }
  function visit(v, depth = 0) {
    m.tick(0, 0); need(depth <= m.bound.depth + 8, 'RESOURCE_LIMIT'); let out;
    if (v === null) out = 'null';
    else if (typeof v === 'string') out = quote(v);
    else if (typeof v === 'boolean') out = String(v);
    else if (typeof v === 'number') { need(Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0), 'UNSAFE_NUMBER'); out = String(v); }
    else if (Array.isArray(v)) out = '[' + v.map(x => visit(x, depth + 1)).join(',') + ']';
    else { need(plain(v), 'INVALID_GRAPH'); out = '{' + Object.keys(v).sort().map(k => quote(k) + ':' + visit(v[k], depth + 1)).join(',') + '}'; }
    m.tick(out.length, 0); m.stats.encodedBytes += out.length; return out;
  }
  return visit(value);
}
