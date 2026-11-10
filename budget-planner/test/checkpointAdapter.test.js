import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckpointPreview, decimalToMinor, sourceRevision, sourceRef } from '../experimental/checkpoint/adapter.js';
import { fixture, scheduled, manual, bind, refresh, ref, independentLedger, deepFreeze } from './fixtures/checkpointAdapter.js';

const saveRoute = { kind: 'contribution', fromAccountId: 'C', toAccountId: 'S', bucketId: 'tax' };
const bankRoute = { kind: 'account_transfer', fromAccountId: 'C', toAccountId: 'S' };
const incomeRoute = { kind: 'income', toAccountId: 'C', categoryId: 'salary' };
const good = f => { const r = buildCheckpointPreview(f); assert.equal(r.ok, true, JSON.stringify(r.diagnostics)); return r; };
const bad = (f, code) => {
  const r = buildCheckpointPreview(f); assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some(d => d.code === code && d.severity === 'blocking'), JSON.stringify(r.diagnostics));
  for (const key of ['calculation', 'events', 'reportMetadata', 'validated', 'projected']) assert.equal(r[key], undefined);
  assert.ok(r.manifest?.records.every(i => i.disposition !== 'included') ?? true);
  return r;
};
const sole = (route = saveRoute, options = {}) => { const f = fixture(); scheduled(f, 'tax__stable', '100.00', route, options); return f; };
const pointer = (f, i = 0) => ({ ref: f.decisions.postings[i].ref, revision: f.decisions.postings[i].revision });
const representative = (f, decision = 'representative') => {
  f.decisions.representations = [{ members: f.decisions.postings.map(p => ({ ref: p.ref, revision: p.revision })), decision,
    representativeRef: decision === 'representative' ? f.decisions.postings[0].ref : undefined, evidenceRef: 'synthetic-two-or-one' }];
};

test('adapter: independent reference ledger reconciles exact accounts, inactive savings, reserves, cash and off-grid tax bill', () => {
  const f = independentLedger(), before = sourceRevision(f), r = good(deepFreeze(f)), c = r.calculation;
  // Independently hand-established in Issue #16. None of these expected totals
  // are computed by the adapter, engine or fixture amount conversion.
  assert.deepEqual(c.validated.accounts, { C: '290000', C2: '50000', S: '248000', S2: '12000' });
  assert.deepEqual(c.projected.accounts, { C: '275000', C2: '50000', S: '263000', S2: '12000' });
  assert.deepEqual(c.validated.buckets, { tax: '70000', emergency: '150000', other: '5000' });
  assert.deepEqual(c.projected.buckets, { tax: '85000', emergency: '150000', other: '5000' });
  assert.deepEqual(c.validated.unallocated, { S: '28000', S2: '7000' });
  assert.deepEqual(c.validated.aggregate, { chequing: '340000', savings: '260000', cash: '600000' });
  assert.deepEqual(c.projected.aggregate, { chequing: '325000', savings: '275000', cash: '600000' });
  assert.equal(c.monthlyReports.find(m => m.month === '2027-01').validated.expense, '60000');
  assert.equal(c.monthlyReports[0].partialPeriod, true);
  const bill = r.reportMetadata.find(m => m.categoryId === 'tax-expense');
  assert.equal(bill.accountingDate, '2027-01-02'); assert.equal(bill.assignedDate, '2026-12-30');
  assert.equal(sourceRevision(f), before); assert.deepEqual(good(f), r);
  assert.notEqual(r.manifest.original, f.data); assert.deepEqual(r.manifest.original, f.data);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.calculation.validated.accounts) && Object.isFrozen(r.manifest.records[0].original));
  assert.throws(() => { r.manifest.original.meta.audits.push({}); }, TypeError);
  const old = r.manifest.records.find(i => i.collection === 'plannerEntries');
  assert.deepEqual(old.original.historicalSourceCorrections, [{ id: 'retained-audit', evidence: 'synthetic-before' }]);
});

test('adapter: exact decimal strings and strict legacy numeric bounds never round or multiply money floats', () => {
  for (const [value, minor] of [['0', '0'], ['0.01', '1'], ['12.3', '1230'], [12.34, '1234'], [1000000, '100000000'], ['9999999999999999999999999999.99', '999999999999999999999999999999']]) {
    assert.equal(decimalToMinor(value, 'CAD'), minor);
  }
  for (const value of ['', ' ', null, undefined, '-1', -0, '-0', '+1', '01', '1e2', '1,000', '1.001', 0.1 + 0.2, Number.MAX_SAFE_INTEGER, 1000000.01, Infinity, NaN]) {
    assert.throws(() => decimalToMinor(value, 'CAD'));
  }
  assert.throws(() => decimalToMinor('1', 'JPY'));
});

test('adapter: canonical content revisions retain all values, ignore object key order and pin exact edits', () => {
  assert.equal(sourceRevision({ b: 1, a: ['x', undefined] }), sourceRevision({ a: ['x', undefined], b: 1 }));
  assert.notEqual(sourceRevision({ a: undefined }), sourceRevision({}));
  assert.notEqual(sourceRevision({ a: -0 }), sourceRevision({ a: 0 }));
  assert.notEqual(sourceRef('transfers', 'a__b'), sourceRef('transfers__a', 'b'));
  const f = sole(); f.data.plannerEntries['tax__stable__2026-12-30'].notes = 'edited-with-same-timestamp';
  bad(f, 'STALE_OR_UNKNOWN_REFERENCE');
});

test('adapter: saved line-items > actual > saved plan, no live-source fallback, exact cents and stable line IDs', () => {
  const f = sole(incomeRoute, { minor: '31', record: { plannedAmount: '900', actualAmount: '800', useActual: true,
    lineItems: [{ id: 'L1', amount: '0.10' }, { id: 'L2', amount: '0.21' }] } });
  assert.equal(good(f).calculation.validated.accounts.C, '200031');
  const r = Object.values(f.data.plannerEntries)[0]; r.lineItems = []; f.decisions.postings[0].amountMinor = '80000';
  assert.equal(good(refresh(f)).events[0].amountMinor, '80000');
  r.useActual = false; f.decisions.postings[0].amountMinor = '90000';
  assert.equal(good(refresh(f)).events[0].amountMinor, '90000');
  delete r.plannedAmount; bad(refresh(f), 'INVALID_DECIMAL_AMOUNT');
});

test('adapter: invalid/missing/synthesized line identities and malformed amounts block with original inventory intact', () => {
  for (const record of [
    { plannedAmount: null }, { plannedAmount: '1.001' }, { actualAmount: '', useActual: true }, { plannedAmount: -1 },
    { plannedAmount: 0.1 + 0.2 }, { useActual: 'true' }, { validated: 1 }, { lineItems: null },
    { lineItems: [{ amount: '1' }] }, { lineItems: [{ id: 'same', amount: '1' }, { id: 'same', amount: '2' }] },
  ]) {
    const f = sole(saveRoute, { record, minor: '10000' }); const r = buildCheckpointPreview(f);
    assert.equal(r.ok, false); assert.equal(r.calculation, undefined);
    assert.deepEqual(r.manifest.original.plannerEntries, f.data.plannerEntries);
  }
});

test('adapter: validation/useActual alone cannot make a posted fact; explicit posting evidence can', () => {
  const f = sole(incomeRoute, { record: { validated: true, useActual: true, actualAmount: '100.00' } });
  f.decisions.postings = []; bad(f, 'POSTING_DECISION_REQUIRED');
  const g = sole(incomeRoute, { record: { validated: false } });
  assert.equal(good(g).events[0].validated, true); assert.equal(Object.values(g.data.plannerEntries)[0].validated, false);
  const h = sole(incomeRoute, { status: 'forecast', record: { validated: true } });
  bad(h, 'VALIDATION_POSTING_CONFLICT'); h.decisions.postings[0].validationDisposition = 'planned-not-posted';
  const r = good(h); assert.equal(r.calculation.validated.accounts.C, '200000'); assert.equal(r.calculation.projected.accounts.C, '210000');
  h.decisions.postings[0].evidenceRef = ' '; bad(h, 'DUPLICATE_OR_UNEVIDENCED_DECISION');
});

test('adapter: verified zero plan remains a nonposting intent, ambiguous zeros/negative/reversal cannot vanish', () => {
  const f = fixture(); scheduled(f, 'zero', '0', incomeRoute, { status: 'zero-intent', posting: { zeroVerified: true } });
  const r = good(f); assert.equal(r.events.length, 0); assert.equal(r.calculation.validated.aggregate.cash, '560000');
  assert.equal(r.manifest.records.find(i => i.collection === 'plannerEntries').disposition, 'zero-nonposting-intent');
  delete f.decisions.postings[0].zeroVerified; bad(f, 'UNSUPPORTED_ZERO_MOVEMENT');
  for (const options of [{ status: 'posted' }, { status: 'zero-intent', record: { validated: true }, posting: { zeroVerified: true } }]) {
    const g = fixture(); scheduled(g, 'zero', '0', incomeRoute, options); bad(g, 'UNSUPPORTED_ZERO_MOVEMENT');
  }
});

const fullFulfilment = () => {
  const f = sole(saveRoute, { status: 'forecast' });
  const posting = manual(f, 'actual98', '98', saveRoute, { date: '2027-01-02', assigned: '2027-01-13', posting: { movementId: 'bank98' } });
  f.decisions.fulfilments = [{ id: 'explicit-full', intent: pointer(f, 0), posting: bind('transfers', posting.id, posting),
    settlement: 'full', amountBasis: 'posting-effective', evidenceRef: 'synthetic-full-settlement' }];
  return f;
};
test('adapter: explicit 100 planned / 98 full posting emits one 98 movement, original occurrence, no fictitious remainder', () => {
  const f = deepFreeze(fullFulfilment()), before = sourceRevision(f), r = good(f);
  assert.equal(r.events.length, 1); const e = r.events[0];
  assert.equal(e.amountMinor, '9800'); assert.equal(e.accountingDate, '2027-01-02');
  assert.equal(e.assignedDate, '2026-12-30'); assert.equal(e.origin.id, 'tax__stable');
  assert.equal(e.origin.occurrenceId, 'tax__stable__2026-12-30'); assert.equal(e.origin.revision, pointer(f).revision);
  assert.deepEqual(r.calculation.validated.accounts, { C: '190200', C2: '50000', S: '309800', S2: '10000' });
  assert.deepEqual(r.calculation.projected, r.calculation.validated); assert.equal(r.calculation.validated.buckets.tax, '129800');
  assert.equal(r.manifest.fulfilments[0].varianceMinor, '200'); assert.equal(r.manifest.fulfilments[0].remainder, 'none-full-settlement');
  assert.equal(r.manifest.records.find(i => i.key === 'actual98').disposition, 'consumed-by-fulfilment');
  assert.equal(r.reportMetadata[0].originalRefs.length, 2);
  assert.equal(r.reportMetadata[0].originalDates[1].assignedDate, '2027-01-13'); assert.equal(sourceRevision(f), before);
});

test('adapter: no implicit fulfilment; partial, reused, unknown, stale and routing-conflicting links block', () => {
  const f = fullFulfilment(); f.decisions.fulfilments[0].settlement = 'partial'; bad(f, 'INVALID_FULFILMENT');
  const g = fullFulfilment(); g.decisions.fulfilments.push({ ...g.decisions.fulfilments[0], id: 'second' }); bad(g, 'CONSUMED_MEMBER_CONFLICT');
  const h = fullFulfilment(); h.decisions.fulfilments[0].posting.revision = 'stale'; bad(h, 'STALE_OR_UNKNOWN_REFERENCE');
  const j = fullFulfilment(); j.decisions.fulfilments[0].posting.ref = ref('transfers', 'absent'); bad(j, 'STALE_OR_UNKNOWN_REFERENCE');
  const k = fullFulfilment(); k.data.transfers[0].toAccountId = 'S2'; k.data.transfers[0].bucketId = 'other';
  k.decisions.routing[1].toAccountId = 'S2'; k.decisions.routing[1].bucketId = 'other'; bad(refresh(k), 'FULFILMENT_ROUTING_CONFLICT');
  const m = fullFulfilment(); delete m.decisions.fulfilments;
  // Differing amount/date is not sufficient to infer that these are one movement.
  const r = good(m); assert.equal(r.events.length, 2); assert.equal(r.manifest.fulfilments.length, 0);
  assert.equal(r.calculation.projected.accounts.S, '319800');
});

test('adapter: fulfilment retains scheduled expense and original manual adjustment IDs with category provenance', () => {
  const f = fixture(); scheduled(f, 'planned-fee', '100', { kind: 'expense', fromAccountId: 'C', categoryId: 'tax-expense' }, { status: 'forecast' });
  const actual = manual(f, 'fee-record', '98', { kind: 'expense', fromAccountId: 'C', categoryId: 'tax-expense' },
    { collection: 'manualAdjustments', sequence: 1, record: { adjustmentType: 'fee', accountId: 'C', categoryId: 'tax-expense' } });
  f.decisions.fulfilments = [{ id: 'fee-full', intent: pointer(f), posting: bind('manualAdjustments', actual.id, actual), settlement: 'full', amountBasis: 'posting-effective', evidenceRef: 'synthetic' }];
  const r = good(f); assert.equal(r.events[0].origin.id, 'planned-fee'); assert.equal(r.calculation.validated.accounts.C, '190200');
  assert.equal(r.manifest.records.find(i => i.key === 'fee-record').original.id, 'fee-record');
});

test('adapter: consumed posting cannot participate in boundaries or representations again', () => {
  const f = fullFulfilment(); f.decisions.boundaries = [{ ...pointer(f, 1), kind: 'carry-forward', evidenceRef: 'synthetic' }];
  bad(f, 'NONPRIMARY_BOUNDARY_MEMBER');
  const g = fullFulfilment(); representative(g); bad(g, 'NONPRIMARY_REPRESENTATION_MEMBER');
});

test('adapter: stable recurring source/occurrences cross years; saved future occurrence overrides supplied intent once', () => {
  const f = fixture(); f.throughDate = '2028-12-31';
  for (const [i, assigned] of ['2026-12-30', '2027-01-13', '2028-01-12'].entries()) scheduled(f, 'income__stable', '1', incomeRoute, { assigned, minor: '100', sequence: i });
  const saved = f.data.plannerEntries['income__stable__2028-01-12'];
  f.intents.push({ ...saved, plannedAmount: '9' });
  const r = good(f); assert.equal(r.calculation.validated.accounts.C, '200300'); assert.equal(r.events.length, 3);
  assert.deepEqual(r.events.map(e => e.origin.occurrenceId), ['income__stable__2026-12-30', 'income__stable__2027-01-13', 'income__stable__2028-01-12']);
  assert.equal(r.manifest.records.find(i => i.collection === 'intents').disposition, 'saved-override');
  assert.equal(r.manifest.original.meta.plannerLastEntryMarker.entryKey, 'old__2026-12-16');
});

test('adapter: unique prospective intent requires exact source snapshot and never generates recurrences', () => {
  const f = fixture(); scheduled(f, 'future', '1', incomeRoute, { intent: true, status: 'forecast', assigned: '2027-01-13' });
  assert.equal(good(f).calculation.projected.accounts.C, '200100'); assert.equal(good(f).events[0].origin.id, 'future');
  f.data.scheduledItems[0] = { ...f.data.scheduledItems[0], amount: '2' }; bad(f, 'INVALID_PROSPECTIVE_INTENT');
});

test('adapter: key/date/source conflicts and duplicate occurrence input cannot be rekeyed or dropped', () => {
  for (const fields of [{ entryKey: 'wrong' }, { scheduledItemId: 'wrong' }, { payPeriodDate: '2027-01-13' }, { scheduledItemSnapshot: { id: 'wrong', type: 'transfer' } }]) {
    const f = sole(); Object.assign(Object.values(f.data.plannerEntries)[0], fields); bad(refresh(f), 'OCCURRENCE_IDENTITY_CONFLICT');
  }
  const f = sole(); f.intents.push({ ...Object.values(f.data.plannerEntries)[0] }, { ...Object.values(f.data.plannerEntries)[0] }); bad(f, 'DUPLICATE_SOURCE_REFERENCE');
});

test('adapter: original occurrence key remains authoritative when redundant saved identity fields are absent, without inserting fields', () => {
  const f = sole(incomeRoute); const record = Object.values(f.data.plannerEntries)[0];
  delete record.scheduledItemId; delete record.payPeriodDate;
  const r = good(deepFreeze(refresh(f)));
  assert.equal(r.events[0].origin.id, 'tax__stable'); assert.equal(r.events[0].origin.occurrenceId, 'tax__stable__2026-12-30');
  assert.equal(r.events[0].assignedDate, '2026-12-30');
  assert.equal(Object.values(r.manifest.original.plannerEntries)[0].scheduledItemId, undefined);
  assert.equal(Object.values(r.manifest.original.plannerEntries)[0].payPeriodDate, undefined);
});

test('adapter: duplicate manual identities reject even after changed IDs/revisions on unrelated objects', () => {
  const f = fixture(); manual(f, 'one', '1', bankRoute); f.data.transfers.push({ ...f.data.transfers[0], amount: '2' });
  bad(f, 'DUPLICATE_SOURCE_REFERENCE');
  const g = sole(); g.decisions.postings.push({ ...g.decisions.postings[0] }); bad(g, 'DUPLICATE_OR_UNEVIDENCED_DECISION');
});

test('adapter: T-1/T/T+1, original assigned date and explicit carry/opening decisions count exactly once', () => {
  const f = sole(incomeRoute, { date: '2026-12-29' }); bad(f, 'BOUNDARY_DECISION_REQUIRED');
  f.decisions.boundaries = [{ ...pointer(f), kind: 'already-in-opening', evidenceRef: 'synthetic' }];
  const r = good(f); assert.equal(r.calculation.validated.accounts.C, '200000'); assert.equal(r.calculation.ledger.length, 0);
  const g = sole(incomeRoute, { assigned: '2026-12-16', date: '2026-12-31' }); bad(g, 'BOUNDARY_DECISION_REQUIRED');
  g.decisions.boundaries = [{ ...pointer(g), kind: 'carry-forward', evidenceRef: 'synthetic' }];
  assert.equal(good(g).calculation.validated.accounts.C, '210000');
  const h = sole(incomeRoute); h.decisions.boundaries = [{ ...pointer(h), kind: 'already-in-opening', evidenceRef: 'synthetic' }]; bad(h, 'OPENING_DATE_CONFLICT');
});

test('adapter: before-anchor checkpoint rejects; original cadence/timezone preserved; leap and DST posting days are exact', () => {
  const f = fixture(); f.checkpoint.date = '2026-12-02'; bad(f, 'CHECKPOINT_BEFORE_ANCHOR');
  f.checkpoint.date = '2026-12-16'; assert.equal(good(f).calculation.cadence.originalAnchor, '2026-12-16');
  const g = fixture(); g.throughDate = '2028-12-31';
  scheduled(g, 'leap', '0.01', incomeRoute, { assigned: '2028-01-12', date: '2028-02-29', minor: '1' });
  scheduled(g, 'dst', '0.01', incomeRoute, { assigned: '2027-01-13', date: '2027-03-14', minor: '1' });
  const r = good(g); assert.equal(r.calculation.validated.accounts.C, '200002');
  assert.deepEqual(r.calculation.ledger.map(e => e.accountingDate), ['2027-03-14', '2028-02-29']);
  g.decisions.postings[0].accountingDate = '2028-02-30'; bad(g, 'INVALID_POSTING_DECISION');
});

test('adapter: unsupported currency, checkpoint mismatch and future unresolved routes block, not filter out', () => {
  const f = sole(saveRoute, { record: { currency: 'USD' } }); bad(f, 'MIXED_CURRENCY');
  const g = sole(saveRoute, { date: '2029-01-01' }); g.decisions.routing[0].toAccountId = 'absent'; bad(g, 'INVALID_ACCOUNT_REFERENCE');
  const h = fixture(); h.data.settings.payFrequencyDays = 7; bad(h, 'CHECKPOINT_SETTINGS_CONFLICT');
  const i = sole(); i.displayFilter = { start: '2029-01-01' }; bad(i, 'UNSUPPORTED_INPUT_OPTION');
});

test('adapter: explicit after-window inventory is complete and original manual posting dates cannot be shifted', () => {
  const f = sole(incomeRoute, { date: '2029-01-01' }); const r = good(f);
  assert.equal(r.events.length, 1); assert.equal(r.calculation.ledger.length, 0);
  assert.equal(r.manifest.records.find(i => i.collection === 'plannerEntries').disposition, 'after-window');
  const g = fixture(); manual(g, 'm', '1', bankRoute); g.decisions.postings[0].accountingDate = '2026-12-31'; bad(g, 'POSTING_DATE_CONFLICT');
});

test('adapter: ordinary transfers preserve exact bank cash with no income, expense or reserve duplication', () => {
  const f = fixture();
  for (const [id, amount, fromAccountId, toAccountId, sequence] of [['cc', '100', 'C', 'C2', 0], ['ss', '20', 'S', 'S2', 1], ['cs', '30', 'C', 'S', 2], ['sc', '10', 'S2', 'C', 3]]) {
    manual(f, id, amount, { kind: 'account_transfer', fromAccountId, toAccountId }, { sequence });
  }
  const c = good(f).calculation;
  assert.deepEqual(c.validated.accounts, { C: '188000', C2: '60000', S: '301000', S2: '11000' });
  assert.deepEqual(c.validated.buckets, { tax: '120000', emergency: '150000', other: '5000' });
  assert.deepEqual(c.validated.unallocated, { S: '31000', S2: '6000' }); assert.equal(c.validated.aggregate.cash, '560000');
  assert.deepEqual(c.monthlyReports[0].validated, { account_transfer: '16000' });
  assert.deepEqual(c.ledger.map(e => e.origin.id), ['cc', 'ss', 'cs', 'sc']);
});

test('adapter: direct savings expense versus allocation/release/reallocation changes reserves once and banks only for expense', () => {
  const f = fixture(); scheduled(f, 'direct-tax', '600', { kind: 'expense', fromAccountId: 'S', bucketId: 'tax', categoryId: 'tax-expense' });
  for (const [id, amount, kind, sequence, extra] of [['rel', '10', 'release', 1, {}], ['alloc', '5', 'allocation', 2, {}], ['move', '5', 'reallocation', 3, { toBucketId: 'emergency' }]]) {
    manual(f, id, amount, { kind, bucketId: 'tax', ...extra }, { collection: 'savingsBucketAdjustments', sequence, record: { adjustmentType: kind, bucketId: 'tax', ...extra } });
  }
  const c = good(f).calculation;
  assert.equal(c.validated.accounts.S, '240000'); assert.equal(c.validated.buckets.tax, '59000');
  assert.equal(c.validated.buckets.emergency, '150500'); assert.equal(c.validated.unallocated.S, '30500');
  assert.equal(c.validated.aggregate.cash, '500000');
  assert.ok(c.ledger.slice(1).every(e => e.legs.bank.length === 0)); assert.equal(c.monthlyReports[0].validated.expense, '60000');
});

test('adapter: invalid account/bucket/category/self-route and raw routing contradiction fail closed', () => {
  for (const [change, code] of [[{ fromAccountId: 'missing' }, 'INVALID_ACCOUNT_REFERENCE'], [{ bucketId: 'other' }, 'INVALID_EVENT_BUCKET'], [{ categoryId: 'missing' }, 'INVALID_CATEGORY_REFERENCE'], [{ categoryId: 'salary' }, 'CATEGORY_CLASSIFICATION_CONFLICT']]) {
    const f = sole(); Object.assign(f.decisions.routing[0], change); bad(f, code);
  }
  const g = fixture(); manual(g, 'm', '1', bankRoute); g.decisions.routing[0].toAccountId = 'C2'; bad(g, 'RAW_ROUTING_CONFLICT');
  const h = fixture(); manual(h, 'm', '1', { kind: 'account_transfer', fromAccountId: 'C', toAccountId: 'C' }); bad(h, 'SELF_TRANSFER');
  const i = sole(incomeRoute); delete Object.values(i.data.plannerEntries)[0].scheduledItemSnapshot; bad(refresh(i), 'SOURCE_SNAPSHOT_REQUIRED');
});

test('adapter: account/bucket coverage includes inactive assets; unsupported credit/cash/other never become zero cash', () => {
  for (const type of ['credit', 'cash', 'other']) {
    const f = fixture(); f.data.accounts.push({ id: 'X', type, active: true, startingBalance: '1' });
    bad(f, 'UNSUPPORTED_ACCOUNT_TYPE');
  }
  const f = fixture(); const a = { id: 'X', type: 'credit', active: false, startingBalance: '0' }; f.data.accounts.push(a);
  f.decisions.excludedAccounts = [{ ...bind('accounts', a.id, a), evidenceRef: 'synthetic' }];
  const r = good(f); assert.ok(r.diagnostics.some(d => d.code === 'UNSUPPORTED_ACCOUNT_EXCLUDED'));
  manual(f, 'm', '1', { kind: 'account_transfer', fromAccountId: 'C', toAccountId: 'X' }); bad(f, 'INVALID_ACCOUNT_REFERENCE');
  const g = fixture(); g.checkpoint.accounts.pop(); bad(g, 'INVALID_BUCKET');
  const h = fixture(); h.data.savingsBuckets[0].linkedAccountId = 'demonstration-missing'; bad(h, 'BUCKET_ASSOCIATION_CONFLICT');
});

test('adapter: old starts are preserved context, not replayed into independently evidenced checkpoint openings', () => {
  const f = fixture(); f.data.accounts[0].startingBalance = '999999.99'; f.data.savingsBuckets[0].startingAmount = '888888.88';
  const r = good(deepFreeze(f));
  assert.equal(r.calculation.opening.accounts.C, '200000'); assert.equal(r.calculation.opening.buckets.tax, '120000');
  assert.deepEqual(r.calculation.monthlyReports, []); assert.equal(r.manifest.original.accounts[0].startingBalance, '999999.99');
});

test('adapter: unclassified off-grid actual expense stays in reporting with a warning, never disappears from spending', () => {
  const f = sole({ kind: 'expense', fromAccountId: 'C' }, { date: '2027-01-02' }); const r = good(f);
  assert.equal(r.calculation.monthlyReports[0].validated.expense, '10000');
  assert.equal(r.reportMetadata[0].categoryId, null); assert.equal(r.reportMetadata[0].accountingDate, '2027-01-02');
  assert.ok(r.diagnostics.some(d => d.code === 'UNCLASSIFIED_EXPENSE' && d.severity === 'warning'));
});

test('adapter: exact same-date transfer candidates require evidence; DISTINCT allows differing periods and posting states', () => {
  const f = sole(saveRoute, { status: 'forecast' }); manual(f, 'other-real', '100', saveRoute, { sequence: 1, assigned: '2027-01-13' });
  bad(f, 'REPRESENTATION_DECISION_REQUIRED'); representative(f, 'distinct');
  const r = good(f); assert.equal(r.events.length, 2);
  assert.equal(r.calculation.validated.accounts.S, '310000'); assert.equal(r.calculation.projected.accounts.S, '320000');
  assert.equal(r.calculation.validated.buckets.tax, '130000'); assert.equal(r.calculation.projected.buckets.tax, '140000');
  assert.equal(r.calculation.validated.aggregate.cash, '560000');
});

test('adapter: exact representatives suppress only an equivalent calculation, never delete or mutate raw transactions', () => {
  const f = sole(); manual(f, 'same-real', '100', saveRoute, { sequence: 1 }); representative(f);
  const before = sourceRevision(f), r = good(deepFreeze(f));
  assert.equal(r.events.length, 2); assert.equal(r.calculation.ledger.length, 1); assert.equal(r.calculation.validated.accounts.S, '310000');
  assert.equal(r.manifest.records.find(i => i.key === 'same-real').disposition, 'represented-by-policy');
  assert.equal(r.manifest.records.find(i => i.key === 'same-real').representedBy, `finpath:${pointer(f).ref}`);
  assert.equal(r.manifest.original.transfers.length, 1); assert.equal(sourceRevision(f), before);
  const g = sole(); manual(g, 'different-real', '98', saveRoute, { sequence: 1 }); representative(g); bad(g, 'INCOMPATIBLE_REPRESENTATION');
});

test('adapter: shared financial identity conflict, overlapping policies, duplicate occurrence and stale decisions remain strict', () => {
  const f = sole(saveRoute, { posting: { movementId: 'one' } }); manual(f, 'other', '100', saveRoute, { sequence: 1, posting: { movementId: 'one' } }); representative(f, 'distinct'); bad(f, 'CONFLICTING_MOVEMENT_CLAIM');
  const g = sole(); manual(g, 'other', '100', saveRoute, { sequence: 1 }); representative(g); g.decisions.representations.push(g.decisions.representations[0]); bad(g, 'INVALID_REPRESENTATION_MEMBER');
  const h = sole(); h.decisions.boundaries = [{ ref: 'unknown', revision: 'x', kind: 'carry-forward', evidenceRef: 's' }]; bad(h, 'STALE_OR_UNKNOWN_REFERENCE');
  const i = sole(); i.decisions.routing.push({ ...i.decisions.routing[0], ref: ref('accounts', 'C'), revision: sourceRevision(i.data.accounts[0]) }); bad(i, 'UNUSED_DECISION');
});

test('adapter: repeated income/expense coincidence requires evidence too; different validated flags remain distinct when evidenced', () => {
  const f = sole(incomeRoute); manual(f, 'extra', '100', incomeRoute, { sequence: 1, collection: 'manualAdjustments', record: { adjustmentType: 'interest' } });
  bad(f, 'REPRESENTATION_DECISION_REQUIRED'); representative(f, 'distinct');
  assert.equal(good(f).calculation.validated.accounts.C, '220000');
});

test('adapter: funds and explicit order are not bypassed; projected failure also blocks confirmed view', () => {
  const f = fixture(); manual(f, 'too-much', '301', { kind: 'account_transfer', fromAccountId: 'S', toAccountId: 'C' }); bad(f, 'INSUFFICIENT_TRANSFER_FUNDS');
  const g = fixture(); scheduled(g, 'one', '1', incomeRoute); scheduled(g, 'two', '2', incomeRoute); bad(g, 'AMBIGUOUS_EVENT_ORDER');
  const h = sole({ kind: 'expense', fromAccountId: 'C' }, { status: 'forecast', record: { plannedAmount: '2001' }, minor: '200100' }); bad(h, 'NEGATIVE_ACCOUNT');
  const i = sole(); delete i.decisions.postings[0].sequence; bad(i, 'INVALID_POSTING_DECISION');
});

test('adapter: generic/signed adjustments, refunds, partial settlement and malformed zero cannot be relabelled', () => {
  const f = fixture(); manual(f, 'generic', '1', incomeRoute, { collection: 'manualAdjustments', record: { adjustmentType: 'correction' } }); bad(f, 'UNSUPPORTED_ADJUSTMENT');
  const g = fixture(); manual(g, 'signed', '-1', incomeRoute, { collection: 'manualAdjustments', minor: '-100', record: { adjustmentType: 'interest' } }); bad(g, 'INVALID_DECIMAL_AMOUNT');
  const h = sole(); h.decisions.postings[0].status = 'partial'; bad(h, 'INVALID_POSTING_DECISION');
});

test('adapter: legacy 25/22/2-shaped context is preserved, qualified and never automatically matched or counted', () => {
  const f = fixture();
  for (let i = 0; i < 49; i++) {
    const source = i < 25 ? `orphan-${i}` : i < 47 ? `newer-${i}` : `bill-${i}`;
    const key = `${source}__2026-12-16`;
    const record = { entryKey: key, scheduledItemId: source, payPeriodDate: '2026-12-16', plannedAmount: '100',
      validated: i >= 14, useActual: false, historicalSourceNeedsReview: true,
      scheduledItemSnapshot: { id: source, type: i < 47 ? 'transfer' : 'expense', accountId: i >= 25 && i < 47 ? 'missing-legacy-account' : 'C', bucketId: i < 47 ? 'tax' : null },
      audit: [{ id: `audit-${i}`, evidence: 'synthetic-original' }] };
    f.data.plannerEntries[key] = record;
    (f.decisions.legacy ??= []).push({ ...bind('plannerEntries', key, record), accountingDate: '2026-12-16', evidenceRef: 'synthetic-pre-checkpoint' });
  }
  f.data.meta.candidateEdges = Array.from({ length: 11 }, (_, i) => [i, i + 25]);
  const before = sourceRevision(f), r = good(deepFreeze(f));
  assert.equal(r.calculation.validated.aggregate.cash, '560000'); assert.equal(r.events.length, 0);
  assert.equal(r.manifest.records.filter(i => i.disposition === 'legacy-context').length, 49);
  assert.equal(Object.values(r.manifest.original.plannerEntries).filter(e => !e.validated).length, 14);
  assert.equal(Object.values(r.manifest.original.plannerEntries).filter(e => e.scheduledItemSnapshot.accountId === 'missing-legacy-account').length, 22);
  assert.equal(Object.values(r.manifest.original.plannerEntries).filter(e => e.scheduledItemSnapshot.type === 'expense').length, 2);
  assert.equal(r.manifest.fulfilments.length, 0); assert.equal(r.legacyExceptions.filter(d => d.code === 'UNVERIFIED_LEGACY_CONTEXT').length, 49);
  assert.equal(r.legacyExceptions.filter(d => d.code === 'LEGACY_ACCOUNT_REFERENCE_INVALID').length, 22);
  assert.equal(sourceRevision(f), before);
});

test('adapter: legacy qualifier cannot conceal boundary members, re-use bank identity or clear historical review flags', () => {
  const f = sole(); f.decisions.legacy = [{ ...pointer(f), accountingDate: '2026-12-16', evidenceRef: 's' }];
  f.decisions.postings = []; f.decisions.routing = []; bad(f, 'INVALID_LEGACY_SCOPE');
  const g = sole(incomeRoute); const old = { entryKey: 'old__2026-12-16', scheduledItemId: 'old', payPeriodDate: '2026-12-16', movementId: 'same', validated: true, historicalSourceNeedsReview: true };
  g.data.plannerEntries[old.entryKey] = old; g.decisions.legacy = [{ ...bind('plannerEntries', old.entryKey, old), accountingDate: '2026-12-16', evidenceRef: 's' }];
  g.decisions.postings[0].movementId = 'same'; const r = bad(g, 'LEGACY_MOVEMENT_CONFLICT'); assert.equal(r.manifest.original.plannerEntries[old.entryKey].historicalSourceNeedsReview, true);
});

test('adapter: complete inventory and no partial trusted totals when one critical member fails', () => {
  const f = independentLedger(); f.decisions.postings[1].amountMinor = '999';
  const r = bad(f, 'POSTING_AMOUNT_CONFLICT');
  assert.equal(r.manifest.records.filter(i => ['plannerEntries', 'transfers'].includes(i.collection)).length, 6);
  assert.equal(r.manifest.records.filter(i => i.disposition === 'unresolved').length, 6);
  assert.deepEqual(r.manifest.original.meta, f.data.meta);
});

test('adapter: >10000 supplied dated records blocks explicitly before consumption, without truncation', () => {
  const f = fixture();
  for (let i = 0; i < 10001; i++) f.data.plannerEntries[`source-${i}__2026-12-30`] = { scheduledItemId: `source-${i}`, payPeriodDate: '2026-12-30', plannedAmount: '1' };
  const r = bad(f, 'WORK_LIMIT'); assert.equal(r.manifest.records.filter(i => i.collection === 'plannerEntries').length, 10001);
});

test('adapter: alias conflict and missing collections never silently omit records or replay derived transactions', () => {
  const f = sole(); f.data.planner = { entries: { ...f.data.plannerEntries } }; assert.equal(good(f).events.length, 1);
  f.data.planner.entries = {}; bad(f, 'PLANNER_ALIAS_CONFLICT');
  const g = fixture(); delete g.data.transfers; bad(g, 'MISSING_COLLECTION');
  const h = sole(); h.data.transactions = [{ id: 'derived-view-only', amount: '100' }]; assert.equal(good(h).events.length, 1);
});

test('adapter: safe codes without copied financial details, no runtime clock, randomness, network, storage or logging', () => {
  const f = sole(); Object.values(f.data.plannerEntries)[0].plannedAmount = 'PRIVATE-NOTE-UNSUPPORTED'; refresh(f);
  const originals = [Date.now, Math.random, globalThis.console];
  const globals = ['fetch', 'window', 'document', 'localStorage', 'indexedDB', 'crypto'];
  const descriptors = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  let calls = 0;
  const forbidden = () => { calls++; throw new Error('forbidden effect'); };
  let r, valid;
  try {
    Date.now = forbidden; Math.random = forbidden;
    for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, get: forbidden });
    globalThis.console = new Proxy({}, { get: () => forbidden });
    r = buildCheckpointPreview(deepFreeze(f));
    valid = buildCheckpointPreview(deepFreeze(independentLedger()));
  } finally {
    [Date.now, Math.random, globalThis.console] = originals;
    globals.forEach((key, i) => { if (descriptors[i]) Object.defineProperty(globalThis, key, descriptors[i]); else delete globalThis[key]; });
  }
  assert.equal(calls, 0); assert.equal(valid.ok, true);
  assert.equal(r.ok, false); assert.ok(!JSON.stringify(r.diagnostics).includes('PRIVATE-NOTE'));
  assert.deepEqual(r.manifest.original, f.data);
});

test('adapter: unidentified records remain inventoried by exact input position without synthesizing IDs', () => {
  const f = fixture(); f.data.transfers.push({ amount: '1' }); f.intents.push({ plannedAmount: '2' });
  const r = bad(f, 'INVALID_SOURCE_ID');
  assert.deepEqual(r.manifest.unidentifiedRecords.map(i => [i.collection, i.index, i.original]),
    [['transfers', 0, { amount: '1' }], ['intents', 0, { plannedAmount: '2' }]]);
  assert.equal(r.manifest.original.transfers[0].id, undefined);
});

test('adapter: unknown decision options and after-window shared movement claims cannot be silently ignored', () => {
  const f = sole(); f.decisions.postings[0].partialAmount = '100'; bad(f, 'UNSUPPORTED_DECISION_FIELD');
  const g = sole(saveRoute, { posting: { movementId: 'one' } });
  manual(g, 'later', '100', saveRoute, { date: '2029-01-01', posting: { movementId: 'one' } });
  bad(g, 'REPRESENTATION_DECISION_REQUIRED');
});

test('adapter: zero intent routing is fully checked without emitting a fabricated positive transaction', () => {
  const f = fixture(); scheduled(f, 'zero', '0', saveRoute, { status: 'zero-intent', posting: { zeroVerified: true } });
  f.decisions.routing[0].bucketId = 'other'; bad(f, 'INVALID_EVENT_BUCKET');
  const g = fixture(); scheduled(g, 'zero', '0', { kind: 'income' }, { status: 'zero-intent', posting: { zeroVerified: true } }); bad(g, 'INVALID_EVENT_ACCOUNT');
});

test('adapter: core origin namespace collisions block, preserving original adjustment IDs without rekeying', () => {
  const f = fixture(); manual(f, 'same', '1', incomeRoute, { collection: 'manualAdjustments', record: { adjustmentType: 'interest' } });
  manual(f, 'same', '1', { kind: 'release', bucketId: 'tax' }, { sequence: 1, collection: 'savingsBucketAdjustments', record: { adjustmentType: 'release', bucketId: 'tax' } });
  const r = bad(f, 'DUPLICATE_ORIGIN'); assert.equal(r.manifest.original.manualAdjustments[0].id, 'same');
  assert.equal(r.manifest.original.savingsBucketAdjustments[0].id, 'same');
});

test('adapter: malformed DTO, accessors, exotic objects and cycles are safe blocked input, never executed', () => {
  let invoked = false; const accessor = { get data() { invoked = true; return {}; } };
  assert.equal(buildCheckpointPreview(accessor).ok, false); assert.equal(invoked, false);
  const f = fixture(); f.data.self = f; bad(f, 'INVALID_DTO');
  const g = fixture(); g.data.meta = new Map(); bad(g, 'INVALID_DTO');
  const h = fixture(); h.synthetic = false; bad(h, 'SYNTHETIC_INPUT_REQUIRED');
});
