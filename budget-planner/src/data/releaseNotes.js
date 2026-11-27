export const APP_VERSION = '2.1.0';

export const RELEASE_NOTES = {
  version: APP_VERSION,
  title: "What's New",
  date: '2026-11-27',
  highlights: [
    'Complete backups include all 11 database stores, including soft-deleted records.',
    'Backup imports and restores commit together across all stores.',
    'Demo and factory resets preserve your previous records if a reset fails.',
    'Complete exports and restores use the same validation rules for keys and stored values.',
    'Before importing a backup, FinPath prepares a complete copy of your current data and asks you to confirm you saved it.',
    'Pull requests run automated validation. Publishing to GitHub Pages requires a separate owner action for a reviewed commit.',
  ],
};
