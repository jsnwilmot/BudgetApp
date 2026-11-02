# Manual Test Checklist

Use this checklist after visual, documentation, PWA, or release-note changes.

## App Load

- [ ] App loads locally with `npm.cmd run dev`.
- [ ] Production preview loads after `npm.cmd run build` and `npm.cmd run preview`.
- [ ] `/BudgetApp/` path works in production preview.
- [ ] Splash screen appears after app refresh.
- [ ] Splash screen fades out when the app is ready.
- [ ] Dashboard loads after the splash screen.

## Updates And Navigation

- [ ] What's New popup appears when `APP_VERSION` changes.
- [ ] What's New popup does not reappear after dismissal for the same version.
- [ ] Main navigation opens Dashboard, Planner, Transactions, Reports, Manage, Settings, and Help.
- [ ] Manage opens Scheduled Items, Accounts, Savings Buckets, Budgets, and Categories.
- [ ] No chatbot launcher, widget, panel, or chatbot navigation item appears.
- [ ] Saved local data remains after refresh.
- [ ] Two missing-account planned rows named `Property Taxes` and `Property taxes` produce one Dashboard alert.
- [ ] Missing-account alert copy includes the transaction description, date, and amount when available.
- [ ] Assign account opens the affected source scheduled item when it is available.
- [ ] Scheduled income shows a Deposited to account field.
- [ ] Scheduled expenses and debts show a Paid from account field.
- [ ] Main Chequing is selected by default when an item has no saved account.
- [ ] Saving a scheduled item account updates its generated transaction and removes its missing-account alert.
- [ ] Scheduled transfers retain their existing savings bucket and transfer behavior.
- [ ] Older saved scheduled items without `accountId` load and can be assigned an account.
- [ ] JSON backup export/import preserves scheduled item `accountId` without changing record IDs.
- [ ] Dismissing a missing-account alert still works.
- [ ] Dismissed non-danger alerts stay dismissed after refresh.
- [ ] Danger alerts remain visible and cannot be dismissed.
- [ ] Unrelated Dashboard alerts still navigate and dismiss normally.
- [ ] PWA update banner and status message stack without overlap.

## Core Workflows

- [ ] Existing IndexedDB data loads without migration errors or data reset.
- [ ] Splash screen does not block app access.
- [ ] What's New popup appears for the current app version when unseen.
- [ ] Payday workflow works: add income, regular bills, misc expenses, misc payments, and savings transfers, then compare Dashboard, Planner, and Reports totals.
- [ ] Planner grid cells do not show Last Entry checkboxes or labels.
- [ ] Edit Planner Cell shows Mark as last entry directly below Mark as validated.
- [ ] Saving one Planner cell with Mark as last entry checked highlights that amount cell.
- [ ] Saving a different Planner cell with Mark as last entry checked clears the previous highlight.
- [ ] Unchecking Mark as last entry on the marked cell and saving leaves all Planner cells unmarked.
- [ ] Closing Edit Planner Cell without saving does not change the existing Last Entry marker.
- [ ] Planner Last Entry remains selected after refresh, navigation away from Planner, and reopening the PWA if practical.
- [ ] Planner Last Entry does not change validation, amount values, account balances, budgets, reports, recurrence, transactions, or planner sorting.
- [ ] Multiple misc expense rows in the same pay period can be added, edited, deleted, and reflected immediately in totals.
- [ ] Multiple misc payment rows in the same pay period can be added, edited, deleted, and reflected immediately in totals.
- [ ] Add transaction-related activity works by adding a supported source record, such as a manual adjustment or transfer, and confirming it appears in Transactions.
- [ ] Budgets still calculate used, remaining, near-budget, and over-budget states.
- [ ] Reports still open and charts render.
- [ ] Data Health loads.
- [ ] Data Health reports the currently loaded IndexedDB data and does not show stale full-app localStorage data.
- [ ] Data Health shows collection counts.
- [ ] Run Health Check button works without changing data.
- [ ] Existing healthy data shows no serious errors.
- [ ] Transfer counts appear.
- [ ] Savings bucket adjustment counts appear.
- [ ] Reports still open after running Data Health.
- [ ] App still loads after refresh.
- [ ] Add income and confirm Reports income changes.
- [ ] Add expense and confirm Reports expense and category totals change.
- [ ] Manual account adjustment income/expense activity appears in report summary totals.
- [ ] Add transfer and confirm Reports transfer totals change without inflating income or expenses.
- [ ] Add savings transfer or bucket-linked transfer and confirm savings movement updates.
- [ ] Savings Buckets shows Current Projected Buckets, Current Validated Buckets, Final Projected Buckets, Current Savings Account Balance, and Current Savings vs Buckets Difference.
- [ ] Scheduled transfer to a savings bucket appears in the future bucket projection.
- [ ] Unvalidated current-period planner transfer increases Current Projected bucket balance but not Current Validated bucket balance.
- [ ] Validating that planner transfer updates Current Validated bucket balance.
- [ ] Reports Bucket Balances chart uses current projected bucket balances.
- [ ] Reports Bucket Balances table balance does not equal the starting amount when current movement exists.
- [ ] Pay Period view planned transfer appears under Reports Planned To Savings.
- [ ] Validated planner transfer appears under Reports Validated Planner Transfers.
- [ ] Manual transfer into savings appears under Reports Transfer Records In.
- [ ] Manual transfer from savings appears under Reports Transfer Records Out.
- [ ] Bucket adjustment appears in Reports Bucket Adjustments or Net Savings Movement.
- [ ] Reports Net Savings Movement reflects validated planner transfers plus manual transfer records and bucket adjustments.
- [ ] Reports Savings Movement no longer shows an empty state when planned, validated, manual, or adjustment activity exists.
- [ ] Month view includes all matching transfer activity in the month.
- [ ] Pay Period view includes only the selected pay period's transfer activity.
- [ ] Savings Buckets and Reports show consistent current projected bucket balances.
- [ ] Validated planner transfer appears as read-only Bucket Activity.
- [ ] Manual transfer record appears in Bucket Activity with Edit/Delete actions.
- [ ] Matching validated planner transfer and manual `to_savings_bucket` transfer shows a duplicate warning and does not crash or lose data.
- [ ] Future planned transfer after today's current pay period affects Final Projected only.
- [ ] Transfer from savings bucket subtracts from current projected and current validated when inside the current cutoff and validated for the validated balance.
- [ ] Savings vs bucket difference labels clearly distinguish current difference from Final Projection Difference.
- [ ] Known sample values show Income 2000, Expenses 100, Transfers 300, and Savings Movement 300 when entered in the same report period.
- [ ] Add budget target and confirm Reports budget status matches Budgets.
- [ ] Switch report period or month and confirm totals update.
- [ ] Check Reports empty state after Factory Reset to Empty App if practical.
- [ ] Backup export still downloads JSON.
- [ ] Backup JSON includes `appName`, `exportVersion`, `schemaVersion`, `exportedAt`, `source`, `basePath`, and `data`.
- [ ] Backup JSON includes `transfers`, `savingsBucketAdjustments`, `plannerEntries`, `settings`, and `budgets`.
- [ ] Backup JSON preserves `appMetadata.plannerLastEntryMarker` when a Planner Last Entry cell is selected.
- [ ] Backup import preview still opens for a valid backup.
- [ ] Backup import shows warnings for older backups where applicable.
- [ ] Backup import requires confirmation before replacing local data.
- [ ] Settings still shows app version, data version, last backup, and backup status.

## Responsive Layout

- [ ] App is usable at 375px wide mobile layout.
- [ ] App is usable at 414px wide mobile layout.
- [ ] App is usable at tablet width.
- [ ] App is usable at desktop width.
- [ ] Installed PWA window layout is usable if practical to test.
- [ ] Dashboard cards stack cleanly on mobile.
- [ ] Transactions display readable stacked cards on mobile.
- [ ] Budgets display readable stacked cards on mobile.
- [ ] Add/edit transaction-related source records work on mobile.
- [ ] Pay Period Planner fits mobile with only intentional internal scrolling.
- [ ] Reports open on mobile without chart overflow.
- [ ] Settings/Data Management fits mobile.
- [ ] Import preview and overwrite confirmation fit mobile.
- [ ] Data Health issue lists wrap correctly on mobile.
- [ ] Run Health Check works on mobile.
- [ ] Export Backup works on mobile.
- [ ] Release Notes modal fits mobile.
- [ ] No unexpected full-page horizontal scrolling appears.

## PWA And Deployment

- [ ] PWA build outputs `manifest.webmanifest`.
- [ ] PWA build outputs `sw.js`.
- [ ] PWA icons are present in `dist/icons`.
- [ ] FinPath manifest name and theme color are present.
- [ ] GitHub Pages workflow still uploads `budget-planner/dist`.
- [ ] GitHub Pages base path remains `/BudgetApp/`.

## Final Web/PWA Release Test

- [ ] Existing data loads.
- [ ] Export a fresh backup before release testing.
- [ ] Run Health Check and review warnings/errors.
- [ ] Dashboard totals look correct.
- [ ] Planner totals look correct.
- [ ] Reports totals look correct.
- [ ] Transfers appear separately from income and spending.
- [ ] Savings Movement looks correct.
- [ ] Budgets match Reports for the same month.
- [ ] Data Management opens.
- [ ] Import preview opens and waits for confirmation.
- [ ] Desktop browser loads `http://127.0.0.1:4173/BudgetApp/` from production preview.
- [ ] Refreshing `/BudgetApp/` reloads the app shell.
- [ ] Mobile width preview loads Dashboard, Planner, Reports, Settings, and Help.
- [ ] Installed PWA/window test is completed if practical.
- [ ] Splash screen appears briefly and fades out.
- [ ] What's New popup appears for `2.0.0-web-final` when unseen.
- [ ] PWA update prompt still offers Refresh App when a service worker update is available.
- [ ] Export Backup downloads JSON before deploy testing.
- [ ] Import Backup shows preview and does not overwrite until confirmed.
- [ ] Data Health recheck works without changing records.
- [ ] Dashboard, Planner, and Reports open after refresh.
- [ ] No unexpected full-page horizontal scrolling appears.
- [ ] Built script, stylesheet, manifest, and icon paths use `/BudgetApp/`.
- [ ] GitHub Pages live site works after deployment.

## Final Commands

```powershell
cd budget-planner
npm.cmd run lint
npm.cmd run build
cd ..
git diff --check
```

## Continuous Planner Phase 1 — pending manual review

Use a separate browser profile with synthetic fixtures. Export first; never replace a real dataset for testing. The automated fixture evidence is in `continuous-planner-phase1.md`; the checks below have not been manually marked PASS.

- [ ] Import `test/fixtures/current-backup.json`; verify saved salary value, original source, IDs, notes and marker.
- [ ] Confirm a planned amount with actual override unchecked. Change schedule amount, frequency, name, account and end date. Reopen the saved cell: original amount/classification remain; untouched cells follow the new schedule.
- [ ] Repeat with actual override and line items. Deactivate and then delete the schedule; saved cells still contribute to balances and remain editable.
- [ ] Set a saved cell as Last Entry, shorten projection range, refresh, export and restore. The off-screen marker remains in metadata. Clearing that cell explicitly clears its marker.
- [ ] Compare December/January and leap-day account and bucket totals with the reference ledger. Correct an old amount and confirm later balances change by exactly that difference.
- [ ] Add transfers within chequing, within savings and between types. Check aggregate conservation, separate planner/manual identities, read-only derived activity and matching duplicate warnings.
- [ ] Try changing anchor/frequency with dated records: save is blocked with a plain error and original settings remain. Reset settings: cadence remains. In an empty planner, initial cadence setup is allowed.
- [ ] Import `test/fixtures/legacy-backup.json`. Preserve IDs and values on export/restore. For legacy entries without original amount/source details, Data Health reports uncertainty; compare a statement before correcting.
- [ ] Check Planner, Dashboard, Reports, CSV/print, account comparisons and buckets under their documented finite scopes. No year controls or rolling forecast should appear.
- [ ] Check desktop, 375px mobile, offline PWA refresh and a second tab. Record review findings before accepting Phase 1.

### F1/F2 historical warning remediation

- [ ] With a legacy saved cell missing its amount/snapshot provenance, edit only notes, marker or validation in each standard/line-item editor. Amber/Data Health warnings must remain after save, refresh and backup restore.
- [ ] Checking a reconciliation confirmation without a backup/statement reference must block save. Providing text alone without a checkbox must not resolve a warning.
- [ ] Confirm only the amount against the original evidence: source warning remains. Confirm only the source: unresolved amount warning remains. Restore the downloaded backup in a fresh isolated profile and verify flags and evidence references.
- [ ] Reassign a legacy source from Chequing to Savings before a snapshot exists. Its current classification must remain provisional, including after source edits/deletion and automatic snapshot enrichment.
- [ ] Treat older snapshots with no provenance as uncertain. Use the per-entry source correction form with a trustworthy original evidence reference if the displayed classification is wrong; do not acknowledge the current fallback as original merely because it exists.
- [ ] Follow the sample reconciliation procedure in `continuous-planner-phase1.md`. Use real original evidence only with owner review; synthetic fixtures do not verify anyone's financial facts.


### F4 per-entry source correction

- [ ] With a validated 2026 cell provisionally assigned to B and current/later salary still B, correct only the old cell to A using the separate form. Require the entry-only confirmation and reference.
- [ ] Change unsaved amount/notes/validation in the normal editor, then submit only the source form. None of those unsaved changes may be applied. Stored amounts, validated state, line-item IDs, key/date, marker and other entries remain intact.
- [ ] Test historical type/account/category/bucket corrections, including archived reference IDs. Unknown/deleted IDs, missing required accounts, stale revisions and blank references must block writes with an error.
- [ ] Check current recurring schedules remain B. Confirm the correction affects only the selected occurrence and subsequent cumulative balances, with no extra transfer/adjustment records.
- [ ] Export and restore into a fresh isolated profile: corrected snapshot, source evidence, append-only audit and independent amount warning survive. Test a second correction, routine note save and source edit: prior correction audit remains.
- [ ] On mobile, expand the correction details and check controls, confirmation and error text remain usable. Check offline reopen of the corrected entry where supported. OS-installed PWA acceptance remains separate.


### Increment A — historical integrity and read-only summaries

- [ ] Import the synthetic `legacy-integrity.js` fixture through the browser harness. A previously attested snapshot with missing account/category/bucket must appear as a genuine exception, separate from legacy source metadata notices.
- [ ] Check required blank income/expense accounts, optional null category/bucket, archived references, and deleted source with/without a usable snapshot. A valid retained snapshot must not become an orphan error simply because its schedule was removed.
- [ ] Filter by stable source ID (including IDs containing `__`) and inclusive saved dates. View exceptions, observed source cohorts and paginated metadata-only rows. Compare every financial store before/after viewing, recheck, filtering and refresh: no writes.
- [ ] Verify source changes across years remain distinct observed classifications; no cohort/date filter verifies anything. All validated flags and original values remain intact.
- [ ] Try source confirmation from a tab opened before another tab changes its source or removes its account reference. Entire save must reject, including pending notes/marker changes. Reopen/refresh to inspect the current issue.
- [ ] Correct a broken classification using F4 with evidence; existing audit and independent amount warning remain. Conflicting keys/dates/IDs or malformed prior audits are reported, never implicitly normalized by confirmation/correction.
- [ ] Export/restore in a clean synthetic profile and compare IDs, values, validation, marker and F4 audit. Check mobile layout, keyboard controls, bounded tables and existing offline reopen behavior.
- [ ] Private M3 real-data reconciliation and independent Architect/owner acceptance remain separate; never attach private backups/statements/screenshots to GitHub.


### Issue #11 preventative account configuration

- [ ] In a fresh synthetic profile, create buckets with zero, one and several savings accounts. Zero requires creating an account, one selects its actual ID, multiple require a choice; inactive/non-savings accounts are excluded.
- [ ] Import a legacy bucket with a missing link. Projection/editor show the exact missing link read-only; open/cancel changes nothing and ordinary notes edits preserve the link. Inactive links remain visible.
- [ ] Delete/deactivate/change the selected savings account in another synthetic tab before saving a new bucket. Save must fail without creating a bucket or changing any financial store.
- [ ] Open the same bucket in two tabs; save a note in one, then save in the stale tab. Expect rejection and retained latest record. Deleted bucket and repeated create submissions must also reject.
- [ ] New scheduled defaults use a sole active chequing account regardless of name; multiple/none require a choice. Existing blank/missing IDs do not change on open. Invalid new/changed account references must reject atomically with history untouched.
- [ ] Export/import into a clean profile; compare existing buckets, entries, amounts, validations, IDs, Last Entry and audits. Check mobile selector and all previous offline/ledger tests.
- [ ] Review `issue11-account-reconciliation.md` before proposing any private repair. No real backup changes, mapping execution or grouped historical correction is authorized here.
