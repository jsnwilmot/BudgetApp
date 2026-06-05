You are working on FinPath, a personal finance planning app by Rose & Paw Digital Designs.

Read this file before making any code changes.

Product identity:
- App name: FinPath
- Tagline: Track smarter. Save better.
- Vendor footer: By Rose & Paw Digital Designs
- Design style: clean, mobile-first, deep navy base, teal primary accents, mint highlights, small gold accents, rounded cards, readable spacing, simple charts
- Avoid gradients, glassmorphism, crypto/trading styling, cluttered dashboards, and overbuilt finance jargon

Current app purpose:
FinPath helps users plan real cash flow across pay periods, track income and expenses, manage savings buckets, validate planned items, monitor budgets, review reports, and export/import full backups.

Core app areas:
- Dashboard
- Planner
- Scheduled Items
- Accounts
- Savings Buckets
- Transactions
- Budgets
- Categories
- Reports
- Manage
- Settings
- Help

Technical expectations:
- Keep changes simple, focused, and maintainable.
- Keep calculation logic separate from UI where practical.
- Preserve stable IDs.
- Do not regenerate existing record IDs.
- Do not silently migrate or delete user data.
- Do not change backup/import shape without documenting it.
- Do not add authentication, banking API integration, cloud sync, Stripe, or backend services unless explicitly requested.
- Do not overbuild MVP features.
- Update README and Help documentation when user-facing behavior changes.
- Update release notes when a visible app feature changes.
- Run lint, build, and diff checks before finishing.

Commands:
- npm run lint
- npm run build
- git diff --check

On Windows: npm.cmd run lint and npm.cmd run build

Data and backup rules:
- FinPath is local-first.
- Treat app data as portable, versioned user data.
- Preserve exportVersion/schemaVersion.
- Preserve exportedAt.
- Preserve all stable IDs during import/export.
- Any import flow should validate data, preview impact when possible, and avoid destructive overwrites without confirmation.
- Future desktop migration must remain possible.
- Avoid storage changes that break later migration to desktop SQLite or MySQL.

Planner rules:
- Planner is pay-period based.
- Scheduled income, expenses, bills, and transfers generate planner rows.
- Planner entries may be edited and validated.
- Validation means the user has confirmed the planned item happened or is correct.
- Do not confuse planned, projected, and validated values.
- Keep labels plain and explicit.

Important planner labels:
- Total Income
- Total Expenses
- Total Transfers to Savings
- Net Chequing Change
- Projected Chequing
- Validated Chequing
- Projected Savings

Meaning:
- Total Income includes income rows for the pay period.
- Total Expenses includes expenses and transfers out of chequing when the app logic treats savings transfers as cash-flow out.
- Total Transfers to Savings shows planned movement from chequing into savings.
- Net Chequing Change equals income minus expenses and savings transfers, based on current app logic.
- Projected Chequing is the planned chequing balance after that period.
- Validated Chequing should only reflect validated items where applicable.
- Projected Savings shows planned savings movement.

Savings bucket rules:
- Savings buckets represent the intended purpose of savings money.
- Bucket starting balances are current user-entered baseline amounts.
- Planner transfers to savings buckets should affect bucket projections.
- Validated planner transfers should affect validated bucket balances.
- Manual transfer records should represent actual movements between accounts and buckets.
- Do not silently copy planner transfers into stored transfer records because this can double-count.
- If planner transfers are shown in bucket activity, show them as derived/read-only planner activity unless the user explicitly creates a manual transfer record.
- Clearly separate:
  - Starting bucket balance
  - Current projected bucket balance
  - Current validated bucket balance
  - Final projected bucket balance
  - Transfer record activity
  - Planner-derived activity
  - Manual bucket adjustments

Savings bucket UX requirements:
- Users must be able to see current bucket values, not only future projections.
- Users must be able to compare current savings account balance against current bucket totals.
- Warnings should be clear if bucket totals do not match actual savings account balances.
- Use plain helper text to explain whether a number is projected, validated, or final projection.

Transfer rules:
- Transfers may move money between accounts.
- Transfers involving savings buckets should be visible from the Savings Buckets page.
- Manual transfer records may have edit/delete controls.
- Derived planner transfer activity should not have edit/delete controls.
- Avoid double-counting the same savings movement across planner rows and manual transfer records.
- If duplicate detection is added, it should warn only. It should not block the user unless explicitly requested.

Reports rules:
- Reports should match the same source data and calculations used elsewhere.
- Do not create separate report math that disagrees with dashboard, planner, or bucket totals.
- Keep report charts readable on mobile.
- CSV export and print behavior should remain stable.

UI rules:
- Mobile-first.
- Use responsive cards and tables with horizontal scroll where needed.
- Use clear empty states.
- Use confirmation before deleting records.
- Use formatted currency and readable dates.
- Keep forms short and fast.
- Do not make the user understand accounting terms to use the app.

Validation rules:
- Amounts must be greater than 0 unless the existing feature explicitly supports corrections.
- Dates are required.
- Category or bucket is required where relevant.
- Prevent invalid recurrence settings.
- Avoid negative balances unless the app intentionally supports debt/overdraft behavior.
- Show clear errors near the field.

Documentation requirements:
When visible behavior changes, update:
- README.md
- Help page or help content
- releaseNotes.js
- manual test checklist if present

For every completed task, return:
- Files changed
- Summary of changes
- How the app behavior changed
- Manual test steps
- Build/lint results
- Known limitations
