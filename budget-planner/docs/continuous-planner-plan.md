# FinPath Continuous Planner and Year Navigation

**Status:** Approved product direction; **planning only**, implementation not started.
**Parent tracking issue:** [#3](https://github.com/jsnwilmot/BudgetApp/issues/3).
**Target user experience:** From **December 1, 2026**, the full **2027** calendar-year Planner is selectable and calculated on demand. This is a product acceptance target, not a claim that it is already deployed.
**Working rule:** No deployment, merging or data migration without review and explicit release approval.

## 1. Problem and approved product decision

Today's pay-period Planner is finite. The current code generates periods from `settings.payPeriodAnchorDate` through `addMonths(anchor, projectionMonths)`, where `projectionMonths` is 3, 6, 12, 18 or 24. It does **not** extend when today's date advances. The current view cannot navigate independently to a different year. Simply moving the anchor can hide saved entries and corrupt account/bucket carry-forward assumptions. See `src/logic/dateLogic.js`, `src/logic/projectionLogic.js`, `src/pages/Planner.jsx`, `src/pages/Settings.jsx`, and `src/logic/plannerLastEntryMarker.js`.

**Approved direction:**
- The Planner has no calendar-year expiry and needs no annual reset.
- Maintain the original anchor as the immutable cadence reference unless the user deliberately runs an explicitly reviewed schedule-change workflow.
- Normal **projection range** controls how far ahead the Dashboard/standard forecast looks, **not** which historical years can be viewed.
- **Year navigation** selects a full calendar year of pay periods on demand, independent of projection range.
- The entire next year is available by December 1 of the preceding year, even with a three-month forecast setting. It may be available earlier through manual year navigation.
- Existing saved entries and correctly confirmed amounts remain accessible, including across multiple years.
- Planned, validated and actual amounts remain distinct, and account/bucket balances carry forward correctly.

## 2. Defined user experience

### Planner toolbar

Place above the existing grid, without replacing the current edit/validation workflow:

`[ Previous Year ]  [ 2026 v ]  [ Next Year ]    [ Today ]`

- The year picker selects calendar year, based on **pay-period start date**.
- The year view shows all pay periods whose **start date** lies within that calendar year. A period crossing December 31 belongs to its start year and appears once, not in both years.
- Show four-digit years in year navigation and in date context/headers. Maintain the existing compact table with internal horizontal scrolling.
- `Today` switches to the year containing the current pay period and scrolls to that column.
- By default, opening Planner focuses the current pay period; switching away/back during the session can preserve the selected year and scroll position. Explicit `Today` always overrides.
- Viewing a year older than the saved anchor must show relevant imported/historical records if present, or a clear empty state, not fabricated periods.
- In an historical view, label projected/unvalidated values as such. Do not present past forecasts as settled actual balances.
- Allow full-year preview of a future year, with clear labels when that goes beyond the ordinary configured forecast.
- For offline PWA use, determine availability from the device's local calendar date when opening/resuming the app. No server cron or background write is required.

### Separate projection range from selected year

| Setting/action | Meaning |
| --- | --- |
| `payPeriodAnchorDate` | Reference date for stable recurring pay-period cadence and saved entry keys |
| `payFrequencyDays` | Spacing of pay periods: existing 7, 14, 28, or 30 |
| `projectionMonths` | Normal forward-looking forecast from the current pay period: existing 3, 6, 12, 18, or 24 |
| Selected calendar year | Full-year Planner view; independent of normal forecast; computed only when requested |
| December 1 availability | Next full calendar year can be selected no later than December 1, including when forecast range is shorter |
| Previous/next year | Readable navigation, not a data rollover or reset |

## 3. Data-integrity contract

1. **Historical identity:** Keep every original `scheduledItemId__payPeriodDate` entry key, stable source ID, record date, notes, line items and validation indicator. Do not regenerate keys by restarting the anchor on January 1.
2. **Confirmed history:** An existing validated cell must display the confirmed amount that was accepted at the time, even after its underlying recurring item amount/frequency changes. Investigate the current `useActual=false` path, where `getEffectiveAmount` can otherwise read a changed scheduled amount. Design a backward-compatible snapshot/effective-date mechanism before implementation. Existing `plannedAmount` on saved entries may help but is not a full history store for untouched cells.
3. **Other history:** Explicit user edits and corrections persist; ordinary unvalidated forecasts may recalculate and must be labeled as projections. Do not silently convert any forecast into an actual/confirmed entry.
4. **Inactive/deleted recurrence:** Historical saved activity remains inspectable even if the scheduled item is now inactive, archived, deleted or has an `endDate`. Distinguish source removal from past occurrence removal.
5. **Last Entry:** The marker remains valid if it points to an existing legitimate cell anywhere in retained history. Current `isPlannerLastEntryMarkerValid` checks only the current `plannerData.payPeriods`, so changing the visible year must **not** trigger clearing an off-screen marker. Clear only if its actual underlying source/entry is invalid under an explicitly defined rule.
6. **Carry-forward:** Derive each year's opening projected and validated balances from a consistent initial baseline and all relevant dated activity before that year's first visible pay period. Never restart from the original account/bucket balance at January 1 and never add that initial balance twice.
7. **Transfer integrity:** Preserve separate identities for scheduled planner transfers and manual transfer records; do not silently materialize derived transfers into persistent records. Apply explicit documented rules to avoid double counting and to reconcile across Reports and Savings Buckets.
8. **Historical correction:** A user-initiated correction to a past dated record can change later cumulative balances, subject to recalculation and clear status; merely viewing/navigating a year cannot change stored data.
9. **Safety/portability:** Preserve versioned JSON exports, import/restore semantics and future desktop migration. Any schema evolution requires a documented reversible or safely recoverable migration plan, old-backup fixtures and verification.
10. **Performance:** Never render a multi-year lifetime grid as one DOM table. Use bounded windows and cumulative checkpoints or incremental calculations as needed; do not sacrifice accounting correctness for speed.

### Calculation and reconciliation model (design direction, not yet implementation)

- **Source records**: accounts, scheduled items, planner entry overrides/confirmations, manual adjustments, savings bucket adjustments, transfer records.
- **Stable chronology**: generate pay-period dates from original anchor for requested windows. Recurrence placement must remain tied to the same pay period on every rebuild.
- **Actual/validated ledger**: accumulate only confirmed or otherwise explicitly realized activity according to existing FinPath rules; separate it from future planned movement.
- **Projected ledger**: start at the same trustworthy baseline, include prior actual/confirmed events and appropriate planned future occurrences, and avoid counting the same event in both forms. Document precise cutoffs for current vs future pay periods and correction behavior.
- **Window view**: obtain opening balance from chronology, then calculate and render only the requested calendar year or normal forecast. The same underlying calculation service feeds Planner, Dashboard, Reports, Savings Buckets and exports.
- Before selecting an implementation strategy, produce reference fixture balances for at least three year-boundary scenarios and audit current treatment of starting balances and validated-only movement. This is a blocking Phase 1 decision, not an assumption that current math already does it correctly.

## 4. Dates, recurrence, and edge cases

- Local calendar day semantics; inject a controllable clock into tests. Recompute the available navigation horizon after date change, tab resume and app refresh.
- December 31 / January 1 boundary, leap year 2028, February month-end, monthly due day 29/30/31, annual recurrence, explicit scheduled `endDate`.
- Weekly, 14-day, 28-day and 30-day pay schedules; 30-day is **not** automatically monthly.
- Pay periods anchored before January 1 may overlap the year boundary. Assignment belongs to start date once; do not duplicate or shift payment records.
- Monthly bill placement remains governed by the existing same/previous-pay-period rule; do not change established historical placement silently.
- Multiple accounts and bucket balances, corrections, negative balances when existing data supports them, partial or missing accounts, and legacy imported backup shapes.
- User changes projection months: affects the **normal horizon**, not historical identity or selected-year contents.
- User changes anchor/frequency: existing settings warn that periods can move. Before shipping continuous planning, determine whether to restrict this action, protect past confirmations with stable identity/effective dating, or offer a safe migration preview. Never silently rekey confirmed past entries.
- If only a finite portion of source history is available, do not invent exact historic actual balances; clearly display limitations instead of misleading precision.
- Different view years should not change the persistent `Last Entry` marker, data health, or backup contents.

## 5. Implementation phases and gates

Each phase uses an independent code PR. The next phase is blocked until the prior phase's documented review and acceptance. The planning PR itself contains **documentation only**.

| Phase | Issue | Deliverable | Completion gate |
| --- | --- | --- | --- |
| 1. History and balance safety | [#4](https://github.com/jsnwilmot/BudgetApp/issues/4) | Reference ledger, confirmed history preservation, stable period IDs, last-entry safety, tests | Reference balances and saved data/backup round trip match before progressing |
| 2. Perpetual and rolling period engine | [#5](https://github.com/jsnwilmot/BudgetApp/issues/5) | Forecast based on current period, bounded year-on-demand calculation, Dec 1 rule | 2027 full year available by Dec 1, 2026 for all projection settings; no duplicate periods or reset balances |
| 3. Year navigation and UX | [#6](https://github.com/jsnwilmot/BudgetApp/issues/6) | Toolbar, year picker, Today, table/summary integration, accessibility | Saved history and active workflows intact in desktop/mobile/PWA views |
| 4. Acceptance and release readiness | [#7](https://github.com/jsnwilmot/BudgetApp/issues/7) | Automated + manual evidence, restore testing, docs, migration/release signoff | All critical cases PASS; explicit approval before merge/deploy |

## 6. Architecture touchpoints to inspect

- `src/logic/dateLogic.js`: `generatePayPeriods` uses a finite anchor-to-months interval. Avoid date rollover bugs from native `setMonth`; test precise calendar math.
- `src/logic/projectionLogic.js`: `buildPlannerRows`, `getEffectiveAmount`, projected/validated account balance accumulation, `buildSavingsBucketProjection`.
- `src/logic/scheduledItemLogic.js`: recurring occurrence dates and per-schedule end bounds.
- `src/pages/Planner.jsx`: current-period positioning, generated grid columns, year controls and historical display.
- `src/pages/Settings.jsx` and `src/data/migrations.js`: keep the projection setting valid; review settings-change risks and compatibility.
- `src/App.jsx`: shared memoized planner data; historical marker validation; data-loading, navigation and cross-screen calculations.
- `src/logic/plannerLastEntryMarker.js`: replace *visible-period-based* cleanup with a true historical eligibility rule.
- `src/logic/reportLogic.js`, `src/logic/transactionLogic.js`, `src/logic/alertLogic.js`, `src/pages/SavingsBuckets.jsx`: date-window effects, counts, export and account/bucket consistency.
- `src/data/db.js`, `src/services/backupService.js`, `docs/desktop-migration-plan.md`: persistent data and versioned portability contract.
- `docs/manual-test-checklist.md`, `src/pages/Help.jsx`, `src/data/releaseNotes.js`, `README.md`: update when feature is actually implemented and released, not in the planning PR.

## 7. Acceptance and release control

Full checklist: [Continuous Planner Acceptance Matrix](continuous-planner-acceptance.md).

For each phase: document branch, PR, changed files, key design decisions, data-diff comparison, tests, limitations, and Architect/user review decision. Automated CI being green is necessary but not sufficient for accepting account/bucket calculations. Do not approve a release if any high-severity cross-year balance, historical record, or backup restore discrepancy is unresolved.

**Explicit non-goals:** annual reset, cloud/bank sync, server-side scheduling, writing years of empty forecast cells into IndexedDB, replacing the FinPath planner with a new budgeting system, changing finance records merely by opening a year, or extending this effort to unrelated features.
