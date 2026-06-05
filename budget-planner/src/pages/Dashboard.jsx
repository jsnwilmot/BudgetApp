import { useEffect, useRef, useState } from 'react';
import {
  Line,
  LineChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AlertList from '../components/AlertList';
import StatCard from '../components/StatCard';
import { formatShortDate } from '../logic/dateLogic';
import { formatCurrency, getDashboardSummary } from '../logic/projectionLogic';

function MeasuredChartFrame({ children, className }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function updateSize() {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();

      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    }

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {size.width > 1 && size.height > 1 ? children(size) : null}
    </div>
  );
}

export default function Dashboard({
  plannerData,
  settings,
  alerts = [],
  alertCounts = { total: 0, warning: 0, danger: 0 },
  appMetadata = {},
  isEmptyApp = false,
  onAlertAction,
  onDismissAlert,
  onCompleteOnboarding,
  onStartEmpty,
  onImportBackup,
  onOpenHelp,
}) {
  const summary = getDashboardSummary(plannerData);
  const currency = settings?.currency || 'CAD';
  const formatDashboardCurrency = (value) => formatCurrency(value, currency);

  const chequingRow = plannerData.projectionRows.find(
    (row) => row.id === 'projected-chequing'
  );

  const savingsRow = plannerData.projectionRows.find(
    (row) => row.id === 'projected-savings'
  );

  const chartData = plannerData.payPeriods.map((period) => ({
    date: formatShortDate(period.date),
    chequing: chequingRow?.amountsByPeriod?.[period.date] || 0,
    savings: savingsRow?.amountsByPeriod?.[period.date] || 0,
  }));

  const lowestTone = summary.lowestChequing < 0 ? 'danger' : 'good';
  const showOnboarding =
    appMetadata?.dataMode === 'demo' && !appMetadata?.onboardingCompletedAt;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Dashboard
        </p>
        <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
          Cash-flow projection
        </h2>
      </div>

      {showOnboarding ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Welcome
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">
                Start with demo data, empty setup, or a backup
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                This is a local-first budget planner. The public app starts with
                fictional demo data, and anything you change is stored locally in
                this browser/device. Export backups regularly to protect your
                planner data.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onCompleteOnboarding}
                className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Explore Demo Data
              </button>
              <button
                type="button"
                onClick={onStartEmpty}
                className="min-h-11 rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
              >
                Start Empty
              </button>
              <button
                type="button"
                onClick={onImportBackup}
                className="min-h-11 rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
              >
                Import Backup
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isEmptyApp ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
          <h3 className="text-lg font-bold text-slate-950">
            Your app is empty
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Start by adding an account, scheduled income, scheduled expenses,
            and savings buckets. You can also open Help for a quick setup guide.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onAlertAction?.('accounts')}
              className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Add Account
            </button>
            <button
              type="button"
              onClick={() => onAlertAction?.('scheduled-items')}
              className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Add Scheduled Item
            </button>
            <button
              type="button"
              onClick={onOpenHelp}
              className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Go to Help
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Alerts"
          value={alertCounts.total}
          helper="Active in-app alerts."
          tone={alertCounts.total > 0 ? 'blue' : 'good'}
        />
        <StatCard
          label="Warnings"
          value={alertCounts.warning}
          helper="Items that need attention soon."
          tone={alertCounts.warning > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Critical"
          value={alertCounts.danger}
          helper="Cash-flow or budget risks."
          tone={alertCounts.danger > 0 ? 'danger' : 'default'}
        />
      </div>

      <AlertList
        title="Alerts and Warnings"
        helper="Key budget, cash-flow, and setup risks from your local data."
        alerts={alerts}
        maxItems={5}
        showEmpty
        onAction={onAlertAction}
        onDismiss={onDismissAlert}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Next Pay Date"
          value={summary.nextPayDate ? formatShortDate(summary.nextPayDate) : 'Not available'}
          helper="Based on saved planner settings"
          tone="blue"
        />
        <StatCard
          label="Next Income"
          value={formatDashboardCurrency(summary.nextIncome)}
          helper="Expected income next pay period"
          tone="good"
        />
        <StatCard
          label="Next Expenses"
          value={formatDashboardCurrency(summary.nextExpenses)}
          helper="Expected expenses next pay period"
        />
        <StatCard
          label="Next Transfers"
          value={formatDashboardCurrency(summary.nextTransfers)}
          helper="Chequing to savings"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Chequing After Next Period"
          value={formatDashboardCurrency(summary.projectedChequingAfterNext)}
          helper="Based on planned items"
          tone={summary.projectedChequingAfterNext < 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Savings After Next Period"
          value={formatDashboardCurrency(summary.projectedSavingsAfterNext)}
          helper="Includes planned transfers"
          tone="good"
        />
        <StatCard
          label="Lowest Chequing, 12 Months"
          value={formatDashboardCurrency(summary.lowestChequing)}
          helper="Used to spot cash-flow risk"
          tone={lowestTone}
        />
        <StatCard
          label="Projected Savings, 12 Months"
          value={formatDashboardCurrency(summary.projectedSavingsEnd)}
          helper="Projected end balance"
          tone="good"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-950">
            12-Month Account Projection
          </h3>
          <p className="text-sm text-slate-500">
            Chequing and savings projected from planned income, expenses, and transfers.
          </p>
        </div>

        <MeasuredChartFrame className="h-72 sm:h-96">
          {({ width, height }) => (
            <LineChart width={width} height={height} data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={16} />
              <YAxis />
              <Tooltip formatter={(value) => formatDashboardCurrency(value)} />
              <Line
                type="monotone"
                dataKey="chequing"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="savings"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          )}
        </MeasuredChartFrame>
      </section>
    </div>
  );
}
