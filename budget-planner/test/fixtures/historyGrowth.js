import { changeHistory, inspectHistoryModel, readHistory, readHistoryVersion, reconstructHistoryOrigin } from '../../experimental/checkpoint/historyModel.js';
import { modelFixture, goodModel } from './historyModel.js';

// All records invented. Dates are explicit fixture arithmetic, not runtime time.
export async function runHistoryWorkload(years, variant) {
  const config = { low: { periods: 26, changes: 1, notes: 32 }, medium: { periods: 27, changes: 2, notes: 160 },
    high: { periods: 27, changes: 4, notes: 512 } }[variant];
  const f = await modelFixture(); let model = f.model;
  const initial = goodModel(inspectHistoryModel(model)), independent = new Map(), revisions = new Map(), checkpoints = [];
  const operations = years * 370, slots = years * config.periods * 12;
  for (let op = 0; op < operations; op++) {
    const changes = [];
    for (let item = 0; item < config.changes; item++) {
      const slot = (op * config.changes + item) % slots, id = `growth-${slot.toString().padStart(5, '0')}`;
      const date = new Date(Date.UTC(2026, 0, 2) + Math.floor(slot / 12) * 14 * 86400000).toISOString().slice(0, 10);
      const deleted = op % 41 === 40, value = { id, date, amount: `${(op + item) % 1000}.25`, validated: op % 3 === 0,
        lineItems: [{ id: `${id}-A`, amount: '0.10' }, { id: `${id}-B`, amount: '0.15' }, { id: `${id}-C`, amount: `${op % 1000}.00` }],
        plannerLastEntryMarker: { cellKey: `${id}__${date}` },
        note: `${'N'.repeat(config.notes)}-revision-${op}-${item}`, evidenceRef: 'synthetic-growth-reference' };
      changes.push(deleted ? { store: 'manualAdjustments', key: id, deleted: true } : { store: 'manualAdjustments', key: id, value });
      const versions = independent.get(id) ?? []; versions.push(deleted ? undefined : structuredClone(value)); independent.set(id, versions);
      const counters = revisions.get(id) ?? []; counters.push(String(op + 3)); revisions.set(id, counters);
    }
    const result = await changeHistory(model, { synthetic: true, operationId: `work-${op}`, datasetId: 'A',
      expectedRevision: model.revision, expectedRoot: model.root, changes });
    if (!result.ok) return { ok: false, years, variant, attempted: op + 1, completed: op, previous: model,
      diagnostics: result.diagnostics, initial: initial.stats, final: goodModel(inspectHistoryModel(model)).stats };
    model = result.model;
    if (op === 0 || op === operations - 1 || op % 370 === 369) checkpoints.push({ model, expected: structuredClone(independent) });
  }
  // Independent append-only per-key reference versions, never full-state history
  // copies in the implementation. Check every retained version at final root.
  const rows = goodModel(await readHistory(model, { datasetId: 'A', store: 'manualAdjustments', includeDeleted: true })).rows;
  let comparedVersions = 0;
  for (const row of rows) {
    const reference = independent.get(row.key), expectedCurrent = reference.at(-1);
    if (JSON.stringify(row.value) !== JSON.stringify(expectedCurrent)) throw Error('synthetic current reference mismatch');
    if (row.deleted !== (expectedCurrent === undefined)) throw Error('synthetic tombstone reference mismatch');
    let ref = row.versionRef;
    for (let i = reference.length - 1; i >= 0; i--) {
      const actual = goodModel(await readHistoryVersion(model, ref));
      if (JSON.stringify(actual.value) !== JSON.stringify(reference[i])) throw Error('synthetic historical reference mismatch');
      if (actual.version.deleted !== (reference[i] === undefined) || actual.version.localRevision !== revisions.get(row.key)[i]) throw Error('synthetic revision reference mismatch');
      ref = actual.version.previous; comparedVersions++;
    }
    if (ref !== null) throw Error('synthetic unexpected older version');
  }
  for (const c of checkpoints) {
    const old = goodModel(await readHistory(c.model, { datasetId: 'A', store: 'manualAdjustments', includeDeleted: true })).rows;
    for (const row of old) if (JSON.stringify(row.value) !== JSON.stringify(c.expected.get(row.key).at(-1))) throw Error('synthetic prior-root mismatch');
  }
  const original = goodModel(await reconstructHistoryOrigin(model, f.originId));
  if (JSON.stringify(original.stores.plannerEntries.rows) !== JSON.stringify(f.source.stores.plannerEntries)) throw Error('synthetic original history mismatch');
  return { ok: true, years, variant, periodsPerYear: config.periods, rowsPerOperation: config.changes,
    noteUnits: config.notes, operations, slots, comparedVersions, initial: initial.stats,
    final: goodModel(inspectHistoryModel(model)).stats, revision: model.revision };
}
