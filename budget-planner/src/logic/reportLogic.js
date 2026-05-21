export function normalizeNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function formatMonthKey(dateValue) {
  if (!dateValue) return "";

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

export function calculateMonthlySummary(rows = []) {
  return rows.reduce(
    (summary, row) => {
      const income = normalizeNumber(
        row.income ?? row.totalIncome ?? row.incomeTotal ?? row.payAmount
      );

      const expenses = normalizeNumber(
        row.expenses ??
          row.totalExpenses ??
          row.expenseTotal ??
          row.fixedExpenses ??
          row.fixedExpenseTotal ??
          row.fixedExpensesTotal ??
          row.billsTotal
      );

      const miscPayments = normalizeNumber(
        row.miscPaymentsTotal ?? row.miscPayments ?? row.additionalPaymentsTotal
      );

      const miscExpenses = normalizeNumber(
        row.miscExpensesTotal ?? row.miscExpenses ?? row.additionalExpensesTotal
      );

      const transfersIn = normalizeNumber(
        row.savingsTransfersIn ?? row.transfersIn ?? row.totalTransfersIn
      );

      const transfersOut = normalizeNumber(
        row.savingsTransfersOut ?? row.transfersOut ?? row.totalTransfersOut
      );

      const remainingBalance = normalizeNumber(
        row.remainingBalance ??
          row.balance ??
          row.availableBalance ??
          row.chequingBalance
      );

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

      if (toBucketId === bucketId) {
        totals.transfersIn += amount;
      }

      if (fromBucketId === bucketId) {
        totals.transfersOut += amount;
      }

      if (directBucketId === bucketId && transferType === "in") {
        totals.transfersIn += amount;
      }

      if (directBucketId === bucketId && transferType === "out") {
        totals.transfersOut += amount;
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
        bucket.balance ?? bucket.currentBalance ?? bucket.amount ?? 0
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