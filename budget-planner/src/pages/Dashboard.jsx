import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AlertList from '../components/AlertList';
import StatCard from '../components/StatCard';
import { formatShortDate } from '../logic/dateLogic';
import { getDashboardSummary } from '../logic/projectionLogic';

function createCurrencyFormatter(currency) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency || 'CAD',
  });
}

export default function Dashboard({
  plannerData,
  settings,
  alerts = [],
  alertCounts = { total: 0, warning: 0, danger: 0 },
  onAlertAction,
  onDismissAlert,
}) {
  const summary = getDashboardSummary(plannerData);
  const currencyFormatter = createCurrencyFormatter(settings?.currency);

  function formatCurrency(value) {
    return currencyFormatter.format(Number(value || 0));
  }

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
          value={formatCurrency(summary.nextIncome)}
          helper="Expected income next pay period"
          tone="good"
        />
        <StatCard
          label="Next Expenses"
          value={formatCurrency(summary.nextExpenses)}
          helper="Expected expenses next pay period"
        />
        <StatCard
          label="Next Transfers"
          value={formatCurrency(summary.nextTransfers)}
          helper="Chequing to savings"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Chequing After Next Period"
          value={formatCurrency(summary.projectedChequingAfterNext)}
          helper="Based on planned items"
          tone={summary.projectedChequingAfterNext < 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="Savings After Next Period"
          value={formatCurrency(summary.projectedSavingsAfterNext)}
          helper="Includes planned transfers"
          tone="good"
        />
        <StatCard
          label="Lowest Chequing, 12 Months"
          value={formatCurrency(summary.lowestChequing)}
          helper="Used to spot cash-flow risk"
          tone={lowestTone}
        />
        <StatCard
          label="Projected Savings, 12 Months"
          value={formatCurrency(summary.projectedSavingsEnd)}
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

        <div className="h-72 sm:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={16} />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
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
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
