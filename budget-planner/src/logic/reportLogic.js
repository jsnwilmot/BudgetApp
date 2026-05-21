export function normalizeNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

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

export function getCurrentMonthKey() {
  return formatMonthKey(new Date());
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
    normalizeNumber(summary.expenses) +
    normalizeNumber(summary.miscExpenses) +
    normalizeNumber(summary.transfersIn);

  return Math.round((used / income) * 100);
}

export function calculateCategoryTotals(items = []) {
  const totals = new Map();

  items.forEach((item) => {
    const category =
      item.category ||
      item.categoryName ||
      item.name ||
      item.label ||
      "Uncategorized";

    const amount = normalizeNumber(item.amount ?? item.value ?? item.total);

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
    { name: "Transfers In", value: normalizeNumber(summary.transfersIn) }
  ];
}

export function buildSavingsTransferChartData(savingsSummary = {}) {
  const totals = savingsSummary.totals || {};

  return [
    { name: "Transfers In", value: normalizeNumber(totals.transfersIn) },
    { name: "Transfers Out", value: normalizeNumber(totals.transfersOut) },
    { name: "Net Transfers", value: normalizeNumber(totals.netTransfers) }
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
        normalizeNumber(summary.income) - totalExpenses - transfersIn + transfersOut,
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
        netCashFlow: getIncomeValue(row) - totalExpenses - transfersIn + transfersOut,
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
    adjustmentType === "transfer_in" ||
    (!hasFromBucket && !transferType && amount > 0);

  const isTransferOut =
    Boolean(hasFromBucket) ||
    transferType === "out" ||
    transferType === "transfer_out" ||
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
          normalizedTransferType === "transfer_in")
      ) {
        totals.transfersIn += Math.abs(amount);
      }

      if (
        isDirectBucketTransfer &&
        (normalizedTransferType === "out" ||
          normalizedTransferType === "transfer_out")
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
