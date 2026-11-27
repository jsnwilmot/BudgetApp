# Data Safety

FinPath is local-first. Your data is stored in your browser through IndexedDB and local storage.

The current PWA uses browser-managed storage on the device. Clearing browser or
site data can delete app data, even when the app is installed. Export backups
regularly.

FinPath tracks the last successful backup export in local app
metadata. If no backup exists, or the last backup is older than 30 days, the app
shows an in-app reminder.

The public app starts with clearly fictional demo data. Demo records are only
sample records for exploring the app and can be edited, backed up, replaced with
demo data again, or cleared with an empty reset.

The first-run onboarding and Help page repeat the most important safety rule:
local browser data can be lost, so export backups regularly.

## Where Data Is Stored

Data is stored locally in the browser profile used to open the app. Data in Chrome is separate from data in Edge, Firefox, Safari, another device, or a private browsing session.

Installed PWA data is still tied to the browser engine/profile that installed
it. Uninstalling the PWA or clearing site data may remove access to the local
data.

## Backup

`Export Backup` validates and downloads a complete JSON snapshot of all 11
IndexedDB stores. It includes original supported keys and values, soft-deleted
records, and app metadata such as Last Entry and the saved backup timestamp.
If an unsupported stored value prevents a complete backup, FinPath reports the
affected store and record position when available.

Recommended backup frequency:

- At least monthly.
- Before major app updates or deployments.
- Before clearing browser or site data.
- Before switching browsers or devices.
- Before uninstalling the PWA.
- Before resetting local data.

The in-app Help Guide includes the same backup guidance in a shorter format.

## Restore

`Import Backup` validates and previews the selected file, then prepares a
complete pre-restore backup. Download it, check that you saved it, and confirm.
Store it somewhere you control. FinPath cannot verify that the
browser saved the file. Cancelling or failing the safety step leaves the
database and backup reminder unchanged.

Restore replaces all 11 stores in one transaction. It first compares the
current records to the safety backup to detect changes since preparation. If
records have changed, prepare and save a fresh backup before retrying. If the
restore transaction aborts, all previous records remain in place.

## Reset Modes

`Reset to Demo Data` replaces current local data with fictional sample records.
It requires typing `DEMO`.

`Factory Reset to Empty App` clears planner data, accounts, scheduled items,
budgets, savings buckets, adjustments, and user/demo records from this
browser/device. It keeps default base categories and safe settings so the app
remains usable. It requires typing `DELETE`.

Both resets replace all 11 stores in a single transaction. FinPath updates the
screen and reports success after the transaction completes. If a reset fails,
the previous records remain in place. Reopen the app to check the existing data
before retrying. Reset preserves the saved backup timestamp and onboarding
completion date when valid. Export a backup before a reset if you need to keep
the current financial records.

Local synthetic Chromium checks cover reset rollback and complete-backup
recovery across all 11 stores, including typed values, soft-deleted records and
reopening the browser. Other browser engines, mobile, large backups, physical
storage durability and recovery of owner financial data remain unverified.

## Repair Local Data

`Repair Local Data` normalizes local records, fills safe missing fields, and repairs conservative data shape issues. It does not intentionally delete user records or unknown fields.

## When To Export A Backup

- Before clearing browser data.
- Before switching browsers or devices.
- Before uninstalling the PWA.
- Before resetting to demo data or factory resetting to an empty app.
- Before a major app update or deployment change.
- After significant planner setup changes.

## Moving Data To Another Device

1. On the old device, open `Settings > Data Management`.
2. Choose `Export Backup`.
3. Move the JSON backup file to the new device.
4. Open the app on the new device.
5. Choose `Import Backup`.
6. Review the preview, download and save the pre-restore backup, and confirm
   the import.

If browser data is cleared and no backup exists, the app cannot recover the removed local data.

## Updates And Stale PWA Cache

After a deployment, refresh FinPath if the browser tab or installed PWA still
shows old content. If stale content persists, close and reopen the installed
PWA or try an incognito/private window. Clear site data only after exporting a
fresh backup.

## Future Desktop Storage Direction

A future desktop version is planned to use app-managed SQLite storage for
stronger long-term local data safety. The web/PWA release does not migrate data
to SQLite. For now, backups remain the safest way to protect long-term finance
data.
