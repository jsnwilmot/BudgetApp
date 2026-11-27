export const APP_VERSION = '2.4.0';

export const RELEASE_NOTES = {
  version: APP_VERSION,
  title: "What's New",
  date: '2026-11-27',
  highlights: [
    'Choose a calendar year in Planner or use Today to return to the current pay period. The Dashboard keeps your configured forecast range.',
    'Inspect saved entries dated before the Planner start in a separate read-only section. These entries stay outside calculated pay periods and totals.',
    'Previously validated balances may look different after upgrading. Earlier calculations could use the latest recurring amount. Rent confirmed at $1,200 stays $1,200 after the schedule changes to $1,700.',
    'Review any affected historical balances. This correction changes displayed calculations and keeps the saved records intact.',
    'The Planner grid highlights missing amounts and conflicting sources. Open an older cell to see when its source details could not be verified.',
    'Export Backup includes all 11 database stores. Before restoring, download the complete safety backup and confirm that you saved it.',
  ],
};
