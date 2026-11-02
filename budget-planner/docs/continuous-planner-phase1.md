# Continuous Planner Phase 1 — historical data and balance integrity

Status: draft implementation for [#4](https://github.com/jsnwilmot/BudgetApp/issues/4), parent [#3](https://github.com/jsnwilmot/BudgetApp/issues/3). Architect review and owner acceptance are **pending**. No merge, deployment or Phase 2 work is included.

Branch: `codex/phase-1-history-balance-integrity`. Base: approved planning commit `b6a87eef7f40d40d3cb7a482d69c7545f63e59ab`. Exact tested candidate SHA and final command results are recorded in the PR description. The plan and acceptance matrix remain the approved originals; their later-phase cases are not claimed complete.

## Accounting and history decisions

- The original anchor/frequency define cadence. There is no January reset, rekey, rolling horizon or year selector. Settings changes to anchor/frequency are rejected while scheduled items, saved cells, manual adjustments, bucket adjustments or transfer records exist. Settings reset retains cadence. Empty setup can choose a cadence. Backup import remains an explicit replacement/preview operation.
- Every explicitly saved cell retains `plannedAmount`, actual override, validation, line items, notes and the original `scheduledItemId__payPeriodDate` key. Saved planned snapshots are used even when actual override is unchecked; untouched forecasts use the current recurrence. A saved snapshot is still projected until validated, not implicitly realized.
- Optional `scheduledItemSnapshot` retains original name/type/account/category/bucket and recurrence details. Cell saves attach it; source edits/deactivation/deletion attach it to existing cells if missing. No empty forecast cells are materialized. Saved cells can reconstruct a deleted source row, and per-cell classification drives account/bucket/report math and the cell editor. The grid's row header follows the current source name/type while saved cell details retain their original classification.
- Snapshot enrichment and source mutation commit in one IndexedDB transaction. Current stored cells are read inside the transaction, so newer corrections are not overwritten and cleared cells are not resurrected. Transaction/clone failures roll back both sides. App state reloads entries after commit. Broader multi-tab editing synchronization remains a manual review item.
- Only explicit user corrections change saved amounts. Changes to dated historical activity intentionally recalculate all later balances. Account/bucket baseline edits remain explicit corrections to the common opening balance, not new yearly baselines.
- A valid canonical marker pointing to a retained saved cell remains eligible even if source/period is off-screen or deleted. Visible editable cells remain eligible under the earlier rule. Invalid/malformed references and explicitly cleared marked cells can clear the marker. Source deletion clears only an unsaved marker without retained history.

## Cumulative balance and date policy

One opening balance is applied per account/bucket, followed by sorted dated activity. `calculationPeriods` contains the original finite forecast plus retained activity dates through its last period; the rendered `payPeriods` grid remains unchanged and bounded. Older saved dates and adjustments are accumulated before the first visible value. Sparse retained dates never participate in recurrence placement, so an imported/manual date cannot shift a scheduled payment to another key. Normal schedule placement continues to use the original generated cadence and existing monthly same/previous-period rule.

- Projected account balances: baseline + effective scheduled income/expense/transfer + signed account adjustments + both account legs of manual transfers. Savings also includes bucket adjustments under the existing FinPath rule.
- Validated account balances: baseline + validated saved cells + validated manual transfers + explicit adjustments. A validated savings row now makes that distinction inspectable alongside validated chequing.
- Bucket projection: baseline + effective planner transfers for that cell's original bucket + bucket adjustments + manual bucket inflows minus outflows. Validated bucket projection includes only validated planner/manual transfer amounts, plus adjustments.
- `payPeriodDate` is the accounting date, not the record's display/transaction `date`. Current comparisons include activity with accounting date **<= local today**, within the finite calculation horizon. A future baseline period does not cause a future balance to appear current. Savings account comparison uses the same calculation chronology, including retained dates outside the current cadence. A fixed test clock covers the day before/on an activity, January and leap day.
- Transfers apply both debit and credit legs independently. Transfers between two chequing or two savings accounts therefore net to zero in aggregate. Planner-derived activity is read-only and never inserted into `transfers`. Separate manual records remain separate movements even if amount/date/bucket match; the existing Savings Buckets warning flags matches to validated planner activity. Reports deduplicate repeated **source identity**, not equal-valued distinct financial records.

A later window engine must calculate full chronology before selecting a year. Slicing input recurrence history and restarting from the baseline would still be incorrect; this PR does not introduce that Phase 2 engine.

## Reference ledger and before/after evidence

Synthetic fixture: anchor `2026-06-03`, biweekly, CAD; chequing 1,000; savings and linked tax bucket 500. Checkpoints are deliberately saved dated occurrences, independent of current recurrence. Each checkpoint has salary 1,000, property-tax transfer 100 and bill line items 230, all validated. December also has fee -10, bucket adjustment +5, validated manual transfer 40. An extra Jan 27 salary override 50 is unvalidated.

| Accounting checkpoint | Projected chequing | Validated chequing | Projected/validated savings | Projected/validated bucket |
| --- | ---: | ---: | ---: | ---: |
| 2026-12-30 | 1,620 | 1,620 | 645 | 645 |
| 2027-01-13 | 2,290 | 2,290 | 745 | 745 |
| 2028-02-29 | 3,010 | 2,960 | 845 | 845 |

For each confirmed checkpoint: chequing increases by `1000 - 230 - 100 = 670`; December's fee/manual transfer subtract another 50. Savings/bucket each gain 100 per checkpoint plus December's 45. Changing the December bill from 230 to 250 reduces every later chequing balance by exactly 20, with unrelated cells unchanged. Tests assert every listed amount with zero difference. The 12-month variant covers December/January; the 24-month variant includes leap day, and the 3-month variant tests retained off-screen history/markers. Month-end/yearly placement and 7/14/28/30-day cadence use separate active schedule tests. Ten years of retained saved history are tested with an unchanged 3-month rendered grid.

`balanceRegressions.test.js` was run against the untouched base using `git archive` into a separate temporary directory, with only the new test and Node loader copied in:

| Regression | Original base observed | Candidate expected/observed |
| --- | --- | --- |
| Confirmed planned amount after recurrence doubles | 2,000 | 1,000 |
| Inactive confirmed income, opening 1,000 | 1,000 | 2,000 |
| Internal chequing transfer, aggregate opening 1,200 | 1,130 | 1,200 |
| Off-screen saved marker eligibility | false | true |

Base existing suite: 18/18 PASS. All four new regressions FAIL on the base and PASS on this branch. Full candidate automated suite: 43/43 PASS before final commit validation; final exact-SHA results are in the PR. Tests also exercise legacy/current JSON import/export, actual/line-item overrides, source edit/delete/reload, failed-write rollback and a newer correction/cleared-cell race using isolated fake IndexedDB. No real browser financial dataset is used.

## Acceptance coverage

PASS below means the specified **automated fixture assertions**, not browser/release acceptance. Manual refresh, browser restore and cross-screen visual checks remain pending in `manual-test-checklist.md`.

| Cases | Automated evidence | Status |
| --- | --- | --- |
| CP-01 | Immutable fixture source JSON during calculations, stable entry keys/IDs during storage reload and backup normalization | PASS (fixtures) |
| CP-02, CP-03 | Actual/line items and saved planned confirmations survive revised recurrence; original-base failure reproduced | PASS (fixtures) |
| CP-04 | Notes, line-item IDs, planned values, validation and metadata survive JSON/IndexedDB round trips | PASS (fixtures); browser refresh pending |
| CP-05 | Inactive, ended and deleted sources retain saved occurrence amounts/classification | PASS (fixtures) |
| CP-06 | Forecast shortening/sliced bucket view leaves source JSON identical, rendered grid bounded | PASS (fixtures); actual year switching belongs to later phases |
| CP-07 | Saved off-screen marker remains eligible, canonical invalid references rejected, metadata round trip | PASS (fixtures); browser cleanup workflow pending |
| CP-08 | Historical correction changes subsequent totals by exact difference | PASS (fixtures) |
| CP-09, CP-10 | Independent Dec/Jan/leap ledger, older retained activity, pre-anchor empty current state, validated/projected distinction | PASS (fixtures) |
| CP-11 | No derived transfer writes, same-type transfer conservation, source identity dedupe and separate manual records | PASS (fixtures); warning UI pending |
| CP-12 | Guard rejects anchor/frequency mutation with dated records; empty setup/range changes allowed; settings reset retains cadence by implementation | PASS (guard); settings UI/reset manual check pending |
| CP-13 | Fixed legacy v1/current v2 JSON fixtures, exportVersion 1, normalized repeat round trips and IndexedDB restore | PASS (fixtures); real browser restore pending |
| CP-43 | Tests/lint/build/diff check on exact candidate | See PR validation record |
| CP-44 | README, Help, review release notes, manual checklist and this evidence document updated | Implemented; manual review pending |
| CP-45 | Independent Architect and owner acceptance | PENDING |
| CP-14–42 (other than supporting regression probes above) | Rolling/year engine, navigation, full integration/performance/PWA release signoff | NOT RUN / later-phase gate |

## Consumer inventory

| Consumer | Existing scope and Phase 1 treatment |
| --- | --- |
| `App.jsx` | Builds shared finite planner, exports derived rows/periods, validates marker. Marker now consults retained entries; source mutation preserves snapshots transactionally. |
| `projectionLogic.js` | Schedule placement, totals, account/validated balances, Dashboard summary, CSV-oriented export rows, current period helper, bucket balances and derived transfer activity. Uses shared retained chronology; dashboard low-balance minimum stays within rendered forecast. |
| `Planner.jsx` | Grid, summary, attention list, click/edit cell, markers. Grid remains finite; editor receives original per-cell source classification. No year controls. |
| `Dashboard.jsx` | Summary and chart from shared balances and finite payPeriods; no new time-window behavior. |
| `SavingsBuckets.jsx` | Current/final balances, account comparison, adjustments, transfer forms, derived activity and duplicate warnings. Comparison uses calculation chronology; activity remains read-only. |
| `reportLogic.js` / `Reports.jsx` | Monthly/pay-period totals, savings movement, bucket charts, CSV/print. Retains original per-cell classification; bucket projection shares the same logic. Content-equal manual movements remain distinct. Filter options remain finite. |
| `alertLogic.js` | Low-balance alerts iterate shared forecast values; no separate annual baseline. Other alerts use transaction source data. No year-navigation/current-date alert redesign. |
| `transactionLogic.js` / `Transactions.jsx` | Separate source-oriented transactions: manual adjustments, bucket adjustments, manual transfers and planned source recurrence, not a second planner balance ledger. Current scheduled transaction forecast is not an immutable historical occurrence register. No derived planner transfers are persisted. |
| `transferLogic.js`, account/bucket adjustment helpers and forms | Pay-period selectors use finite dates; stable manual IDs/accounting dates preserved. Transfers retain separate source identity. |
| `backupService.js` / `migrations.js` / `db.js` | Portable source collections/entries/metadata plus derived export aliases. Optional snapshot fields survive existing spread-based normalization. Missing historic facts produce Data Health warnings; no opening/viewing migration. |
| `Settings.jsx` | Range remains independent of saved records. Cadence mutation rejected with dated data; reset retains cadence. |
| `desktop-migration-plan.md` | Portable versioned records remain intact; optional snapshots can map to a JSON field or normalized history table later. No desktop storage work. |

## Compatibility, recovery and remaining risks

`exportVersion` remains 1, data/schema version remains 2 and DB version remains 9. No store, required field or import envelope changes. Review-build app version is `2.0.1-phase1-review`; legacy accepted data is normalized using the existing import path. Original exported timestamps in an imported file are not rewritten in that file; a new export gets a new export timestamp by existing design. Stable source IDs, dates, entry keys, line-item IDs and financial fields survive normalization/restore. Optional snapshots and review flags are additive and preserved by the current spread-based normalizers.

Recovery: keep the original exported backup before review testing. No automatic on-open migration is added. Source mutation enriches saved cells in the same atomic transaction and never deletes entries. To roll back the review application, retain/export the candidate's data and restore the original backup using the normal import preview/confirmation flow in an isolated profile. Older application code may preserve but will not honor snapshots in calculations; restoring an old binary alone does not fix its old calculation bugs. There is no automatic destructive rollback.

Remaining review risks:

1. Legacy entries without a saved planned confirmation, or sources already deleted without snapshots, cannot yield provably exact original history. Data Health warns. Before explicit source mutation, available prior planned values are captured; fallback recurrence amounts remain marked for review. Compare original backups/statements and explicitly correct these entries. No claim is made that lost information was recovered.
2. This phase preserves saved cells only. Unsaved forecast history is not an actual ledger and can recalculate. Snapshot storage grows with explicitly saved cells, never with every viewed period.
3. Manual and planner movements have no authoritative linking ID. Equal amounts may be separate real transfers. Existing matching warnings remain advisory; the user must reconcile an accidentally double-entered movement. No heuristic deletes or suppresses financial records.
4. Account totals retain existing aggregate account-type semantics, and bucket adjustments retain the existing aggregate savings effect. A bucket allocation is not automatically a separate bank movement. Missing account/source details still require Data Health review. Changing starting amounts intentionally changes the common baseline.
5. The normal forecast is still anchored and finite. Next-year availability, current-period rolling forecasts, year controls, lifetime checkpoint performance and full browser/PWA/cross-screen acceptance remain Phase 2–4 work. A window must not compute balances from a sliced input ledger.
6. Browser/mobile/offline/PWA, concurrent source edits across tabs and real browser restore have not been manually exercised. Fake IndexedDB verifies source/cell transaction safety but does not replace those checks. No independent Architect approval or owner acceptance is claimed.
7. Production build reports stale Browserslist compatibility data. Build and PWA generation succeed; updating unrelated dependency metadata is outside this phase.

Manual review steps are the dedicated Phase 1 section in `manual-test-checklist.md`. PR checks run tests, lint and production build with Node 22 and have read-only repository permissions; the existing deployment workflow is unchanged and triggers only on main/manual dispatch. This branch does not merge or deploy.
