# FinPath Desktop Migration Architecture Plan

Stage 3A is a planning phase only. It does not add desktop dependencies, change
web/PWA behavior, alter finance logic, or change the backup format.

## Current Web/PWA Data Model

The finalized web/PWA app stores data locally in IndexedDB database
`budget-planner-db`, version `9`.

Current IndexedDB stores:

- `appSettings`
- `appMetadata`
- `categories`
- `budgetTargets`
- `plannerEntries`
- `scheduledItems`
- `accounts`
- `manualAdjustments`
- `savingsBuckets`
- `savingsBucketAdjustments`
- `transfers`

Current versioned JSON backups include:

- `appName`
- `appVersion`
- `exportVersion`
- `schemaVersion`
- `exportedAt`
- `source`
- `basePath`
- `metadata`
- `data`

Current backup `data` includes:

- `appMetadata`
- `settings`
- `accounts`
- `categories`
- `transactions`
- `scheduledItems`
- `plannerEntries`
- `manualAdjustments`
- `savingsBuckets`
- `savingsBucketAdjustments`
- `transfers`
- `budgets`
- `budgetTargets`
- compatibility aliases such as `planner` and `savings`

Transactions are derived from source records. They are not the primary persisted
source of truth. The desktop app should continue deriving transaction-style
history from source records unless a future schema intentionally adds direct
transaction entry.

The FinPath JSON backup is the migration source for desktop. Stable IDs must be
preserved exactly. Desktop import must not regenerate IDs for existing records or
planner entry keys.

## Recommended Desktop Stack

Recommended first desktop stack:

- Tauri
- React/Vite frontend
- SQLite local database

Why Tauri:

- Smaller app footprint than Electron.
- Good fit for a Windows-first local desktop app.
- Can reuse most of the existing React/Vite UI.
- Strong local file access through a native shell.
- Good SQLite support through Rust-side commands or a maintained plugin.
- Better fit for a solo developer who wants a local-first desktop app without a
  bundled browser runtime cost.

Electron is still reasonable if:

- Node.js ecosystem access is more important than app size.
- The app needs mature desktop integrations quickly.
- Build tooling familiarity matters more than binary size.
- A future feature needs Node-native packages that are awkward in Tauri.

Decision: start with Tauri unless a proof of concept exposes a blocker.

## Recommended Local Database

Recommended first desktop database:

- SQLite

Why SQLite:

- No database server required.
- One portable local database file.
- Easier installer and user support.
- Strong fit for one-person local finance data.
- Easy to back up with file copies and JSON exports.
- Works well with transactional imports from FinPath web backups.
- Keeps the app local-first without introducing admin tooling.

MySQL should only be reconsidered later if FinPath becomes:

- Multi-user.
- Server-hosted.
- Shared over a network.
- Backed by a sync service.
- Heavy enough to require server database administration tools.

Decision: use SQLite for the first desktop version.

## Desktop Data Storage Strategy

Conceptual storage layout:

- Local SQLite database file for active app data.
- Local backups folder for timestamped JSON backups.
- User-selected import/export file locations.
- Optional app logs folder for diagnostics.

Windows examples:

- App data: `%APPDATA%/FinPath/finpath.sqlite`
- Backups: `Documents/FinPath Backups`
- Logs: `%APPDATA%/FinPath/logs`

These paths are examples, not hard requirements. The desktop app should use the
platform's recommended app data directory and allow users to choose export
locations.

Backup files should never be silently overwritten. Use timestamped names.

## Proposed SQLite Schema Mapping

Use existing app IDs as the logical primary keys. SQLite `rowid` can exist
internally, but it must not replace FinPath record IDs.

### `settings`

- Primary key: `id`, expected `app-settings`
- Fields: `currency`, `payPeriodAnchorDate`, `payFrequencyDays`,
  `projectionMonths`, `monthlyBillAssignmentRule`
- Flexible fields: `raw_json`
- Timestamps: `createdAt`, `updatedAt` if present

### `app_metadata`

- Primary key: `id`, expected `app-metadata`
- Fields: `lastBackupAt`, `plannerLastEntryMarker`, `onboardingCompletedAt`,
  `createdAt`, `updatedAt`
- Important: `plannerLastEntryMarker` is nullable and should be cleared during
  import if its scheduled item ID, pay-period occurrence, or planner cell key no
  longer resolves.
- Flexible fields: `raw_json`

### `accounts`

- Primary key: `id`
- Fields: `name`, `type`, `startingBalance`, `active`, `createdAt`,
  `updatedAt`
- References: used by scheduled items, manual adjustments, and transfers
- Flexible fields: `raw_json`

### `categories`

- Primary key: `id`
- Fields: `name`, `type`, `color`, `icon`, `active`, `sortOrder`, `createdAt`,
  `updatedAt`
- References: scheduled items, manual adjustments, budget targets
- Flexible fields: `raw_json`

### `scheduled_items`

- Primary key: `id`
- Fields: `name`, `type`, `amount`, `frequency`, `startDate`, `endDate`,
  `dueDay`, `active`, `categoryId`, `accountId`, `savingsBucketId`, `bucketId`,
  `notes`, `createdAt`, `updatedAt`
- References: `categories.id`, `accounts.id`, `savings_buckets.id`
- Flexible fields: `raw_json`

### `planner_entries`

- Primary key: `entryKey`
- Fields: `scheduledItemId`, `payPeriodDate`, `actualAmount`, `useActual`,
  `validated`, `notes`
- Flexible fields: `lineItems_json`, `raw_json`
- Important: do not rewrite planner entry keys. Keys may encode scheduled item
  IDs and pay-period dates.

### `manual_adjustments`

- Primary key: `id`
- Fields: `date`, `payPeriodDate`, `accountId`, `categoryId`,
  `adjustmentType`, `amount`, `notes`, `createdAt`, `updatedAt`
- References: `accounts.id`, `categories.id`
- Flexible fields: `raw_json`

### `savings_buckets`

- Primary key: `id`
- Fields: `name`, `linkedAccountId`, `startingAmount`, `targetAmount`,
  `active`, `deletedAt`, `notes`, `createdAt`, `updatedAt`
- References: optional `accounts.id`
- Flexible fields: `raw_json`

### `savings_bucket_adjustments`

- Primary key: `id`
- Fields: `bucketId`, `savingsBucketId`, `date`, `payPeriodDate`,
  `adjustmentType`, `amount`, `notes`, `createdAt`, `updatedAt`
- References: `savings_buckets.id`
- Flexible fields: `raw_json`

### `transfers`

- Primary key: `id`
- Fields: `date`, `payPeriodDate`, `fromAccountId`, `toAccountId`, `amount`,
  `bucketId`, `transferType`, `validated`, `notes`, `createdAt`, `updatedAt`
- References: `accounts.id` for source/destination, optional
  `savings_buckets.id`
- Transfer types: `to_savings_bucket`, `from_savings_bucket`,
  `account_transfer`
- Flexible fields: `raw_json`

### `budget_targets`

- Primary key: `id`
- Fields: `name`, `categoryId`, `period`, `amount`, `rollover`, `active`,
  `notes`, `createdAt`, `updatedAt`
- References: `categories.id`
- Flexible fields: `raw_json`

### `import_history`

- Primary key: generated import event ID
- Fields: `importedAt`, `source`, `appVersion`, `exportVersion`,
  `schemaVersion`, `recordCounts_json`, `warnings_json`
- Purpose: diagnostics and support, not finance calculations

### `backup_history`

- Primary key: generated backup event ID
- Fields: `exportedAt`, `fileName`, `targetPath`, `exportVersion`,
  `schemaVersion`
- Purpose: backup reminder and user support

## JSON Import Strategy

Desktop import flow:

1. User selects a FinPath backup JSON file.
2. Parse JSON.
3. Validate the export wrapper.
4. Confirm `appName` is `FinPath` or supported legacy `BudgetApp`.
5. Validate `exportVersion` and `schemaVersion`.
6. Normalize older compatible backups to the current desktop import shape.
7. Validate required section types.
8. Validate missing IDs and duplicate IDs.
9. Validate references.
10. Show import preview with counts, metadata, warnings, and errors.
11. Block import if errors exist.
12. Require explicit overwrite confirmation.
13. Write to SQLite inside one transaction.
14. Roll back the transaction on any failure.
15. Preserve all record IDs and planner entry keys exactly.
16. Show success message.
17. Recommend exporting a desktop backup after import.

Validation should check:

- Valid JSON.
- Recognized backup wrapper or supported legacy app data shape.
- Supported `exportVersion` and `schemaVersion`.
- Arrays or objects for expected collections.
- Missing stable IDs.
- Duplicate stable IDs.
- Missing account references.
- Missing category references.
- Missing savings bucket references.
- Invalid dates.
- Invalid amounts.
- Planner entry shape.
- Transfer account and bucket references.
- Budget target category references.

Desktop import must not generate IDs for existing imported records. Missing IDs
should be import-blocking errors, not auto-repair candidates.

## Desktop Backup And Export Strategy

The desktop app should continue exporting full versioned FinPath JSON backups.

Desktop backup envelope:

- `appName`: `FinPath`
- `appVersion`: desktop app version
- `exportVersion`: continue current versioning
- `schemaVersion`: desktop-supported app data schema version
- `exportedAt`: ISO timestamp
- `source`: `desktop`
- `data`: full portable app data

Rules:

- Preserve stable IDs.
- Keep JSON portable for future app versions.
- Keep aliases only where useful for backwards compatibility.
- Include transfers and savings bucket adjustments.
- Include app metadata, settings, and planner entries.
- Never silently overwrite existing backup files.

Recommended backup UX:

- Manual Export Backup button.
- Backup reminder status.
- Optional automatic timestamped backup before major imports.
- Clear backup location guidance.

## Staged Desktop Build Plan

### Stage 3B: Desktop Technical Proof Of Concept

- Add desktop wrapper.
- Build app locally.
- Open the app shell.
- Confirm FinPath branding.
- Confirm `/BudgetApp/` web deployment remains untouched.
- No database migration yet.

### Stage 3C: SQLite Foundation

- Add SQLite database layer.
- Create schema.
- Add database initialization.
- Add app metadata table.
- Add migration runner.
- No destructive data migration.

### Stage 3D: JSON Import To SQLite

- Import FinPath web backup JSON.
- Validate wrapper and data.
- Show import preview.
- Require confirmation.
- Write records to SQLite transactionally.
- Preserve IDs.
- Roll back on failure.

### Stage 3E: Desktop Data Adapter

- Add desktop data adapter behind existing UI-facing data calls.
- Load from SQLite.
- Save changes to SQLite.
- Keep app UI mostly unchanged.
- Keep calculations shared where possible.

### Stage 3F: Desktop Backup And Export

- Export SQLite data back to versioned FinPath JSON.
- Add backup location guidance.
- Add pre-import backup option.
- Confirm exported desktop backup can re-import.

### Stage 3G: Desktop QA And Installer

- Test install.
- Test JSON import.
- Test data persistence after restart.
- Test backup/export.
- Test report and transfer calculations.
- Build Windows installer.

### Stage 3H: Desktop Final Release

- Final docs.
- Known limitations.
- Release checklist.
- Installer verification.
- Post-install backup/import test.

## Risks And Safeguards

| Risk | Safeguard |
| --- | --- |
| ID mismatch | Use web/PWA IDs as SQLite primary logical IDs. Block imports with missing or duplicate IDs. |
| Double-counted transfers | Keep transfers separate from income/spending and reuse shared report/transaction logic. |
| Schema drift | Store important flexible fields in `raw_json` while promoting stable columns. Version every schema change. |
| Stale web backups | Validate export/schema versions and show warnings for older compatible backups. |
| Destructive imports | Require preview, confirmation, and a SQLite transaction with rollback. |
| User data loss | Recommend/export automatic pre-import backups and never overwrite backup files silently. |
| Path or permission issues | Use platform app data directories and user-selected export paths. Show clear errors. |
| App update migrations | Add explicit migration runner and test upgrades on copies of real backup data. |
| Timezone/date parsing bugs | Preserve `YYYY-MM-DD` date strings and avoid converting date-only values to UTC timestamps. |
| Future desktop import incompatibility | Keep JSON export as the portability contract and preserve stable IDs. |

## Decision Log

- Use SQLite first.
- Use Tauri + React/Vite for the first desktop proof of concept unless a blocker
  appears.
- Use FinPath JSON backups as the migration source.
- Preserve imported IDs and planner entry keys exactly.
- Desktop import uses validation, preview, confirmation, and transaction rollback.
- Desktop export remains versioned JSON.
- No cloud sync in the first desktop version.
- No bank sync in the first desktop version.
- The finalized web/PWA remains stable and deployable at `/BudgetApp/`.

## Open Decisions Before Implementation

- Final desktop framework confirmation after Stage 3B proof of concept.
- SQLite access layer choice: Tauri plugin, Rust commands, or another maintained
  local bridge.
- Exact Windows app data and default backup folder paths.
- Whether desktop supports both web-style JSON import and direct SQLite file
  backup.
- Whether import should replace all data or support a future merge mode. The
  first version should replace after confirmation.
- Whether to keep all existing web localStorage-only state out of desktop
  migration, including release-note dismissal state.
