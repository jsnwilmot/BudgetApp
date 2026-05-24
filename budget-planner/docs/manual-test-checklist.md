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
- [ ] Saved local data remains after refresh.

## Core Workflows

- [ ] Existing IndexedDB data loads without migration errors or data reset.
- [ ] Splash screen does not block app access.
- [ ] What's New popup appears for the current app version when unseen.
- [ ] Payday workflow works: add income, regular bills, misc expenses, misc payments, and savings transfers, then compare Dashboard, Planner, and Reports totals.
- [ ] Multiple misc expense rows in the same pay period can be added, edited, deleted, and reflected immediately in totals.
- [ ] Multiple misc payment rows in the same pay period can be added, edited, deleted, and reflected immediately in totals.
- [ ] Add transaction-related activity works by adding a supported source record, such as a manual adjustment or transfer, and confirming it appears in Transactions.
- [ ] Budgets still calculate used, remaining, near-budget, and over-budget states.
- [ ] Reports still open and charts render.
- [ ] Data Health loads.
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
- [ ] Known sample values show Income 2000, Expenses 100, Transfers 300, and Savings Movement 300 when entered in the same report period.
- [ ] Add budget target and confirm Reports budget status matches Budgets.
- [ ] Switch report period or month and confirm totals update.
- [ ] Check Reports empty state after Factory Reset to Empty App if practical.
- [ ] Backup export still downloads JSON.
- [ ] Backup JSON includes `appName`, `exportVersion`, `schemaVersion`, `exportedAt`, `source`, `basePath`, and `data`.
- [ ] Backup JSON includes `transfers`, `savingsBucketAdjustments`, `plannerEntries`, `settings`, and `budgets`.
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

## Final PWA Release Smoke

- [ ] Desktop browser loads `http://127.0.0.1:4173/BudgetApp/` from production preview.
- [ ] Refreshing `/BudgetApp/` reloads the app shell.
- [ ] Mobile width preview loads Dashboard, Planner, Reports, Settings, and Help.
- [ ] Installed PWA/window test is completed if practical.
- [ ] Splash screen appears briefly and fades out.
- [ ] What's New popup appears for `2.0.0-phase-2v` when unseen.
- [ ] PWA update prompt still offers Refresh App when a service worker update is available.
- [ ] Export Backup downloads JSON before deploy testing.
- [ ] Import Backup shows preview and does not overwrite until confirmed.
- [ ] Data Health recheck works without changing records.
- [ ] Dashboard, Planner, and Reports open after refresh.
- [ ] No unexpected full-page horizontal scrolling appears.
- [ ] Built script, stylesheet, manifest, and icon paths use `/BudgetApp/`.

## Final Commands

```powershell
cd budget-planner
npm.cmd run lint
npm.cmd run build
cd ..
git diff --check
```
