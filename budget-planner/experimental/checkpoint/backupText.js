// Bounded grammar/token preflight BEFORE whole-document JSON.parse.
import { LIMITS, need, failure, freeze, budget } from './backupFormat.js';

export const MONEY_FIELDS = new Set(['amount', 'plannedAmount', 'actualAmount', 'startingBalance', 'startingAmount',
  'balance', 'targetAmount', 'monthlyBudget', 'monthlyTarget', 'budgetAmount']);
export function legacyMoney(token) {
  need(typeof token === 'string' && token.length <= 128 && /^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(token), 'UNSAFE_NUMBER');
  const negative = token.startsWith('-'), [whole, fraction = ''] = (negative ? token.slice(1) : token).split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  need(minor <= 9007199254740991n, 'UNSAFE_NUMBER');
  // Only after lexical/BigInt checks. String(Number(token)) must retain cents.
  const native = Number(token), round = String(native);
  need(/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(round), 'UNSAFE_NUMBER');
  const [rw, rf = ''] = round.replace(/^-/, '').split('.');
  need(BigInt(rw) * 100n + BigInt(rf.padEnd(2, '0')) === minor &&
    (minor === 0n ? Object.is(native, -0) === negative : native < 0 === negative), 'UNSAFE_NUMBER');
  return `${negative && minor !== 0n ? '-' : ''}${minor}`;
}

export function parseText(bytes, legacy = false) {
  need(bytes instanceof Uint8Array && bytes.byteLength <= LIMITS.bytes, bytes instanceof Uint8Array ? 'RESOURCE_LIMIT' : 'INVALID_INPUT');
  const input = new Uint8Array(bytes); // Caller cannot mutate a pending hash/parse.
  let s;
  try { s = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input); }
  catch { need(false, 'INVALID_UTF8'); }
  need(s[0] !== '\ufeff', 'INVALID_JSON');
  let i = 0, visits = 0; const lexemes = [], memory = budget();
  const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const ws = () => { while (/[ \t\r\n]/.test(s[i] ?? '') && i < s.length) i++; };
  function string() {
    const start = i++; let units = 0;
    while (i < s.length) {
      const c = s.charCodeAt(i++);
      if (c === 34) {
        const value = JSON.parse(s.slice(start, i));
        need(value.length <= LIMITS.string, 'RESOURCE_LIMIT'); memory.charge(16 + value.length * 2); return value;
      }
      need(c >= 32, 'INVALID_JSON');
      if (c === 92) {
        const escape = s[i++]; need('"\\/bfnrtu'.includes(escape ?? '!'), 'INVALID_JSON');
        if (escape === 'u') { need(/^[0-9a-fA-F]{4}$/.test(s.slice(i, i + 4)), 'INVALID_JSON'); i += 4; }
      }
      need(++units <= LIMITS.string, 'RESOURCE_LIMIT');
    }
    need(false, 'INVALID_JSON');
  }
  function value(depth, path) {
    need(depth <= LIMITS.depth && ++visits <= LIMITS.visits, 'RESOURCE_LIMIT'); ws();
    memory.charge(32);
    if (s[i] === '"') { string(); return; }
    if (s[i] === '{' || s[i] === '[') {
      const object = s[i++] === '{', end = object ? '}' : ']', keys = new Set(); let index = 0;
      ws(); if (s[i] === end) { i++; return; }
      while (i < s.length) {
        ws(); let k = index++;
        if (object) {
          need(s[i] === '"', 'INVALID_JSON'); k = string();
          need(!keys.has(k), 'DUPLICATE_JSON_KEY'); keys.add(k);
          ws(); need(s[i++] === ':', 'INVALID_JSON');
        }
        value(depth + 1, [...path, k]); ws();
        if (s[i] === end) { i++; return; }
        need(s[i++] === ',', 'INVALID_JSON');
      }
      need(false, 'INVALID_JSON');
    }
    for (const token of ['true', 'false', 'null']) if (s.startsWith(token, i)) { i += token.length; return; }
    numberPattern.lastIndex = i; const m = numberPattern.exec(s);
    need(m, 'INVALID_JSON'); const token = m[0];
    need(token.length <= 128, 'UNSAFE_NUMBER');
    if (!legacy) need(/^(0|[1-9]\d*)$/.test(token) && Number.isSafeInteger(Number(token)), 'UNSAFE_NUMBER');
    else {
      const key = path.at(-1);
      if (MONEY_FIELDS.has(key)) legacyMoney(token);
      else need(/^(0|[1-9]\d*)$/.test(token) && Number.isSafeInteger(Number(token)), 'UNSAFE_NUMBER');
      memory.charge(path.length * 8 + token.length * 2 + 32); lexemes.push({ path, token });
    }
    i += token.length;
  }
  value(0, []); ws(); need(i === s.length, 'INVALID_JSON');
  // Only after UTF-8, grammar, escape-decoded duplicates, depth and token checks.
  return { value: JSON.parse(s), lexemes, input };
}

export function strictSyntheticText(bytes) {
  try { return freeze({ ok: true, value: parseText(bytes).value }); }
  catch (e) { return failure(e); }
}
