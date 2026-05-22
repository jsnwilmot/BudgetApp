# Data Safety

Budget Planner is local-first. Your data is stored in your browser through IndexedDB and local storage.

## Where Data Is Stored

Data is stored locally in the browser profile used to open the app. Data in Chrome is separate from data in Edge, Firefox, Safari, another device, or a private browsing session.

## Backup

`Export Backup` downloads a JSON file containing your local planner data, including settings, planner entries, accounts, scheduled items, categories, budget targets, savings buckets, and adjustments.

Backups include app metadata such as app version, backup version, data version, creation date, and source.

## Restore

`Import Backup` reads a JSON backup, validates it, previews record counts, and replaces the current local data after confirmation.

Export a fresh backup before importing another backup if you might need to undo the import.

## Reset

`Reset Local Data` deletes the current local data and restores safe defaults. It requires typing `DELETE`.

Reset is destructive. Export a backup first if you want to preserve your current data.

## Repair Local Data

`Repair Local Data` normalizes local records, fills safe missing fields, and repairs conservative data shape issues. It does not intentionally delete user records or unknown fields.

## When To Export A Backup

- Before clearing browser data.
- Before switching browsers or devices.
- Before importing a backup.
- Before resetting local data.
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
