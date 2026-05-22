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
- [ ] Reset Local Data requires `DELETE`.
- [ ] Reset warning explains the browser/device data loss risk.

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
