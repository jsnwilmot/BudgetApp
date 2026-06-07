import { getEntryKey } from "./projectionLogic";
import { getTransferBucketEffect } from "./transferLogic";
import { normalizeNumber } from "../utils/numbers";

export { normalizeNumber };

export function formatMonthKey(dateValue) {
  if (!dateValue) return "";

  if (typeof dateValue === "string") {
    const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-\d{2}/);

    if (dateMatch) {
      return `${dateMatch[1]}-${dateMatch[2]}`;
    }
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

export function getMonthLabel(monthKey) {
  if (!monthKey) return "Current month";

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  if (Number.isNaN(date.getTime())) {
    return "Current month";
  }

  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

export function getAvailableMonths(rows = []) {
  const monthSet = new Set();

  rows.forEach((row) => {
    const monthKey =
      row.monthKey ||
      formatMonthKey(row.date) ||
      formatMonthKey(row.payDate) ||
      formatMonthKey(row.startDate) ||
      formatMonthKey(row.payPeriodDate);

    if (monthKey) {
      monthSet.add(monthKey);
    }
  });

  return Array.from(monthSet).sort().reverse();
}

export function getRowsForMonth(rows = [], monthKey) {
  return rows.filter((row) => {
    const rowMonthKey =
      row.monthKey ||
      formatMonthKey(row.date) ||
      formatMonthKey(row.payDate) ||
      formatMonthKey(row.startDate) ||
      formatMonthKey(row.payPeriodDate);

    return rowMonthKey === monthKey;
  });
}

function parseReportDate(dateValue) {
  if (!dateValue) return null;

  if (typeof dateValue === "string") {
    const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (dateMatch) {
      return new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3])
      );
    }
  }

  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRowDateValue(row) {
  return row.payPeriodDate || row.date || row.payDate || row.startDate || "";
}

function formatMonthShortLabel(monthKey) {
  if (!monthKey) return "Unknown";

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  if (Number.isNaN(date.getTime())) {
    return monthKey;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric"
  });
}

function formatShortDateLabel(dateValue) {
  const date = parseReportDate(dateValue);

  if (!date) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit"
  });
}

function formatFullDateLabel(dateValue) {
  const date = parseReportDate(dateValue);

  if (!date) {
    return String(dateValue || "Unknown");
  }

  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "2-digit",
    year: "numeric"
  });
}

export function getIncomeValue(row = {}) {
  return normalizeNumber(
    row.income ?? row.totalIncome ?? row.incomeTotal ?? row.payAmount
  );
}

export function getExpenseValue(row = {}) {
  return normalizeNumber(
    row.expenses ??
      row.totalExpenses ??
      row.expenseTotal ??
      row.fixedExpenses ??
      row.fixedExpenseTotal ??
      row.fixedExpensesTotal ??
      row.billsTotal
  );
}

export function getMiscExpensesValue(row = {}) {
  return normalizeNumber(
    row.miscExpensesTotal ?? row.miscExpenses ?? row.additionalExpensesTotal
  );
}

export function getMiscPaymentsValue(row = {}) {
  return normalizeNumber(
    row.miscPaymentsTotal ?? row.miscPayments ?? row.additionalPaymentsTotal
  );
}

export function getTransfersInValue(row = {}) {
  return normalizeNumber(
    row.savingsTransfersIn ?? row.transfersIn ?? row.totalTransfersIn
  );
}

export function getTransfersOutValue(row = {}) {
  return normalizeNumber(
    row.savingsTransfersOut ?? row.transfersOut ?? row.totalTransfersOut
  );
}

export function getRemainingBalanceValue(row = {}) {
  return normalizeNumber(
    row.remainingBalance ?? row.balance ?? row.availableBalance ?? row.chequingBalance
  );
}

export function getPayPeriodLabel(row) {
  return (
    row.payPeriodLabel ||
    row.label ||
    row.payPeriodName ||
    row.name ||
    row.payPeriodDate ||
    row.date ||
    "Pay period"
  );
}

export function getAvailablePayPeriods(rows = []) {
  return rows
    .filter((row) => row.payPeriodDate || row.date)
    .map((row) => ({
      date: row.payPeriodDate || row.date,
      label: getPayPeriodLabel(row)
    }));
}

export function getRowsForPayPeriod(rows = [], payPeriodDate) {
  return rows.filter((row) => {
    const rowPayPeriodDate = row.payPeriodDate || row.date;
    return rowPayPeriodDate === payPeriodDate;
  });
}

export function getItemPayPeriodDate(item) {
  return (
    item.payPeriodDate ||
    item.periodDate ||
    item.payDate ||
    item.date ||
    item.createdAt ||
    ""
  );
}

export function getItemsForMonth(items = [], monthKey) {
  return items.filter((item) => {
    return formatMonthKey(getItemPayPeriodDate(item)) === monthKey;
  });
}

export function getItemsForPayPeriod(items = [], payPeriodDate) {
  return items.filter((item) => getItemPayPeriodDate(item) === payPeriodDate);
}

function getIsoDateValue(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (dateMatch) {
      return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }
  }

  const date = parseReportDate(value);
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(date.getDate()).padStart(2, "0")}`
    : "";
}

function getNextPayPeriodDate(payPeriods = [], selectedPayPeriod) {
  return [...payPeriods]
    .map((period) => period.date)
    .filter(Boolean)
    .sort()
    .find((periodDate) => periodDate > selectedPayPeriod);
}

function isDateInPayPeriodWindow(dateValue, selectedPayPeriod, payPeriods = []) {
  const dateKey = getIsoDateValue(dateValue);

  if (!dateKey || !selectedPayPeriod) {
    return false;
  }

  if (dateKey === selectedPayPeriod) {
    return true;
  }

  const nextPayPeriodDate = getNextPayPeriodDate(payPeriods, selectedPayPeriod);

  if (!nextPayPeriodDate) {
    return false;
  }

  return dateKey >= selectedPayPeriod && dateKey < nextPayPeriodDate;
}

function itemMatchesReportFilter(
  item = {},
  { selectedView = "month", selectedMonth = "", selectedPayPeriod = "", payPeriods = [] } = {}
) {
  if (selectedView === "payPeriod") {
    const explicitPayPeriodDate = getIsoDateValue(
      item.payPeriodDate || item.periodDate || item.payDate
    );

    if (explicitPayPeriodDate) {
      return explicitPayPeriodDate === selectedPayPeriod;
    }

    return isDateInPayPeriodWindow(item.date, selectedPayPeriod, payPeriods);
  }

  return [item.payPeriodDate, item.periodDate, item.payDate, item.date].some(
    (dateValue) => formatMonthKey(dateValue) === selectedMonth
  );
}

function getBucketIdFromPlannerRow(row = {}) {
  return (
    row.item?.bucketId ||
    row.item?.savingsBucketId ||
    row.bucketId ||
    row.savingsBucketId ||
    null
  );
}

function buildBucketNameMap(savingsBuckets = []) {
  return new Map(
    savingsBuckets
      .filter((bucket) => bucket?.id)
      .map((bucket) => [bucket.id, bucket.name || "Unnamed bucket"])
  );
}

function getBucketName(bucketId, bucketNameMap) {
  return bucketId ? bucketNameMap.get(bucketId) || bucketId : "No bucket";
}

function isSavingsPlannerTransfer(row = {}, accounts = []) {
  if (row.type !== "transfer") {
    return false;
  }

  if (getBucketIdFromPlannerRow(row)) {
    return true;
  }

  const savingsAccountIds = new Set(
    accounts
      .filter((account) => account.type === "savings")
      .map((account) => account.id)
  );

  return Boolean(
    row.item?.toAccountId && savingsAccountIds.has(row.item.toAccountId)
  );
}

function getPlannerAmount(row = {}, periodDate) {
  return normalizeNumber(row.amountsByPeriod?.[periodDate]);
}

function getPlannerActivityDateLabel(periodDate, payPeriods = []) {
  return (
    payPeriods.find((period) => period.date === periodDate)?.label ||
    formatFullDateLabel(periodDate)
  );
}

export function buildReportTransferChartData(transferSummary = {}) {
  return [
    {
      name: "Planned",
      value: normalizeNumber(transferSummary.plannedToSavings)
    },
    {
      name: "Validated",
      value: normalizeNumber(transferSummary.validatedPlannerTransfers)
    },
    {
      name: "Records In",
      value: normalizeNumber(transferSummary.transferRecordsIn)
    },
    {
      name: "Records Out",
      value: normalizeNumber(transferSummary.transferRecordsOut)
    },
    {
      name: "Adjustments",
      value: normalizeNumber(transferSummary.bucketAdjustments)
    },
    {
      name: "Net",
      value: normalizeNumber(transferSummary.netSavingsMovement)
    }
  ];
}

export function buildReportTransferSummary({
  plannerData = {},
  plannerEntries = {},
  transfers = [],
  savingsBucketAdjustments = [],
  savingsBuckets = [],
  accounts = [],
  selectedView = "month",
  selectedMonth = "",
  selectedPayPeriod = ""
} = {}) {
  const payPeriods = plannerData?.payPeriods || [];
  const plannerRows = plannerData?.rows || [];
  const bucketNameMap = buildBucketNameMap(savingsBuckets);
  const filterOptions = {
    selectedView,
    selectedMonth,
    selectedPayPeriod,
    payPeriods
  };
  const selectedPeriods =
    selectedView === "payPeriod"
      ? payPeriods.filter((period) => period.date === selectedPayPeriod)
      : payPeriods.filter((period) => formatMonthKey(period.date) === selectedMonth);
  const summary = {
    plannedToSavings: 0,
    validatedPlannerTransfers: 0,
    transferRecordsIn: 0,
    transferRecordsOut: 0,
    accountTransfers: 0,
    bucketAdjustments: 0,
    netSavingsMovement: 0,
    activityRows: []
  };

  selectedPeriods.forEach((period) => {
    plannerRows
      .filter((row) => isSavingsPlannerTransfer(row, accounts))
      .forEach((row) => {
        const amount = getPlannerAmount(row, period.date);

        if (amount === 0) {
          return;
        }

        const entry = plannerEntries[getEntryKey(row.id, period.date)];
        const validated = Boolean(entry?.validated);
        const bucketId = getBucketIdFromPlannerRow(row);

        summary.plannedToSavings += amount;

        if (validated) {
          summary.validatedPlannerTransfers += amount;
        }

        summary.activityRows.push({
          id: `planner-${row.id}-${period.date}`,
          date: period.date,
          dateLabel: getPlannerActivityDateLabel(period.date, payPeriods),
          source: "Planner",
          bucket: getBucketName(bucketId, bucketNameMap),
          type: validated ? "Validated Planner Transfer" : "Planned Transfer",
          amount,
          status: validated ? "Validated" : "Planned",
          sortDate: period.date
        });
      });
  });

  transfers
    .filter((transfer) => itemMatchesReportFilter(transfer, filterOptions))
    .forEach((transfer) => {
      const amount = Math.abs(normalizeNumber(transfer.amount));
      const bucketId = transfer.bucketId || transfer.savingsBucketId || null;
      const bucketEffect = getTransferBucketEffect(transfer);

      if (bucketEffect.transfersIn > 0) {
        summary.transferRecordsIn += bucketEffect.transfersIn;
        summary.activityRows.push({
          id: transfer.id || `transfer-in-${summary.activityRows.length}`,
          date: transfer.payPeriodDate || transfer.date || "",
          dateLabel: formatFullDateLabel(transfer.payPeriodDate || transfer.date),
          source: "Transfer Record",
          bucket: getBucketName(bucketId, bucketNameMap),
          type: "Manual Transfer In",
          amount: bucketEffect.transfersIn,
          status: "Manual",
          sortDate: getIsoDateValue(transfer.payPeriodDate || transfer.date)
        });
        return;
      }

      if (bucketEffect.transfersOut > 0) {
        summary.transferRecordsOut += bucketEffect.transfersOut;
        summary.activityRows.push({
          id: transfer.id || `transfer-out-${summary.activityRows.length}`,
          date: transfer.payPeriodDate || transfer.date || "",
          dateLabel: formatFullDateLabel(transfer.payPeriodDate || transfer.date),
          source: "Transfer Record",
          bucket: getBucketName(bucketId, bucketNameMap),
          type: "Manual Transfer Out",
          amount: bucketEffect.transfersOut,
          status: "Manual",
          sortDate: getIsoDateValue(transfer.payPeriodDate || transfer.date)
        });
        return;
      }

      summary.accountTransfers += amount;
    });

  savingsBucketAdjustments
    .filter((adjustment) => itemMatchesReportFilter(adjustment, filterOptions))
    .forEach((adjustment) => {
      const amount = normalizeNumber(adjustment.amount);
      const bucketId = adjustment.bucketId || adjustment.savingsBucketId || null;

      if (amount === 0) {
        return;
      }

      summary.bucketAdjustments += amount;
      summary.activityRows.push({
        id: adjustment.id || `adjustment-${summary.activityRows.length}`,
        date: adjustment.payPeriodDate || adjustment.date || "",
        dateLabel: formatFullDateLabel(adjustment.payPeriodDate || adjustment.date),
        source: "Bucket Adjustment",
        bucket: getBucketName(bucketId, bucketNameMap),
        type: "Bucket Adjustment",
        amount,
        status: "Adjustment",
        sortDate: getIsoDateValue(adjustment.payPeriodDate || adjustment.date)
      });
    });

  summary.netSavingsMovement =
    summary.validatedPlannerTransfers +
    summary.transferRecordsIn -
    summary.transferRecordsOut +
    summary.bucketAdjustments;
  summary.activityRows.sort((left, right) => {
    const dateSort = String(left.sortDate || "").localeCompare(
      String(right.sortDate || "")
    );

    if (dateSort !== 0) {
      return dateSort;
    }

    return String(left.type || "").localeCompare(String(right.type || ""));
  });

  return summary;
}

function isMiscExpenseRow(row) {
  const rowId = String(row.id || "").toLowerCase();
  const rowName = String(row.name || "").toLowerCase();

  return (
    rowId.includes("misc-expense") ||
    rowName === "misc expenses" ||
    rowName === "misc expense"
  );
}

function isMiscPaymentRow(row) {
  const rowId = String(row.id || "").toLowerCase();
  const rowName = String(row.name || "").toLowerCase();

  return (
    rowId.includes("misc-payment") ||
    rowName === "misc payments" ||
    rowName === "misc payment"
  );
}

function getProjectedAmount(row, periodDate) {
  return normalizeNumber(row?.amountsByPeriod?.[periodDate]);
}

export function buildReportRowsFromPlannerData(plannerData) {
  const payPeriods = plannerData?.payPeriods || [];
  const plannerRows = plannerData?.rows || [];
  const projectionRows = plannerData?.projectionRows || [];
  const projectedChequingRow = projectionRows.find(
    (row) => row.id === "projected-chequing"
  );

  return payPeriods.map((period) => {
    const income = plannerRows
      .filter((row) => row.type === "income")
      .reduce(
        (total, row) => total + getProjectedAmount(row, period.date),
        0
      );

    const expenses = plannerRows
      .filter((row) => row.type === "expense")
      .filter((row) => !isMiscExpenseRow(row) && !isMiscPaymentRow(row))
      .reduce(
        (total, row) => total + getProjectedAmount(row, period.date),
        0
      );

    const miscPayments = plannerRows
      .filter(isMiscPaymentRow)
      .reduce(
        (total, row) => total + getProjectedAmount(row, period.date),
        0
      );

    const miscExpenses = plannerRows
      .filter(isMiscExpenseRow)
      .reduce(
        (total, row) => total + getProjectedAmount(row, period.date),
        0
      );

    const transfersIn = plannerRows
      .filter((row) => row.type === "transfer")
      .reduce(
        (total, row) => total + getProjectedAmount(row, period.date),
        0
      );

    return {
      date: period.date,
      payPeriodDate: period.date,
      payPeriodLabel: period.label,
      monthKey: formatMonthKey(period.date),
      income,
      expenses,
      miscPayments,
      miscExpenses,
      transfersIn,
      transfersOut: 0,
      remainingBalance: getProjectedAmount(projectedChequingRow, period.date)
    };
  });
}

export function calculateMonthlySummary(rows = []) {
  return rows.reduce(
    (summary, row) => {
      const income = getIncomeValue(row);
      const expenses = getExpenseValue(row);
      const miscPayments = getMiscPaymentsValue(row);
      const miscExpenses = getMiscExpensesValue(row);
      const transfersIn = getTransfersInValue(row);
      const transfersOut = getTransfersOutValue(row);
      const remainingBalance = getRemainingBalanceValue(row);

      summary.income += income;
      summary.expenses += expenses;
      summary.miscPayments += miscPayments;
      summary.miscExpenses += miscExpenses;
      summary.transfersIn += transfersIn;
      summary.transfersOut += transfersOut;
      summary.remainingBalance += remainingBalance;

      return summary;
    },
    {
      income: 0,
      expenses: 0,
      miscPayments: 0,
      miscExpenses: 0,
      transfersIn: 0,
      transfersOut: 0,
      remainingBalance: 0
    }
  );
}

export function calculateBudgetUsedPercentage(summary) {
  const income = normalizeNumber(summary.income);

  if (income <= 0) {
    return 0;
  }

  const used =
    normalizeNumber(summary.expenses) + normalizeNumber(summary.miscExpenses);

  return Math.round((used / income) * 100);
}

function buildCategoryNameMap(categories = []) {
  return new Map(
    categories
      .filter((category) => category?.id)
      .map((category) => [category.id, category.name || "Uncategorized"])
  );
}

function resolveCategoryName(item = {}, categoryNameMap = new Map()) {
  if (item.categoryId && categoryNameMap.has(item.categoryId)) {
    return categoryNameMap.get(item.categoryId);
  }

  return (
    item.category ||
    item.categoryName ||
    item.name ||
    item.label ||
    "Uncategorized"
  );
}

export function calculateCategoryTotals(items = [], categories = []) {
  const totals = new Map();
  const categoryNameMap = buildCategoryNameMap(categories);

  items.forEach((item) => {
    const category = resolveCategoryName(item, categoryNameMap);

    const amount = Math.abs(
      normalizeNumber(item.amount ?? item.value ?? item.total)
    );

    totals.set(category, normalizeNumber(totals.get(category)) + amount);
  });

  return Array.from(totals.entries())
    .map(([category, total]) => ({
      category,
      total
    }))
    .sort((a, b) => b.total - a.total);
}

export function buildIncomeOutflowChartData(summary = {}) {
  return [
    { name: "Income", value: normalizeNumber(summary.income) },
    { name: "Expenses", value: normalizeNumber(summary.expenses) },
    {
      name: "Misc Expenses",
      value: normalizeNumber(summary.miscExpenses)
    },
    {
      name: "Transfers to Savings",
      value: normalizeNumber(summary.transfersIn)
    }
  ];
}

export function buildSavingsTransferChartData(savingsSummary = {}) {
  const totals = savingsSummary.totals || {};

  return [
    { name: "Movement In", value: normalizeNumber(totals.transfersIn) },
    { name: "Movement Out", value: normalizeNumber(totals.transfersOut) },
    { name: "Net Movement", value: normalizeNumber(totals.netTransfers) }
  ];
}

export function buildBucketBalanceChartData(savingsSummary = {}) {
  return [...(savingsSummary.buckets || [])]
    .sort((a, b) => normalizeNumber(b.balance) - normalizeNumber(a.balance))
    .slice(0, 8)
    .map((bucket) => ({
      name: bucket.name,
      value: normalizeNumber(bucket.balance)
    }));
}

export function groupRowsByMonth(rows = []) {
  const groups = new Map();

  rows.forEach((row) => {
    const monthKey =
      row.monthKey ||
      formatMonthKey(row.date) ||
      formatMonthKey(row.payDate) ||
      formatMonthKey(row.startDate) ||
      formatMonthKey(row.payPeriodDate);

    if (!monthKey) {
      return;
    }

    if (!groups.has(monthKey)) {
      groups.set(monthKey, []);
    }

    groups.get(monthKey).push(row);
  });

  return Array.from(groups.entries())
    .sort(([leftMonth], [rightMonth]) => leftMonth.localeCompare(rightMonth))
    .map(([monthKey, monthRows]) => ({
      monthKey,
      label: formatMonthShortLabel(monthKey),
      rows: monthRows
    }));
}

export function calculateMonthlyTrendRows(rows = []) {
  return groupRowsByMonth(rows).map((group) => {
    const sortedRows = [...group.rows].sort((left, right) =>
      String(getRowDateValue(left)).localeCompare(String(getRowDateValue(right)))
    );
    const summary = calculateMonthlySummary(sortedRows);
    const lastRow = sortedRows[sortedRows.length - 1] || {};
    const expenses = normalizeNumber(summary.expenses);
    const miscExpenses = normalizeNumber(summary.miscExpenses);
    const totalExpenses = expenses + miscExpenses;
    const transfersIn = normalizeNumber(summary.transfersIn);
    const transfersOut = normalizeNumber(summary.transfersOut);

    return {
      monthKey: group.monthKey,
      label: group.label,
      income: normalizeNumber(summary.income),
      expenses,
      miscExpenses,
      totalExpenses,
      transfersIn,
      transfersOut,
      netCashFlow:
        normalizeNumber(summary.income) - totalExpenses,
      remainingBalance: getRemainingBalanceValue(lastRow)
    };
  });
}

export function calculatePayPeriodTrendRows(rows = [], limit = 12) {
  return [...rows]
    .filter((row) => getRowDateValue(row))
    .sort((left, right) =>
      String(getRowDateValue(left)).localeCompare(String(getRowDateValue(right)))
    )
    .slice(0, limit)
    .map((row) => {
      const expenses = getExpenseValue(row);
      const miscExpenses = getMiscExpensesValue(row);
      const totalExpenses = expenses + miscExpenses;
      const transfersIn = getTransfersInValue(row);
      const transfersOut = getTransfersOutValue(row);
      const dateValue = getRowDateValue(row);

      return {
        id: dateValue,
        label: getPayPeriodLabel(row) || formatShortDateLabel(dateValue),
        fullLabel: formatFullDateLabel(dateValue),
        income: getIncomeValue(row),
        expenses,
        miscExpenses,
        totalExpenses,
        transfersIn,
        transfersOut,
        netCashFlow: getIncomeValue(row) - totalExpenses,
        remainingBalance: getRemainingBalanceValue(row)
      };
    });
}

function getSavingsTransferDateValue(transfer = {}) {
  return (
    transfer.transferDate ||
    transfer.payPeriodDate ||
    transfer.periodDate ||
    transfer.payDate ||
    transfer.date ||
    ""
  );
}

function getSavingsTransferAmounts(transfer = {}) {
  const amount = normalizeNumber(transfer.amount ?? transfer.value ?? transfer.total);
  const transferType = String(
    transfer.type || transfer.direction || transfer.transferType || ""
  ).toLowerCase();
  const adjustmentType = String(
    transfer.adjustmentType || transfer.category || ""
  ).toLowerCase();
  const hasToBucket =
    transfer.toBucketId ||
    transfer.toBucket ||
    transfer.destinationBucketId ||
    transfer.bucketToId;
  const hasFromBucket =
    transfer.fromBucketId ||
    transfer.fromBucket ||
    transfer.sourceBucketId ||
    transfer.bucketFromId;

  const isTransferIn =
    Boolean(hasToBucket) ||
    transferType === "in" ||
    transferType === "transfer_in" ||
    transferType === "to_savings_bucket" ||
    adjustmentType === "transfer_in" ||
    (!hasFromBucket && !transferType && amount > 0);

  const isTransferOut =
    Boolean(hasFromBucket) ||
    transferType === "out" ||
    transferType === "transfer_out" ||
    transferType === "from_savings_bucket" ||
    adjustmentType === "transfer_out" ||
    (!hasToBucket && !transferType && amount < 0);

  return {
    transfersIn: isTransferIn ? Math.abs(amount) : 0,
    transfersOut: isTransferOut ? Math.abs(amount) : 0
  };
}

export function calculateSavingsTransferTrendRows(transfers = []) {
  const groups = new Map();

  transfers.forEach((transfer) => {
    const dateValue = getSavingsTransferDateValue(transfer);
    const monthKey = formatMonthKey(dateValue);

    if (!monthKey) {
      return;
    }

    const current = groups.get(monthKey) || {
      monthKey,
      label: formatMonthShortLabel(monthKey),
      transfersIn: 0,
      transfersOut: 0,
      netTransfers: 0
    };
    const amounts = getSavingsTransferAmounts(transfer);

    current.transfersIn += amounts.transfersIn;
    current.transfersOut += amounts.transfersOut;
    current.netTransfers = current.transfersIn - current.transfersOut;
    groups.set(monthKey, current);
  });

  return Array.from(groups.values()).sort((left, right) =>
    left.monthKey.localeCompare(right.monthKey)
  );
}

function getMaxRow(rows, getValue) {
  if (rows.length === 0) {
    return null;
  }

  return rows.reduce((best, row) => {
    return getValue(row) > getValue(best) ? row : best;
  }, rows[0]);
}

function getMinRow(rows, getValue) {
  if (rows.length === 0) {
    return null;
  }

  return rows.reduce((best, row) => {
    return getValue(row) < getValue(best) ? row : best;
  }, rows[0]);
}

export function calculateTrendSummary(
  monthlyTrendRows = [],
  payPeriodTrendRows = []
) {
  const bestCashFlowMonth = getMaxRow(
    monthlyTrendRows,
    (row) => row.netCashFlow
  );
  const highestExpenseMonth = getMaxRow(
    monthlyTrendRows,
    (row) => row.totalExpenses
  );
  const highestSavingsTransferMonth = getMaxRow(
    monthlyTrendRows,
    (row) => row.transfersIn
  );
  const lowestRemainingBalance = getMinRow(
    payPeriodTrendRows.filter((row) => Number.isFinite(row.remainingBalance)),
    (row) => row.remainingBalance
  );
  const averageMonthlyNetCashFlow =
    monthlyTrendRows.length === 0
      ? null
      : monthlyTrendRows.reduce(
          (total, row) => total + normalizeNumber(row.netCashFlow),
          0
        ) / monthlyTrendRows.length;

  return {
    bestCashFlowMonth,
    highestExpenseMonth,
    highestSavingsTransferMonth,
    lowestRemainingBalance,
    averageMonthlyNetCashFlow
  };
}

export function sanitizeFileName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildReportExportFileName(
  reportType,
  selectedMonth,
  selectedPayPeriodLabel
) {
  if (reportType === "payPeriod") {
    const payPeriodName =
      sanitizeFileName(selectedPayPeriodLabel) || "selected-pay-period";
    return `budget-report-pay-period-${payPeriodName}.csv`;
  }

  return `budget-report-month-${sanitizeFileName(selectedMonth) || "current"}.csv`;
}

function buildTrendSummaryExportRows(trendSummary = {}) {
  return [
    [
      "Trend Summary",
      "Best Cash Flow Month",
      trendSummary.bestCashFlowMonth
        ? trendSummary.bestCashFlowMonth.netCashFlow
        : "Not enough data"
    ],
    [
      "Trend Summary",
      "Highest Expense Month",
      trendSummary.highestExpenseMonth
        ? trendSummary.highestExpenseMonth.totalExpenses
        : "Not enough data"
    ],
    [
      "Trend Summary",
      "Highest Savings Transfer Month",
      trendSummary.highestSavingsTransferMonth
        ? trendSummary.highestSavingsTransferMonth.transfersIn
        : "Not enough data"
    ],
    [
      "Trend Summary",
      "Lowest Remaining Balance",
      trendSummary.lowestRemainingBalance
        ? trendSummary.lowestRemainingBalance.remainingBalance
        : "Not enough data"
    ],
    [
      "Trend Summary",
      "Average Monthly Net Cash Flow",
      trendSummary.averageMonthlyNetCashFlow ?? "Not enough data"
    ]
  ];
}

export function buildReportCsvSections(reportData = {}) {
  const {
    reportType,
    periodLabel,
    generatedAt,
    summary = {},
    budgetUsedPercentage = 0,
    categoryTotals = [],
    savingsSummary = { buckets: [], totals: {} },
    bucketBalanceSummary = savingsSummary,
    transferSummary = {},
    trendSummary = {},
    hasReportData = false
  } = reportData;
  const transferActivityRows = transferSummary.activityRows || [];
  const totalExpenses =
    normalizeNumber(summary.expenses) + normalizeNumber(summary.miscExpenses);
  const netCashFlow =
    normalizeNumber(summary.income) - totalExpenses;
  const rows = [
    ["Section", "Field", "Value"],
    [
      "Report Metadata",
      "Report Type",
      reportType === "payPeriod" ? "Pay period report" : "Monthly report"
    ],
    ["Report Metadata", "Period", periodLabel || ""],
    ["Report Metadata", "Generated At", generatedAt || ""]
  ];

  if (!hasReportData) {
    rows.push(["Report Metadata", "Note", "No report data available."]);
  }

  rows.push(
    [],
    ["Section", "Field", "Value"],
    ["Summary", "Income", normalizeNumber(summary.income)],
    ["Summary", "Expenses", totalExpenses],
    ["Summary", "Scheduled Expenses", normalizeNumber(summary.expenses)],
    ["Summary", "Misc Payments", normalizeNumber(summary.miscPayments)],
    ["Summary", "Misc Expenses", normalizeNumber(summary.miscExpenses)],
    ["Summary", "Planned Transfers To Savings", normalizeNumber(summary.transfersIn)],
    ["Summary", "Planned Transfers Out", normalizeNumber(summary.transfersOut)],
    ["Summary", "Net Cash Flow", netCashFlow],
    ["Summary", "Remaining Balance", normalizeNumber(summary.remainingBalance)],
    ["Summary", "Budget Used %", normalizeNumber(budgetUsedPercentage)],
    [],
    ["Section", "Field", "Value"],
    [
      "Transfers",
      "Planned To Savings",
      normalizeNumber(transferSummary.plannedToSavings)
    ],
    [
      "Transfers",
      "Validated Planner Transfers",
      normalizeNumber(transferSummary.validatedPlannerTransfers)
    ],
    [
      "Transfers",
      "Transfer Records In",
      normalizeNumber(transferSummary.transferRecordsIn)
    ],
    [
      "Transfers",
      "Transfer Records Out",
      normalizeNumber(transferSummary.transferRecordsOut)
    ],
    [
      "Transfers",
      "Bucket Adjustments",
      normalizeNumber(transferSummary.bucketAdjustments)
    ],
    [
      "Transfers",
      "Account Transfers",
      normalizeNumber(transferSummary.accountTransfers)
    ],
    [
      "Transfers",
      "Net Savings Movement",
      normalizeNumber(transferSummary.netSavingsMovement)
    ],
    [],
    ["Section", "Category", "Total"]
  );

  if (categoryTotals.length === 0) {
    rows.push(["Top Spending Categories", "No category spending found", ""]);
  } else {
    categoryTotals.forEach((item) => {
      rows.push([
        "Top Spending Categories",
        item.category,
        normalizeNumber(item.total)
      ]);
    });
  }

  rows.push(
    [],
    ["Section", "Field", "Value"],
    [
      "Savings Movement",
      "Planned To Savings",
      normalizeNumber(transferSummary.plannedToSavings)
    ],
    [
      "Savings Movement",
      "Validated Planner Transfers",
      normalizeNumber(transferSummary.validatedPlannerTransfers)
    ],
    [
      "Savings Movement",
      "Transfer Records In",
      normalizeNumber(transferSummary.transferRecordsIn)
    ],
    [
      "Savings Movement",
      "Transfer Records Out",
      normalizeNumber(transferSummary.transferRecordsOut)
    ],
    [
      "Savings Movement",
      "Bucket Adjustments",
      normalizeNumber(transferSummary.bucketAdjustments)
    ],
    [
      "Savings Movement",
      "Net Savings Movement",
      normalizeNumber(transferSummary.netSavingsMovement)
    ],
    [],
    ["Section", "Date", "Source", "Bucket", "Type", "Amount", "Status"]
  );

  if (transferActivityRows.length === 0) {
    rows.push([
      "Savings Movement Activity",
      "No transfer or savings movement found",
      "",
      "",
      "",
      "",
      ""
    ]);
  } else {
    transferActivityRows.forEach((activity) => {
      rows.push([
        "Savings Movement Activity",
        activity.date || activity.dateLabel || "",
        activity.source || "",
        activity.bucket || "",
        activity.type || "",
        normalizeNumber(activity.amount),
        activity.status || ""
      ]);
    });
  }

  rows.push(
    [],
    [
      "Section",
      "Bucket",
      "Current Projected",
      "Current Validated",
      "Movement In",
      "Movement Out",
      "Net Movement"
    ]
  );

  if ((bucketBalanceSummary.buckets || []).length === 0) {
    rows.push(["Savings Buckets", "No savings buckets found", "", "", "", "", ""]);
  } else {
    bucketBalanceSummary.buckets.forEach((bucket) => {
      rows.push([
        "Savings Buckets",
        bucket.name,
        normalizeNumber(bucket.currentProjectedBalance ?? bucket.balance),
        normalizeNumber(bucket.currentValidatedBalance ?? bucket.balance),
        normalizeNumber(bucket.movementIn ?? bucket.transfersIn),
        normalizeNumber(bucket.movementOut ?? bucket.transfersOut),
        normalizeNumber(bucket.netMovement ?? bucket.netTransfers)
      ]);
    });
  }

  rows.push([], ["Section", "Field", "Value"], ...buildTrendSummaryExportRows(trendSummary));

  return rows;
}

export function calculateBucketTransferTotals(bucketId, transfers = []) {
  return transfers.reduce(
    (totals, transfer) => {
      const amount = normalizeNumber(transfer.amount);

      const toBucketId =
        transfer.toBucketId ||
        transfer.toBucket ||
        transfer.destinationBucketId ||
        transfer.bucketToId;

      const fromBucketId =
        transfer.fromBucketId ||
        transfer.fromBucket ||
        transfer.sourceBucketId ||
        transfer.bucketFromId;

      const directBucketId = transfer.bucketId || transfer.savingsBucketId;

      const transferType =
        transfer.type || transfer.direction || transfer.transferType;
      const adjustmentType = transfer.adjustmentType || transfer.category;
      const normalizedTransferType = String(transferType || "").toLowerCase();
      const normalizedAdjustmentType = String(adjustmentType || "").toLowerCase();
      const isDirectBucketTransfer = directBucketId === bucketId;

      if (toBucketId === bucketId) {
        totals.transfersIn += Math.abs(amount);
      }

      if (fromBucketId === bucketId) {
        totals.transfersOut += Math.abs(amount);
      }

      if (
        isDirectBucketTransfer &&
        (normalizedTransferType === "in" ||
          normalizedTransferType === "transfer_in" ||
          normalizedTransferType === "to_savings_bucket")
      ) {
        totals.transfersIn += Math.abs(amount);
      }

      if (
        isDirectBucketTransfer &&
        (normalizedTransferType === "out" ||
          normalizedTransferType === "transfer_out" ||
          normalizedTransferType === "from_savings_bucket")
      ) {
        totals.transfersOut += Math.abs(amount);
      }

      if (
        isDirectBucketTransfer &&
        !transferType &&
        (normalizedAdjustmentType === "transfer_in" || amount > 0)
      ) {
        totals.transfersIn += Math.abs(amount);
      }

      if (
        isDirectBucketTransfer &&
        !transferType &&
        (normalizedAdjustmentType === "transfer_out" || amount < 0)
      ) {
        totals.transfersOut += Math.abs(amount);
      }

      totals.netTransfers = totals.transfersIn - totals.transfersOut;

      return totals;
    },
    {
      transfersIn: 0,
      transfersOut: 0,
      netTransfers: 0
    }
  );
}

export function dedupeSavingsMovements(movements = []) {
  const seen = new Set();

  return movements.filter((movement) => {
    const dateValue = getSavingsTransferDateValue(movement);
    const directBucketId =
      movement.bucketId ||
      movement.savingsBucketId ||
      movement.toBucketId ||
      movement.fromBucketId ||
      movement.destinationBucketId ||
      movement.sourceBucketId ||
      "";
    const amounts = getSavingsTransferAmounts(movement);
    const direction =
      amounts.transfersOut > 0
        ? "out"
        : amounts.transfersIn > 0
          ? "in"
          : "none";
    const amount = Math.max(amounts.transfersIn, amounts.transfersOut);
    const key = [
      dateValue,
      directBucketId,
      direction,
      normalizeNumber(amount).toFixed(2)
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function calculateSavingsSummary(buckets = [], transfers = []) {
  const bucketSummaries = buckets.map((bucket) => {
    const bucketId = bucket.id || bucket.bucketId || bucket.name;
    const transferTotals = calculateBucketTransferTotals(bucketId, transfers);

    const transfersIn = normalizeNumber(
      bucket.totalTransfersIn ?? transferTotals.transfersIn
    );

    const transfersOut = normalizeNumber(
      bucket.totalTransfersOut ?? transferTotals.transfersOut
    );

    return {
      id: bucketId,
      name: bucket.name || bucket.bucketName || bucket.label || "Unnamed bucket",
      balance: normalizeNumber(
        bucket.balance ??
          bucket.currentBalance ??
          bucket.startingAmount ??
          bucket.amount ??
          0
      ),
      transfersIn,
      transfersOut,
      netTransfers: normalizeNumber(
        bucket.netTransferAmount ?? transfersIn - transfersOut
      )
    };
  });

  const totals = bucketSummaries.reduce(
    (result, bucket) => {
      result.balance += bucket.balance;
      result.transfersIn += bucket.transfersIn;
      result.transfersOut += bucket.transfersOut;
      result.netTransfers += bucket.netTransfers;
      return result;
    },
    {
      balance: 0,
      transfersIn: 0,
      transfersOut: 0,
      netTransfers: 0
    }
  );

  return {
    buckets: bucketSummaries,
    totals
  };
}
