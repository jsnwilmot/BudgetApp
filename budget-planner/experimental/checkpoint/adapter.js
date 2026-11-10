// Stage 2A only. No application imports or effects; see ADAPTER.md.
import { calculateCheckpoint } from './ledger.js';

const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string' && value.trim().length > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const fail = code => { throw { code }; };
const need = (condition, code) => { if (!condition) fail(code); };
const currencies = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CHF'];
const routeFields = ['fromAccountId', 'toAccountId', 'bucketId', 'toBucketId'];
const routeKeys = {
  income: ['toAccountId'], expense: ['fromAccountId', 'bucketId'],
  account_transfer: ['fromAccountId', 'toAccountId'],
  contribution: ['fromAccountId', 'toAccountId', 'bucketId'],
  withdrawal: ['fromAccountId', 'toAccountId', 'bucketId'],
  allocation: ['bucketId'], release: ['bucketId'], reallocation: ['bucketId', 'toBucketId'],
};

// Reject accessors, exotic objects and cycles without executing their properties.
function copy(value, seen = new Set()) {
  if (value === null || value === undefined || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { need(Number.isFinite(value), 'INVALID_DTO'); return value; }
  need((plain(value) || Array.isArray(value)) && !seen.has(value), 'INVALID_DTO');
  seen.add(value);
  const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
  need(entries.every(([key, d]) => 'value' in d && (d.enumerable || (Array.isArray(value) && key === 'length'))), 'INVALID_DTO');
  need(Object.getOwnPropertySymbols(value).length === 0, 'INVALID_DTO');
  let result;
  if (Array.isArray(value)) {
    need(Object.keys(value).length === value.length, 'INVALID_DTO');
    result = value.map(item => copy(item, seen));
  } else result = Object.fromEntries(entries.map(([key, d]) => [key, copy(d.value, seen)]));
  seen.delete(value);
  return result;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function token(value) {
  if (value === undefined) return 'u';
  if (typeof value === 'number' && Object.is(value, -0)) return 'n:-0';
  if (Array.isArray(value)) return `a:[${value.map(token).join(',')}]`;
  if (plain(value)) return `o:{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${token(value[key])}`).join(',')}}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}
export function sourceRef(collection, key) {
  need(text(collection) && text(key), 'INVALID_REFERENCE');
  return JSON.stringify([collection, key]);
}
export function sourceRevision(record) { return token(copy(record)); }

export function decimalToMinor(value, currency) {
  need(currencies.includes(currency), 'UNSUPPORTED_CURRENCY');
  if (typeof value === 'number') {
    need(Number.isFinite(value) && !Object.is(value, -0) && value >= 0 && value <= 1000000, 'UNSAFE_NUMERIC_AMOUNT');
    value = String(value);
  }
  need(typeof value === 'string' && /^(0|[1-9]\d{0,27})(\.\d{1,2})?$/.test(value), 'INVALID_DECIMAL_AMOUNT');
  const [whole, fraction = ''] = value.split('.');
  return String(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
}
function effective(record, currency, scheduled) {
  if (!scheduled) return { amountMinor: decimalToMinor(record.amount, currency), basis: 'amount' };
  need(typeof record.useActual === 'boolean' && typeof record.validated === 'boolean', 'INVALID_ENTRY_FLAGS');
  need(record.lineItems === undefined || Array.isArray(record.lineItems), 'INVALID_LINE_ITEMS');
  if (record.lineItems?.length) {
    const ids = new Set();
    let total = 0n;
    for (const line of record.lineItems) {
      need(plain(line) && text(line.id) && !ids.has(line.id), 'INVALID_LINE_ID');
      ids.add(line.id); total += BigInt(decimalToMinor(line.amount, currency));
    }
    need(total < 10n ** 30n, 'MONEY_LIMIT');
    return { amountMinor: String(total), basis: 'lineItems' };
  }
  return { amountMinor: decimalToMinor(record.useActual ? record.actualAmount : record.plannedAmount, currency),
    basis: record.useActual ? 'actualAmount' : 'plannedAmount' };
}

function run(input, out) {
  need(plain(input) && input.synthetic === true, 'SYNTHETIC_INPUT_REQUIRED');
  need(Object.keys(input).every(k => ['synthetic', 'data', 'checkpoint', 'throughDate', 'intents', 'decisions'].includes(k)), 'UNSUPPORTED_INPUT_OPTION');
  const data = input.data, cp = input.checkpoint;
  need(plain(data) && plain(cp) && plain(input.decisions) && Array.isArray(input.intents), 'INVALID_INPUT');
  const manifest = out.manifest = { original: data, checkpoint: cp, throughDate: input.throughDate,
    decisions: input.decisions, records: [], unidentifiedRecords: [], fulfilments: [], coverage: 'synthetic-supplied-members-only' };
  const diagnostics = out.diagnostics, legacyExceptions = out.legacyExceptions;
  const report = (code, ref, severity = 'blocking') => {
    const item = { code, ...(ref ? { ref } : {}), severity };
    (severity === 'legacy' ? legacyExceptions : diagnostics).push(item);
  };
  const attempt = (ref, action) => { try { return action(); } catch (error) { report(error?.code ?? 'INVALID_INPUT', ref); } };
  const records = new Map(), dated = [];
  const add = (collection, key, original) => {
    const ref = sourceRef(collection, key);
    const item = { ref, collection, key, revision: sourceRevision(original), original, disposition: 'unresolved' };
    manifest.records.push(item);
    need(!records.has(ref), 'DUPLICATE_SOURCE_REFERENCE'); records.set(ref, item);
    return item;
  };
  const indexed = {};
  for (const collection of ['accounts', 'savingsBuckets', 'categories', 'scheduledItems', 'transfers', 'manualAdjustments', 'savingsBucketAdjustments']) {
    need(Array.isArray(data[collection]), 'MISSING_COLLECTION');
    indexed[collection] = new Map();
    data[collection].forEach((original, i) => attempt(sourceRef(collection, String(i)), () => {
      if (!plain(original) || !text(original.id)) {
        manifest.unidentifiedRecords.push({ collection, index: i, original, revision: sourceRevision(original), disposition: 'unresolved' });
        fail('INVALID_SOURCE_ID');
      }
      const item = add(collection, original.id, original);
      indexed[collection].set(original.id, item);
      if (['transfers', 'manualAdjustments', 'savingsBucketAdjustments'].includes(collection)) dated.push(item);
      else item.disposition = 'reference';
    }));
  }
  need(plain(data.plannerEntries), 'INVALID_PLANNER_ENTRIES');
  if (data.planner?.entries !== undefined) need(token(data.planner.entries) === token(data.plannerEntries), 'PLANNER_ALIAS_CONFLICT');
  for (const [key, record] of Object.entries(data.plannerEntries)) {
    attempt(sourceRef('plannerEntries', key), () => dated.push(add('plannerEntries', key, record)));
  }
  for (const [index, record] of input.intents.entries()) {
    attempt('intents', () => {
      if (!plain(record) || !text(record.entryKey)) {
        manifest.unidentifiedRecords.push({ collection: 'intents', index,
          original: record, revision: sourceRevision(record), disposition: 'unresolved' });
        fail('INVALID_INTENT');
      }
      dated.push(add('intents', record.entryKey, record));
    });
  }
  need(dated.length <= 10000, 'WORK_LIMIT');
  need(plain(data.settings) && data.settings.payPeriodAnchorDate === cp.originalAnchor &&
    data.settings.payFrequencyDays === cp.frequencyDays && data.settings.currency === cp.currency &&
    (data.settings.timeZone === undefined || data.settings.timeZone === cp.timeZone), 'CHECKPOINT_SETTINGS_CONFLICT');
  const initial = calculateCheckpoint({ checkpoint: cp, events: [], throughDate: input.throughDate });
  if (!initial.ok) { diagnostics.push(...initial.diagnostics.map(d => ({ ...d, severity: 'blocking' }))); return; }

  const allowedDecisions = ['postings', 'routing', 'legacy', 'fulfilments', 'boundaries', 'representations', 'excludedAccounts'];
  need(Object.keys(input.decisions).every(k => allowedDecisions.includes(k)), 'UNSUPPORTED_DECISION_COLLECTION');
  const decisions = Object.fromEntries(allowedDecisions.map(k => {
    const value = input.decisions[k] ?? []; need(Array.isArray(value), 'INVALID_DECISION_COLLECTION'); return [k, value];
  }));
  const decisionFields = {
    postings: ['ref', 'revision', 'evidenceRef', 'status', 'amountMinor', 'accountingDate', 'sequence', 'movementId', 'validationDisposition', 'zeroVerified'],
    routing: ['ref', 'revision', 'evidenceRef', 'kind', 'categoryId', ...routeFields],
    legacy: ['ref', 'revision', 'evidenceRef', 'accountingDate'],
    fulfilments: ['id', 'intent', 'posting', 'settlement', 'amountBasis', 'evidenceRef'],
    boundaries: ['ref', 'revision', 'kind', 'evidenceRef'],
    representations: ['members', 'decision', 'representativeRef', 'evidenceRef'],
    excludedAccounts: ['ref', 'revision', 'evidenceRef'],
  };
  for (const [name, values] of Object.entries(decisions)) for (const d of values) {
    need(plain(d) && Object.keys(d).every(k => decisionFields[name].includes(k)), 'UNSUPPORTED_DECISION_FIELD');
  }
  const used = new Set(), maps = {};
  const member = d => {
    need(plain(d) && text(d.ref) && text(d.revision), 'INVALID_DECISION_REFERENCE');
    const item = records.get(d.ref);
    need(item && item.revision === d.revision, 'STALE_OR_UNKNOWN_REFERENCE'); return item;
  };
  for (const name of ['postings', 'routing', 'legacy', 'excludedAccounts']) {
    maps[name] = new Map();
    for (const d of decisions[name]) attempt(d?.ref, () => {
      member(d); need(text(d.evidenceRef) && !maps[name].has(d.ref), 'DUPLICATE_OR_UNEVIDENCED_DECISION');
      maps[name].set(d.ref, d);
    });
  }
  const cpAccounts = new Map(cp.accounts.map(a => [a.id, a])), cpBuckets = new Map(cp.buckets.map(b => [b.id, b]));
  // An omitted intent list is not evidence that a referenced account is unused.
  // Inspect the supplied source graph only: no recurrence/date/posting inference.
  const prospectiveAccountSources = new Map();
  for (const source of indexed.scheduledItems.values()) {
    if (source.original.active === false) continue;
    const accountIds = new Set(['accountId', 'fromAccountId', 'toAccountId'].map(k => source.original[k]));
    for (const field of ['bucketId', 'savingsBucketId', 'fromBucketId', 'toBucketId']) {
      const bucket = indexed.savingsBuckets.get(source.original[field])?.original;
      if (bucket) { accountIds.add(bucket.linkedAccountId); accountIds.add(bucket.accountId); }
    }
    for (const id of accountIds) if (text(id)) {
      if (!prospectiveAccountSources.has(id)) prospectiveAccountSources.set(id, []);
      prospectiveAccountSources.get(id).push(source);
    }
  }
  for (const item of indexed.accounts.values()) attempt(item.ref, () => {
    const account = item.original, excluded = maps.excludedAccounts.get(item.ref);
    if (!['chequing', 'savings'].includes(account.type)) {
      if (excluded) {
        need(account.active === false && decimalToMinor(account.startingBalance, cp.currency) === '0' && !cpAccounts.has(account.id), 'MATERIAL_UNSUPPORTED_ACCOUNT');
        used.add(excluded);
        const sources = prospectiveAccountSources.get(account.id) ?? [];
        for (const source of sources) {
          source.disposition = 'unresolved'; report('UNRESOLVED_SOURCE_COVERAGE', source.ref);
        }
        need(sources.length === 0, 'UNSUPPORTED_ACCOUNT_REFERENCED');
        item.disposition = 'qualified-unsupported-account';
        report('UNSUPPORTED_ACCOUNT_EXCLUDED', item.ref, 'warning'); return;
      }
      fail('UNSUPPORTED_ACCOUNT_TYPE');
    }
    const opening = cpAccounts.get(account.id);
    need(opening && opening.type === account.type && (account.currency === undefined || account.currency === cp.currency) &&
      (account.active === undefined || account.active === opening.active), 'ACCOUNT_COVERAGE_CONFLICT');
  });
  for (const a of cp.accounts) need(indexed.accounts.has(a.id), 'CHECKPOINT_ACCOUNT_NOT_FOUND');
  for (const item of indexed.savingsBuckets.values()) attempt(item.ref, () => {
    const bucket = item.original, opening = cpBuckets.get(bucket.id);
    const linked = bucket.linkedAccountId ?? bucket.accountId;
    need(opening && text(linked) && opening.accountId === linked &&
      (bucket.accountId === undefined || bucket.linkedAccountId === undefined || bucket.accountId === bucket.linkedAccountId), 'BUCKET_ASSOCIATION_CONFLICT');
  });
  for (const b of cp.buckets) need(indexed.savingsBuckets.has(b.id), 'CHECKPOINT_BUCKET_NOT_FOUND');

  function identity(item) {
    const record = item.original;
    need(plain(record), 'INVALID_RECORD');
    const scheduled = ['plannerEntries', 'intents'].includes(item.collection);
    const assignedDate = scheduled ? item.key.slice(item.key.lastIndexOf('__') + 2) : record.payPeriodDate;
    need(date(assignedDate), 'INVALID_ASSIGNED_DATE');
    if (scheduled) {
      const split = item.key.lastIndexOf('__'), id = item.key.slice(0, split);
      need(split > 0 && text(id) && (record.entryKey === undefined || record.entryKey === item.key) &&
        (record.payPeriodDate === undefined || record.payPeriodDate === assignedDate) &&
        (record.scheduledItemId === undefined || record.scheduledItemId === id) &&
        (record.scheduledItemSnapshot?.id === undefined || record.scheduledItemSnapshot.id === id), 'OCCURRENCE_IDENTITY_CONFLICT');
      item.sourceRef = sourceRef('scheduledItems', id);
      const source = indexed.scheduledItems.get(id);
      if (source) item.sourceRevision = source.revision;
      return { scheduled, assignedDate, origin: { kind: 'scheduled', id, occurrenceId: item.key, revision: item.revision } };
    }
    need(record.id === item.key && date(record.date), 'INVALID_MANUAL_ID_OR_DATE');
    return { scheduled, assignedDate, origin: { kind: item.collection === 'transfers' ? 'manual' : 'adjustment',
      id: record.id, revision: item.revision } };
  }
  function route(item, ident, decision) {
    const r = item.original;
    need(decision && routeKeys[decision.kind], 'ROUTING_DECISION_REQUIRED'); used.add(decision);
    const result = { kind: decision.kind };
    for (const key of routeFields) if (decision[key] !== undefined) {
      need(routeKeys[result.kind].includes(key) && text(decision[key]), 'EXTRANEOUS_OR_INVALID_ROUTING'); result[key] = decision[key];
    }
    const agrees = (raw, expected) => need(raw === undefined || raw === null || raw === '' || raw === expected, 'RAW_ROUTING_CONFLICT');
    let classification = r;
    if (ident.scheduled) {
      classification = r.scheduledItemSnapshot;
      need(plain(classification) && classification.id === ident.origin.id, 'SOURCE_SNAPSHOT_REQUIRED');
      need(classification.currency === undefined || classification.currency === cp.currency, 'MIXED_CURRENCY');
      if (item.collection === 'intents') {
        const live = indexed.scheduledItems.get(ident.origin.id);
        need(live && token(live.original) === token(classification) && r.useActual === false && r.validated === false,
          'INVALID_PROSPECTIVE_INTENT');
      }
      const expected = { income: ['income'], expense: ['expense'], transfer: ['contribution', 'account_transfer', 'withdrawal'], savings: ['contribution'] }[classification.type];
      need(expected?.includes(result.kind), 'UNSUPPORTED_OR_CONFLICTING_CLASSIFICATION');
      if (['income', 'expense'].includes(result.kind)) agrees(classification.accountId, result.kind === 'income' ? result.toAccountId : result.fromAccountId);
      else agrees(classification.accountId, result.fromAccountId);
    } else if (item.collection === 'transfers') {
      need({ account_transfer: 'account_transfer', to_savings_bucket: 'contribution', from_savings_bucket: 'withdrawal' }[r.transferType] === result.kind, 'TRANSFER_CLASSIFICATION_CONFLICT');
    } else if (item.collection === 'manualAdjustments') {
      const expected = ['interest', 'unexpected_deposit'].includes(r.adjustmentType) ? 'income' :
        (['fee', 'unexpected_withdrawal'].includes(r.adjustmentType) || r.type === 'misc-expense' ? 'expense' : undefined);
      need(expected === result.kind, 'UNSUPPORTED_ADJUSTMENT');
      agrees(r.accountId, result.kind === 'income' ? result.toAccountId : result.fromAccountId);
    } else need(['allocation', 'release', 'reallocation'].includes(r.adjustmentType) && r.adjustmentType === result.kind, 'UNSUPPORTED_BUCKET_ADJUSTMENT');
    for (const key of routeFields) agrees(classification[key], result[key]);
    agrees(classification.savingsBucketId, result.bucketId);
    if (classification.categoryId !== undefined && classification.categoryId !== null && classification.categoryId !== '') agrees(classification.categoryId, decision.categoryId);
    if (decision.categoryId !== undefined) {
      need(text(decision.categoryId) && indexed.categories.has(decision.categoryId), 'INVALID_CATEGORY_REFERENCE');
      const type = indexed.categories.get(decision.categoryId).original.type;
      const allowed = result.kind === 'income' ? ['income', 'general'] : result.kind === 'expense' ? ['expense', 'debt', 'general'] : ['savings', 'transfer', 'general'];
      need(allowed.includes(type), 'CATEGORY_CLASSIFICATION_CONFLICT');
    }
    item.categoryId = decision.categoryId ?? null;
    for (const key of ['fromAccountId', 'toAccountId']) if (result[key] !== undefined) need(cpAccounts.has(result[key]), 'INVALID_ACCOUNT_REFERENCE');
    for (const key of ['bucketId', 'toBucketId']) if (result[key] !== undefined) need(cpBuckets.has(result[key]), 'INVALID_BUCKET_REFERENCE');
    // Structural preflight also applies to nonposting zero intents. Never
    // fabricate a positive financial event to validate a zero plan. Stage 1
    // independently rechecks all emitted routes and per-track funding.
    const account = (id, type) => need(cpAccounts.has(id) && (!type || cpAccounts.get(id).type === type), 'INVALID_EVENT_ACCOUNT');
    const bucket = (id, accountId) => need(cpBuckets.has(id) && (!accountId || cpBuckets.get(id).accountId === accountId), 'INVALID_EVENT_BUCKET');
    if (result.kind === 'income') account(result.toAccountId);
    if (result.kind === 'expense') {
      account(result.fromAccountId);
      if (result.bucketId) { account(result.fromAccountId, 'savings'); bucket(result.bucketId, result.fromAccountId); }
    }
    if (result.kind === 'account_transfer') {
      account(result.fromAccountId); account(result.toAccountId);
      need(result.fromAccountId !== result.toAccountId, 'SELF_TRANSFER');
    }
    if (['contribution', 'withdrawal'].includes(result.kind)) {
      account(result.fromAccountId, result.kind === 'contribution' ? 'chequing' : 'savings');
      account(result.toAccountId, result.kind === 'contribution' ? 'savings' : 'chequing');
      bucket(result.bucketId, result.kind === 'contribution' ? result.toAccountId : result.fromAccountId);
    }
    if (['allocation', 'release', 'reallocation'].includes(result.kind)) {
      bucket(result.bucketId);
      if (result.kind === 'reallocation') {
        bucket(result.toBucketId, cpBuckets.get(result.bucketId).accountId);
        need(result.toBucketId !== result.bucketId, 'SAME_BUCKET');
      }
    }
    return result;
  }
  const mapped = new Map(), legacyMovements = new Set();
  for (const item of dated) attempt(item.ref, () => {
    const ident = identity(item), r = item.original;
    item.assignedDate = ident.assignedDate;
    if (plain(r.scheduledItemSnapshot)) item.snapshotRevision = sourceRevision(r.scheduledItemSnapshot);
    if (item.collection === 'intents' && records.has(sourceRef('plannerEntries', item.key))) {
      item.disposition = 'saved-override'; item.overriddenBy = sourceRef('plannerEntries', item.key); return;
    }
    const old = maps.legacy.get(item.ref), posting = maps.postings.get(item.ref);
    if (old) {
      need(!posting && !maps.routing.has(item.ref) && ident.assignedDate < cp.date && date(old.accountingDate) && old.accountingDate < cp.date &&
        (r.date === undefined || r.date === old.accountingDate), 'INVALID_LEGACY_SCOPE');
      need(item.collection !== 'intents', 'INVALID_LEGACY_SCOPE');
      used.add(old); item.disposition = 'legacy-context'; item.accountingDate = old.accountingDate;
      report('UNVERIFIED_LEGACY_CONTEXT', item.ref, 'legacy');
      if (r.historicalSourceNeedsReview || !r.scheduledItemSnapshot || !indexed.scheduledItems.has(ident.origin.id)) report('LEGACY_SOURCE_UNRESOLVED', item.ref, 'legacy');
      if (r.historicalAmountNeedsReview) report('LEGACY_AMOUNT_UNRESOLVED', item.ref, 'legacy');
      const snapshot = r.scheduledItemSnapshot ?? r;
      for (const field of ['accountId', 'fromAccountId', 'toAccountId']) {
        if (text(snapshot[field]) && !indexed.accounts.has(snapshot[field])) report('LEGACY_ACCOUNT_REFERENCE_INVALID', item.ref, 'legacy');
        else if (text(snapshot[field]) && !['chequing', 'savings'].includes(indexed.accounts.get(snapshot[field]).original.type)) report('LEGACY_ACCOUNT_TYPE_UNSUPPORTED', item.ref, 'legacy');
      }
      const bucketId = snapshot.bucketId ?? snapshot.savingsBucketId;
      if (text(bucketId) && !indexed.savingsBuckets.has(bucketId)) report('LEGACY_BUCKET_REFERENCE_INVALID', item.ref, 'legacy');
      if (text(snapshot.categoryId) && !indexed.categories.has(snapshot.categoryId)) report('LEGACY_CATEGORY_REFERENCE_INVALID', item.ref, 'legacy');
      if (r.movementId !== undefined) { need(text(r.movementId), 'INVALID_MOVEMENT_ID'); legacyMovements.add(r.movementId); }
      return;
    }
    need(posting, 'POSTING_DECISION_REQUIRED'); used.add(posting);
    need(['posted', 'forecast', 'zero-intent'].includes(posting.status) && date(posting.accountingDate) &&
      Number.isSafeInteger(posting.sequence) && posting.sequence >= 0, 'INVALID_POSTING_DECISION');
    need(r.currency === undefined || r.currency === cp.currency, 'MIXED_CURRENCY');
    if (r.validated !== undefined) need(typeof r.validated === 'boolean', 'INVALID_ENTRY_FLAGS');
    if (posting.status === 'forecast' && r.validated === true) need(posting.validationDisposition === 'planned-not-posted', 'VALIDATION_POSTING_CONFLICT');
    if (r.date !== undefined) need(r.date === posting.accountingDate, 'POSTING_DATE_CONFLICT');
    const value = effective(r, cp.currency, ident.scheduled);
    need(value.amountMinor === posting.amountMinor, 'POSTING_AMOUNT_CONFLICT');
    item.amountBasis = value.basis; item.effectiveMinor = value.amountMinor;
    item.accountingDate = posting.accountingDate;
    const routing = route(item, ident, maps.routing.get(item.ref));
    if (r.movementId !== undefined) need(text(r.movementId) && (posting.movementId === undefined || r.movementId === posting.movementId), 'MOVEMENT_ID_CONFLICT');
    const movementId = posting.movementId ?? r.movementId;
    need(movementId === undefined || (text(movementId) && posting.status === 'posted'), 'INVALID_MOVEMENT_ID');
    if (value.amountMinor === '0') {
      need(posting.status === 'zero-intent' && posting.zeroVerified === true && ident.scheduled && r.validated === false && r.useActual === false &&
        ident.assignedDate >= cp.date && posting.accountingDate >= cp.date, 'UNSUPPORTED_ZERO_MOVEMENT');
      item.disposition = 'zero-nonposting-intent'; return;
    }
    need(posting.status !== 'zero-intent', 'ZERO_INTENT_AMOUNT_CONFLICT');
    const event = { id: `finpath:${item.ref}`, origin: ident.origin, assignedDate: ident.assignedDate,
      accountingDate: posting.accountingDate, currency: cp.currency, amountMinor: value.amountMinor,
      validated: posting.status === 'posted', settlement: posting.status, sequence: posting.sequence, ...routing,
      ...(movementId === undefined ? {} : { movementId }) };
    mapped.set(item.ref, { item, event }); item.disposition = 'mapped';
  });

  const consumed = new Set(), fulfilmentIds = new Set();
  for (const d of decisions.fulfilments) attempt(d?.intent?.ref, () => {
    need(plain(d) && text(d.id) && !fulfilmentIds.has(d.id) && text(d.evidenceRef) && d.settlement === 'full' && d.amountBasis === 'posting-effective', 'INVALID_FULFILMENT');
    fulfilmentIds.add(d.id); const intent = member(d.intent), posting = member(d.posting);
    need(intent !== posting && !consumed.has(intent.ref) && !consumed.has(posting.ref), 'CONSUMED_MEMBER_CONFLICT');
    const a = mapped.get(intent.ref), b = mapped.get(posting.ref);
    need(a && b && a.event.origin.kind === 'scheduled' && b.event.origin.kind !== 'scheduled' &&
      a.event.settlement === 'forecast' && b.event.settlement === 'posted', 'INVALID_FULFILMENT_MEMBERS');
    need(token([a.event.kind, ...routeFields.map(k => a.event[k]), a.event.currency]) ===
      token([b.event.kind, ...routeFields.map(k => b.event[k]), b.event.currency]) && intent.categoryId === posting.categoryId, 'FULFILMENT_ROUTING_CONFLICT');
    need(!a.event.movementId || !b.event.movementId || a.event.movementId === b.event.movementId, 'MOVEMENT_ID_CONFLICT');
    const event = { ...b.event, id: a.event.id, origin: a.event.origin, assignedDate: a.event.assignedDate };
    mapped.set(intent.ref, { item: intent, event }); mapped.delete(posting.ref);
    consumed.add(intent.ref); consumed.add(posting.ref);
    intent.fulfilmentId = d.id; posting.fulfilmentId = d.id; posting.disposition = 'consumed-by-fulfilment';
    posting.consumedBy = intent.ref;
    manifest.fulfilments.push({ id: d.id, intentRef: intent.ref, postingRef: posting.ref, eventId: event.id,
      plannedMinor: a.event.amountMinor, postedMinor: b.event.amountMinor,
      varianceMinor: String(BigInt(a.event.amountMinor) - BigInt(b.event.amountMinor)), remainder: 'none-full-settlement', evidenceRef: d.evidenceRef });
  });
  const boundaries = decisions.boundaries.map(d => {
    return attempt(d?.ref, () => {
      member(d); const entry = mapped.get(d.ref); need(entry, 'NONPRIMARY_BOUNDARY_MEMBER');
      return { eventId: entry.event.id, revision: entry.event.origin.revision, kind: d.kind, evidenceRef: d.evidenceRef };
    });
  }).filter(Boolean);
  const representations = decisions.representations.map(d => attempt(undefined, () => {
    need(plain(d) && Array.isArray(d.members) && text(d.evidenceRef), 'INVALID_REPRESENTATION_POLICY');
    const eventIds = d.members.map(m => { member(m); need(mapped.has(m.ref), 'NONPRIMARY_REPRESENTATION_MEMBER'); return mapped.get(m.ref).event.id; });
    if (d.representativeRef !== undefined) need(d.members.some(m => m.ref === d.representativeRef), 'INVALID_REPRESENTATIVE');
    return { eventIds, decision: d.decision, evidenceRef: d.evidenceRef,
      ...(d.representativeRef === undefined ? {} : { representativeId: mapped.get(d.representativeRef)?.event.id }) };
  })).filter(Boolean);
  for (const name of ['postings', 'routing', 'legacy', 'excludedAccounts']) for (const d of decisions[name]) {
    if (!used.has(d)) report('UNUSED_DECISION', d?.ref);
  }
  const events = [...mapped.values()].map(value => value.event);
  for (const entry of mapped.values()) if (entry.event.movementId && legacyMovements.has(entry.event.movementId)) report('LEGACY_MOVEMENT_CONFLICT', entry.item.ref);
  // Cross-window shared identity is still a claim of the same movement. Do not
  // hide that conflict merely because one supplied member is outside the view.
  const movementClaims = new Map();
  for (const e of events) if (e.movementId) {
    const previous = movementClaims.get(e.movementId);
    if (previous && !representations.some(p => p.eventIds.includes(previous.id) && p.eventIds.includes(e.id))) report('REPRESENTATION_DECISION_REQUIRED', e.id);
    movementClaims.set(e.movementId, e);
  }
  // Stage 1 already guards transfer coincidences. Also guard identical cash
  // income/expense claims; candidates require evidence, never automatic merging.
  for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
    const a = events[i], b = events[j];
    if (['income', 'expense'].includes(a.kind) && a.accountingDate >= cp.date && a.accountingDate <= input.throughDate &&
      token([a.kind, a.accountingDate, a.amountMinor, ...routeFields.map(k => a[k])]) ===
      token([b.kind, b.accountingDate, b.amountMinor, ...routeFields.map(k => b[k])])) {
      if (!representations.some(p => p.eventIds.includes(a.id) && p.eventIds.includes(b.id))) report('REPRESENTATION_DECISION_REQUIRED', a.id);
    }
  }
  if (diagnostics.some(d => d.severity === 'blocking')) return;
  const calculation = calculateCheckpoint({ checkpoint: cp, events, boundaryDecisions: boundaries,
    representationPolicies: representations, throughDate: input.throughDate, legacyContext: data.meta });
  if (!calculation.ok) { diagnostics.push(...calculation.diagnostics.map(d => ({ ...d, severity: 'blocking' }))); return; }
  for (const { item, event } of mapped.values()) {
    item.eventId = event.id;
    item.disposition = calculation.excluded.find(ex => ex.id === event.id)?.reason ?? 'included';
    item.originalRefs = manifest.fulfilments.find(f => f.intentRef === item.ref) ?
      [item.ref, manifest.fulfilments.find(f => f.intentRef === item.ref).postingRef] : [item.ref];
    const policy = representations.find(p => p.eventIds.includes(event.id));
    if (policy) item.representation = policy;
    if (item.disposition === 'represented-by-policy') item.representedBy = policy.representativeId;
  }
  const byEventId = new Map([...mapped.values()].map(value => [value.event.id, value]));
  const reportMetadata = calculation.ledger.map(row => {
    const entry = byEventId.get(row.eventId);
    const refs = entry.item.originalRefs;
    if (row.kind === 'expense' && !entry.item.categoryId) report('UNCLASSIFIED_EXPENSE', entry.item.ref, 'warning');
    return { eventId: row.eventId, accountingDate: row.accountingDate, assignedDate: row.assignedDate,
      categoryId: entry.item.categoryId, originalRefs: refs, originalDates: refs.map(ref => ({ ref,
        assignedDate: records.get(ref).assignedDate, accountingDate: records.get(ref).accountingDate })) };
  });
  out.ok = true; out.events = events; out.reportMetadata = reportMetadata; out.calculation = calculation;
}

export function buildCheckpointPreview(input) {
  const out = { ok: false, diagnostics: [], legacyExceptions: [] };
  try { run(copy(input), out); }
  catch (error) { out.diagnostics.push({ code: error?.code ?? 'INVALID_INPUT', severity: 'blocking' }); }
  // Mapped does not mean verified when another member/track failed.
  if (!out.ok && out.manifest) for (const item of out.manifest.records) {
    if (item.disposition === 'mapped') item.disposition = 'unresolved';
  }
  return freeze(out);
}
