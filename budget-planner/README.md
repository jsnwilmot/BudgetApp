# Budget Planner

Budget Planner is a local-first personal finance app for planning pay periods,
bills, savings transfers, category budgets, transactions, alerts, and reports.

Current release: `1.0.0-local-mvp`
Data version: `1`

## Current Status

This is a clean local MVP release. It runs in the browser, can be installed as
a PWA in supported browsers, stores user data locally, and does not require
login, cloud sync, bank connections, or a server.

New installs start with clearly fictional demo data so the app can be explored
without setup. Use `Settings > Data Management` to reset back to demo data or
factory reset to an empty app.

## Features

- Dashboard with cash-flow summary, projection chart, and alerts.
- Pay Period Planner with editable projected and actual amounts.
- Transactions view derived from scheduled items, adjustments, and savings activity.
- Scheduled Items with recurrence, categories, filters, duplicate, and active status.
- Accounts with starting balances and manual adjustments.
- Savings Buckets with projected balances and adjustment history.
- Budgets with monthly category targets, usage, remaining amounts, and progress bars.
- Categories with local create, edit, archive, and reset workflows.
- Reports with filters, charts, trends, print view, and report CSV export.
- Settings with editable planner settings and data management tools.
- Backup, restore, repair, reset, and CSV export workflows.
- Backup reminder status and data safety guidance for browser-managed storage.
- Fictional demo dataset with scheduled items, accounts, savings buckets,
  budgets, transactions, reports, alerts, and multi-line notes.
- Mobile-friendly navigation and responsive page layouts.
- PWA install support with app icons, manifest, service worker caching, and a
  simple update prompt.

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
  categories, budgets, savings buckets, and adjustments.
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
device changes.

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
3. Install Budget Planner.
4. Open it from the desktop, dock, start menu, or app launcher.

Mobile browser:

1. Open the app URL.
2. Open the browser menu.
3. Choose `Add to Home Screen` or `Install App`.
4. Open Budget Planner from the home screen.

Exact wording depends on browser and device. PWA data is still browser-managed,
so export backups before uninstalling the PWA, clearing site data, switching
browsers, or switching devices.

## Build

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run preview
```

The production build currently emits a Vite large chunk warning due to
chart/report bundle size. This does not block the local MVP. Bundle optimization
is planned for a later performance phase.

## GitHub Pages Deployment

Live URL: https://jsnwilmot.github.io/BudgetApp/

- Source folder: `budget-planner`
- Build output: `budget-planner/dist`
- Deployment: GitHub Actions
- Workflow: `.github/workflows/deploy-pages.yml`

The Vite base path is configured as `/BudgetApp/` so production assets, the PWA
manifest, service worker, and icons load correctly from GitHub Pages.

Local deployment check:

```powershell
npm.cmd run build
npm.cmd run preview
```

## Browser Support

The app is intended for current desktop and mobile browsers with IndexedDB and
modern JavaScript support, such as current Chrome, Edge, Firefox, and Safari.

Because data is browser-local, data saved in one browser profile is separate
from data saved in another browser, device, or private browsing session.

## Documentation

- [Quick Start](./QUICK_START.md)
- [Data Safety](./DATA_SAFETY.md)
- [Release Checklist](./RELEASE_CHECKLIST.md)

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
- Vite may show a large chunk warning during build.

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

## Known Limitations

- Data is local-only and does not sync across devices.
- No account login, cloud backup, or bank connections are included.
- User data must be backed up manually.
- Backup reminders are local to the browser/device.
- PWA install support depends on browser and device support.
- Native desktop/mobile packaging is not included yet.
- Advanced forecasting, AI categorization, receipt scanning, and PDF generation
  are not included.
- Automated test coverage is still limited.

## Data Safety Warning

Clearing site data, changing browsers, using private browsing, resetting local
data, or moving devices can remove access to saved planner data. Export a backup
regularly and before any browser cleanup or deployment change.

## Future Roadmap

- Desktop SQLite storage.
- Bundle/performance optimization.
- More automated test coverage.
- Direct standalone transaction entry.
- Budget rollover math and custom budget alerts.
- Optional local import templates for common setup data.
