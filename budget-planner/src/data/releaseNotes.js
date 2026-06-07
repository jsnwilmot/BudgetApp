export const APP_VERSION = '2.0.0-web-final';

export const RELEASE_NOTES = {
  version: APP_VERSION,
  title: "What's New",
  date: '2026-05-24',
  highlights: [
    'Finalized FinPath web/PWA release.',
    'Confirmed local-first backup, import preview, and Data Health tools.',
    'Confirmed Reports, transfers, savings movement, budgets, and planner QA coverage.',
    'Improved Savings Buckets with current projected balances, validated bucket balances, and read-only validated planner transfer activity.',
    'Fixed Reports bucket balances so they use current bucket projection data instead of only starting balances.',
    'Fixed Reports transfer summaries so planned, validated, manual, and adjustment-based savings movement are clearly separated.',
    'Improved missing-account alerts with clearer copy and deduplication.',
    'Added account assignment to scheduled income, expenses, and debts, with missing-account alerts opening the source scheduled item.',
    'Kept non-danger alert dismissals after refresh and prevented update notices from covering status messages.',
    'Hardened IndexedDB replacement writes and removed stale full-app localStorage diagnostics.',
    'Confirmed mobile and PWA release readiness.',
    'Prepared the app for stable daily use before future desktop migration.',
  ],
};
