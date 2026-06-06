# FinPath

FinPath is a local-first personal finance app for planning pay periods,
bills, savings transfers, category budgets, transactions, alerts, and reports.

Tagline: Track smarter. Save better.

Current release: `2.0.0-web-final`
Data version: `2`

## Current Status

This is the stable FinPath web/PWA release. It runs in the browser, can be
installed as a PWA in supported browsers, stores user data locally, and does not
require login, cloud sync, bank connections, or a server.

Current phase status: FinPath is stable for web/PWA daily use. Phase 2W
finalizes release labeling, documentation, backup safety reminders, deployment
notes, and post-deploy testing while keeping `/BudgetApp/` unchanged.

New installs start with clearly fictional demo data so the app can be explored
without setup. Use `Settings > Data Management` to reset back to demo data or
factory reset to an empty app.

User-facing release notes are controlled from
`src/data/releaseNotes.js`. Update `APP_VERSION` and the highlights for each
release that should show the one-time What's New popup.

## Features

- Dashboard with cash-flow summary, projection chart, and alerts.
- Missing-account alerts are deduplicated and open the affected scheduled item
  when possible so its deposit or paid-from account can be assigned.
- Planner with editable projected and actual amounts plus a current pay period summary.
- Transactions view derived from scheduled items, adjustments, and savings activity.
- Manage area for Scheduled Items, Accounts, Savings Buckets, Budgets, and Categories.
- Scheduled income, expenses, and debts support account assignment so generated
  transactions and projections use the intended account.
- Unified transfer workflow for account-to-account and savings bucket movement.
- Reports with filters, charts, trends, print view, and report CSV export.
- Settings with editable planner settings and data management tools.
- Backup, restore, repair, reset, and CSV export workflows.
- Backup reminder status and data safety guidance for browser-managed storage.
- Fictional demo dataset with scheduled items, accounts, savings buckets,
  budgets, transactions, reports, alerts, and multi-line notes.
- First-run onboarding and an in-app Help Guide.
- One-time What's New popup for user-facing updates.
- Mobile-friendly navigation, stacked mobile cards, responsive forms, and
  readable Data Management surfaces.
- PWA install support with app icons, manifest, service worker caching, and a
  simple update prompt.
- FinPath branding with approved logo assets, app icon, colors, and PWA metadata.

## Local-First Data

User data is stored locally in the browser through IndexedDB and local storage.
Export backups before clearing browser data, switching browsers, switching
devices, or updating/deploying major versions.

There is no cloud account, server database, or automatic sync in this MVP. The
planned long-term direction is a desktop app with app-managed SQLite storage for
stronger local data ownership.

## Backup And Restore

Use `Settings > Data Management`.

- `Export Backup` downloads a local JSON backup file with app metadata, app
  version, data version, settings, planner entries, accounts, scheduled items,
  categories, transfers, budgets, savings buckets, and adjustments.
- The app records the last successful backup export and recommends a new backup
  if no backup exists or the last one is older than 30 days.
- `Import Backup` previews the backup counts, then replaces current local data
  after confirmation.
- `Repair Local Data` normalizes records and fills safe missing fields without
  deleting user records.
- `Reset to Demo Data` requires typing `DEMO` and restores fictional sample
  records.
- `Factory Reset to Empty App` requires typing `DELETE`, clears user/demo
  records from this browser/device, and keeps only safe defaults needed to keep
  the app usable.

Keep backup files somewhere you control, especially before browser cleanup or
device changes. Export a backup before deploying or installing a major update.

## Data Portability

FinPath backup files are versioned JSON exports designed for web/PWA restore
and future desktop migration. Current full backups include:

- `appName`, `appVersion`, `exportVersion`, `schemaVersion`, `exportedAt`,
  `source`, and `basePath`.
- `settings`, `accounts`, `categories`, `transactions`, `scheduledItems`,
  `plannerEntries`, `manualAdjustments`, `savingsBuckets`,
  `savingsBucketAdjustments`, `transfers`, and `budgets`.
- Compatibility aliases such as `budgetTargets` for the current web app.

Exports preserve existing record IDs exactly, including account IDs, category
IDs, scheduled item IDs, savings bucket IDs, transfer IDs, budget IDs, and
planner entry keys. Import validation checks the file shape, previews record
counts, shows warnings for older or incomplete backups, and requires
confirmation before replacing local data.

Older BudgetApp backups remain supported where the data can be normalized
safely. Transfer records are included in current backups and repairs. The
GitHub Pages base path remains `/BudgetApp/`.

## Reports Data Notes

Reports use the same saved local data as Dashboard, Planner, Transactions,
Savings Buckets, Budgets, Accounts, and Unified Transfers.

- Income and expense summaries come from planner rows and derived transaction
  data.
- Transfers are shown separately so internal account movement does not inflate
  income or spending.
- Planned To Savings means scheduled planner transfers for the selected report
  period.
- Validated Planner Transfers means scheduled planner transfers whose planner
  cells are marked validated.
- Transfer Records In/Out are manually saved transfer records that move money
  into or out of savings buckets.
- Bucket Adjustments are corrections, interest, fees, or other manual bucket
  changes.
- Net Savings Movement uses validated planner transfers plus manual transfer
  records and bucket adjustments. Unvalidated planned transfers remain separate
  as planned movement.
- Reports > Bucket Balances uses the same current bucket projection data as
  Savings Buckets. Starting bucket balances are only the baseline; current
  projected balances include planner transfers, transfer records, and bucket
  adjustments through the selected report/current pay period. Current validated
  balances include validated planner activity and validated transfer records.
- Budget reporting uses the same derived transaction helper as the Budgets
  page, so category budget status should match between Budgets and Reports.

## Savings Bucket Balance Labels

Savings Buckets now separates current money from future forecast money.

- Starting bucket balance is the amount you already had assigned to that
  bucket when it was created or last corrected.
- Current projected bucket balance starts with the bucket balance, then adds
  planner transfers, transfer records, and bucket adjustments through today's
  current pay period.
- Current validated bucket balance uses the same cutoff, but only includes
  planner transfers and transfer records marked as validated. Bucket
  adjustments are included because they do not have their own validation flag.
- Final projected bucket balance includes the full projection range, including
  future planned transfers.
- Planner transfers are scheduled plans. Validated planner transfers appear as
  read-only Bucket Activity so the user can see the confirmed planner movement
  without creating hidden transfer records.
- Manual transfer records are saved one-off movements between user-owned
  accounts. They can be edited or deleted and are included separately from
  planner activity.

Do not add the same savings movement as both a validated planner transfer and
a manual transfer record unless the extra record is intended to correct the
balance. Savings Buckets shows a warning when the bucket, pay period, amount,
and direction match.

## Data Health Checks

Settings > Data Management includes a non-destructive Data Health section. It
shows record counts, detected warning/error counts, transfer reference counts,
and plain-language guidance.

Current checks include:

- Duplicate and missing stable IDs for accounts, categories, scheduled items,
  adjustments, savings buckets, transfers, and budget targets.
- Missing account, category, and savings bucket references.
- Invalid dates and timestamps on date-dependent records.
- Invalid amounts and unexpected negative amounts where the current forms
  expect positive values.
- Planner entry shape issues without rewriting planner keys.
- Budget target issues, including duplicate active targets for the same
  category.
- Transfer risks, same-account transfers, missing transfer accounts, bucket
  reference issues, and possible duplicate savings movement.

Data Health does not delete records, generate IDs, merge duplicates, rewrite
planner keys, or change account/category/bucket references automatically. These
checks are intended to make reports and future desktop migration safer.

## Install And Run

```powershell
npm.cmd install
npm.cmd run dev
```

Then open the local URL shown by Vite, usually `http://localhost:5173/`.

## Install As A PWA

Desktop browser:

1. Open the app URL.
2. Look for the install icon in the address bar.
3. Install FinPath.
4. Open it from the desktop, dock, start menu, or app launcher.

Mobile browser:

1. Open the app URL.
2. Open the browser menu.
3. Choose `Add to Home Screen` or `Install App`.
4. Open FinPath from the home screen.

Exact wording depends on browser and device. PWA data is still browser-managed,
so export backups before uninstalling the PWA, clearing site data, switching
browsers, or switching devices.

## Build

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run preview
```

The production build uses page-level lazy loading so chart-heavy and workflow
pages are split into separate assets. Run production preview after build to
verify lazy-loaded pages and PWA assets.

Basic verification before release:

```powershell
cd budget-planner
npm.cmd run lint
npm.cmd run build
cd ..
git diff --check
```

Before deploying or testing a major update, export a fresh backup from
`Settings > Data Management`. FinPath data is stored locally in the current
browser/device, and backups are the portable recovery path for future desktop
import.

## GitHub Pages Deployment

Live URL: https://jsnwilmot.github.io/BudgetApp/

- Source folder: `budget-planner`
- Build output: `budget-planner/dist`
- Deployment: GitHub Actions
- Workflow: `.github/workflows/deploy-pages.yml`

The Vite base path is configured as `/BudgetApp/` so production assets, the PWA
manifest, service worker, and icons load correctly from GitHub Pages.

FinPath uses in-app navigation instead of URL routes for individual pages.
Refreshing `https://jsnwilmot.github.io/BudgetApp/` should reload the app shell;
share the `/BudgetApp/` URL and use the app navigation for Dashboard, Planner,
Reports, Manage, Settings, and Help. If a browser or installed PWA appears stale
after deployment, refresh the app to pick up the latest service worker update.

Local deployment check:

```powershell
npm.cmd run build
npm.cmd run preview
```

Then open `http://127.0.0.1:4173/BudgetApp/` and confirm it returns HTTP 200.

Final deploy steps:

1. Export a fresh backup from `Settings > Data Management`.
2. Run `npm.cmd run lint`.
3. Run `npm.cmd run build`.
4. Run `git diff --check`.
5. Run production preview and open `/BudgetApp/`.
6. Commit and push to `main`.
7. Confirm the GitHub Pages workflow completes.
8. Open https://jsnwilmot.github.io/BudgetApp/.
9. Hard refresh or open an incognito/private window if stale cached content
   appears. Clear site data only after exporting a backup.

## Browser Support

The app is intended for current desktop and mobile browsers with IndexedDB and
modern JavaScript support, such as current Chrome, Edge, Firefox, and Safari.

Because data is browser-local, data saved in one browser profile is separate
from data saved in another browser, device, or private browsing session.

## Documentation

- [Quick Start](./QUICK_START.md)
- [Data Safety](./DATA_SAFETY.md)
- [Release Checklist](./RELEASE_CHECKLIST.md)
- [Manual Test Checklist](./docs/manual-test-checklist.md)
- [Desktop Migration Plan](./docs/desktop-migration-plan.md)

## Brand Assets

The public app uses the FinPath brand while the repository remains BudgetApp.
Approved brand assets live in `budget-planner/public/brand`:

- `finpath-logo-horizontal.png`
- `finpath-logo-stacked.png`
- `finpath-splash.png`
- `finpath-icon.png`

PWA install icons live in `budget-planner/public/icons`. Release notes and the
current user-facing app version are maintained in
`budget-planner/src/data/releaseNotes.js`; backup metadata uses the app version
from `budget-planner/src/data/migrations.js`.

FinPath uses a true flat design style with a deep navy base, teal primary
accents, mint secondary highlights, small gold accents, rounded cards, and
strong contrast. The tagline is `Track smarter. Save better.` The vendor footer
is `By Rose & Paw Digital Designs`.

The branded splash screen appears briefly while the app loads and fades out when
local app data is ready. It does not delay loading artificially.

The PWA manifest, browser metadata, favicon, and install icons use FinPath
branding. The GitHub Pages base path remains `/BudgetApp/`.

## Release Notes

### Phase 1A: Project Foundation

- Established the local React/Vite app foundation.
- Added the initial app shell and local MVP direction.

### Phase 1B: Planner Foundation

- Added the pay period planning foundation.
- Established projection rows and planner-oriented data flow.

### Phase 1C: Accounts Foundation

- Added account balance support.
- Connected starting balances to projection behavior.

### Phase 1D: Scheduled Items Foundation

- Added planned income, expenses, and transfer items.
- Connected scheduled items to planner projections.

### Phase 1E: Planner Editing

- Added planner cell editing.
- Preserved planned values while allowing actual user-entered values.

### Phase 1F: Savings Foundation

- Added savings bucket concepts.
- Connected savings transfers and bucket tracking to projections.

### Phase 1G: Dashboard Improvements

- Added dashboard summary cards and projection visibility.
- Improved cash-flow overview.

### Phase 1H: Data Persistence

- Added local persistence for app data.
- Preserved user-entered planner and setup data across refreshes.

### Phase 1I: CSV Exports

- Added local CSV export workflows.
- Kept exports simple and browser-based.

### Phase 1J: Backup And Restore

- Added JSON backup and restore.
- Added safer reset behavior for local data.

### Phase 1K: Reports Foundation

- Added the Reports page foundation.
- Added summary cards, report tables, and initial reporting structure.

### Phase 1L: Report Filters And Accuracy

- Added monthly and pay-period report filters.
- Improved report calculations and savings transfer summaries.

### Phase 1M: Charts And Report Visuals

- Added income vs outflow, top spending categories, savings transfers, and
  bucket balance charts.
- Added chart empty states and responsive chart cards.

### Phase 1N: Advanced Report Trends

- Added monthly, pay-period, and savings transfer trend reporting.
- Added trend summary cards and trend empty states.

### Phase 1O: Report Export And Print View

- Added browser print support for the current report view.
- Added report-specific CSV export with metadata and visible totals.

### Phase 1P: Editable Budget Planner Settings

- Added editable planner settings.
- Persisted settings locally and connected them to projection rebuilds.

### Phase 1Q: Settings-Driven Projection Hardening

- Hardened saved settings normalization and validation.
- Preserved planner data when projection settings change.

### Phase 1R: Category Management

- Added local category defaults, persistence, and a Categories page.
- Added category assignment support for scheduled items and reports.

### Phase 1S: Scheduled Item Improvements

- Hardened scheduled item normalization and recurrence handling.
- Added filters, active/inactive support, duplicate, validation, and upcoming
  scheduled items.

### Phase 1T: Transaction History Foundation

- Added Transactions page with derived transaction-style rows.
- Added filters, sorting, summary cards, and filtered transaction CSV export.

### Phase 1U: Budget Targets

- Added monthly category budget targets.
- Added budget usage calculations, remaining budget, status, and progress bars.

### Phase 1V: Alerts And Warnings

- Added local in-app alerts for low balances, budgets, upcoming bills, setup,
  and data warnings.
- Added Dashboard and contextual page-level alert panels.
- Missing-account alerts link to a focused Transactions view so the affected
  planned item is clear.

### Phase 1W: Data Cleanup And Migration Safety

- Added app data versioning, migration helpers, normalization, safer import
  validation, import preview, data health, and repair action.

### Phase 1X: Mobile UX Polish

- Improved mobile navigation, spacing, tables, forms, charts, and touch targets.
- Preserved desktop sidebar behavior.

### Phase 1Y: Full QA And Bug Fix Pass

- Completed full navigation QA and browser smoke testing.
- Fixed chart console warnings, savings bucket edge states, projection fallback,
  and table fallback text.

### Phase 1Z: Production Readiness Pass

Completed:

- Added app version display.
- Added release documentation.
- Added quick start guide.
- Added data safety guide.
- Updated README for local MVP release.
- Confirmed production build readiness.
- Confirmed release checklist.
- Completed final label and copy consistency pass.

Known limitation:

- App is local-first only.
- No cloud sync or account login is included.
- User data must be backed up manually.
- PWA install support depends on browser and device support.
- Native desktop/mobile packaging is not included yet.
- Further performance work may be useful after desktop packaging.

### Phase 2A: PWA Install Support

Completed:

- Added PWA manifest.
- Added app icons.
- Added service worker caching.
- Added install support for supported browsers.
- Added PWA install and testing documentation.
- Updated data safety guidance for browser-managed local data.

Known limitation:

- PWA data is still browser-managed.
- Clearing browser or site data can remove user data.
- Users must export backups regularly.
- Desktop SQLite storage is planned for a later phase.
- Native desktop packaging is not included yet.

### Phase 2B: Demo Data And Empty Reset Mode

Completed:

- Added a full fictional demo dataset for the public app.
- Added demo records for accounts, scheduled items, savings buckets, manual
  adjustments, savings activity, budget targets, reports, alerts, and
  transactions.
- Added multi-line demo notes where supported.
- Added Reset to Demo Data with `DEMO` confirmation.
- Added Factory Reset to Empty App with `DELETE` confirmation.
- Kept default categories in the empty app state so users can start fresh.
- Added local last-backup tracking.
- Added backup status to Data Management.
- Added Dashboard backup reminder alerts.
- Added clearer local browser data safety messaging.
- Improved backup export, import, and reset guidance.
- Updated data safety and release documentation.

Known limitation:

- Demo data is fictional and intended only as a starter experience.
- Empty reset keeps default base categories so the app remains usable.
- Backup reminders are in-app only.
- PWA data is still browser-managed.
- Users must keep backup files somewhere safe.
- Desktop SQLite storage is planned for a later phase.

### Phase 2D: Help Guide And First-Run Onboarding

Completed:

- Added an in-app Help Guide.
- Added Help navigation.
- Added first-run onboarding for the public demo.
- Added onboarding choices for exploring demo data, starting empty, or
  importing a backup.
- Added Dashboard empty-app setup prompt.
- Persisted onboarding completion in local app metadata.
- Added contextual Help access from Data Management.

Known limitation:

- Onboarding is in-app only.
- Start Empty and Import Backup route users to existing safe Settings flows
  instead of running those actions directly.
- PWA data is still browser-managed.

### Phase 2E: Backup Reminders And Data Safety Polish

Completed:

- Confirmed local last-backup tracking in app metadata.
- Confirmed Data Health backup status and readable Last backup display.
- Confirmed Dashboard backup reminder alerts for missing or old backups.
- Preserved valid last-backup timestamps through demo and empty resets.
- Improved reset warning copy.
- Added backup reminder guidance to the Help Guide.
- Updated data safety and release documentation.

Known limitation:

- Backup reminders are in-app only.
- Backups are local downloaded files users must store safely.
- PWA data is still browser-managed.
- Desktop SQLite storage is planned for a later phase.

### Phase 2F: Performance Optimization And Bundle Cleanup

Completed:

- Added safe page-level lazy loading.
- Reduced initial bundle pressure.
- Split chart-heavy page code into lazy-loaded production assets.
- Preserved PWA and GitHub Pages deployment behavior.
- Confirmed production build passes without the previous large chunk warning.

Known limitation:

- Further performance work may be needed after desktop packaging.
- Browser storage remains the current PWA storage model until the desktop
  SQLite phase.

### Phase 2M: Simplified User Experience And Navigation Cleanup

Completed:

- Simplified top-level navigation to Dashboard, Planner, Transactions, Reports,
  Manage, Settings, and Help.
- Added a Manage page for Scheduled Items, Accounts, Savings Buckets, Budgets,
  and Categories.
- Added Current Pay Period Summary to the Planner.
- Added current-period attention items that open the existing planner cell
  editor.
- Clarified projected and validated planner wording.
- Clarified Savings Buckets projected transfer labels.
- Updated Help with simplified navigation and planner total explanations.

Known limitation:

- Advanced setup pages are still full-featured and may need additional polish
  inside Manage in a future UX pass.
- Data remains local-first browser storage until the future desktop SQLite
  migration.

### Phase 2N: Release Notes And Update Popup

Completed:

- Added central app release notes data.
- Added a one-time What's New popup keyed by app version.
- Added release note actions for Got it, View Help, and Export Backup.
- Added Help guidance for app updates.
- Updated release documentation and checklist.

Known limitation:

- Release note visibility is tracked per browser/device with localStorage.
- Users should still export backups manually after major updates.

### Phase 2O: Unified Transfer And Bucket Automation

Completed:

- Added a unified transfer workflow for money moving between user-owned
  accounts.
- Added transfer records for chequing-to-savings bucket transfers,
  savings-bucket-to-chequing transfers, and account transfers without buckets.
- Added transfer history with edit and delete actions.
- Connected transfer records to projected account balances, validated chequing,
  projected savings, bucket projections, transactions, reports, backups, import,
  repair, and reset-safe defaults.
- Clarified when to use transfers versus manual adjustments.
- Added Help guidance for transfer types and examples.

Known limitation:

- Scheduled transfers remain planned recurring items; transfer records are
  one-off or confirmed account movements.
- No bank sync or automatic matching is included.
- Future desktop import/export should preserve stable transfer ids and the
  versioned `transfers` collection.

### Phase 2P: FinPath Branding And Visual Identity Integration

Completed:

- Added approved FinPath logo, splash, and wallet icon assets.
- Updated visible app branding from Budget Planner to FinPath.
- Updated browser title, favicon, PWA app name, manifest colors, and app icons.
- Added FinPath brand color tokens.
- Added branded sidebar/header identity and loading states.
- Updated release notes, Help, README, Quick Start, Data Safety, and release
  checklist references.

Known limitation:

- This phase applies brand identity without redesigning the full app UI.
- Full dark-mode theming and deeper chart recoloring are left for a future
  visual polish phase.

### Phase 2Q: Backup, Export, Import, And Migration Foundation

Completed:

- Added a versioned FinPath full-data export format.
- Added import validation, warnings, and preview metadata.
- Preserved stable IDs for future desktop migration.
- Included transfers, savings bucket adjustments, budgets, settings, and
  planner entries in the portable backup shape.
- Improved Data Health checks for transfer references.
- Kept older BudgetApp backup compatibility where safe.

Known limitation:

- Direct standalone transactions are not stored yet; transaction rows are still
  derived from source records in the web app.
- Desktop SQLite import is planned for a later phase.

### Phase 2R: Reports Accuracy And Data Sync Fix

Completed:

- Improved Reports source-of-truth logic to use shared transaction and budget
  helpers.
- Kept transfers separate from income and spending totals.
- Improved savings movement reporting for bucket adjustments and transfer
  records.
- Fixed Reports transfer summaries so planned, validated, manual, and
  adjustment-based savings movement are clearly separated.
- Fixed Reports bucket balances to use current projected and validated bucket
  projection data instead of only starting balances.
- Aligned budget reporting with monthly budget targets.
- Improved Reports labels, empty states, Help text, and manual test coverage.

Known limitation:

- Reports remain intentionally simple and do not include advanced analytics or
  custom date ranges yet.
- Transaction rows are still derived from source records rather than stored as
  standalone transactions.

### Phase 2S: Data Health And Repair Polish

Completed:

- Added stronger Data Health checks.
- Added duplicate and missing ID detection.
- Added missing account, category, and savings bucket reference checks.
- Added invalid date and invalid amount checks.
- Added transfer and savings movement health checks.
- Added non-destructive recheck flow and clearer repair guidance.
- Improved migration readiness for future desktop import.

Known limitation:

- Data Health is intentionally conservative and does not automatically repair
  duplicate IDs, missing references, or planner entry keys.
- A future desktop migration may add deeper validation before importing into a
  local database.

### Phase 2T: Mobile Responsive Polish And Usability Pass

Completed:

- Improved mobile and tablet spacing across core app surfaces.
- Added stacked mobile cards for Transactions and Budgets while preserving
  desktop tables.
- Improved Data Management, import preview, reset confirmations, and Data
  Health wrapping on small screens.
- Improved drawer/modal sizing and touch targets for planner and transfer
  editing.
- Added Help guidance for phone, tablet, and installed PWA use.
- Preserved PWA, backup, import, reports, and GitHub Pages behavior.

Known limitation:

- The Pay Period Planner remains a dense forecasting tool, so some planner
  areas still use intentional internal scrolling on small screens.
- Further device-specific polish may be useful after more installed PWA testing.

### Phase 2U: Real-Data QA And Bug Fix Pass

Completed:

- Completed a real-data QA pass across Dashboard, Planner, Accounts, Savings
  Buckets, Transactions, Budgets, Reports, Data Management, Help, and PWA output.
- Fixed report pay-period syncing for derived transaction rows.
- Included manual account adjustment income/expense activity in report summary
  totals without counting transfers as spending.
- Improved projection totals for multiple chequing and savings accounts.
- Fixed projected savings math for numeric savings bucket adjustments.
- Synced Dashboard next-transfer totals with planner transfer totals.
- Confirmed `/BudgetApp/` remains the GitHub Pages base path.

Known limitation:

- This pass was manual/code-review based; a broader automated regression suite
  is still recommended before a wider release.

### Phase 2V: Final PWA Release Hardening

Completed:

- Hardened final PWA release readiness checks.
- Verified GitHub Pages `/BudgetApp/` deployment assumptions and production
  preview guidance.
- Confirmed manifest, service worker, icon, and branded asset expectations.
- Improved release checklist and manual PWA smoke test coverage.
- Improved final backup and update guidance for local-first data safety.
- Preserved planner, reports, transfers, budgets, backup/import, and data
  health behavior.

Known limitation:

- Browser install prompts and offline behavior still depend on each browser and
  device.
- GitHub Pages should be deployed from the generated `budget-planner/dist`
  artifact through GitHub Actions.

### Phase 2W: Final Web/PWA Release Documentation And Deploy Pass

Completed:

- Set the final web release version to `2.0.0-web-final`.
- Finalized web/PWA release documentation and deployment notes.
- Confirmed local-first backup, import preview, and Data Health guidance.
- Documented final production preview, GitHub Pages, and stale-cache checks.
- Prepared FinPath for stable daily web/PWA use before future desktop planning.

Known limitation:

- Data remains local to the browser/device until a future desktop local database
  version is built.
- Users must continue exporting backups manually.

## Known Limitations

- Data is local to the current browser/device.
- No bank sync, cloud login, or automatic cloud backup is included.
- Users must export backups manually.
- Desktop local database storage is planned later.
- Browser install/offline behavior depends on browser and device support.

## Data Safety Warning

Clearing site data, changing browsers, using private browsing, resetting local
data, or moving devices can remove access to saved planner data. Export a backup
regularly and before any browser cleanup or deployment change.

## Future Roadmap

- Desktop SQLite storage.
- Further performance tuning after desktop packaging.
- More automated test coverage.
- Direct standalone transaction entry.
- Budget rollover math and custom budget alerts.
- Optional local import templates for common setup data.
