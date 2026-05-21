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

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
