import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  calculateBudgetUsage
} from "../logic/budgetLogic";
import { getCurrentMonthKey } from "../logic/dateLogic";
import {
  buildSavingsBucketProjection,
  formatCurrency
} from "../logic/projectionLogic";
import {
  buildIncomeOutflowChartData,
  buildReportCsvSections,
  buildReportExportFileName,
  buildReportRowsFromPlannerData,
  buildSavingsTransferChartData,
  calculateMonthlyTrendRows,
  calculatePayPeriodTrendRows,
  calculateBudgetUsedPercentage,
  calculateCategoryTotals,
  calculateMonthlySummary,
  calculateSavingsSummary,
  calculateSavingsTransferTrendRows,
  calculateTrendSummary,
  dedupeSavingsMovements,
  getAvailableMonths,
  getAvailablePayPeriods,
  getItemsForMonth,
  getItemsForPayPeriod,
  getMonthLabel,
  getRowsForMonth,
  getRowsForPayPeriod
} from "../logic/reportLogic";
import {
  buildTransactionsFromAppData,
  transactionMatchesDateRange
} from "../logic/transactionLogic";
import { tableRowsToCsv } from "../utils/csv";
import { downloadTextFile } from "../utils/downloadFile";

const INCOME_OUTFLOW_COLORS = ["#2563eb", "#475569", "#f97316", "#059669"];
const SAVINGS_COLORS = ["#059669", "#dc2626", "#2563eb"];
const CATEGORY_COLOR = "#7c3aed";
const BUCKET_COLOR = "#0f766e";
const TREND_COLORS = {
  income: "#2563eb",
  expenses: "#dc2626",
  netCashFlow: "#059669",
  remainingBalance: "#7c3aed",
  transfersIn: "#059669",
  transfersOut: "#dc2626",
  netTransfers: "#2563eb"
};

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

function summarizeManualTransactions(transactions = []) {
  return transactions
    .filter((transaction) => transaction.source === "manual-adjustment")
    .reduce(
      (summary, transaction) => {
        const amount = Math.abs(Number(transaction.amount) || 0);

        if (transaction.type === "income") {
          summary.income += amount;
        }

        if (transaction.type === "expense") {
          summary.expenses += amount;
        }

        return summary;
      },
      { income: 0, expenses: 0 }
    );
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid print:border-slate-300 print:shadow-none sm:p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-bold text-slate-950 sm:text-2xl">
        {value}
      </p>
      {helper && <p className="mt-1 text-sm text-slate-500">{helper}</p>}
    </div>
  );
}

function ChartCard({ title, helper, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid print:border-slate-300 print:shadow-none sm:p-5">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-950 sm:text-xl">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{helper}</p>
      </div>
      {children}
    </section>
  );
}

function MeasuredChartFrame({ children, className, label }) {
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
        height: Math.max(1, Math.floor(rect.height))
      });
    }

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener("resize", updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return (
    <div ref={containerRef} className={className} aria-label={label}>
      {size.width > 1 && size.height > 1 ? children(size) : null}
    </div>
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

function TrendTooltip({ active, payload, label, currencyFormatter }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload || {};

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-950">
        {point.fullLabel || label}
      </p>
      <div className="mt-1 space-y-1">
        {payload.map((entry) => (
          <p key={entry.dataKey} className="flex items-center gap-2 text-slate-600">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.name}: </span>
            <span className="font-semibold text-slate-950">
              {currencyFormatter.format(Number(entry.value || 0))}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

function TrendSummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 print:break-inside-avoid print:border-slate-300">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
      {helper && <p className="mt-1 text-sm text-slate-500">{helper}</p>}
    </div>
  );
}

function EmptyChartState({ message }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600 print:h-auto print:min-h-24">
      {message}
    </div>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center print:border-slate-300">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
    </div>
  );
}

function formatGeneratedDate(date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

export default function Reports({
  settings,
  budgetTargets = [],
  categories = [],
  plannerData,
  scheduledItems = [],
  manualAdjustments = [],
  accounts = [],
  plannerEntries = {},
  miscExpenses = [],
  savingsBuckets = [],
  savingsBucketAdjustments = [],
  savingsTransfers = [],
  transfers = []
}) {
  const currency = settings?.currency || "CAD";
  const currencyFormatter = useMemo(
    () => ({
      format: (value) => formatCurrency(value, currency)
    }),
    [currency]
  );

  const reportRows = useMemo(() => {
    const rowsFromPlannerData = buildReportRowsFromPlannerData(plannerData);
    return rowsFromPlannerData.length > 0
      ? rowsFromPlannerData
      : plannerData?.payPeriods || [];
  }, [plannerData]);

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
  const [exportMessage, setExportMessage] = useState("");

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

  const scopedSavingsTransfers = useMemo(() => {
    const movementSource =
      savingsBucketAdjustments.length > 0 || transfers.length > 0
        ? dedupeSavingsMovements([...transfers, ...savingsBucketAdjustments])
        : dedupeSavingsMovements(savingsTransfers);

    if (reportFilter === "payPeriod") {
      return getItemsForPayPeriod(movementSource, activeSelectedPayPeriod);
    }

    return getItemsForMonth(movementSource, activeSelectedMonth);
  }, [
    activeSelectedMonth,
    activeSelectedPayPeriod,
    reportFilter,
    savingsBucketAdjustments,
    savingsTransfers,
    transfers
  ]);

  const scopedTransferRecords = useMemo(() => {
    if (reportFilter === "payPeriod") {
      return getItemsForPayPeriod(transfers, activeSelectedPayPeriod);
    }

    return getItemsForMonth(transfers, activeSelectedMonth);
  }, [activeSelectedMonth, activeSelectedPayPeriod, reportFilter, transfers]);

  const reportTransactions = useMemo(
    () =>
      buildTransactionsFromAppData({
        scheduledItems,
        manualAdjustments,
        savingsBucketAdjustments,
        transfers,
        savingsBuckets,
        accounts,
        categories
      }),
    [
      accounts,
      categories,
      manualAdjustments,
      savingsBucketAdjustments,
      savingsBuckets,
      scheduledItems,
      transfers
    ]
  );

  const scopedTransactions = useMemo(() => {
    if (reportFilter === "payPeriod") {
      return reportTransactions.filter(
        (transaction) =>
          transaction.date === activeSelectedPayPeriod ||
          transaction.payPeriodDate === activeSelectedPayPeriod
      );
    }

    return reportTransactions.filter((transaction) =>
      transactionMatchesDateRange(
        transaction,
        "this-month",
        "",
        "",
        new Date(`${activeSelectedMonth || getCurrentMonthKey()}-01T12:00:00`)
      )
    );
  }, [
    activeSelectedMonth,
    activeSelectedPayPeriod,
    reportFilter,
    reportTransactions
  ]);

  const baseMonthlySummary = useMemo(
    () => calculateMonthlySummary(selectedRows),
    [selectedRows]
  );

  const manualTransactionSummary = useMemo(
    () => summarizeManualTransactions(scopedTransactions),
    [scopedTransactions]
  );

  const monthlySummary = useMemo(
    () => ({
      ...baseMonthlySummary,
      income: baseMonthlySummary.income + manualTransactionSummary.income,
      miscExpenses:
        baseMonthlySummary.miscExpenses + manualTransactionSummary.expenses
    }),
    [baseMonthlySummary, manualTransactionSummary]
  );

  const budgetUsedPercentage = useMemo(
    () => calculateBudgetUsedPercentage(monthlySummary),
    [monthlySummary]
  );

  const scopedExpenseTransactions = useMemo(
    () => scopedTransactions.filter((transaction) => transaction.type === "expense"),
    [scopedTransactions]
  );

  const categoryTotals = useMemo(
    () => calculateCategoryTotals(scopedExpenseTransactions, categories).slice(0, 5),
    [categories, scopedExpenseTransactions]
  );

  const savingsSummary = useMemo(
    () => calculateSavingsSummary(savingsBuckets, scopedSavingsTransfers),
    [savingsBuckets, scopedSavingsTransfers]
  );

  const bucketProjection = useMemo(
    () =>
      buildSavingsBucketProjection({
        payPeriods: plannerData?.payPeriods || [],
        rows: plannerData?.rows || [],
        savingsBuckets,
        savingsBucketAdjustments,
        transfers,
        plannerEntries,
      }),
    [
      plannerData?.payPeriods,
      plannerData?.rows,
      plannerEntries,
      savingsBucketAdjustments,
      savingsBuckets,
      transfers
    ]
  );

  const bucketBalanceRows = useMemo(
    () =>
      bucketProjection.map((item) => {
        const movementIn =
          (Number(item.plannedTransfersToDate) || 0) +
          (Number(item.transferRecordsInToDate) || 0);
        const movementOut = Number(item.transferRecordsOutToDate) || 0;
        const adjustments = Number(item.adjustmentsToDate) || 0;

        return {
          id: item.bucket.id,
          name: item.bucket.name || "Unnamed bucket",
          currentProjectedBalance: Number(item.currentProjectedBalance) || 0,
          currentValidatedBalance: Number(item.currentValidatedBalance) || 0,
          movementIn,
          movementOut,
          adjustments,
          netMovement: movementIn - movementOut + adjustments,
        };
      }),
    [bucketProjection]
  );

  const bucketBalanceChartData = useMemo(
    () =>
      [...bucketBalanceRows]
        .sort(
          (left, right) =>
            right.currentProjectedBalance - left.currentProjectedBalance
        )
        .slice(0, 8)
        .map((bucket) => ({
          name: bucket.name,
          value: bucket.currentProjectedBalance,
        })),
    [bucketBalanceRows]
  );

  const bucketBalanceSummary = useMemo(
    () => ({
      buckets: bucketBalanceRows,
      totals: bucketBalanceRows.reduce(
        (totals, bucket) => {
          totals.currentProjectedBalance += bucket.currentProjectedBalance;
          totals.currentValidatedBalance += bucket.currentValidatedBalance;
          totals.movementIn += bucket.movementIn;
          totals.movementOut += bucket.movementOut;
          totals.netMovement += bucket.netMovement;
          return totals;
        },
        {
          currentProjectedBalance: 0,
          currentValidatedBalance: 0,
          movementIn: 0,
          movementOut: 0,
          netMovement: 0,
        }
      ),
    }),
    [bucketBalanceRows]
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

  const monthlyTrendRows = useMemo(
    () => calculateMonthlyTrendRows(reportRows),
    [reportRows]
  );

  const payPeriodTrendRows = useMemo(
    () => calculatePayPeriodTrendRows(reportRows, 12),
    [reportRows]
  );

  const savingsTransferTrendRows = useMemo(
    () =>
      calculateSavingsTransferTrendRows(
        dedupeSavingsMovements([...transfers, ...savingsBucketAdjustments])
      ),
    [savingsBucketAdjustments, transfers]
  );

  const trendSummary = useMemo(
    () => calculateTrendSummary(monthlyTrendRows, payPeriodTrendRows),
    [monthlyTrendRows, payPeriodTrendRows]
  );

  const selectedPayPeriodLabel =
    availablePayPeriods.find(
      (period) => period.date === activeSelectedPayPeriod
    )?.label || activeSelectedPayPeriod;
  const selectedPayPeriodReportLabel = activeSelectedPayPeriod
    ? `${selectedPayPeriodLabel} (${activeSelectedPayPeriod})`
    : selectedPayPeriodLabel;

  const reportRangeLabel =
    reportFilter === "payPeriod"
      ? selectedPayPeriodReportLabel || "Selected pay period"
      : getMonthLabel(activeSelectedMonth);
  const reportTypeLabel =
    reportFilter === "payPeriod" ? "Pay period report" : "Monthly report";
  const generatedDate = useMemo(() => new Date(), []);
  const budgetMonthKey =
    reportFilter === "payPeriod" && activeSelectedPayPeriod
      ? activeSelectedPayPeriod.slice(0, 7)
      : activeSelectedMonth;
  const budgetTargetUsage = useMemo(
    () =>
      calculateBudgetUsage({
        budgetTargets,
        transactions: reportTransactions,
        categories,
        selectedMonth: budgetMonthKey
      }),
    [budgetMonthKey, budgetTargets, reportTransactions, categories]
  );

  const transferSummary = useMemo(() => {
    return scopedTransferRecords.reduce(
      (summary, transfer) => {
        const amount = Math.abs(Number(transfer.amount) || 0);

        if (transfer.transferType === "to_savings_bucket") {
          summary.toSavings += amount;
        } else if (transfer.transferType === "from_savings_bucket") {
          summary.fromSavings += amount;
        } else {
          summary.accountTransfers += amount;
        }

        summary.total += amount;
        return summary;
      },
      {
        total: monthlySummary.transfersIn + monthlySummary.transfersOut,
        plannedToSavings: monthlySummary.transfersIn,
        toSavings: 0,
        fromSavings: 0,
        accountTransfers: 0
      }
    );
  }, [monthlySummary.transfersIn, monthlySummary.transfersOut, scopedTransferRecords]);

  const hasReportData =
    reportRows.length > 0 ||
    miscExpenses.length > 0 ||
    budgetTargets.length > 0 ||
    savingsBuckets.length > 0 ||
    savingsBucketAdjustments.length > 0 ||
    transfers.length > 0 ||
    savingsTransfers.length > 0;

  function handlePrintReport() {
    window.print();
  }

  function handleExportReportCsv() {
    const generatedAt = new Date().toISOString();
    const csvRows = buildReportCsvSections({
      reportType: reportFilter,
      periodLabel: reportRangeLabel,
      generatedAt,
      summary: monthlySummary,
      budgetUsedPercentage,
      categoryTotals,
      savingsSummary,
      bucketBalanceSummary,
      transferSummary,
      trendSummary,
      hasReportData
    });
    const csv = tableRowsToCsv(csvRows);
    const filename = buildReportExportFileName(
      reportFilter,
      activeSelectedMonth,
      selectedPayPeriodReportLabel
    );

    downloadTextFile({
      content: csv,
      filename,
      mimeType: "text/csv;charset=utf-8"
    });

    setExportMessage(`Exported ${filename}`);
  }

  return (
    <div className="space-y-6 print:bg-white print:p-6 print:text-black">
      <div className="hidden print:block">
        <h1 className="text-3xl font-bold text-slate-950">
          FinPath Report
        </h1>
        <p className="mt-2 text-base text-slate-700">
          {reportTypeLabel}, {reportRangeLabel}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Generated {formatGeneratedDate(generatedDate)}
        </p>
      </div>

      <div className="no-print flex flex-col justify-between gap-4 print:hidden md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Reports
          </p>
          <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
            Budget reports
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Review income, expenses, transfers, savings movement, budgets, and
            top spending categories from saved FinPath data.
          </p>
        </div>

        <div className="grid w-full gap-3 md:min-w-[420px] md:max-w-xl">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
            <div>
              <p className="text-sm font-medium text-slate-600">View</p>
              <div className="mt-1 inline-flex w-full rounded-xl border border-slate-300 bg-white p-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setReportFilter("month")}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold sm:flex-none ${
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
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold sm:flex-none ${
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

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-950">
              Report Actions
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Print or export the current report view.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePrintReport}
                className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Print Current Report
              </button>
              <button
                type="button"
                onClick={handleExportReportCsv}
                className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Export Current Report CSV
              </button>
            </div>
            {exportMessage && (
              <p className="mt-2 text-sm font-medium text-emerald-700">
                {exportMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      {!hasReportData && (
        <EmptyState
          title="No report data yet"
          message="Add income, expenses, transfers, savings buckets, or budget targets to see report trends."
        />
      )}

      {hasReportData && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            Transfers are shown separately so they do not inflate income or
            spending totals. Savings movement includes bucket adjustments and
            bucket-linked transfer records.
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Income"
              value={currencyFormatter.format(monthlySummary.income)}
              helper={reportRangeLabel}
            />

            <StatCard
              label="Expenses"
              value={currencyFormatter.format(
                monthlySummary.expenses + monthlySummary.miscExpenses
              )}
              helper="Scheduled expenses plus misc expenses"
            />

            <StatCard
              label="Remaining Balance"
              value={currencyFormatter.format(monthlySummary.remainingBalance)}
              helper="Based on selected planner rows"
            />

            <StatCard
              label="Budget Used"
              value={`${budgetUsedPercentage}%`}
              helper="Expenses compared to income; transfers excluded"
            />
          </section>

          <section className="space-y-4 print:break-inside-avoid">
            <div>
              <h3 className="text-xl font-bold text-slate-950">
                Transfers
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Internal account and savings movements for {reportRangeLabel}.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Total Transfers"
                value={currencyFormatter.format(transferSummary.total)}
                helper="Shown outside income and spending"
              />
              <StatCard
                label="Planned To Savings"
                value={currencyFormatter.format(transferSummary.plannedToSavings)}
                helper="Scheduled planner transfers"
              />
              <StatCard
                label="Transfers To Savings"
                value={currencyFormatter.format(transferSummary.toSavings)}
                helper="Transfer records into savings"
              />
              <StatCard
                label="Transfers From Savings"
                value={currencyFormatter.format(transferSummary.fromSavings)}
                helper="Transfer records back to chequing"
              />
              <StatCard
                label="Account Transfers"
                value={currencyFormatter.format(transferSummary.accountTransfers)}
                helper="Transfers without bucket movement"
              />
            </div>
          </section>

          {budgetTargets.length > 0 ? (
            <section className="space-y-4 print:break-inside-avoid">
              <div>
                <h3 className="text-xl font-bold text-slate-950">
                  Budget Targets
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Monthly target usage for {getMonthLabel(budgetMonthKey)}.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Total Monthly Budget"
                  value={currencyFormatter.format(
                    budgetTargetUsage.summary.totalBudget
                  )}
                  helper="Active category targets"
                />
                <StatCard
                  label="Total Used"
                  value={currencyFormatter.format(budgetTargetUsage.summary.totalUsed)}
                  helper="Tracked spending"
                />
                <StatCard
                  label="Remaining"
                  value={currencyFormatter.format(
                    budgetTargetUsage.summary.remainingBudget
                  )}
                  helper="Budget minus tracked spending"
                />
                <StatCard
                  label="Over Budget"
                  value={budgetTargetUsage.summary.overBudgetCount}
                  helper="Categories over target"
                />
              </div>
            </section>
          ) : null}

          <ChartCard
            title="Income, Spending, and Transfers"
            helper="Compares income with spending and shows transfers separately for the selected report."
          >
            {selectedRows.length === 0 ? (
              <EmptyChartState message="No planner rows match this filter." />
            ) : (
              <MeasuredChartFrame
                className="h-64 sm:h-[280px]"
                label="Income vs outflow chart"
              >
                {({ width, height }) => (
                  <BarChart
                    width={width}
                    height={height}
                    data={incomeOutflowChartData}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      tick={{ fill: "#475569", fontSize: 12 }}
                      tickFormatter={(value) => truncateLabel(value, 13)}
                    />
                    <YAxis
                      tick={{ fill: "#475569", fontSize: 12 }}
                      tickFormatter={(value) => currencyFormatter.format(value)}
                      width={72}
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
                )}
              </MeasuredChartFrame>
            )}
          </ChartCard>

          <section className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Top Spending Categories"
              helper="Shows the top five expense categories from derived transaction data for the selected report."
            >
              {categoryTotals.length === 0 ? (
                <EmptyChartState message="No category spending found for this filter." />
              ) : (
                <>
                  <MeasuredChartFrame
                    className="h-64 sm:h-[280px]"
                    label="Top spending categories chart"
                  >
                    {({ width, height }) => (
                      <BarChart
                        width={width}
                        height={height}
                        data={categoryChartData}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fill: "#475569", fontSize: 12 }}
                          tickFormatter={(value) => currencyFormatter.format(value)}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={104}
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
                    )}
                  </MeasuredChartFrame>

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
                          {currencyFormatter.format(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>

            <ChartCard
              title="Savings Movement"
              helper="Compares bucket-linked transfers and savings bucket adjustments without counting them as regular spending."
            >
              {!chartHasAnyValue(savingsTransferChartData) ? (
                <EmptyChartState message="No transfers or savings movement found for this filter." />
              ) : (
                <MeasuredChartFrame
                  className="h-64 sm:h-[280px]"
                  label="Savings transfers chart"
                >
                  {({ width, height }) => (
                    <BarChart
                      width={width}
                      height={height}
                      data={savingsTransferChartData}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => truncateLabel(value, 13)}
                      />
                      <YAxis
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => currencyFormatter.format(value)}
                        width={72}
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
                  )}
                </MeasuredChartFrame>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-500">
                    Movement In
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {currencyFormatter.format(savingsSummary.totals.transfersIn)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-500">
                    Movement Out
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {currencyFormatter.format(savingsSummary.totals.transfersOut)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-500">
                    Net Movement
                  </p>
                  <p className="mt-2 text-xl font-bold text-slate-950">
                    {currencyFormatter.format(savingsSummary.totals.netTransfers)}
                  </p>
                </div>
              </div>
            </ChartCard>
          </section>

          <section className="space-y-5">
            <div>
              <h3 className="text-2xl font-bold text-slate-950">
                Trend Insights
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Follow cash flow, income, expenses, savings movement, and
                projected balance changes over time.
              </p>
            </div>

            <ChartCard
              title="Trend Summary"
              helper="Highlights the strongest and riskiest points in the available report trends. Net cash flow excludes transfers."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <TrendSummaryCard
                  label="Best Cash Flow Month"
                  value={
                    trendSummary.bestCashFlowMonth
                      ? currencyFormatter.format(trendSummary.bestCashFlowMonth.netCashFlow)
                      : "Not enough data"
                  }
                  helper={trendSummary.bestCashFlowMonth?.label}
                />

                <TrendSummaryCard
                  label="Highest Expense Month"
                  value={
                    trendSummary.highestExpenseMonth
                      ? currencyFormatter.format(
                          trendSummary.highestExpenseMonth.totalExpenses
                        )
                      : "Not enough data"
                  }
                  helper={trendSummary.highestExpenseMonth?.label}
                />

                <TrendSummaryCard
                  label="Highest Savings Transfer Month"
                  value={
                    trendSummary.highestSavingsTransferMonth
                      ? currencyFormatter.format(
                          trendSummary.highestSavingsTransferMonth.transfersIn
                        )
                      : "Not enough data"
                  }
                  helper={trendSummary.highestSavingsTransferMonth?.label}
                />

                <TrendSummaryCard
                  label="Lowest Remaining Balance"
                  value={
                    trendSummary.lowestRemainingBalance
                      ? currencyFormatter.format(
                          trendSummary.lowestRemainingBalance.remainingBalance
                        )
                      : "Not enough data"
                  }
                  helper={trendSummary.lowestRemainingBalance?.fullLabel}
                />

                <TrendSummaryCard
                  label="Average Monthly Net Cash Flow"
                  value={
                    trendSummary.averageMonthlyNetCashFlow !== null
                      ? currencyFormatter.format(trendSummary.averageMonthlyNetCashFlow)
                      : "Not enough data"
                  }
                  helper={
                    trendSummary.averageMonthlyNetCashFlow !== null
                      ? "Across available months"
                      : ""
                  }
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Monthly Cash Flow Trend"
              helper="Shows monthly income, expenses, and net cash flow from oldest to newest. Transfers are tracked separately."
            >
              {monthlyTrendRows.length === 0 ? (
                <EmptyChartState message="No monthly planner data is available for trends." />
              ) : (
                <MeasuredChartFrame
                  className="h-72 sm:h-[320px]"
                  label="Monthly cash flow trend chart"
                >
                  {({ width, height }) => (
                    <LineChart
                      width={width}
                      height={height}
                      data={monthlyTrendRows}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => truncateLabel(value, 12)}
                      />
                      <YAxis
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => currencyFormatter.format(value)}
                        width={72}
                      />
                      <Tooltip
                        content={
                          <TrendTooltip
                            currencyFormatter={currencyFormatter}
                          />
                        }
                      />
                      <Legend />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Line
                        type="monotone"
                        dataKey="income"
                        name="Income"
                        stroke={TREND_COLORS.income}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="totalExpenses"
                        name="Expenses"
                        stroke={TREND_COLORS.expenses}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="netCashFlow"
                        name="Net Cash Flow"
                        stroke={TREND_COLORS.netCashFlow}
                        strokeWidth={2}
                      />
                    </LineChart>
                  )}
                </MeasuredChartFrame>
              )}
            </ChartCard>

            <section className="grid gap-5 xl:grid-cols-2">
              <ChartCard
                title="Pay Period Cash Flow Trend"
                helper="Shows the first 12 projected pay periods with income, expenses, net cash flow, and remaining balance. Transfers are tracked separately."
              >
                {payPeriodTrendRows.length === 0 ? (
                  <EmptyChartState message="No dated pay-period planner rows are available for trends." />
                ) : (
                  <MeasuredChartFrame
                    className="h-72 sm:h-[320px]"
                    label="Pay period cash flow trend chart"
                  >
                    {({ width, height }) => (
                      <LineChart
                        width={width}
                        height={height}
                        data={payPeriodTrendRows}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          interval={0}
                          tick={{ fill: "#475569", fontSize: 12 }}
                          tickFormatter={(value) => truncateLabel(value, 8)}
                        />
                        <YAxis
                          tick={{ fill: "#475569", fontSize: 12 }}
                          tickFormatter={(value) => currencyFormatter.format(value)}
                          width={72}
                        />
                        <Tooltip
                          content={
                            <TrendTooltip
                              currencyFormatter={currencyFormatter}
                            />
                          }
                        />
                        <Legend />
                        <ReferenceLine y={0} stroke="#94a3b8" />
                        <Line
                          type="monotone"
                          dataKey="income"
                          name="Income"
                          stroke={TREND_COLORS.income}
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="totalExpenses"
                          name="Expenses"
                          stroke={TREND_COLORS.expenses}
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="netCashFlow"
                          name="Net Cash Flow"
                          stroke={TREND_COLORS.netCashFlow}
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="remainingBalance"
                          name="Remaining Balance"
                          stroke={TREND_COLORS.remainingBalance}
                          strokeWidth={2}
                        />
                      </LineChart>
                    )}
                  </MeasuredChartFrame>
                )}
              </ChartCard>

              <ChartCard
                title="Savings Transfer Trend"
                helper="Groups dated savings transfer history by month."
              >
                {savingsTransferTrendRows.length === 0 ? (
                  <EmptyChartState message="Savings transfer trend needs dated transfer history." />
                ) : (
                  <MeasuredChartFrame
                    className="h-72 sm:h-[320px]"
                    label="Savings transfer trend chart"
                  >
                    {({ width, height }) => (
                      <LineChart
                        width={width}
                        height={height}
                        data={savingsTransferTrendRows}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#475569", fontSize: 12 }}
                          tickFormatter={(value) => truncateLabel(value, 12)}
                        />
                        <YAxis
                          tick={{ fill: "#475569", fontSize: 12 }}
                          tickFormatter={(value) => currencyFormatter.format(value)}
                          width={72}
                        />
                        <Tooltip
                          content={
                            <TrendTooltip
                              currencyFormatter={currencyFormatter}
                            />
                          }
                        />
                        <Legend />
                        <ReferenceLine y={0} stroke="#94a3b8" />
                        <Line
                          type="monotone"
                          dataKey="transfersIn"
                          name="Movement In"
                          stroke={TREND_COLORS.transfersIn}
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="transfersOut"
                          name="Movement Out"
                          stroke={TREND_COLORS.transfersOut}
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="netTransfers"
                          name="Net Movement"
                          stroke={TREND_COLORS.netTransfers}
                          strokeWidth={2}
                        />
                      </LineChart>
                    )}
                  </MeasuredChartFrame>
                )}
              </ChartCard>
            </section>
          </section>

          <ChartCard
            title="Bucket Balances"
            helper="Shows current projected savings bucket balances."
          >
            {bucketBalanceRows.length === 0 ? (
              <EmptyChartState message="No savings buckets yet. Add buckets to track how your savings is assigned." />
            ) : (
              <>
                <MeasuredChartFrame
                  className="h-72 sm:h-[320px]"
                  label="Savings bucket balances chart"
                >
                  {({ width, height }) => (
                    <BarChart
                      width={width}
                      height={height}
                      data={bucketBalanceChartData}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: "#475569", fontSize: 12 }}
                        tickFormatter={(value) => currencyFormatter.format(value)}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={104}
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
                  )}
                </MeasuredChartFrame>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[920px] divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr>
                        <th className="py-3 pr-4 text-left font-semibold text-slate-600">
                          Bucket
                        </th>
                        <th className="py-3 pr-4 text-right font-semibold text-slate-600">
                          Current Projected
                        </th>
                        <th className="py-3 pr-4 text-right font-semibold text-slate-600">
                          Current Validated
                        </th>
                        <th className="py-3 pr-4 text-right font-semibold text-slate-600">
                          Movement In
                        </th>
                        <th className="py-3 pr-4 text-right font-semibold text-slate-600">
                          Movement Out
                        </th>
                        <th className="py-3 text-right font-semibold text-slate-600">
                          Net
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {bucketBalanceRows.map((bucket) => (
                        <tr key={bucket.id || bucket.name}>
                          <td className="py-3 pr-4 font-medium text-slate-900">
                            {bucket.name}
                          </td>
                          <td className="py-3 pr-4 text-right text-slate-700">
                            {currencyFormatter.format(bucket.currentProjectedBalance)}
                          </td>
                          <td className="py-3 pr-4 text-right text-slate-700">
                            {currencyFormatter.format(bucket.currentValidatedBalance)}
                          </td>
                          <td className="py-3 pr-4 text-right text-slate-700">
                            {currencyFormatter.format(bucket.movementIn)}
                          </td>
                          <td className="py-3 pr-4 text-right text-slate-700">
                            {currencyFormatter.format(bucket.movementOut)}
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-950">
                            {currencyFormatter.format(bucket.netMovement)}
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
