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
- [ ] Import Backup shows preview counts.
- [ ] Valid backup import works.
- [ ] Newer unsupported app data version is rejected.
- [ ] Repair Local Data completes.
- [ ] Reset Local Data requires `DELETE`.

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
