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

## F1/F2 architecture remediation revision — 2026-11-02

Review basis: PR review `5735975676` at `1dd1e2f4ce2d49596883f96e95865920305fe11c`, and the matching findings in Issue #4. The initial Architect disposition was changes requested. This revision implements corrections for F1/F2; independent re-review and owner acceptance remain pending. Earlier evidence above describes the initial candidate; this section supersedes its warning/reconciliation behavior and browser NOT RUN statements only for checks explicitly executed below.

### F1 — routine saves cannot certify a historical amount

Removed unconditional `historicalAmountNeedsReview: false` assignments from **both** editor handlers. Storage now reads the existing cell in its write transaction and applies a shared history policy before saving. A stale payload with a false flag, a newly supplied fallback planned value, a note/marker save, validation toggle or line-item edit cannot remove an existing warning. Source enrichment uses the same policy and cannot clear it either.

The editor provides a separate, unchecked amount confirmation. Resolving it requires deliberate acknowledgement plus a nonblank original backup/statement reference. The reference and acknowledgement time are preserved in `historicalReview.amount`. Merely entering reference text does not acknowledge anything. Source confirmation does not resolve the amount warning. Existing amounts, notes, line items and stable keys are retained; the shared policy only governs provenance and review metadata.

### F2 — an inferred current source is not verified historical classification

Data Health checks source provenance for saved cells even when `plannedAmount` and the current scheduled item exist. The grid exposes an amber warning and accessible provisional-source context, and the editor shows the account/type/category/bucket details being proposed for review.

Optional metadata:

- `historicalSourceNeedsReview`: persistent unresolved classification warning.
- `scheduledItemSnapshotProvenance`: `captured-at-entry-save` for a genuinely new cell captured when saved; `unverified-current-source` for inferred legacy/source-enrichment snapshots; `user-reconciled` only after explicit source acknowledgement with a reference.
- `historicalReview.source`: the evidence reference and acknowledgement timestamp, separate from amount reconciliation.

Snapshots from the earlier review build without provenance are conservatively uncertain: that build could have captured an already changed source. Presence of a snapshot, a false flag or incoming audit/provenance fields in a routine save cannot certify an existing legacy cell. A `user-reconciled` source also requires a stored reference. Ordinary snapshot enrichment never creates evidence. A borrowed snapshot is not a new capture.

The fallback still participates in existing projection math, but is explicitly **provisional**. Neither code nor a user checkbox reconstructs a lost historical fact. If displayed source details are wrong, do not confirm them. The F4 revision below now supplies a separate per-entry correction form; it replaces the initial full-backup-restoration workaround. No recurrence engine, on-view migration or Transactions ledger is added.

### Concrete synthetic reconciliation procedure

The existing `test/fixtures/current-backup.json` is a **synthetic** original-backup example. Its `salary__2026-12-30` cell has planned amount **1000 CAD** and a source snapshot with ID `salary`, type `income`, account `c` (Chequing), and no category/bucket. Its original line-item fixture is described by `history-ledger.js`; these are test facts, not a user's statement.

1. Export the current dataset and keep that file unchanged. Use an isolated browser profile to compare the original backup's cell key, amount and source IDs with the flagged entry.
2. Reproduce F2 by removing provenance/snapshot from a saved 2026 cell and reassigning the current salary source to `s` (Savings). Current-source inference must remain flagged; a routine save or an inferred snapshot of `s` is not proof of the original account `c`.
3. If historical source details differ, open that saved cell and expand **Correct source for this saved entry**. Choose type `income`, account `c` (Chequing), and no category/bucket, matching the original evidence. Do not edit the current recurring schedule or import an old dataset to perform this correction.
4. Reference `current-backup.json / salary__2026-12-30 / original account c, income, no category or bucket`, explicitly confirm the correction for this entry only, and save. Source uncertainty resolves and the audit records previous B versus corrected A classification; any unresolved amount warning remains. If displayed details already match, the separate existing source-acknowledgement control can confirm them without a correction.
5. Separately compare the effective confirmed amount to the original record. If correction is required, enter the supported actual/line-item correction, then explicitly confirm the amount with its original backup/statement reference. An actual correction does not prove a previously unknown planned snapshot; preserve the original files and distinguish the two.
6. Export, restore in a fresh profile, and check flags, evidence references, marker, stable IDs and balances. If original evidence is missing or ambiguous, leave the applicable confirmation unchecked. Acknowledgements record the user's review, not automated authentication of financial facts.

### Automated and isolated-browser evidence

- The unit/storage suite adds F1/F2 tests for note/marker/validation-only payloads, both standard and line-item values, fallback planned amounts, evidence-required rollback, independent amount/source acknowledgement, legacy reassigned account/type/category provenance, inferred and pre-provenance snapshots, source edit/delete, backup round trip and submitted provenance/audit without acknowledgement. Earlier ledger/ID/backup/transaction regressions remain in the suite. Final exact-head test count, lint, build, diff and Node 22 CI results are recorded in the PR.
- Browser harness: `npm run test:browser`, against a local **production preview**, Chromium `154.0.8037.57`, Playwright Core, Linux, clock `2026-12-30T12:00:00Z`, fresh isolated contexts at 1440×1000 and 375×812. Real browser IndexedDB, file upload/download, service worker and offline mode are used, not fake IndexedDB. Results and downloads/screenshots are written to a new `/tmp/finpath-phase1-browser-*` directory per run; no user browser/profile or production financial data is accessed.
- Completed browser assertions: standard and line-item note/marker saves preserve both warnings; Data Health exposes both uncertainties; blank-reference confirmation blocks save; explicit amount acknowledgement leaves source warning; explicit source acknowledgement leaves unresolved amount warning; actual JSON export and fresh-profile restore preserve flags, evidence and marker; navigation/refresh do not write planner entries; service-worker-controlled offline reload and new-page reopen retain entries; reassigned source remains provisional; restored original source is reconciled only with evidence; mobile review controls are visible with no page overflow; UI schedule edit/deactivate/delete retains entry keys, notes, snapshots and unresolved warnings. Final run also imports the legacy JSON fixture in a fresh profile and checks that viewing does not silently add a source snapshot.
- Cross-screen browser spot checks use the December reference ledger: Planner projected/validated chequing **1620**, projected savings **645**; Dashboard next-period chequing/savings **1620/645**; current projected/validated buckets **645/645**. Reports for Dec 30 show income **1000** and expenses **240**, comprising bill 230 plus manual fee 10. Transfers are separate movements, not part of that expense card. These are finite-scope spot checks, not complete CP-36–42 acceptance.

### Remaining gate and limitations

F1/F2 are corrected in implementation and regression coverage, subject to independent Architect re-review. OS-installed/standalone PWA installation and launch cannot be established by a headless browser: only service-worker offline reload/reopen is asserted. Broader multi-tab source editing, all mobile/PWA devices, all import/repair workflows and comprehensive cross-screen acceptance remain pending. The harness does not authenticate real owner statements or reconcile real financial records. F3 is unchanged: Transactions uses current source-oriented recurrence, not a historical validated occurrence ledger; deactivated/deleted planner history may not appear there. Phase 4 needs an explicit integration resolution/acceptance decision. Phase 1 remains unaccepted; do not merge/deploy or start Phase 2.

Changed files for this revision: `plannerHistory.js`, `db.js`, `migrations.js`, `App.jsx`, `CellEditor.jsx`, `Planner.jsx`; targeted unit/storage and browser tests; dev-only Playwright Core dependency and browser script; README, Help, review release notes, this evidence report and the manual checklist. ExportVersion 1, schema/data version 2, IndexedDB version 9, financial source IDs and accounting keys remain unchanged. Additive metadata is retained through the existing extensible import/export normalization; no on-view migration is introduced.

## F4 revision — safe per-entry historical source correction

Review basis: [Architect re-review 5736324875](https://github.com/jsnwilmot/BudgetApp/pull/9#pullrequestreview-5736324875) at `9d732c9dbf9b7f1a46da622ae7e6d4bd60222e81`. That review resolved F1/F2 warning fixes in implementation but identified the inability to correct an inferred historical B snapshot safely. This revision implements F4 on the same Phase 1 branch. Independent final review and owner acceptance remain pending.

**Current procedure replaces the old restore workaround:** compare original evidence without importing it, open the affected saved Planner cell, expand **Correct source for this saved entry**, choose historical type/account/category/bucket, enter an original backup/statement reference, explicitly confirm this entry-only correction and save. No current schedule change, reset or full backup restore is needed. The separate form submits no amounts, line items, notes, validation, dates or marker changes, including unsaved edits in the normal amount form. It is available for saved entries with or without an existing source snapshot, including previously reconciled entries needing an intentional correction.

The dedicated storage command reads the latest saved cell plus existing reference/source records in one transaction, validates consent/evidence, accepts only the four explicit classification fields and rejects stale revisions. Unknown account/category/bucket IDs or a missing account for income/expense/debt/general reject the command. Historical inactive/archived records remain valid references. The command does not create replacement IDs or recover deleted reference records; unresolved evidence/reference gaps remain owner review limitations. Transfers keep existing FinPath aggregate chequing-to-savings semantics, with an optional known bucket.

Only the selected saved entry is written. Its key/source ID, dates, planned/actual amounts, useActual, line items/IDs, notes, created timestamp and validated state remain intact. The marker and every recurring schedule, account, category, bucket, manual transfer/adjustment and other saved entry are untouched. Classification changes intentionally recalculate that occurrence and dependent cumulative account/bucket/report balances. Original amount uncertainty is retained independently; this command never acknowledges an amount.

Correction and evidence commit atomically. Optional `historicalSourceCorrections` is an append-only entry audit of previous and corrected type/account/category/bucket, previous provenance, reference and correction timestamp. `historicalReview.source`, source provenance and the corrected snapshot are updated in the same write. Stale ordinary cell saves and routine source enrichment preserve the latest corrected snapshot and audit. Repeating an obsolete correction is rejected rather than overwriting a later one; a newly reviewed correction appends a second record. Missing/deleted saved entries cannot be resurrected by correction. A failed final IndexedDB write leaves classification, evidence and audit unchanged.

### F4 fixture evidence and validation

- Regression tests reproduce A → B reassignment with an existing provisional B snapshot, then correct the single old cell back to A. Original/current/later B source records and unrelated entries remain byte-for-byte equivalent after normal normalization. December validated chequing/savings change from **620/1645** to **1620/645**. The difference carries forward by exactly **+1000/-1000**, while later B occurrences stay in B. Browser January validated chequing is **1290**, reflecting the later B income and original expense/transfer activity.
- Additional tests cover historical type and bucket corrections, archived categories, missing IDs/required account, protected-field injection, explicit consent/reference requirements, stale/deleted entry rejection, repeated correction audits, stale routine-save audit preservation, source enrichment, injected final-write rollback, legacy cells without a snapshot, actual/line-item/validation preservation and JSON export/restore. Final exact-head unit count, lint, build, diff and Node 22 CI results are recorded in the PR.
- The isolated production-browser harness exercises the new correction without restoring the dataset or editing its live B schedule. It attempts missing confirmation/evidence and an unknown account, verifies no writes, then corrects B → A with evidence. It checks that unsaved normal-editor edits do not leak into the correction, all financial/identity/marker fields and other entries/schedules remain unchanged, December/January balances recalculate, and audit/evidence/amount warnings survive real JSON export and fresh-profile restoration. The correction form is also checked at 375px. Existing F1/F2, reference-ledger, refresh/offline and legacy-import assertions remain enabled. Final results are in the PR; temporary browser artifacts are generated per run by `npm run test:browser`.

Compatibility: no required field, store or envelope changes. ExportVersion **1**, data/schema version **2**, IndexedDB version **9** and the review-build app version remain unchanged. The additive correction audit survives the existing spread-based normalization and JSON backup shape. No view, refresh or date change writes corrections. To reverse an incorrect classification, use another evidence-backed per-entry correction; the audit preserves both versions without reverting unrelated later records.

Remaining limits: a user's reference/confirmation is not authenticated financial evidence; real legacy reconciliation and missing original reference records still require owner review. OS-installed standalone PWA launch, wider multi-tab/device acceptance and comprehensive cross-screen acceptance remain pending. F3 historical Transactions integration is unchanged and remains a Phase 4 decision. No Phase 2, merge, deployment or acceptance is included.

Revision files: new `HistoricalSourceCorrection.jsx`, `plannerHistory.js`, transactional `db.js`, `App.jsx`/`CellEditor.jsx` wiring, Data Health guidance, targeted source-correction unit/storage tests and the expanded browser harness; README, Help, review release notes, manual checklist and this evidence report.

## Increment A — approved integrity diagnostics and read-only reconciliation

Authorization: Issue #10, **Increment A only**, and Architect conditions in issue comment `6579324821`. Baseline `0fd93b8f0c7b9ae7ecc03a52704c6233c250077a`. Increment B grouped attestation and Increment C batch correction remain excluded. This revision does not accept Phase 1 or authorize merge/deployment/Phase 2.

### Shared read-only integrity model

`historicalIntegrity.js` separates four independent facts: original saved validation, provenance metadata, current reference/identity integrity, and missing/invalid/unresolved amount evidence. The existing `getHistoricalReviewState` API remains available through `plannerHistory.js` for provenance/amount flags; it is not a complete reference-integrity assertion. `inspectHistoricalEntry` and `summarizeHistoricalEntries` provide the composite state. A source acknowledgement can remain recorded while its current references are broken; `sourceVerified` is false for those entries. Diagnostics do not rewrite stored provenance/flags.

Checks include required income/expense/debt/general account links; known optional category/bucket links; bucket alias conflicts and provided linked-account references; snapshot type/source identity; canonical key/date/source consistency; malformed audit containers; missing or invalid saved amounts in the active actual/planned/line-item mode. Optional null metadata/links are absence, not automatically corruption. Finite saved zero/correction values remain values, not missing data. Existing inactive/archived IDs are valid. A deleted schedule with a usable snapshot remains history. An orphan/unusable source is surfaced as unresolved classification/representation; no source/period is fabricated and no existing calculation is changed.

Canonical identity is parsed at the final `__`, preserving source IDs that themselves contain delimiters. Missing redundant legacy fields can be read from the key without writing them; conflicting stored fields are exceptions. Ordinary cell saves cannot rewrite existing IDs/dates to hide those conflicts. F4 may repair classification but cannot rewrite a conflicting snapshot source ID or discard malformed prior audit containers. Such records remain unresolved for separate owner review.

### Single-entry verification guard

Source confirmation now captures the entry revision and displayed source signature when the editor opens. The database re-reads the saved entry, live source and account/category/bucket stores in one readwrite transaction. Changed/deleted entries or source classification reject stale confirmation. Current and proposed integrity are both checked: invalid links, key/date/source conflicts and malformed audit containers cannot be normalized away by the submitted payload. Missing references introduced after the editor opened also block the save. No partial amount/note/marker update or new evidence is persisted on failure. The actual resolved stored source takes precedence over an untrusted incoming snapshot payload.

F4 shares the same final integrity assertion, while still allowing evidence-backed account/category/bucket/type corrections for valid identities. Amount review remains independent, and the latest correction audit/snapshot stays protected during ordinary saves and source enrichment. There is no verification on import, view, filter, refresh or date change.

### Read-only UX

Settings → Data Management contains a **Legacy reconciliation — read-only** inventory over canonical saved entries, not only rendered Planner rows. It shows total/confirmed entries, unique reference/identity problem entries and issue counts, unresolved amount entries, source metadata pending, acknowledgements with valid links, and orphan/unusable sources. Counts may overlap.

Exception rows precede collapsible observed cohorts and metadata-only rows. Cohorts are keyed by stable source ID, observed classification and snapshot/fallback origin, with min/max saved dates and counts. A source ID/inclusive saved date filter changes only the view; unknown dates remain visible for integrity review. Reversed date windows show an error and do not apply date filtering. Tables are paginated at 20 rows. No selection or verification/correction command exists in this summary.

Pure legacy provenance uncertainty is an informational Data Health notice, not a financial error or loss of original validation. Genuine historical reference/identity problems are actionable errors; amount evidence remains separate. Existing validated labels and stored values are retained. A balance notice on Dashboard, Planner, Reports and Savings Buckets explains unresolved classifications or potentially unrepresented activity without altering totals. Known limitations must be reconciled before relying on affected balances.

### Tests and evidence

Synthetic `legacy-integrity.js` contains an account-reassigned source across 2025/2026, source IDs with `__`, duplicate display labels, a removed source with a retained reliable snapshot, an orphan without a snapshot, an already-attested missing account, missing category/bucket, required null account, valid archived references, saved overrides/line-item IDs, amount and date conflicts, Last Entry and prior F4 history. No private financial data is used.

New regression cases exercise:

- Historical reference failures independent of prior capture/attestation; valid archived references and optional null links.
- Key/date/source consistency, delimiter-bearing IDs, orphans and previously removed legitimate sources.
- Pure summaries without input, audit or financial-calculation mutation; independent amount/provenance status and decade-long retained history.
- Atomic rejection of invalid/stale acknowledgement, including removed reference and changed live fallback, with no financial/identity/audit/marker changes.
- Valid single-entry acknowledgement and JSON round trip; original marker, IDs, saved financial values and audits retained. Optional undefined fields follow existing JSON omission semantics.
- Malformed non-null audits and identity conflicts cannot be overwritten by a confirmation/correction payload; missing optional null metadata remains a legacy review case.
- Existing F4 correction can repair links with evidence and retain prior audit while identity conflicts remain unresolved.

The expanded browser harness retains all prior ledger/F1/F2/F4/offline assertions and adds raw-history exceptions, read-only source/date filters/recheck/refresh with full financial-store comparisons, mobile summary layout, JSON restore, a paginated ten-year metadata-only cohort, and same-origin concurrent source edit/reference deletion rejection. Test-only synthetic reference deletion simulates a linked record removed after a form opened; no real profile is accessed. Final exact SHA, counts, local commands and CI/browser results are recorded in PR #9.

### Safety and limits

No financial formula, source cadence, period generation, storage migration, required field, audit format, export envelope, or version is changed. ExportVersion 1, schema/data version 2, IndexedDB version 9 and review app version remain unchanged. Existing provenance, validated state, financial field values, source/record/line IDs, notes, markers, corrections and export aliases are preserved by diagnostic reads. Acknowledgement/correction remain explicit single-entry operations with evidence.

The inventory does not recover missing original facts, create missing reference IDs, repair conflicting identities/audits, or expose a new history navigation engine. Use existing F4 correction where the saved cell is available; inaccessible orphan/identity/reference cases remain listed and unresolved. Previously imported malformed values or schema normalization are not silently repaired. Existing financial fallback calculations remain visible with limitations rather than being changed to conceal uncertainty. Owner-private M3 reconciliation and independent final review remain required. Owner-reported earlier M1/M2 acceptance does not independently verify these new changes. Grouped attestation, bulk correction, F3 Transactions history completeness and Continuous Planner Phase 2 are not implemented.


## Issue #11 — prevention and historical repair design

The approved preventative revision removes the literal demo account link from bucket creation, adds real savings account selection with zero/one/multiple-account behavior, transaction-time reference checks and stale bucket-editor rejection. Existing bucket associations are shown read-only, including missing/inactive links; ordinary edits preserve their stored values. Scheduled defaults no longer depend on a “Main Chequing” display name and never replace existing blank IDs on opening; new/changed links are checked against current active accounts. Financial formulas, history, versions and backup shapes are unchanged.

[Account configuration findings and historical reconciliation proposal](issue11-account-reconciliation.md) separates the confirmed creation bug from unproven legacy causes. It specifies local exact-field manifests/evidence, separate configuration versus historical approvals, synthetic before/after account/bucket/report impact, orphan handling, audit preservation, concurrency, atomicity and recovery. This stage implements no mapping or historical group repair and uses no private data. Final SHA and separate unit/browser/lint/build/Node 22 CI results are in PR #9. Independent review, owner-private M3 and final acceptance remain open.

## Issue #12 — standalone offline comparison utility

Owner authorization is code/synthetic tests only, following the Architect's conditional approval of the read-only assessment. `tools/reconcile/cli.mjs` reads an explicitly supplied regular local JSON copy in read-only mode; pure `analysis.mjs` compares exact saved minor-unit values and traces the existing Planner representation on an in-memory clone. No application source, importer, database or financial formula changes. No output files, raw rows, private identifiers/dates/amounts, network/telemetry, repair operations or app startup are included.

The [tool guide](../tools/reconcile/README.md) documents aggregate counts, separate bill expenses, source/row/orphan differences, candidate ambiguity, manual overlap risks, unsupported shapes/precision, resource limits, safe errors, security boundaries and Windows PowerShell instructions. It explicitly requires independent Architect/security review before separate owner authorization for real-data analysis. Source selection is explicit, not name inference. Synthetic fixture sizes 25/22/2 do not predetermine real matches.

Regression tests and separate CLI process acceptance verify frozen input, exact money, malformed/reference/currency cases, aliases, source/sibling/malformed representation, dates/overlaps, safe errors, no private sentinel output, unchanged input bytes/mtime/files, and denied write/network calls under test tripwires. Node 22 CI includes `npm run test:cli`. Synthetic-only shared-calculator illustrations show why representing both overlapping cohorts can change savings/bucket effects while leaving actual bill expenses separate; the utility has no real-data scenario or writeback mode. Final counts/SHA and lint/build/CI results are in PR #9. No owner backup or actual financial input has been accessed; M3, real-data-run approval and final acceptance remain pending.


### Windows CLI security-test compatibility correction

At `fa303c1`, owner testing on Windows PowerShell 5.1 / Node 22.23.3 exposed `ERR_UNSUPPORTED_ESM_URL_SCHEME` before all eight CLI test assertions. The harness now retains a `file:` URL for the guard preload instead of passing its Windows drive path to `--import`; the CLI executable path remains native. The shared guard value also covers negative controls. No security protections/assertions, application behavior, financial calculation or backup handling changes. Node 22.23.3 CI now includes Windows PowerShell and Linux for all regression/CLI/lint/build checks. Final exact-head evidence and owner-local retest limits are in PR #9 and the tool guide. No owner backup has been accessed or analyzed.


### Independent file-rejection tests and Windows symlink permission skip

Owner-local testing at `5d44ce7` reported 8 tests / 7 pass / 1 fail because Windows denied synthetic link creation with `EPERM` before the combined test reached link rejection or oversize assertions. Directory, symlink and oversize now run as three independent security tests (10 CLI tests total). A narrow catch around `symlink` creation alone skips only Windows `EPERM`/`EACCES`, with a diagnostic explicitly stating link rejection was not exercised; all other errors propagate. Actual CLI checks, negative controls and security guards are preserved. Final evidence separates pass/fail/skipped counts for local and Linux/Windows Node 22 CI in PR #9. No production application, utility reader, financial logic, database or backup behavior changed, and no real financial input was accessed.
