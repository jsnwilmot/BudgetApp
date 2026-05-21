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

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
