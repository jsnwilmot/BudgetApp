// Invented synthetic records only. No backup reader or application dependency.
import { sourceRef, sourceRevision } from '../../experimental/checkpoint/adapter.js';

export const ref = (collection, key) => sourceRef(collection, key);
export const bind = (collection, key, original) => ({ ref: ref(collection, key), revision: sourceRevision(original) });
export function fixture() {
  const accounts = [
    { id: 'C', type: 'chequing', startingBalance: '2000.00', active: true },
    { id: 'C2', type: 'chequing', startingBalance: '500.00', active: true },
    { id: 'S', type: 'savings', startingBalance: '3000.00', active: true },
    { id: 'S2', type: 'savings', startingBalance: '100.00', active: false },
  ];
  const savingsBuckets = [
    { id: 'tax', linkedAccountId: 'S', startingAmount: '1200.00' },
    { id: 'emergency', linkedAccountId: 'S', startingAmount: '1500.00' },
    { id: 'other', linkedAccountId: 'S2', startingAmount: '50.00' },
  ];
  return { synthetic: true, throughDate: '2027-01-13', intents: [], decisions: {},
    data: { settings: { payPeriodAnchorDate: '2026-12-16', payFrequencyDays: 14, currency: 'CAD', timeZone: 'America/Edmonton' },
      accounts, savingsBuckets, categories: [{ id: 'tax-expense', type: 'expense' }, { id: 'salary', type: 'income' }],
      scheduledItems: [], plannerEntries: {}, transfers: [], manualAdjustments: [], savingsBucketAdjustments: [],
      meta: { plannerLastEntryMarker: { entryKey: 'old__2026-12-16' }, audits: [{ id: 'old-audit', validated: true }] } },
    checkpoint: { id: 'synthetic-opening', date: '2026-12-30', originalAnchor: '2026-12-16', frequencyDays: 14,
      timeZone: 'America/Edmonton', currency: 'CAD', verified: true, basis: 'posted', evidenceRef: 'synthetic-statement',
      accounts: accounts.map(a => ({ id: a.id, type: a.type, currency: 'CAD', active: a.active,
        openingMinor: { C: '200000', C2: '50000', S: '300000', S2: '10000' }[a.id], verified: true, evidenceRef: `opening-${a.id}` })),
      buckets: savingsBuckets.map(b => ({ id: b.id, accountId: b.linkedAccountId,
        openingMinor: { tax: '120000', emergency: '150000', other: '5000' }[b.id], verified: true, evidenceRef: `opening-${b.id}` })),
      unallocated: [{ accountId: 'S', amountMinor: '30000' }, { accountId: 'S2', amountMinor: '5000' }] } };
}
export function scheduled(f, id, amount, route, options = {}) {
  const assigned = options.assigned ?? '2026-12-30';
  const source = { id, type: route.kind === 'income' ? 'income' : route.kind === 'expense' ? 'expense' : 'transfer',
    amount, active: true, ...(route.categoryId ? { categoryId: route.categoryId } : {}) };
  const existing = f.data.scheduledItems.find(s => s.id === id);
  if (!existing) f.data.scheduledItems.push(source);
  const key = `${id}__${assigned}`;
  const record = { entryKey: key, scheduledItemId: id, payPeriodDate: assigned, plannedAmount: amount,
    useActual: false, validated: false, lineItems: [], scheduledItemSnapshot: existing ?? source,
    historicalSourceCorrections: [{ id: 'retained-audit', evidence: 'synthetic-before' }], ...options.record };
  const collection = options.intent ? 'intents' : 'plannerEntries';
  if (options.intent) f.intents.push(record); else f.data.plannerEntries[key] = record;
  decision(f, collection, key, record, route, options);
  return record;
}
export function manual(f, id, amount, route, options = {}) {
  const collection = options.collection ?? 'transfers';
  const record = { id, amount, date: options.date ?? '2026-12-30', payPeriodDate: options.assigned ?? '2026-12-30',
    validated: false, ...(collection === 'transfers' ? { transferType: { contribution: 'to_savings_bucket', withdrawal: 'from_savings_bucket', account_transfer: 'account_transfer' }[route.kind],
      ...Object.fromEntries(['fromAccountId', 'toAccountId', 'bucketId'].filter(k => route[k] !== undefined).map(k => [k, route[k]])) } : {}),
    ...options.record };
  f.data[collection].push(record); decision(f, collection, id, record, route, options); return record;
}
export function decision(f, collection, key, record, route, options = {}) {
  const member = bind(collection, key, record);
  const [whole, fraction = ''] = String(record.plannedAmount ?? record.amount).split('.');
  (f.decisions.postings ??= []).push({ ...member, status: options.status ?? 'posted', amountMinor: options.minor ?? String(BigInt(`${whole}${fraction.padEnd(2, '0')}`)),
    accountingDate: options.date ?? record.date ?? record.payPeriodDate, sequence: options.sequence ?? 0, evidenceRef: 'synthetic-posting', ...options.posting });
  (f.decisions.routing ??= []).push({ ...member, ...route, evidenceRef: 'synthetic-route' });
}
export function refresh(f) {
  const original = member => {
    const [collection, key] = JSON.parse(member.ref);
    return collection === 'plannerEntries' ? f.data.plannerEntries[key] : collection === 'intents' ? f.intents.find(r => r.entryKey === key) : f.data[collection].find(r => r.id === key);
  };
  for (const name of ['postings', 'routing', 'legacy', 'excludedAccounts', 'boundaries']) {
    for (const member of f.decisions[name] ?? []) member.revision = sourceRevision(original(member));
  }
  for (const d of f.decisions.fulfilments ?? []) for (const m of [d.intent, d.posting]) m.revision = sourceRevision(original(m));
  for (const d of f.decisions.representations ?? []) for (const m of d.members) m.revision = sourceRevision(original(m));
  return f;
}
export function independentLedger() {
  const f = fixture();
  scheduled(f, 'salary', '1000.00', { kind: 'income', toAccountId: 'C', categoryId: 'salary' }, { sequence: 0, minor: '100000', record: { validated: true } });
  scheduled(f, 'tax-save', '100.00', { kind: 'contribution', fromAccountId: 'C', toAccountId: 'S', bucketId: 'tax' }, { sequence: 1, minor: '10000' });
  manual(f, 'tax-funding', '600.00', { kind: 'withdrawal', fromAccountId: 'S', toAccountId: 'C', bucketId: 'tax' }, { date: '2026-12-31', minor: '60000' });
  scheduled(f, 'tax-bill', '600.00', { kind: 'expense', fromAccountId: 'C', categoryId: 'tax-expense' }, { date: '2027-01-02', minor: '60000' });
  manual(f, 'neutral-ss', '20.00', { kind: 'account_transfer', fromAccountId: 'S', toAccountId: 'S2' }, { date: '2027-01-03', minor: '2000' });
  scheduled(f, 'tax-save', '150.00', { kind: 'contribution', fromAccountId: 'C', toAccountId: 'S', bucketId: 'tax' }, { assigned: '2027-01-13', status: 'forecast', minor: '15000' });
  return f;
}
export const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
