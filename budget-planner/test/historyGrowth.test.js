import test from 'node:test';
import assert from 'node:assert/strict';
import { runHistoryWorkload } from './fixtures/historyGrowth.js';

for (const years of [1, 3, 5]) for (const variant of ['low', 'medium', 'high']) {
  test(`H03/H15 model: ${years} years ${variant}370-write history, complete provenance and independent old-version reference`, async t => {
    const r = await runHistoryWorkload(years, variant);
    assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
    assert.equal(r.operations, years * 370); assert.equal(r.comparedVersions, r.operations * r.rowsPerOperation);
    assert.equal(r.final.kinds.origin, 1); assert.equal(r.final.kinds.journal, r.operations + 2);
    assert.equal(r.final.kinds['model-root'], r.operations + 3);
    assert.ok(r.final.retainedBytes < 256 * 1024 * 1024);
    assert.ok(r.final.kindBytes.journal / r.final.kinds.journal < 2048);
    assert.ok(r.final.kindBytes['model-root'] / r.final.kinds['model-root'] < 2048);
    t.diagnostic(JSON.stringify(r));
  });
}
