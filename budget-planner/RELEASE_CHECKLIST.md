# Release Checklist

Run this before tagging or sharing a local MVP build.

## Static Checks

- [ ] `npm.cmd run lint`
- [ ] `npm.cmd run build`
- [ ] `git diff --check`
- [ ] `npm.cmd run preview`
- [ ] Update `APP_VERSION` in `src/data/releaseNotes.js`.
- [ ] Update `APP_VERSION` in `src/data/migrations.js` for backup metadata.
- [ ] Update `RELEASE_NOTES` highlights in `src/data/releaseNotes.js`.

The production build should split larger pages and chart code into separate
assets. If a large chunk warning returns, review page lazy loading and chart
imports before release.

## Browser Smoke Test

- [ ] App loads in the browser.
- [ ] Production preview loads.
- [ ] Dashboard opens.
- [ ] Planner opens.
- [ ] Transactions opens.
- [ ] Reports opens.
- [ ] Manage opens.
- [ ] Manage cards open Scheduled Items, Accounts, Savings Buckets, Budgets, and Categories.
- [ ] Settings opens.
- [ ] Help opens.
- [ ] No console errors appear.
- [ ] Manifest loads.
- [ ] Service worker registers.

## PWA Checks

- [ ] Browser title shows FinPath.
- [ ] Browser shows install option where supported.
- [ ] Installed app opens in standalone mode.
- [ ] App name appears as FinPath.
- [ ] FinPath logo renders without stretching.
- [ ] PWA manifest name is FinPath.
- [ ] Favicon/app icon uses the FinPath wallet mark.
- [ ] App icon appears correctly.
- [ ] Refresh/update prompt appears after a new service worker is available.
- [ ] Local data remains after app close and reopen.
- [ ] App shell loads after first visit when offline, where supported.

## Brand Checks

- [ ] Sidebar/header shows FinPath branding.
- [ ] Tagline appears only where useful and does not crowd navigation.
- [ ] Brand colors maintain readable contrast.
- [ ] `public/brand` contains the approved logo and splash assets.
- [ ] GitHub Pages base path remains `/BudgetApp/`.

## Mobile Check

- [ ] Test around 360px wide.
- [ ] Mobile menu opens and closes.
- [ ] Tables scroll intentionally.
- [ ] Forms and editors are usable.
- [ ] Reports charts do not overflow.
- [ ] Reports charts render after lazy loading.
- [ ] Dashboard chart renders after lazy loading.

## Data Management

- [ ] Export Backup downloads JSON.
- [ ] Backup includes `appVersion` and `appDataVersion`.
- [ ] Data Health shows Last backup.
- [ ] Backup export updates the Last backup timestamp.
- [ ] Data Health shows Backup status.
- [ ] Dashboard shows backup reminder when no backup exists.
- [ ] Dashboard shows backup reminder when last backup is older than 30 days.
- [ ] Dashboard does not show backup reminder when backup is current.
- [ ] Import Backup shows preview counts.
- [ ] Import warning says current local data will be replaced.
- [ ] Valid backup import works.
- [ ] Newer unsupported app data version is rejected.
- [ ] Repair Local Data completes.
- [ ] Repair Local Data preserves a valid Last backup timestamp.
- [ ] Reset to Demo Data requires `DEMO`.
- [ ] Reset to Demo Data restores fictional sample records.
- [ ] Factory Reset to Empty App requires `DELETE`.
- [ ] Factory Reset to Empty App clears user/demo records and keeps safe defaults.
- [ ] Demo and empty resets preserve a valid Last backup timestamp.
- [ ] Reset warnings explain the browser/device data loss risk.

## Demo Data And Empty Reset

- [ ] Fresh app starts with fictional demo data.
- [ ] Existing user data is not overwritten automatically.
- [ ] No bundled demo record uses real personal names, providers, employers, or account numbers.
- [ ] Demo data includes accounts, scheduled items, savings buckets, manual adjustments, savings adjustments, budgets, transactions, reports, and alerts.
- [ ] Demo data includes multi-line notes where supported.
- [ ] Multi-line notes render safely in cards, tables, forms, CSV exports, print view, and backup JSON.
- [ ] Factory Reset to Empty App leaves no accounts, scheduled items, manual adjustments, savings buckets, savings adjustments, budget targets, or planner entries.
- [ ] Empty app keeps default categories and safe settings.
- [ ] Backup export works after demo reset.
- [ ] Backup export works after empty reset.

## Help And Onboarding

- [ ] Help nav item appears.
- [ ] Help page opens.
- [ ] Help content is readable on mobile.
- [ ] Help explains backup reminders.
- [ ] First-run onboarding appears for fresh demo users.
- [ ] Explore Demo Data dismisses onboarding.
- [ ] Onboarding completion persists after refresh.
- [ ] Start Empty navigates to Settings and does not erase data without confirmation.
- [ ] Import Backup navigates to Settings and uses the existing safe import flow.
- [ ] Empty app setup prompt appears after Factory Reset to Empty App.
- [ ] Data Management includes a Help link.

## Release Notes

- [ ] What's New popup appears once for a fresh/new app version.
- [ ] Popup shows version, date, and highlights.
- [ ] Got it dismisses the popup.
- [ ] Popup does not reappear after dismissal for the same version.
- [ ] Changing `APP_VERSION` locally causes the popup to appear again.
- [ ] View Help opens Help from the popup.
- [ ] Export Backup works from the popup.
- [ ] Existing PWA update prompt still works.

## Core Workflows

- [ ] Settings save works.
- [ ] Settings reset works.
- [ ] Planner cell edit works.
- [ ] Blank planner cells still open for editing.
- [ ] Planner sticky headers still work.
- [ ] Planner scrolls to the current pay period.
- [ ] Current Pay Period Summary shows expected totals.
- [ ] Current Pay Period Summary attention items open the cell editor.
- [ ] Scheduled item add/edit/duplicate/toggle works.
- [ ] Account adjustment add/edit/delete works.
- [ ] Savings bucket adjustment add/edit/delete works.
- [ ] Transfer to Savings Bucket moves money from chequing to savings and increases the selected bucket.
- [ ] Transfer from Savings Bucket moves money from savings to chequing and decreases the selected bucket.
- [ ] Account Transfer without a bucket affects only the selected accounts.
- [ ] Transfer edit updates account and bucket projections.
- [ ] Transfer delete removes only the transfer record and updates totals.
- [ ] Backup export includes transfer records.
- [ ] Backup import restores transfer records.
- [ ] Projections still include transfers after refresh.
- [ ] Budget target add/edit/archive works.
- [ ] Category add/edit/archive works.
- [ ] Transactions CSV export downloads.
- [ ] Report CSV export downloads.
- [ ] Report print opens browser print.
- [ ] Help explains simplified navigation and Planner total rows.
- [ ] Savings Buckets projected labels are clear.
- [ ] Backup/export still works in installed PWA.
- [ ] Import backup still works in installed PWA.

## Production Preview

- [ ] `npm.cmd run preview`
- [ ] Production preview loads.
- [ ] All nav pages open in production preview.
- [ ] Lazy-loaded pages show a loading state instead of a blank screen.
- [ ] Reports opens and chart assets load in production preview.
- [ ] Dashboard opens and chart assets load in production preview.
- [ ] Service worker still registers after bundle splitting.
- [ ] No console errors appear in production preview.

## GitHub Pages Deployment

- [ ] Push to `main`.
- [ ] Confirm GitHub Actions workflow passes.
- [ ] Confirm Pages deployment completes.
- [ ] Open https://jsnwilmot.github.io/BudgetApp/.
- [ ] Confirm app shell loads.
- [ ] Confirm PWA manifest loads.
- [ ] Confirm service worker registers.
- [ ] Confirm Settings shows app version.
- [ ] Confirm backup/export works.
