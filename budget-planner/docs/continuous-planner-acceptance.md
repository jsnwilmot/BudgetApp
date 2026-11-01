# Continuous Planner Acceptance Matrix

**Status:** Planned test cases only. None are marked PASS. Do not claim this feature is implemented.
**Parent:** [#3](https://github.com/jsnwilmot/BudgetApp/issues/3). **Execution phases:** [#4](https://github.com/jsnwilmot/BudgetApp/issues/4), [#5](https://github.com/jsnwilmot/BudgetApp/issues/5), [#6](https://github.com/jsnwilmot/BudgetApp/issues/6), [#7](https://github.com/jsnwilmot/BudgetApp/issues/7).
**Acceptance target:** Full **2027** selectable on **December 1, 2026** without losing or changing validated **2026** data.

## Test-fixture requirements

Create isolated **synthetic** IndexedDB states and versioned JSON backup fixtures. Never test by overwriting a user's actual financial dataset. At minimum:

- A biweekly anchor of `2026-06-03`, 12-month range, two accounts, one bucket, recurring salary, property tax transfer, monthly bill, debt/expense, manually validated expenses, line items, marker, transfer records and adjustments.
- A 3-month range on that anchor, explicitly opened at `2026-11-30`, `2026-12-01`, and `2027-01-01` (inject a test clock).
- 7-day, 14-day, 28-day and 30-day pay cadences and January-boundary pay periods.
- Old backup with planner entries lacking newer optional fields; current-format backup with `appMetadata.plannerLastEntryMarker`.
- 2028 leap-day, late-month monthly bill, yearly recurrence, inactive and end-dated schedule, corrected past entry, an empty-state dataset, and at least 10 years of synthetic history.
- A reference ledger specifying opening balances, expected per-period income/expenses/transfers, projected/validated account balances, bucket balance and year-end carry-forward. Compare to it numerically, not by screenshots alone.

## Phase 1: Historical data and calculation safety

| ID | Test and acceptance criterion | Priority |
| --- | --- | --- |
| CP-01 | Import/load current data; preserve all saved `plannerEntries` keys, record IDs, dates and source collections. | Critical |
| CP-02 | Confirm a period's amount with `useActual=true`; changing future schedule amount does not rewrite it. | Critical |
| CP-03 | Confirm a period with `validated=true`, `useActual=false`; changing future schedule amount does not change that confirmed amount. | Critical |
| CP-04 | Saved notes, line items and planned amount snapshots survive a year switch, refresh and backup round trip. | Critical |
| CP-05 | Inactivating, ending or archiving a schedule does not erase its already confirmed historical occurrences. | Critical |
| CP-06 | Opening/viewing another year cannot write, migrate or delete planner history and does not rekey occurrences. | Critical |
| CP-07 | Last Entry marker remains stored and identifiable while its year is off-screen; it only clears under an explicit legitimate invalidation rule. | Critical |
| CP-08 | Historical correction intentionally updates dependent later totals, without modifying unrelated records. | Critical |
| CP-09 | Savings bucket starting amount is applied exactly once; prior confirmed transfer, adjustment, and manual record activity carries forward. | Critical |
| CP-10 | Chequing/savings starting balances applied exactly once. Projected and validated reference totals match at Dec/Jan and later years. | Critical |
| CP-11 | Planner-derived transfers and explicit manual transfers do not accidentally become duplicate stored records; related display counts reconcile. | Critical |
| CP-12 | Changing the anchor/frequency must not silently strand or rewrite validated history; test the selected safe policy, warnings and rollback. | Critical |
| CP-13 | Legacy backup imports; round-trip export preserves IDs, dates, marker and financial values with no unexpected format change. | Critical |

## Phase 2: Time and recurrence

| ID | Test and acceptance criterion | Priority |
| --- | --- | --- |
| CP-14 | On Dec 1, 2026, the complete 2027 calendar year is selectable from a 2026 anchor with a **3-month** range. Normal Dashboard forecast remains 3 months. | Critical |
| CP-15 | Repeat CP-14 with 6-, 12-, 18- and 24-month projection settings; no artificial Jan 1 rollover required. | Critical |
| CP-16 | On Nov 30/Dec 1/Jan 1 using an injected local clock, next-year navigation remains available, and no data resets or auto-write occur. | Critical |
| CP-17 | Every start-date pay period belongs to exactly one year even if the pay period spans Dec 31/Jan 1. Exact cadence preserved. | Critical |
| CP-18 | Weekly, biweekly, 28-day and 30-day scheduled periods maintain expected dates across years with no duplicates/gaps. | High |
| CP-19 | Monthly bill due-day/previous-vs-same-period placement remains stable, including month-end, Feb 29 and leap year 2028. | High |
| CP-20 | Yearly, one-off, ended and inactive recurring items follow their configured dates; no occurrences beyond their end date. | High |
| CP-21 | Account and bucket projections on Jan 2027 open from 2026 accumulated activity, never reapply or omit the initial balance. | Critical |
| CP-22 | A year selected outside the normal forecast generates that year on demand with correct cumulative opening totals and without modifying saved records. | Critical |
| CP-23 | Old historical year can be reopened after advancing multiple years; saved amount and classification remain accurate. | Critical |
| CP-24 | Normal forecast moves with the current pay period, independently from anchor and selected view year. | High |
| CP-25 | An empty/partial dataset and a past-first period are handled without a misleading 'current' summary or runtime error. | High |
| CP-26 | Projection is responsive over 10+ years of synthetic history; no entire-lifetime table is mounted, and no excessive persistent record growth occurs. | High |

## Phase 3: User experience and accessibility

| ID | Test and acceptance criterion | Priority |
| --- | --- | --- |
| CP-27 | Previous Year, year selector, Next Year and Today controls all work with mouse, keyboard and touch. | High |
| CP-28 | Current period opens by default. Today returns from historical/future year to correct period and scroll position. | High |
| CP-29 | Switching 2026 to 2027 to 2026 preserves edited entries, validation, marker, annotations and correct account display. | Critical |
| CP-30 | Year labels in the picker and date headers clearly distinguish December 2026 and January 2027; no duplicate columns. | High |
| CP-31 | Full-year view beyond 3-month default has explanatory copy and does not claim to change configured normal forecast. | High |
| CP-32 | 375px, 414px, tablet and desktop layouts have accessible controls, readable grid and only intentional internal scrolling. | High |
| CP-33 | Opening a historical cell preserves existing edit, validation, line-item and note behaviours, with accurate planned-versus-actual labeling. | Critical |
| CP-34 | Focus order, ARIA labels, selected-year state and Today action are accessible to keyboard and screen-reader users. | High |
| CP-35 | Browser/PWA refresh, offline reopen and local-day change do not reset, duplicate or obscure the selected financial data. | High |

## Phase 4: Integrated reconciliation and release gates

| ID | Test and acceptance criterion | Priority |
| --- | --- | --- |
| CP-36 | Planner, Dashboard, Reports and Transactions agree for synthetic totals before/after the year boundary, allowing documented filter scopes. | Critical |
| CP-37 | Savings Buckets current projected, validated and final totals agree with the reference ledger and Reports bucket views. | Critical |
| CP-38 | CSV/print exports show correctly selected time windows and years and preserve distinct planned/validated totals. | High |
| CP-39 | Alerts and current-period summary remain current-date based while viewing an old or future year; no false warnings from a truncated view. | High |
| CP-40 | Restore current and legacy backups in a fresh isolated browser, reopen years, inspect Last Entry and verify ledger reconciliation. | Critical |
| CP-41 | Existing maintenance workflows (settings, categories, scheduled items, account assignment, manual transfers/adjustments, repairs, Data Health) pass regression. | Critical |
| CP-42 | No production financial data is written or migrated solely by crossing midnight, viewing a year, or updating a forecast window. | Critical |
| CP-43 | Lint, automated regression tests, build and git diff check succeed on the exact candidate commit; record SHA and output evidence. | Critical |
| CP-44 | Help, README, release notes, and the manual test checklist correctly document implemented behavior, limitations and recovery steps. | High |
| CP-45 | Independent Architect review and explicit owner approval recorded; no unresolved Critical failures or unreviewed schema/backup changes. | Critical |

## Phase-by-phase evidence template

For each implementation PR, record:

- **Phase / PR / branch / exact commit:** [fill after work]
- **Scope actually changed:** [files and behavior]
- **Test fixtures & clock dates:** [precise simulated dates / baseline amounts]
- **Test cases:** [CP IDs with PASS/FAIL/NOT RUN; never mark inferred PASS]
- **Cross-screen reconciliation:** [expected vs actual amounts, differences]
- **Data integrity verification:** [before/after IDs/keys/counts and restore result]
- **Automated checks:** [command, result, commit, environment]
- **Manual/browser/PWA checks:** [tested device/viewport and result]
- **Risks / blockers / deviations:** [with mitigation]
- **Architect review decision:** [pending/approved/changes requested]
- **Owner approval:** [pending/approved]

## Release blocking rules

- Every **Critical** case must PASS, including both old and new backup integrity, account and bucket reconciliation, validated historical amounts and marker retention.
- High-priority cases should PASS or have an explicitly accepted and user-visible non-financial limitation.
- Unexpected writes, mismatched balances, missing validated history, restored data loss, or unsupported year navigation block release.
- Existing data is never reset to correct a failed test. Use isolated fixtures and fix the implementation.
- No implementation PR is auto-merged or deployed by this plan.
