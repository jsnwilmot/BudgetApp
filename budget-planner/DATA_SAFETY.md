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

`Export Backup` downloads a JSON file containing your local planner data, including settings, planner entries, accounts, scheduled items, categories, budget targets, savings buckets, and adjustments.

Backups include app metadata such as app version, backup version, data version,
creation date, source, and the last successful backup export timestamp.

Recommended backup frequency:

- At least monthly.
- Before major app updates or deployments.
- Before clearing browser or site data.
- Before switching browsers or devices.
- Before uninstalling the PWA.
- Before importing another backup or resetting local data.

The in-app Help Guide includes the same backup guidance in a shorter format.

## Restore

`Import Backup` reads a JSON backup, validates it, previews record counts, and replaces the current local data after confirmation.

Export a fresh backup before importing another backup if you might need to undo the import.

## Reset Modes

`Reset to Demo Data` replaces current local data with fictional sample records.
It requires typing `DEMO`.

`Factory Reset to Empty App` clears planner data, accounts, scheduled items,
budgets, savings buckets, adjustments, and user/demo records from this
browser/device. It keeps default base categories and safe settings so the app
remains usable. It requires typing `DELETE`.

Both reset modes replace local data. Export a backup first if you want to
preserve your current data. Reset keeps the locally stored last-backup timestamp
when it is valid because that timestamp represents your last successful backup
export action on this browser/device.

## Repair Local Data

`Repair Local Data` normalizes local records, fills safe missing fields, and repairs conservative data shape issues. It does not intentionally delete user records or unknown fields.

## When To Export A Backup

- Before clearing browser data.
- Before switching browsers or devices.
- Before uninstalling the PWA.
- Before importing a backup.
- Before resetting to demo data or factory resetting to an empty app.
- Before a major app update or deployment change.
- After significant planner setup changes.

## Moving Data To Another Device

1. On the old device, open `Settings > Data Management`.
2. Choose `Export Backup`.
3. Move the JSON backup file to the new device.
4. Open the app on the new device.
5. Choose `Import Backup`.
6. Review the preview counts and confirm the import.

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
