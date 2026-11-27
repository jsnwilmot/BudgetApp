# Release Checklist

Run this before tagging or sharing a local MVP build.

## Validation and manual Pages release

- Pull requests and updates to `main` run **Validate FinPath** with Node 22,
  locked `npm ci`, source diff checks, lint, `npm test`, production build,
  artifact and tracked-file checks, and the Chromium backup, reset and
  pre-restore suites with disposable synthetic profiles. Validation has
  read-only repository permissions.
- After reviewing the changes and validating the exact merged commit, the
  repository owner opens **Actions → Deploy FinPath to GitHub Pages → Run
  workflow**, selects `main`, and enters the full lowercase SHA of the reviewed
  commit. The workflow requires that SHA to match the commit selected at
  dispatch. If main advanced, review the new head before dispatching again.
- The owner must also initiate any rerun. Deployment builds the exact dispatched
  SHA with the lockfile, lint and Node tests. It uploads the existing
  `budget-planner/dist` Pages structure for the `github-pages` environment.
  Check the Actions summary and `/BudgetApp/pages-debug.txt` for the published
  SHA after an authorized release. Any existing GitHub environment rules apply.
- Before authorizing a release, run the synthetic Chromium reset and backup
  suites from the same built revision. Other engines, mobile, large-backup
  recovery and actual owner-data recovery remain unverified.

## Static Checks

- [ ] `npm.cmd run lint`
- [ ] `npm.cmd test`
- [ ] `npm.cmd run build`
- [ ] `git diff --check`
- [ ] `npm.cmd run preview`
- [ ] Update `APP_VERSION` in `src/data/releaseNotes.js`.
- [ ] Confirm app metadata uses the shared `APP_VERSION`.
- [ ] Update `RELEASE_NOTES` highlights in `src/data/releaseNotes.js`.

The production build should split larger pages and chart code into separate
assets. If a large chunk warning returns, review page lazy loading and chart
imports before release.

## Final Web/PWA Release Gate

- [ ] Export a backup before deploying or testing a major update.
- [ ] Run Data Health and review warnings/errors before deploy.
- [ ] Production preview `/BudgetApp/` returns HTTP 200.
- [ ] `budget-planner/dist/index.html` exists.
- [ ] `budget-planner/dist/manifest.webmanifest` exists.
- [ ] `budget-planner/dist/sw.js` exists.
- [ ] `budget-planner/dist/icons/icon-192.png` exists.
- [ ] `budget-planner/dist/icons/icon-512.png` exists.
- [ ] `budget-planner/dist/icons/maskable-icon-512.png` exists.
- [ ] Built script and CSS paths start with `/BudgetApp/`.
- [ ] App loads after refresh at `/BudgetApp/`.
- [ ] Splash screen appears and does not block access.
- [ ] What's New popup appears for the new app version.
- [ ] Data Health opens and recheck does not modify records.
- [ ] Export Backup works.
- [ ] Import preview works and still requires confirmation before overwrite.
- [ ] Dashboard, Planner, Reports, Settings, and Help open in production preview.
- [ ] Mobile phone width and tablet width are checked.
- [ ] Installed PWA or standalone browser window is checked if practical.
- [ ] Hard refresh is checked after production preview deploy.
- [ ] Incognito/private window load is checked.
- [ ] GitHub Pages live URL is checked after deploy.
- [ ] Known limitations and data safety notes are reviewed.

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

## Reports Accuracy

- [ ] Reports match Dashboard totals where expected.
- [ ] Income totals are correct.
- [ ] Expense totals are correct.
- [ ] Manual account adjustment income and expenses appear in report summaries.
- [ ] Transfers are shown separately from income and spending.
- [ ] Savings transfers and bucket movements are not double counted.
- [ ] Budget report matches the Budgets screen for the same month.
- [ ] Empty Reports state is clear.
- [ ] Production preview `/BudgetApp/` returns HTTP 200.

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
- [ ] Export creates a FinPath full backup with `formatVersion`, `databaseVersion`, `exportedAt`, `appName`, all 11 `stores` and an integrity digest.
- [ ] The archived `appMetadata` store preserves the original version and Last Entry fields where present.
- [ ] Backup includes transfers.
- [ ] Backup includes savings buckets and savings bucket adjustments.
- [ ] Data Health shows Last backup.
- [ ] Backup export updates the Last backup timestamp.
- [ ] Data Health shows Backup status.
- [ ] Data Health counts transfer records and missing transfer references.
- [ ] Data Health runs without changing data.
- [ ] Data Health shows collection counts.
- [ ] Duplicate IDs are detected.
- [ ] Missing account references are detected.
- [ ] Missing category references are detected.
- [ ] Missing savings bucket references are detected.
- [ ] Invalid dates are detected.
- [ ] Invalid amounts are detected.
- [ ] Transfer issues are detected.
- [ ] Budget target issues are detected.
- [ ] Dashboard shows backup reminder when no backup exists.
- [ ] Dashboard shows backup reminder when last backup is older than 30 days.
- [ ] Dashboard does not show backup reminder when backup is current.
- [ ] Import Backup shows preview counts.
- [ ] Import Backup shows export version, schema version, exported date, source, and warnings.
- [ ] Import blocks invalid JSON.
- [ ] Import warns on older backups with missing optional collections.
- [ ] Import preserves IDs for accounts, categories, scheduled items, buckets, transfers, budgets, and planner entry keys.
- [ ] Import prepares the complete pre-restore backup. Download and save it, then confirm before local data is replaced.
- [ ] Exported backup can be re-imported successfully.
- [ ] Import warning says current local data will be replaced.
- [ ] Valid backup import works.
- [ ] Newer unsupported app data version is rejected.
- [ ] App still works after import.
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

- [ ] Existing IndexedDB data loads without resetting user data.
- [ ] Payday workflow works: income, bills, misc expenses/payments, savings transfers, Dashboard totals, Planner totals, and Reports totals are understandable.
- [ ] Multiple misc expense rows in the same pay period can be added, edited, deleted, and reflected in totals.
- [ ] Multiple misc payment rows in the same pay period can be added, edited, deleted, and reflected in totals.
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
- [ ] Dashboard next-transfer total reflects planner transfer totals.
- [ ] Multiple chequing and savings accounts contribute to projected aggregate balances.
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

## Responsive Layout

- [ ] Dashboard works on phone width.
- [ ] Transactions work on phone width.
- [ ] Add/edit transaction controls work on phone width.
- [ ] Pay Period Planner works on phone width with only intentional internal scrolling.
- [ ] Budgets work on phone width.
- [ ] Savings Buckets and transfer forms work on phone width.
- [ ] Reports work on phone width and charts do not overflow.
- [ ] Settings/Data Management works on phone width.
- [ ] Import preview fits mobile.
- [ ] Data Health issue lists wrap correctly.
- [ ] Release Notes modal fits mobile.
- [ ] No unexpected full-page horizontal scrolling appears.

## Production Preview

- [ ] `npm.cmd run preview`
- [ ] Production preview loads.
- [ ] Production preview `/BudgetApp/` returns HTTP 200.
- [ ] Built app assets use `/BudgetApp/` paths.
- [ ] All nav pages open in production preview.
- [ ] Lazy-loaded pages show a loading state instead of a blank screen.
- [ ] Reports opens and chart assets load in production preview.
- [ ] Dashboard opens and chart assets load in production preview.
- [ ] Service worker still registers after bundle splitting.
- [ ] Manifest and service worker are not blocked by stale cache after refresh.
- [ ] No console errors appear in production preview.

## GitHub Pages Deployment

- [ ] Confirm Validate FinPath passes for the reviewed pull request.
- [ ] Record the approved revision on `main` after merge.
- [ ] The repository owner dispatches **Deploy FinPath to GitHub Pages** from
  `main` with the exact reviewed SHA after separately approving production release.
- [ ] Confirm Pages deployment completes for that SHA.
- [ ] Open https://jsnwilmot.github.io/BudgetApp/.
- [ ] Confirm app shell loads.
- [ ] Confirm PWA manifest loads.
- [ ] Confirm service worker registers.
- [ ] Confirm Settings shows app version.
- [ ] Confirm backup/export works.
