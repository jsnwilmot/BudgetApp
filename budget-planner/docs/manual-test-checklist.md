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

- [ ] Add transaction-related activity works by adding a supported source record, such as a manual adjustment or transfer, and confirming it appears in Transactions.
- [ ] Budgets still calculate used, remaining, near-budget, and over-budget states.
- [ ] Reports still open and charts render.
- [ ] Add income and confirm Reports income changes.
- [ ] Add expense and confirm Reports expense and category totals change.
- [ ] Add transfer and confirm Reports transfer totals change without inflating income or expenses.
- [ ] Add savings transfer or bucket-linked transfer and confirm savings movement updates.
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

## PWA And Deployment

- [ ] PWA build outputs `manifest.webmanifest`.
- [ ] PWA build outputs `sw.js`.
- [ ] PWA icons are present in `dist/icons`.
- [ ] FinPath manifest name and theme color are present.
- [ ] GitHub Pages workflow still uploads `budget-planner/dist`.
- [ ] GitHub Pages base path remains `/BudgetApp/`.

## Final Commands

```powershell
cd budget-planner
npm.cmd run lint
npm.cmd run build
cd ..
git diff --check
```
