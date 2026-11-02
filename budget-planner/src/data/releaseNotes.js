export const APP_VERSION = '2.0.1-phase1-review';

export const RELEASE_NOTES = {
  version: APP_VERSION,
  title: 'Phase 1 review build',
  date: '2026-11-02',
  highlights: [
    'Preserved saved planner amounts, notes, line items and source snapshots when recurring items change or are deleted.',
    'Kept historical markers eligible outside the visible forecast; routine edits now retain historical uncertainty warnings.',
    'Added separate amount and source reconciliation confirmations with an original backup or statement reference.',
    'Protected anchor and pay frequency while dated records exist; resetting settings retains the cadence.',
    'Reconciled retained dated activity with account and savings bucket opening balances.',
    'Corrected transfers between accounts of the same type and report movement identity handling.',
    'Added regression, ledger, backup and IndexedDB rollback tests. Year navigation and rolling forecasts are reserved for later phases.',
  ],
};
