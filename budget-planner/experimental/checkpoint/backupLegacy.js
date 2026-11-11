// Inspection ONLY. Never normalizes/promotes legacy exports to full B1 snapshots.
import { parseText, MONEY_FIELDS, legacyMoney } from './backupText.js';
import { copy, need, plain, fields, text, own, freeze, failure, sha, RAW } from './backupFormat.js';
import { nativeEqual, nativeToken, noActiveCheckpoint } from './backupInventory.js';

const dataKeys = ['appVersion', 'appDataVersion', 'appMetadata', 'settings', 'accounts', 'categories', 'transactions',
  'scheduledItems', 'plannerEntries', 'manualAdjustments', 'savingsBuckets', 'savingsBucketAdjustments', 'transfers',
  'budgets', 'budgetTargets', 'planner', 'savings'];
const rootKeys = ['appName', 'appVersion', 'exportVersion', 'schemaVersion', 'exportedAt', 'source', 'basePath', 'metadata', 'data'];
const metadataKeys = ['appName', 'legacyAppName', 'appVersion', 'backupVersion', 'exportVersion', 'appDataVersion',
  'schemaVersion', 'createdAt', 'exportedAt', 'source', 'basePath'];
function allowed(o, keys) { need(plain(o) && Object.keys(o).every(k => keys.includes(k)), 'UNSUPPORTED_LEGACY'); }
function keyed(a) {
  need(Array.isArray(a), 'INVALID_ALIAS'); const map = new Map();
  for (const r of a) { need(plain(r) && text(r.id) && !map.has(r.id), 'INVALID_IDENTITY'); map.set(r.id, r); }
  return map;
}
function sameCollection(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const am = keyed(a), bm = keyed(b);
    return am.size === bm.size && [...am].every(([k, v]) => bm.has(k) && nativeEqual(v, bm.get(k)));
  }
  return plain(a) && plain(b) && nativeEqual(a, b);
}
export async function inspectSyntheticLegacy(bytes, options) {
  try {
    const opts = copy(options); fields(opts, ['synthetic']); need(opts.synthetic === true, 'SYNTHETIC_INPUT_REQUIRED');
    const parsed = parseText(bytes, true), root = parsed.value;
    need(plain(root), 'UNSUPPORTED_LEGACY');
    const wrapped = own(root, 'data'), data = wrapped ? root.data : root;
    if (wrapped) {
      allowed(root, rootKeys); need(plain(root.metadata) && ['FinPath', 'BudgetApp'].includes(root.appName ?? root.metadata.appName), 'UNSUPPORTED_LEGACY');
      allowed(root.metadata, metadataKeys);
      const versions = [root.exportVersion, root.metadata.exportVersion, root.metadata.backupVersion].filter(v => v !== undefined);
      need(versions.length > 0 && versions.every(v => v === 1), 'UNSUPPORTED_VERSION');
      for (const k of ['appName', 'appVersion', 'schemaVersion', 'exportedAt', 'source', 'basePath']) {
        if (own(root, k) && own(root.metadata, k)) need(root[k] === root.metadata[k], 'UNSUPPORTED_VERSION');
      }
      const schemas = [root.schemaVersion, root.metadata.schemaVersion, root.metadata.appDataVersion, data?.appDataVersion].filter(v => v !== undefined);
      need(schemas.length > 0 && schemas.every(v => v === 2), 'UNSUPPORTED_VERSION');
    } else need(data.appDataVersion === undefined || [0, 1].includes(data.appDataVersion), 'UNSUPPORTED_VERSION');
    allowed(data, dataKeys);
    if (data.appMetadata !== undefined) { need(plain(data.appMetadata), 'UNSUPPORTED_LEGACY'); noActiveCheckpoint(data.appMetadata); }
    need(plain(data.settings) && Array.isArray(data.accounts) && Array.isArray(data.scheduledItems), 'UNSUPPORTED_LEGACY');
    const qualifications = ['INSPECTION_ONLY', 'FINANCIAL_READINESS_NOT_ESTABLISHED', 'NO_FULL_17_STORE_HISTORY'];
    if (data.planner !== undefined) allowed(data.planner, ['entries', 'payPeriods', 'rows']);
    if (data.savings !== undefined) allowed(data.savings, ['buckets', 'transfers']);
    for (const [a, b] of [[data.plannerEntries, data.planner?.entries], [data.budgetTargets, data.budgets], [data.savingsBuckets, data.savings?.buckets]]) {
      if (a !== undefined && b !== undefined) need(sameCollection(a, b), 'INVALID_ALIAS');
    }
    for (const s of ['accounts', 'categories', 'scheduledItems', 'manualAdjustments', 'savingsBuckets', 'savingsBucketAdjustments', 'transfers', 'budgetTargets', 'budgets']) {
      if (data[s] !== undefined) keyed(data[s]);
    }
    const entries = data.plannerEntries ?? data.planner?.entries;
    if (entries !== undefined) {
      need(plain(entries), 'INVALID_IDENTITY'); const occurrences = new Set();
      for (const [key, entry] of Object.entries(entries)) {
        need(plain(entry) && (!own(entry, 'entryKey') || entry.entryKey === key), 'INVALID_IDENTITY');
        if (text(entry.scheduledItemId) && text(entry.payPeriodDate)) {
          const occurrence = JSON.stringify([entry.scheduledItemId, entry.payPeriodDate]);
          need(!occurrences.has(occurrence), 'INVALID_IDENTITY'); occurrences.add(occurrence);
        }
        if (entry.lineItems !== undefined) {
          need(Array.isArray(entry.lineItems), 'INVALID_IDENTITY'); const ids = new Set();
          for (const line of entry.lineItems) {
            need(plain(line), 'INVALID_IDENTITY');
            if (!text(line.id)) { qualifications.push('MISSING_HISTORICAL_LINE_ID'); continue; }
            need(!ids.has(line.id), 'INVALID_IDENTITY'); ids.add(line.id);
          }
        }
      }
    }
    if (data.savings?.transfers !== undefined) {
      need(Array.isArray(data.savings.transfers), 'INVALID_ALIAS');
      if (data.savingsBucketAdjustments !== undefined && data.transfers !== undefined) {
        const canonical = [...data.savingsBucketAdjustments, ...data.transfers], counts = new Map();
        need(canonical.length === data.savings.transfers.length, 'INVALID_ALIAS');
        for (const r of canonical) { const key = nativeToken(r); counts.set(key, (counts.get(key) ?? 0) + 1); }
        for (const r of data.savings.transfers) {
          const key = nativeToken(r), count = counts.get(key) ?? 0;
          need(count > 0, 'INVALID_ALIAS'); counts.set(key, count - 1);
        }
      } else qualifications.push('AMBIGUOUS_COMBINED_SAVINGS_ALIAS');
    }
    function check(v) {
      if (!v || typeof v !== 'object') return;
      for (const [k, x] of Object.entries(v)) {
        if (MONEY_FIELDS.has(k)) { need(typeof x === 'number' || typeof x === 'string', 'UNSAFE_NUMBER'); legacyMoney(typeof x === 'string' ? x : Object.is(x, -0) ? '-0' : String(x)); }
        if (k.endsWith('Minor')) need(typeof x === 'string' && /^(0|-?[1-9]\d*)$/.test(x), 'UNSAFE_NUMBER');
        check(x);
      }
    }
    check(data);
    const absent = RAW.filter(s => !own(data, s) && !(s === 'appSettings' && own(data, 'settings')));
    for (const s of absent) qualifications.push(`ABSENT_${s}`);
    return freeze({ ok: true, kind: 'legacy-inspection-only', synthetic: true, original: root,
      originalBytes: [...parsed.input], transportDigest: await sha(parsed.input), lexemes: parsed.lexemes,
      qualifications: [...new Set(qualifications)], absent, fullSnapshot: false, restoreImplemented: false });
  } catch (e) { return failure(e); }
}
