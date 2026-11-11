import test from 'node:test';
import assert from 'node:assert/strict';
import { runRetentionWorkload } from './fixtures/retention.js';

const baseline = {
  '1-low': [27372, 20815519, 10540686], '1-medium': [31693, 26548589, 14447447], '1-high': [39693, 38088521, 22112147],
  '3-low': [57926, 56403253, 35220689], '3-medium': [70871, 77503505, 50845340], '3-high': [94859, 120017447, 81735280],
  '5-low': [86069, 97187501, 65691863], '5-medium': [107593, 138992729, 98375593], '5-high': [147573, 223089067, 163063597],
};
for (const years of [1, 3, 5]) for (const variant of ['low', 'medium', 'high']) {
  test(`O10/G4/G6: ${years} years ${variant} exact P1 workload, full committed-state and source17 proof`, async t => {
    const r = await runRetentionWorkload(years, variant);
    assert.deepEqual([r.baseline.objects, r.baseline.retainedBytes, r.baseline.kindBytes.map], baseline[`${years}-${variant}`]);
    assert.equal(r.rootsRead, r.operations + 3); assert.equal(r.candidate.byKind.version.count, r.baseline.kinds.version);
    // Efficiency misses are reported as misses, never assertions that encourage
    // removing history. Correctness requires exact counters, history and math.
    assert.equal(r.accounting.accountedBytes, r.candidate.keptBytes + r.accounting.overheadBytes);
    assert.equal(r.candidate.excludedMapBytes + r.candidate.protectedMapBytes, r.baseline.kindBytes.map);
    t.diagnostic(JSON.stringify(r));
  });
}
