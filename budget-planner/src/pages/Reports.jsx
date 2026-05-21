import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  buildBucketBalanceChartData,
  buildIncomeOutflowChartData,
  buildReportRowsFromPlannerData,
  buildSavingsTransferChartData,
  calculateBudgetUsedPercentage,
  calculateCategoryTotals,
  calculateMonthlySummary,
  calculateSavingsSummary,
  getAvailableMonths,
  getAvailablePayPeriods,
  getCurrentMonthKey,
  getItemsForMonth,
  getItemsForPayPeriod,
  getMonthLabel,
  getRowsForMonth,
  getRowsForPayPeriod
} from "../logic/reportLogic";

const INCOME_OUTFLOW_COLORS = ["#2563eb", "#475569", "#f97316", "#059669"];
const SAVINGS_COLORS = ["#059669", "#dc2626", "#2563eb"];
const CATEGORY_COLOR = "#7c3aed";
const BUCKET_COLOR = "#0f766e";

function createCurrencyFormatter(currency) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency || "CAD"
  });
}

function truncateLabel(value, maxLength = 18) {
  const label = String(value || "");

  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength - 1)}...`;
}

function chartHasAnyValue(data = []) {
  return data.some((item) => Number(item.value || 0) !== 0);
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

function ChartCard({ title, helper, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-xl font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{helper}</p>
      </div>
      {children}
    </section>
  );
}

function CurrencyTooltip({ active, payload, label, currencyFormatter }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-950">{label}</p>
      <p className="text-slate-600">
        {currencyFormatter.format(Number(payload[0].value || 0))}
      </p>
    </div>
  );
}

function EmptyChartState({ message }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
      {message}
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
  plannerData,
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

  const reportRows = useMemo(() => {
    const rowsFromPlannerData = buildReportRowsFromPlannerData(plannerData);
    return rowsFromPlannerData.length > 0 ? rowsFromPlannerData : plannerRows;
  }, [plannerData, plannerRows]);

  const availableMonths = useMemo(
    () => getAvailableMonths(reportRows),
    [reportRows]
  );

  const availablePayPeriods = useMemo(
    () => getAvailablePayPeriods(reportRows),
    [reportRows]
  );

  const [reportFilter, setReportFilter] = useState("month");
  const [selectedMonth, setSelectedMonth] = useState(
    availableMonths[0] || getCurrentMonthKey()
  );
  const [selectedPayPeriod, setSelectedPayPeriod] = useState(
    availablePayPeriods[0]?.date || ""
  );

  const activeSelectedMonth = availableMonths.includes(selectedMonth)
    ? selectedMonth
    : availableMonths[0] || selectedMonth;

  const activeSelectedPayPeriod = availablePayPeriods.some(
    (period) => period.date === selectedPayPeriod
  )
    ? selectedPayPeriod
    : availablePayPeriods[0]?.date || selectedPayPeriod;

  const selectedRows = useMemo(() => {
    if (reportFilter === "payPeriod") {
      return getRowsForPayPeriod(reportRows, activeSelectedPayPeriod);
    }

    return getRowsForMonth(reportRows, activeSelectedMonth);
  }, [activeSelectedMonth, activeSelectedPayPeriod, reportFilter, reportRows]);

  const scopedMiscExpenses = useMemo(() => {
    if (reportFilter === "payPeriod") {
      return getItemsForPayPeriod(miscExpenses, activeSelectedPayPeriod);
    }

    return getItemsForMonth(miscExpenses, activeSelectedMonth);
  }, [activeSelectedMonth, activeSelectedPayPeriod, miscExpenses, reportFilter]);

  const scopedSavingsTransfers = useMemo(() => {
    if (reportFilter === "payPeriod") {
      return getItemsForPayPeriod(savingsTransfers, activeSelectedPayPeriod);
    }

    return getItemsForMonth(savingsTransfers, activeSelectedMonth);
  }, [
    activeSelectedMonth,
    activeSelectedPayPeriod,
    reportFilter,
    savingsTransfers
  ]);

  const monthlySummary = useMemo(
    () => calculateMonthlySummary(selectedRows),
    [selectedRows]
  );

  const budgetUsedPercentage = useMemo(
    () => calculateBudgetUsedPercentage(monthlySummary),
    [monthlySummary]
  );

  const categoryTotals = useMemo(
    () => calculateCategoryTotals(scopedMiscExpenses).slice(0, 5),
    [scopedMiscExpenses]
  );

  const savingsSummary = useMemo(
    () => calculateSavingsSummary(savingsBuckets, scopedSavingsTransfers),
    [savingsBuckets, scopedSavingsTransfers]
  );

  const incomeOutflowChartData = useMemo(
    () => buildIncomeOutflowChartData(monthlySummary),
    [monthlySummary]
  );

  const categoryChartData = useMemo(
    () =>
      categoryTotals.map((item) => ({
        name: item.category,
        value: item.total
      })),
    [categoryTotals]
  );

  const savingsTransferChartData = useMemo(
    () => buildSavingsTransferChartData(savingsSummary),
    [savingsSummary]
  );

  const bucketBalanceChartData = useMemo(
    () => buildBucketBalanceChartData(savingsSummary),
    [savingsSummary]
  );

  const selectedPayPeriodLabel =
    availablePayPeriods.find(
      (period) => period.date === activeSelectedPayPeriod
    )?.label || activeSelectedPayPeriod;

  const reportRangeLabel =
    reportFilter === "payPeriod"
      ? selectedPayPeriodLabel || "Selected pay period"
      : getMonthLabel(activeSelectedMonth);

  const hasReportData =
    reportRows.length > 0 ||
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
            Budget reports
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Review income, expenses, remaining balance, savings transfers, and
            top spending categories.
          </p>
        </div>

        <div className="grid gap-3 sm:min-w-[360px] sm:grid-cols-[auto_1fr] sm:items-end">
          <div>
            <p className="text-sm font-medium text-slate-600">View</p>
            <div className="mt-1 inline-flex rounded-xl border border-slate-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setReportFilter("month")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  reportFilter === "month"
                    ? "bg-slate-950 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setReportFilter("payPeriod")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  reportFilter === "payPeriod"
                    ? "bg-slate-950 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                Pay Period
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-600">
              {reportFilter === "payPeriod" ? "Pay period" : "Report month"}
            </label>
            {reportFilter === "payPeriod" ? (
              <select
                value={activeSelectedPayPeriod}
                onChange={(event) => setSelectedPayPeriod(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                {availablePayPeriods.length === 0 && (
                  <option value="">No pay periods</option>
                )}

                {availablePayPeriods.map((period) => (
                  <option key={period.date} value={period.date}>
                    {period.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={activeSelectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                {availableMonths.length === 0 && (
                  <option value={activeSelectedMonth}>
                    {getMonthLabel(activeSelectedMonth)}
                  </option>
                )}

                {availableMonths.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>
                    {getMonthLabel(monthKey)}
                  </option>
                ))}
              </select>
            )}
          </div>
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
              label="Income"
              value={formatCurrency(monthlySummary.income)}
              helper={reportRangeLabel}
            />

            <StatCard
              label="Expenses"
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

          <ChartCard
            title="Income vs Outflow"
            helper="Compares income with planned expenses, misc expenses, and transfers for the selected report."
          >
            {selectedRows.length === 0 ? (
              <EmptyChartState message="No planner rows match this filter." />
            ) : (
              <div className="h-[280px]" aria-label="Income vs outflow chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incomeOutflowChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      tick={{ fill: "#475569", fontSize: 12 }}
                      tickFormatter={(value) => truncateLabel(value, 13)}
                    />
                    <YAxis
                      tick={{ fill: "#475569", fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                      width={88}
                    />
                    <Tooltip
                      content={
                        <CurrencyTooltip
                          currencyFormatter={currencyFormatter}
                        />
                      }
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {incomeOutflowChartData.map((item, index) => (
                        <Cell
                          key={item.name}
                          fill={
                            INCOME_OUTFLOW_COLORS[
                              index % INCOME_OUTFLOW_COLORS.length
                            ]
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <section className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Top Spending Categories"
              helper="Shows the top five misc expense categories for the selected report."
            >
              {categoryTotals.length === 0 ? (
                <EmptyChartState message="No category spending found for this filter." />
              ) : (
                <>
                  <div
                    className="h-[280px]"
                    aria-label="Top spending categories chart"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fill: "#475569", fontSize: 12 }}
                          tickFormatter={(value) => formatCurrency(value)}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={130}
                          tick={{ fill: "#475569", fontSize: 12 }}
                          tickFormatter={(value) => truncateLabel(value, 18)}
                        />
                        <Tooltip
                          content={
                            <CurrencyTooltip
                              currencyFormatter={currencyFormatter}
                            />
                          }
                        />
                        <Bar
                          dataKey="value"
                          fill={CATEGORY_COLOR}
                          radius={[0, 8, 8, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 space-y-3">
                    {categoryTotals.map((item) => (
                      <div
                        key={item.category}
                        className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"
                      >
                        <span className="min-w-0 truncate font-medium text-slate-800">
                          {item.category}
                        </span>
                        <span className="shrink-0 font-bold text-slate-950">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>

            <ChartCard
              title="Savings Transfers"
              helper="Compares transfers into savings, transfers out, and the net movement."
            >
              {!chartHasAnyValue(savingsTransferChartData) ? (
                <EmptyChartState message="No savings transfers found for this filter." />
              ) : (
                <div
                  className="h-[280px]"
                  aria-label="Savings transfers chart"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={savingsTransferChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => truncateLabel(value, 13)}
                      />
                      <YAxis
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => formatCurrency(value)}
                        width={88}
                      />
                      <Tooltip
                        content={
                          <CurrencyTooltip
                            currencyFormatter={currencyFormatter}
                          />
                        }
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {savingsTransferChartData.map((item, index) => (
                          <Cell
                            key={item.name}
                            fill={SAVINGS_COLORS[index % SAVINGS_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-500">
                    Transfers In
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {formatCurrency(savingsSummary.totals.transfersIn)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-500">
                    Transfers Out
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {formatCurrency(savingsSummary.totals.transfersOut)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-500">
                    Net Transfers
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {formatCurrency(savingsSummary.totals.netTransfers)}
                  </p>
                </div>
              </div>
            </ChartCard>
          </section>

          <ChartCard
            title="Bucket Balances"
            helper="Shows up to eight savings buckets with the highest balances."
          >
            {savingsSummary.buckets.length === 0 ? (
              <EmptyChartState message="No savings buckets found yet." />
            ) : (
              <>
                <div
                  className="h-[320px]"
                  aria-label="Savings bucket balances chart"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bucketBalanceChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={140}
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => truncateLabel(value, 20)}
                      />
                      <Tooltip
                        content={
                          <CurrencyTooltip
                            currencyFormatter={currencyFormatter}
                          />
                        }
                      />
                      <ReferenceLine x={0} stroke="#94a3b8" />
                      <Bar
                        dataKey="value"
                        fill={BUCKET_COLOR}
                        radius={[0, 8, 8, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

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
              </>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}
