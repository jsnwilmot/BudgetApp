# Release Checklist

Run this before tagging or sharing a local MVP build.

## Static Checks

- [ ] `npm.cmd run lint`
- [ ] `npm.cmd run build`
- [ ] `git diff --check`
- [ ] `npm.cmd run preview`

The Vite large chunk warning may appear during build and does not block the local MVP.

## Browser Smoke Test

- [ ] App loads in the browser.
- [ ] Production preview loads.
- [ ] Dashboard opens.
- [ ] Pay Period Planner opens.
- [ ] Transactions opens.
- [ ] Scheduled Items opens.
- [ ] Accounts opens.
- [ ] Savings Buckets opens.
- [ ] Budgets opens.
- [ ] Categories opens.
- [ ] Reports opens.
- [ ] Settings opens.
- [ ] Help opens.
- [ ] No console errors appear.
- [ ] Manifest loads.
- [ ] Service worker registers.

## PWA Checks

- [ ] Browser shows install option where supported.
- [ ] Installed app opens in standalone mode.
- [ ] App name appears as Budget Planner.
- [ ] App icon appears correctly.
- [ ] Refresh/update prompt appears after a new service worker is available.
- [ ] Local data remains after app close and reopen.
- [ ] App shell loads after first visit when offline, where supported.

## Mobile Check

- [ ] Test around 360px wide.
- [ ] Mobile menu opens and closes.
- [ ] Tables scroll intentionally.
- [ ] Forms and editors are usable.
- [ ] Reports charts do not overflow.

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

## Core Workflows

- [ ] Settings save works.
- [ ] Settings reset works.
- [ ] Planner cell edit works.
- [ ] Scheduled item add/edit/duplicate/toggle works.
- [ ] Account adjustment add/edit/delete works.
- [ ] Savings bucket adjustment add/edit/delete works.
- [ ] Budget target add/edit/archive works.
- [ ] Category add/edit/archive works.
- [ ] Transactions CSV export downloads.
- [ ] Report CSV export downloads.
- [ ] Report print opens browser print.
- [ ] Backup/export still works in installed PWA.
- [ ] Import backup still works in installed PWA.

## Production Preview

- [ ] `npm.cmd run preview`
- [ ] Production preview loads.
- [ ] All nav pages open in production preview.
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
