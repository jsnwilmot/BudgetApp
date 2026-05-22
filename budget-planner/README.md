# React + Vite

## Phase 1M: Charts and Report Visuals

Completed:

- Added income vs outflow chart.
- Added top spending categories chart.
- Added savings transfers chart.
- Added savings bucket balances chart.
- Charts respond to monthly and pay period filters.
- Added chart empty states.
- Kept report tables and summary cards for clarity.

Known limitation:

- Charts are local-only and based on current app data.
- Advanced trend charts and forecast analytics are not included yet.

## Phase 1N: Advanced Report Trends

Completed:

- Added monthly cash flow trend reporting.
- Added pay-period cash flow trend reporting.
- Added savings transfer trend reporting where dated transfer data exists.
- Added trend summary cards.
- Added trend empty states.
- Reused existing report calculations for accuracy.

Known limitation:

- Trends are based on local planner and transfer data only.
- Savings transfer trends require dated transfer history.
- Advanced forecasting and PDF reports are not included yet.

## Phase 1O: Report Export and Print View

Completed:

- Added print action for the current Reports view.
- Added print-friendly report layout.
- Added report-specific CSV export.
- CSV export includes metadata, summary totals, categories, savings transfers, savings buckets, and trend summary.
- Export respects the current monthly or pay-period report filter.

Known limitation:

- PDF export uses browser print/save as PDF.
- Chart image export is not included.
- Cloud sync and automated report delivery are not included.

## Phase 1P: Editable Budget Planner Settings

Completed:

- Added editable planner settings.
- Added local persistence for settings.
- Added Save, Cancel, and Reset controls.
- Added validation for planner settings.
- Connected saved settings to planner recalculation.
- Preserved backup/restore compatibility.

Known limitation:

- Settings are local-only.
- No account sync or cloud settings sync is included.
- Advanced pay schedules, like twice monthly by specific dates, are not included yet.

## Phase 1Q: Settings-driven Projection Hardening

Completed:

- Audited projection logic for saved settings usage.
- Hardened settings normalization and validation.
- Improved projection rebuild behavior after settings changes.
- Preserved planner entries when projection settings change.
- Verified monthly bill assignment rules.
- Confirmed backup/restore compatibility with saved settings.
- Added edge-case handling for invalid or missing settings.

Known limitation:

- Manual entries outside the current projection range remain stored but may not appear until the projection range or anchor date includes them again.
- Advanced pay schedules, such as twice monthly fixed dates, are not included yet.

## Phase 1R: Category Management

Completed:

- Added local category model.
- Added default income, expense, savings, transfer, and general categories.
- Added category persistence.
- Added Categories page.
- Added category create, edit, and archive workflows.
- Added category assignment support for scheduled items.
- Updated report category resolution.
- Preserved backup/restore compatibility.

Known limitation:

- Category budget limits are not included yet.
- Drag-and-drop category sorting is not included yet.
- Category icons are stored as simple text for now.

## Phase 1S: Scheduled Item Improvements

Completed:

- Hardened scheduled item data normalization.
- Added improved scheduled item filters.
- Added active/inactive scheduled item support.
- Added duplicate scheduled item action.
- Improved scheduled item validation.
- Improved recurrence handling for once, weekly, biweekly, monthly, and yearly items.
- Added scheduled item summary cards.
- Added upcoming next 30 days section.
- Preserved category, backup, restore, and projection compatibility.

Known limitation:

- Advanced custom recurrence rules are not included yet.
- Drag-and-drop ordering is not included yet.
- Automated bill reminders are not included yet.

## Phase 1T: Transaction History Foundation

Completed:

- Added Transactions page.
- Added unified transaction-style rows derived from existing local data.
- Added transaction summary cards.
- Added transaction search, filters, and sorting.
- Added category, account, and savings bucket name resolution.
- Added filtered transaction CSV export.
- Preserved backup and restore compatibility.

Known limitation:

- Transactions are currently derived from existing planner, manual adjustment, scheduled item, and savings bucket activity.
- Direct standalone transaction entry is not included yet.
- Bank import, receipt upload, and reconciliation are not included.

## Phase 1U: Budget Targets

Completed:

- Added local budget target model.
- Added budget target persistence.
- Added Budgets page.
- Added monthly category budget targets.
- Added budget usage calculations.
- Added remaining budget and over-budget status.
- Added budget progress bars.
- Added budget target backup/restore compatibility.

Known limitation:

- Budgets are monthly only.
- Rollover is stored but full rollover math is not implemented yet.
- Advanced budget alerts are not included yet.

## Phase 1V: Alerts and Warnings

Completed:

- Added local in-app alert generation.
- Added Dashboard alerts and warnings panel.
- Added low balance alerts.
- Added near-budget and over-budget alerts.
- Added upcoming bill alerts.
- Added missing setup alerts.
- Added contextual page-level warnings where useful.
- Preserved existing app behavior.

Known limitation:

- Alerts are in-app only.
- Push notifications, email reminders, and browser notification permissions are not included yet.
- Advanced custom alert thresholds are not included yet.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
