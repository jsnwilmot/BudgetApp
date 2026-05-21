import { useMemo, useState } from "react";
import {
  calculateBudgetUsedPercentage,
  calculateCategoryTotals,
  calculateMonthlySummary,
  calculateSavingsSummary,
  getAvailableMonths,
  getCurrentMonthKey,
  getMonthLabel,
  getRowsForMonth
} from "../logic/reportLogic";

function createCurrencyFormatter(currency) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency || "CAD"
  });
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      {helper && <p className="mt-1 text-sm text-slate-500">{helper}</p>}
    </div>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
    </div>
  );
}

export default function Reports({
  settings,
  plannerRows = [],
  miscExpenses = [],
  savingsBuckets = [],
  savingsTransfers = []
}) {
  const currencyFormatter = useMemo(
    () => createCurrencyFormatter(settings?.currency),
    [settings?.currency]
  );

  function formatCurrency(value) {
    return currencyFormatter.format(Number(value || 0));
  }

  const availableMonths = useMemo(
    () => getAvailableMonths(plannerRows),
    [plannerRows]
  );

  const [selectedMonth, setSelectedMonth] = useState(
    availableMonths[0] || getCurrentMonthKey()
  );

  const selectedRows = useMemo(
    () => getRowsForMonth(plannerRows, selectedMonth),
    [plannerRows, selectedMonth]
  );

  const monthlySummary = useMemo(
    () => calculateMonthlySummary(selectedRows),
    [selectedRows]
  );

  const budgetUsedPercentage = useMemo(
    () => calculateBudgetUsedPercentage(monthlySummary),
    [monthlySummary]
  );

  const categoryTotals = useMemo(
    () => calculateCategoryTotals(miscExpenses).slice(0, 5),
    [miscExpenses]
  );

  const savingsSummary = useMemo(
    () => calculateSavingsSummary(savingsBuckets, savingsTransfers),
    [savingsBuckets, savingsTransfers]
  );

  const hasReportData =
    selectedRows.length > 0 ||
    miscExpenses.length > 0 ||
    savingsBuckets.length > 0 ||
    savingsTransfers.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Reports
          </p>
          <h2 className="text-3xl font-bold text-slate-950">
            Reports foundation
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Review monthly income, expenses, remaining balance, savings
            transfers, and top spending categories.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-600">
            Report month
          </label>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
          >
            {availableMonths.length === 0 && (
              <option value={selectedMonth}>
                {getMonthLabel(selectedMonth)}
              </option>
            )}

            {availableMonths.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {getMonthLabel(monthKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hasReportData && (
        <EmptyState
          title="No report data yet"
          message="Add planner rows, savings buckets, or transfers to see reports."
        />
      )}

      {hasReportData && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Monthly Income"
              value={formatCurrency(monthlySummary.income)}
              helper={getMonthLabel(selectedMonth)}
            />

            <StatCard
              label="Monthly Expenses"
              value={formatCurrency(
                monthlySummary.expenses + monthlySummary.miscExpenses
              )}
              helper="Scheduled expenses plus misc expenses"
            />

            <StatCard
              label="Remaining Balance"
              value={formatCurrency(monthlySummary.remainingBalance)}
              helper="Based on selected planner rows"
            />

            <StatCard
              label="Budget Used"
              value={`${budgetUsedPercentage}%`}
              helper="Expenses and savings transfers compared to income"
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">
                Top spending categories
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Highest misc expense categories found in your data.
              </p>

              {categoryTotals.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  No category spending found yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {categoryTotals.map((item) => (
                    <div
                      key={item.category}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
                    >
                      <span className="font-medium text-slate-800">
                        {item.category}
                      </span>
                      <span className="font-bold text-slate-950">
                        {formatCurrency(item.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-bold text-slate-950">
                Savings transfer summary
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Tracks how much moved into and out of savings buckets.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatCard
                  label="Transfers In"
                  value={formatCurrency(savingsSummary.totals.transfersIn)}
                />

                <StatCard
                  label="Transfers Out"
                  value={formatCurrency(savingsSummary.totals.transfersOut)}
                />

                <StatCard
                  label="Net Transfers"
                  value={formatCurrency(savingsSummary.totals.netTransfers)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xl font-bold text-slate-950">
              Savings buckets
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Bucket balances and transfer activity.
            </p>

            {savingsSummary.buckets.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                No savings buckets found yet.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr>
                      <th className="py-3 pr-4 text-left font-semibold text-slate-600">
                        Bucket
                      </th>
                      <th className="py-3 pr-4 text-right font-semibold text-slate-600">
                        Balance
                      </th>
                      <th className="py-3 pr-4 text-right font-semibold text-slate-600">
                        Transfers In
                      </th>
                      <th className="py-3 pr-4 text-right font-semibold text-slate-600">
                        Transfers Out
                      </th>
                      <th className="py-3 text-right font-semibold text-slate-600">
                        Net
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {savingsSummary.buckets.map((bucket) => (
                      <tr key={bucket.id || bucket.name}>
                        <td className="py-3 pr-4 font-medium text-slate-900">
                          {bucket.name}
                        </td>
                        <td className="py-3 pr-4 text-right text-slate-700">
                          {formatCurrency(bucket.balance)}
                        </td>
                        <td className="py-3 pr-4 text-right text-slate-700">
                          {formatCurrency(bucket.transfersIn)}
                        </td>
                        <td className="py-3 pr-4 text-right text-slate-700">
                          {formatCurrency(bucket.transfersOut)}
                        </td>
                        <td className="py-3 text-right font-semibold text-slate-950">
                          {formatCurrency(bucket.netTransfers)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}