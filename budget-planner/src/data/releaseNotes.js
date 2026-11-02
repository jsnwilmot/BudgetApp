export const APP_VERSION = '2.0.1-phase1-review';

export const RELEASE_NOTES = {
  version: APP_VERSION,
  title: 'Phase 1 review build',
  date: '2026-11-02',
  highlights: [
    'Replaced demo bucket account links with actual savings-account selection and save-time validation; existing associations remain visible and unchanged.',
    'Added stale bucket-edit protection and safer scheduled-account defaults; historical reconciliation remains a separately reviewed proposal.',
    'Preserved saved planner amounts, notes, line items and source snapshots when recurring items change or are deleted.',
    'Added historical account, category and bucket integrity checks; broken links cannot be newly confirmed.',
    'Added read-only legacy cohorts and exception reporting, separate from missing verification metadata.',
    'Kept historical markers eligible outside the visible forecast; routine edits now retain historical uncertainty warnings.',
    'Added entry-only historical type, account, category and bucket correction with evidence and an audit; saved amounts and recurring schedules stay unchanged.',
    'Added separate amount and source reconciliation confirmations with an original backup or statement reference.',
    'Protected anchor and pay frequency while dated records exist; resetting settings retains the cadence.',
    'Reconciled retained dated activity with account and savings bucket opening balances.',
    'Corrected transfers between accounts of the same type and report movement identity handling.',
    'Added regression, ledger, backup and IndexedDB rollback tests. Year navigation and rolling forecasts are reserved for later phases.',
  ],
};
