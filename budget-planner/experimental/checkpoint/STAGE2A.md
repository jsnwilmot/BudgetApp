# Stage 2A review and handoff — Issue #17

This implements only the synthetic, pure source adapter authorized after the
[Issue #16 plan and Architect review](https://github.com/jsnwilmot/BudgetApp/issues/16).
Baseline: accepted Stage 1 `6b61c8a88131e0ecdc6d80d0216be66441885efe`.
New branch: `codex/stage2a-checkpoint-adapter`, targeting `codex/checkpoint-stage1`.
PR #9 and PR #15 are dependencies, not modified deliverables.

## Review entry points and use

- [ADAPTER.md](ADAPTER.md): frozen-for-this-PR DTO/decision/output contract,
  mapping/unsupported cases and fail-closed rules.
- [adapter.js](adapter.js): pure adapter, exact decimal converter and deterministic
  reference/revision helpers. Its only import is the unchanged Stage 1 engine.
- [synthetic fixtures](../../test/fixtures/checkpointAdapter.js) and
  [adapter tests](../../test/checkpointAdapter.test.js): example callers and
  independent expected financial ledgers. No JSON/file/owner-data entry point.

The existing Stage 1 CONTRACT/INTEGRATION documents describe the previously
accepted foundation. They remain unchanged. This document and ADAPTER describe
the separately authorized 2A addition, not production integration or activation.

Manual review steps (synthetic only), from `budget-planner`:

```sh
node --import ./test/register.mjs --test test/checkpointAdapter.test.js
npm test
npm run test:cli
npm run lint
npm run build
git diff --check 6b61c8a HEAD
```

Windows PowerShell 5.1 uses `npm.cmd` in place of `npm`; the Node command is
unchanged and uses no OS filesystem path as an ESM URL. The existing CI matrix
runs Node 22.23.3 on Windows/PowerShell 5.1 and Linux/bash. No CI workflow or
CLI security assertion/negative control was changed.

Do not supply actual records, backups or statements. `synthetic:true` is an
explicit caller constraint, not a privacy detector. The manifest is intentionally
detailed synthetic provenance, not a safe anonymous export for real finances.
No app behavior changes: no new screen, file reader, storage, logging, repair,
checkpoint activation, backup format, recurrence generator or future-year UI.

## Independent financial reference (minor units)

These expectations were established by hand before comparing adapter output;
they are hardcoded independently of the calculation implementation in tests.

| State/activity | C | C2 | S | S2 | Tax reserve | Total bank cash |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Opening | 200000 | 50000 | 300000 | 10000 | 120000 | 560000 |
| Income +100000 to C | 300000 | 50000 | 300000 | 10000 | 120000 | 660000 |
| Contribution 10000 C→S/Tax | 290000 | 50000 | 310000 | 10000 | 130000 | 660000 |
| Funding withdrawal 60000 S/Tax→C | 350000 | 50000 | 250000 | 10000 | 70000 | 660000 |
| Actual Jan 2 bill 60000 from C | 290000 | 50000 | 250000 | 10000 | 70000 | 600000 |
| Neutral S→S2 transfer 2000 | 290000 | 50000 | 248000 | 12000 | 70000 | 600000 |
| Forecast contribution 15000 (projected only) | 275000 | 50000 | 263000 | 12000 | 85000 | 600000 |

Emergency=150000 and Other(S2)=5000 throughout. Confirmed unallocated S=28000,
S2=7000; the forecast contribution does not change unallocated. S2 is inactive
but nonzero, so it remains an asset. Confirmed spending is only the Jan bill
60000; contributions/withdrawals/neutral transfers do not become expenses.
December begins at T=Dec 30 and is a partial month. A direct savings-paid bill
is separately tested with one bank debit and one matching reserve release;
allocation/release/reallocation tests move no bank cash.

Another independent reference: plan 10000, explicitly full settled manual posting
9800, produces C=190200/S=309800/Tax=129800 from opening. Both tracks are equal,
only one economic event exists, plan variance=200, no remaining obligation.
Both raw records, their dates/flags/IDs and decision evidence remain available.

## Coverage and validation record

43 new adapter cases cover exact money/line precedence, immutable original
IDs/keys/snapshots/revisions/starts/audits/Last Entry, explicit bank confirmation,
zero plans, consumed intent lifecycle, repeated occurrences 2026–2028, original
cadence, year/DST/leap/off-grid dates, cutover/opening/carry, saved future override,
all four bank transfer directions, direct savings bill, allocations, funding,
DISTINCT/REPRESENTATIVE, unsupported/invalid references, source/alias conflicts,
complete blocked inventories, 10,001-member refusal and runtime effect tripwires.
The 25 orphan/22 newer/two bill fixture includes 14 unvalidated entries, 22 broken
historical account references and 11 candidate edges, without matching, repairing,
deleting, certifying or replaying any of them into the forward baseline.

Exploratory adapter run: 35 pass / 1 fail / 0 skipped. A malformed-money test
fixture tried constructing a synthetic expected amount before invoking the
adapter. Supplying that test's literal expected minor-unit assertion fixed the
fixture; no financial/security guard or negative test was removed/weakened.
Subsequent 40-case run: 40 pass / 0 fail / 0 skipped, before the final two cases.
The first 163-case full run then had 162 pass / 1 fail / 0 skipped: a new
manifest assertion assumed canonical event array order chose the representative.
It now checks the exact explicit original primary reference instead; the adapter
already reported that reference correctly. No calculation/identity rule changed.
Final exact-head suite counts and Windows/Linux CI links are recorded in the
draft PR after final validation. Prior accepted Stage 1 evidence is not reused
as proof of this adapter.

Final local Linux / Node v24.19.0 validation of the delivered code:

| Suite/check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Full regression/checkpoint/adapter | 164 | 0 | 0 |
| Of those: new adapter tests | 43 | 0 | 0 |
| CLI/security (all guards and negative controls unchanged) | 10 | 0 | 0 |

Lint and production build PASS; staged diff/unchanged baseline boundary checks
are required before commit. Existing Browserslist update advisory and npm
upgrade notices only. Exact-head Node 22.23.3 Windows/Linux CI evidence belongs
in the draft PR; local Node 24 results do not establish Windows/Node 22 support.

No browser/PWA/IndexedDB/migration/backup/real-data/activation testing was run or
claimed for this phase. These are not implemented here; browser/storage
acceptance is a separately authorized 2B–E responsibility.

## Limitations and independent Architect gates

1. Review exact identity/evidence semantics, particularly scheduled-origin full
   fulfilment and immutable consumed membership. Confirm compatibility with the
   unchanged Stage 1 API; no reduced retry input may bypass its guards.
2. Evidence is a synthetic caller assertion, not authenticated bank proof. Equal
   date/amount/route is only a candidate; no automatic fulfilment/merging/deletion.
   Cross-date/composite economic overlap without link/movement evidence cannot
   be inferred reliably. Two unequal unlinked facts may still require future
   owner reconciliation; this adapter cannot certify their independence.
3. Money numbers have a deliberately small safe bound; strings are preferred.
   Existing normalization damage cannot be reconstructed. Posting amount/evidence
   assertions must establish the interpreted value, especially an apparent zero.
4. Chequing/savings and supported two-decimal single currencies only. Material
   credit/cash/other accounts, unknown classification, negatives/refunds/reversals,
   partial/split fulfilment, generic corrections and cross-account reserve moves
   block. Colliding adjustment IDs block instead of being rekeyed.
5. A checkpoint does not fix broken current bucket links. Legacy snapshot
   exceptions remain visible, but forward broken associations block. No live
   source/bucket/account/Property Taxes corrections were implemented.
6. The supplied member set is bounded and explicit, not proof that a source
   recurrence/real-world ledger is complete. No hidden display filters, omitted
   invalid future routing, truncation or forecast failure downgrade. Stage 1's
   whole-result blocking and quadratic candidate-work characteristics remain.
   The conservative 10000 total-dated-member cap also counts legacy/consumed
   records. This is not a production-scale performance certification.
7. Deep-frozen copies and content tokens provide deterministic in-memory
   provenance. They are not a hostile-object sandbox or persisted concurrency
   protocol. Raw data are never written; detailed outputs must stay synthetic.
8. Stage 2B needs separate approval for durable schema/versioning, atomic whole-
   dataset import/reset/export, old-reader/writer barriers, evidence consent,
   concurrent content guards and rollback; 2C–E must integrate all consumers and
   verify synthetic browser/PWA/recovery before any separately approved private
   owner-local verification. No application is wired to these results.

Stop at the separate draft PR for independent Architect and owner review.
Passing tests authorizes no merge/deployment, real-data access, activation,
Stage 2B–E, Phase 1 M3 acceptance or Continuous Planner Phase 2.
