import { parseLocalDate } from './dateLogic';

// Provenance metadata only; inspectHistoricalEntry also checks identity and reference integrity.
// Presence of a snapshot alone is not evidence: older builds also inferred it
// from the current (possibly reassigned) schedule during routine edits.
export function getHistoricalReviewState(entry = {}) {
  const snapshot = entry.scheduledItemSnapshot;
  const provenance = entry.scheduledItemSnapshotProvenance;
  const sourceEvidence = entry.historicalReview?.source?.evidence;
  const verifiedSource = snapshot?.id && snapshot.id === entry.scheduledItemId &&
    (provenance === 'captured-at-entry-save' ||
      (provenance === 'user-reconciled' && typeof sourceEvidence === 'string' && sourceEvidence.trim()));
  return {
    amount: Boolean(entry.historicalAmountNeedsReview ||
      (entry.validated && !entry.useActual && !entry.lineItems?.length && entry.plannedAmount == null)),
    source: Boolean(entry.historicalSourceNeedsReview || !verifiedSource),
  };
}

const TYPES = new Set(['income', 'expense', 'debt', 'general', 'transfer', 'savings']);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const absent = (value) => value === null || value === undefined || value === '';
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(parseLocalDate(value).getTime());
const numeric = (value) => (typeof value === 'number' || typeof value === 'string') &&
  String(value).trim() !== '' && Number.isFinite(Number(value));

export function historicalSourceSignature(source) {
  const bucketId = !absent(source?.bucketId) ? source.bucketId : source?.savingsBucketId;
  return JSON.stringify([source?.id, source?.type, source?.accountId, source?.categoryId, bucketId]
    .map((value) => absent(value) ? null : typeof value === 'string' ? value : '(invalid value)'));
}

export function historicalReferenceContext(data = {}) {
  return Object.fromEntries(['scheduledItems', 'accounts', 'categories', 'savingsBuckets'].map((name) =>
    [name, new Map((Array.isArray(data[name]) ? data[name] : []).filter(plain).map((record) => [record.id, record]))]));
}

// Pure inspection: no normalization, inferred IDs, mutations or projection generation.
export function inspectHistoricalEntry(entryKey, raw, data = {}, indexed = historicalReferenceContext(data)) {
  const issues = [];
  const add = (code, message) => issues.push({ code, message });
  const entry = plain(raw) ? raw : {};
  const split = typeof entryKey === 'string' ? entryKey.lastIndexOf('__') : -1;
  const sourceId = split > 0 ? entryKey.slice(0, split) : '';
  const date = split > 0 ? entryKey.slice(split + 2) : '';
  if (!plain(raw)) add('entry_shape', 'Saved entry is not an object.');
  if (!sourceId || !validDate(date)) add('key_invalid', 'Saved key has no consistent source ID and calendar date.');
  if (!absent(entry.entryKey) && entry.entryKey !== entryKey) add('key_conflict', 'Stored entry key differs from its collection key.');
  if (!absent(entry.scheduledItemId) && entry.scheduledItemId !== sourceId) add('source_conflict', 'Saved source ID differs from the key.');
  if (!absent(entry.payPeriodDate) && (!validDate(entry.payPeriodDate) || entry.payPeriodDate !== date)) {
    add('date_conflict', 'Saved pay-period date differs from the key or is invalid.');
  }
  const live = indexed.scheduledItems.get(sourceId);
  const hasSnapshot = entry.scheduledItemSnapshot !== undefined && entry.scheduledItemSnapshot !== null;
  const snapshot = entry.scheduledItemSnapshot;
  const usableSnapshot = plain(snapshot) && snapshot.id === sourceId && TYPES.has(snapshot.type);
  if (hasSnapshot && !usableSnapshot) add('snapshot_invalid', 'Historical snapshot identity or type is invalid.');
  const orphan = !live && !usableSnapshot;
  if (orphan) add('orphan', 'No current schedule or usable historical snapshot; classification or representation is unresolved.');
  const source = hasSnapshot ? (plain(snapshot) ? snapshot : null) : live;
  if (source && !TYPES.has(source.type)) add('type_invalid', 'Historical transaction type is unknown.');
  if (source) {
    const requiredAccount = TYPES.has(source.type) && !['transfer', 'savings'].includes(source.type);
    if (requiredAccount && absent(source.accountId)) add('account_required', 'Historical income or expense has no required account.');
    for (const [field, collection, code, label] of [
      ['accountId', 'accounts', 'account_missing', 'account'],
      ['categoryId', 'categories', 'category_missing', 'category'],
    ]) {
      if (!absent(source[field]) && (typeof source[field] !== 'string' || !indexed[collection].has(source[field]))) {
        add(code, `Historical ${label} reference is missing or invalid (ID: ${typeof source[field] === 'string' ? source[field] : 'invalid value'}).`);
      }
    }
    if (!absent(source.bucketId) && !absent(source.savingsBucketId) && source.bucketId !== source.savingsBucketId) {
      add('bucket_conflict', 'Historical bucket aliases conflict.');
    }
    const bucketId = !absent(source.bucketId) ? source.bucketId : source.savingsBucketId;
    if (!absent(bucketId)) {
      const bucket = indexed.savingsBuckets.get(bucketId);
      if (typeof bucketId !== 'string' || !bucket) add('bucket_missing', `Historical savings bucket reference is missing or invalid (ID: ${typeof bucketId === 'string' ? bucketId : 'invalid value'}).`);
      else if (!absent(bucket.linkedAccountId) && (typeof bucket.linkedAccountId !== 'string' || !indexed.accounts.has(bucket.linkedAccountId))) {
        add('bucket_account_missing', 'Historical bucket links to a missing account.');
      }
    }
  }
  if ((entry.historicalSourceCorrections != null && !Array.isArray(entry.historicalSourceCorrections)) ||
      (entry.historicalReview != null && !plain(entry.historicalReview)) ||
      (entry.historicalReview?.source != null && !plain(entry.historicalReview.source))) {
    add('audit_invalid', 'Historical review or correction audit is malformed; preserve it for review.');
  }
  const amountIssues = [];
  if (getHistoricalReviewState(entry).amount) amountIssues.push('Original confirmed amount needs evidence review.');
  if (entry.lineItems !== undefined && !Array.isArray(entry.lineItems)) amountIssues.push('Saved line items are malformed.');
  else if (entry.lineItems?.length) {
    if (entry.lineItems.some((line) => !plain(line) || !numeric(line.amount)) ||
        !Number.isFinite(entry.lineItems.reduce((total, line) => total + Number(line?.amount), 0))) {
      amountIssues.push('Saved line-item amounts are missing or invalid.');
    }
  } else if (entry.useActual) {
    if (!numeric(entry.actualAmount)) amountIssues.push('Actual mode has no valid saved actual amount.');
  } else if ((entry.validated || !absent(entry.plannedAmount)) && !numeric(entry.plannedAmount)) {
    amountIssues.push('Saved planned amount is missing or invalid; a forecast fallback is not confirmed history.');
  }
  const review = getHistoricalReviewState(entry);
  return { entryKey, sourceId: sourceId || (typeof entry.scheduledItemId === 'string' ? entry.scheduledItemId : '(unknown source)'),
    date: validDate(date) ? date : '', name: typeof source?.name === 'string' ? source.name : typeof live?.name === 'string' ? live.name : 'Historical entry',
    source, sourceOrigin: hasSnapshot ? 'Saved snapshot' : live ? 'Current schedule fallback' : 'Unavailable',
    sourceRemoved: !live && usableSnapshot, orphan, validated: entry.validated === true,
    integrityIssues: issues, amountIssues, sourceNeedsReview: review.source,
    sourceAcknowledged: !review.source, sourceVerified: !review.source && issues.length === 0,
    correctionCount: Array.isArray(entry.historicalSourceCorrections) ? entry.historicalSourceCorrections.length : 0 };
}

export function assertHistoricalIntegrity(entryKey, entry, data) {
  const result = inspectHistoricalEntry(entryKey, entry, data);
  if (result.integrityIssues.length) {
    throw new Error(`Historical source cannot be confirmed: ${result.integrityIssues.map((issue) => issue.message).join(' ')}`);
  }
  return result;
}

export function summarizeHistoricalEntries(data = {}) {
  const indexed = historicalReferenceContext(data);
  const entries = plain(data.plannerEntries) ? data.plannerEntries : plain(data.planner?.entries) ? data.planner.entries : {};
  const rows = Object.entries(entries).map(([key, entry]) => inspectHistoricalEntry(key, entry, data, indexed));
  const groups = new Map();
  rows.forEach((row) => {
    const groupKey = JSON.stringify([row.sourceId, historicalSourceSignature(row.source), row.sourceOrigin]);
    if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, sourceId: row.sourceId, name: row.name,
      source: row.source, sourceOrigin: row.sourceOrigin, count: 0, dates: [], sourcePending: 0, exceptions: 0 });
    const group = groups.get(groupKey);
    group.count += 1;
    if (row.date) group.dates.push(row.date);
    if (row.sourceNeedsReview) group.sourcePending += 1;
    if (row.integrityIssues.length || row.amountIssues.length) group.exceptions += 1;
  });
  return { rows, groups: [...groups.values()].map((group) => ({ ...group,
      fromDate: group.dates.length ? group.dates.reduce((a, b) => a < b ? a : b) : '',
      toDate: group.dates.length ? group.dates.reduce((a, b) => a > b ? a : b) : '' })),
    total: rows.length, validated: rows.filter((row) => row.validated).length,
    integrityCount: rows.filter((row) => row.integrityIssues.length).length,
    integrityFieldCount: rows.reduce((total, row) => total + row.integrityIssues.length, 0),
    amountCount: rows.filter((row) => row.amountIssues.length).length,
    sourcePendingCount: rows.filter((row) => row.sourceNeedsReview).length,
    sourceVerifiedCount: rows.filter((row) => row.sourceVerified).length,
    orphanCount: rows.filter((row) => row.orphan).length };
}
