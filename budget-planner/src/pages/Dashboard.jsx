import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import StatCard from '../components/StatCard';
import { formatShortDate } from '../logic/dateLogic';
import { formatCurrency, getDashboardSummary } from '../logic/projectionLogic';

export default function Dashboard({ plannerData }) {
  const summary = getDashboardSummary(plannerData);

  const chequingRow = plannerData.projectionRows.find(
    (row) => row.id === 'projected-chequing'
  );

  const savingsRow = plannerData.projectionRows.find(
    (row) => row.id === 'projected-savings'
  );

  const chartData = plannerData.payPeriods.map((period) => ({
    date: formatShortDate(period.date),
    chequing: chequingRow.amountsByPeriod[period.date],
    savings: savingsRow.amountsByPeriod[period.date],
  }));

  const lowestTone = summary.lowestChequing < 0 ? 'danger' : 'good';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Dashboard
        </p>
        <h2 className="text-3xl font-bold text-slate-950">
          Biweekly cash-flow projection
        </h2>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Next Pay Date"
          value={formatShortDate(summary.nextPayDate)}
          helper="Anchor schedule starts June 03, 2026"
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

      <div className="grid grid-cols-4 gap-4">
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-950">
            12-Month Account Projection
          </h3>
          <p className="text-sm text-slate-500">
            Chequing and savings projected from planned income, expenses, and transfers.
          </p>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
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