// Issue #34 only: strict canonical transport parse, not a backup/import API.
// The source constructor supplies current-format ASCII; native financial values
// remain represented by FP-TV nodes, not untyped JSON numbers/object ordering.
import { need, fields } from './writerFormat.js';
import { CAPABILITIES } from './backupFormat.js';

export function parseSourceTransport(text, m) {
  need(typeof text === 'string' && text.length <= 33554432, 'RESOURCE_LIMIT');
  m.tick(text.length); let at = 0;
  for (let i = 0; i < text.length; i++) {
    if (i % 1024 === 0) m.tick();
    need(text.charCodeAt(i) >= 32 && text.charCodeAt(i) <= 126, 'INVALID_FORMAT');
  }
  function string() {
    need(text[at++] === '"', 'INVALID_FORMAT'); const start = at - 1; let units = 0;
    while (at < text.length) {
      if (units % 1024 === 0) m.tick(); const c = text.charCodeAt(at++);
      if (c === 34) {
        // All escapes, lengths and input bounds were checked before this parse.
        m.reserve(16 + units * 2); return JSON.parse(text.slice(start, at));
      }
      need(c >= 32, 'INVALID_FORMAT');
      if (c === 92) {
        const escaped = text[at++]; need('"\\/bfnrtu'.includes(escaped ?? '!'), 'INVALID_FORMAT');
        if (escaped === 'u') { need(/^[0-9a-fA-F]{4}$/.test(text.slice(at, at + 4)), 'INVALID_FORMAT'); at += 4; }
      }
      need(++units <= 1048576, 'RESOURCE_LIMIT');
    }
    need(false, 'INVALID_FORMAT');
  }
  function value(depth = 0) {
    m.tick(); need(depth <= m.bound.depth, 'RESOURCE_LIMIT'); m.reserve(32);
    if (text[at] === '"') { string(); return; }
    if (text[at] === '{' || text[at] === '[') {
      const object = text[at++] === '{', end = object ? '}' : ']', keys = new Set();
      if (text[at] === end) { at++; return; }
      while (at < text.length) {
        m.tick(); if (object) { const k = string(); need(!keys.has(k), 'INVALID_FORMAT'); keys.add(k); need(text[at++] === ':', 'INVALID_FORMAT'); }
        value(depth + 1); if (text[at] === end) { at++; return; } need(text[at++] === ',', 'INVALID_FORMAT');
      }
      need(false, 'INVALID_FORMAT');
    }
    for (const token of ['true', 'false', 'null']) if (text.startsWith(token, at)) { at += token.length; return; }
    const start = at; while (at < text.length && text[at] >= '0' && text[at] <= '9') { need(at - start < 128, 'UNSAFE_NUMBER'); at++; }
    const token = text.slice(start, at); need(/^(0|[1-9]\d*)$/.test(token) && Number.isSafeInteger(Number(token)), 'UNSAFE_NUMBER');
  }
  value(); need(at === text.length, 'INVALID_FORMAT');
  const parsed = JSON.parse(text);
  need(m.canonical(parsed) === text, 'INVALID_FORMAT');
  fields(parsed, ['appName', 'exportVersion', 'schemaVersion', 'appVersion', 'exportedAt', 'metadata', 'data', 'integrity']);
  need(parsed.appName === 'FinPath' && parsed.exportVersion === 2 && parsed.schemaVersion === 3, 'UNSUPPORTED_VERSION');
  fields(parsed.metadata, ['appName', 'appVersion', 'exportVersion', 'schemaVersion', 'appDataVersion', 'exportedAt', 'source', 'synthetic', 'requiredCapabilities']);
  for (const k of ['appName', 'appVersion', 'exportVersion', 'schemaVersion', 'exportedAt']) need(parsed[k] === parsed.metadata[k], 'UNSUPPORTED_VERSION');
  need(parsed.metadata.synthetic === true && parsed.metadata.source === 'synthetic-harness', 'SYNTHETIC_INPUT_REQUIRED');
  fields(parsed.data, ['appDataVersion', 'format', 'sourceProfile', 'requiredCapabilities', 'source', 'manifest', 'nodes', 'provenance', 'derived']);
  need(parsed.metadata.appDataVersion === 3 && parsed.data.appDataVersion === 3 && parsed.data.format === 'FP-FULL-1' &&
    parsed.data.sourceProfile === 'finpath-b1-raw17-v1', 'UNSUPPORTED_VERSION');
  need(m.canonical(parsed.metadata.requiredCapabilities) === m.canonical(CAPABILITIES) &&
    m.canonical(parsed.data.requiredCapabilities) === m.canonical(CAPABILITIES), 'UNSUPPORTED_CAPABILITY');
  fields(parsed.data.source, ['storageSchema', 'protocolVersion', 'databaseName', 'snapshotDigest', 'controlRef']);
  need(parsed.data.source.storageSchema === 1 && parsed.data.source.protocolVersion === 1, 'UNSUPPORTED_VERSION');
  fields(parsed.data.provenance, ['sourceEnvelopes', 'qualifications']);
  need(m.canonical(parsed.data.provenance.sourceEnvelopes) === '[]' && m.canonical(parsed.data.provenance.qualifications) === '[]' &&
    m.canonical(parsed.data.derived) === '{}', 'INVALID_FIELDS');
  fields(parsed.integrity, ['algorithm', 'canonicalization', 'valueCodec', 'graph', 'contentDigest']);
  need(parsed.integrity.algorithm === 'SHA-256' && parsed.integrity.canonicalization === 'FP-CJ-1' &&
    parsed.integrity.valueCodec === 'FP-TV-1' && parsed.integrity.graph === 'FP-GRAPH-1', 'UNSUPPORTED_VERSION');
  return parsed;
}
