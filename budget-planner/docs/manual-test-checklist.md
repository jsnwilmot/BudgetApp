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
- [ ] Backup export still downloads JSON.
- [ ] Backup import preview still opens for a valid backup.
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
