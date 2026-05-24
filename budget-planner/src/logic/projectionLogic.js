import {
  appSettings as defaultAppSettings,
} from '../data/seedData';
import {
  findPreviousPayPeriod,
  formatDateKey,
  generatePayPeriods,
  parseLocalDate,
} from './dateLogic';
import {
  getProjectionType,
  getScheduledItemOccurrences,
  normalizeScheduledItem,
} from './scheduledItemLogic';
import { getTransferAccountEffects } from './transferLogic';

export function formatCurrency(value, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
  }).format(value || 0);
}

export function getEntryKey(scheduledItemId, payPeriodDate) {
  return `${scheduledItemId}__${payPeriodDate}`;
}

export function sumLineItems(lineItems = []) {
  return lineItems.reduce((total, item) => {
    const amount = Number(item.amount);
    return total + (Number.isNaN(amount) ? 0 : amount);
  }, 0);
}

function getMonthlyBillAssignmentRule(settings) {
  if (
    settings.monthlyBillAssignmentRule === 'same-pay-period' ||
    settings.monthlyBillAssignmentRule === 'same_pay_period'
  ) {
    return 'same-pay-period';
  }

  return 'previous-pay-period';
}

function normalizeProjectionSettings(settings = {}) {
  const safeSettings =
    settings && typeof settings === 'object' ? settings : {};
  const payFrequencyDays = [7, 14, 28, 30].includes(
    Number(safeSettings.payFrequencyDays)
  )
    ? Number(safeSettings.payFrequencyDays)
    : defaultAppSettings.payFrequencyDays;
  const projectionMonths = [3, 6, 12, 18, 24].includes(
    Number(safeSettings.projectionMonths)
  )
    ? Number(safeSettings.projectionMonths)
    : defaultAppSettings.projectionMonths;
  const payPeriodAnchorDate =
    typeof safeSettings.payPeriodAnchorDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(safeSettings.payPeriodAnchorDate)
      ? safeSettings.payPeriodAnchorDate
      : defaultAppSettings.payPeriodAnchorDate;

  return {
    ...defaultAppSettings,
    ...safeSettings,
    payFrequencyDays,
    projectionMonths,
    payPeriodAnchorDate,
    monthlyBillAssignmentRule:
      safeSettings.monthlyBillAssignmentRule || 'previous-pay-period',
  };
}

function findSamePayPeriod(payPeriods, dueDate) {
  const dueDateKey = formatDateKey(dueDate);
  const matchingPeriod = [...payPeriods].reverse().find((period) => {
    return period.date <= dueDateKey;
  });

  return matchingPeriod || payPeriods[0];
}

function isSameCalendarMonth(leftDate, rightDate) {
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth()
  );
}

function findAssignedPayPeriod(item, payPeriods, occurrenceDate, settings) {
  if (payPeriods.length === 0 || Number.isNaN(occurrenceDate.getTime())) {
    return null;
  }

  const firstPeriodDate = parseLocalDate(payPeriods[0].date);
  const lastPeriodDate = parseLocalDate(payPeriods[payPeriods.length - 1].date);

  if (occurrenceDate < firstPeriodDate) {
    if (item.frequency === 'monthly' && isSameCalendarMonth(occurrenceDate, firstPeriodDate)) {
      return payPeriods[0];
    }

    return null;
  }

  if (occurrenceDate > lastPeriodDate) {
    return null;
  }

  if (item.frequency === 'monthly') {
    return getMonthlyBillAssignmentRule(settings) === 'same-pay-period'
      ? findSamePayPeriod(payPeriods, occurrenceDate)
      : findPreviousPayPeriod(payPeriods, occurrenceDate);
  }

  if (item.frequency === 'yearly') {
    return findPreviousPayPeriod(payPeriods, occurrenceDate);
  }

  return findSamePayPeriod(payPeriods, occurrenceDate);
}

function buildScheduledItemPlacements(item, payPeriods, settings) {
  const placements = new Map();

  if (payPeriods.length === 0) {
    return placements;
  }

  const firstPeriodDate = parseLocalDate(payPeriods[0].date);
  const lastPeriodDate = parseLocalDate(payPeriods[payPeriods.length - 1].date);
  const occurrenceRangeStart =
    item.frequency === 'monthly'
      ? new Date(firstPeriodDate.getFullYear(), firstPeriodDate.getMonth(), 1)
      : firstPeriodDate;
  const occurrences = getScheduledItemOccurrences(
    item,
    occurrenceRangeStart,
    lastPeriodDate
  );

  occurrences.forEach((occurrence) => {
    const occurrenceDate = parseLocalDate(occurrence);
    const assignedPeriod = findAssignedPayPeriod(
      item,
      payPeriods,
      occurrenceDate,
      settings
    );

    if (!assignedPeriod) {
      return;
    }

    placements.set(
      assignedPeriod.date,
      (placements.get(assignedPeriod.date) || 0) + 1
    );
  });

  return placements;
}

function getEffectiveAmount(item, periodDate, plannedAmount, plannerEntries) {
  const entryKey = getEntryKey(item.id, periodDate);
  const entry = plannerEntries[entryKey];

  if (!entry) {
    return plannedAmount;
  }

  if (item.allowLineItems) {
    return sumLineItems(entry.lineItems || []);
  }

  if (!entry.useActual) {
    return plannedAmount;
  }

  const actualAmount = Number(entry.actualAmount);

  if (Number.isNaN(actualAmount)) {
    return plannedAmount;
  }

  return actualAmount;
}

export function buildPlannerRows({
  settings,
  accounts,
  scheduledItems,
  manualAdjustments,
  savingsBucketAdjustments = [],
  transfers = [],
  plannerEntries = {},
}) {
  const normalizedSettings = normalizeProjectionSettings(settings);
  const payPeriods = generatePayPeriods(
    normalizedSettings.payPeriodAnchorDate,
    normalizedSettings.payFrequencyDays,
    normalizedSettings.projectionMonths
  );

  const rows = scheduledItems
    .map((item) => normalizeScheduledItem(item))
    .filter((item) => item.active)
    .map((item) => {
      const placements = buildScheduledItemPlacements(
        item,
        payPeriods,
        normalizedSettings
      );
      const plannedByPeriod = {};
      const amountsByPeriod = {};

      payPeriods.forEach((period) => {
        const plannedAmount = (placements.get(period.date) || 0) * item.amount;

        plannedByPeriod[period.date] = plannedAmount;
        amountsByPeriod[period.date] = getEffectiveAmount(
          item,
          period.date,
          plannedAmount,
          plannerEntries
        );
      });

      return {
        id: item.id,
        name: item.name,
        type: getProjectionType(item.type),
        scheduledItemType: item.type,
        categoryId: item.categoryId,
        item,
        plannedByPeriod,
        amountsByPeriod,
      };
    });

  const projectionRows = calculateProjectionRows({
    payPeriods,
    rows,
    accounts,
    manualAdjustments,
    savingsBucketAdjustments,
    transfers,
    plannerEntries,
  });

  return {
    payPeriods,
    rows,
    projectionRows,
  };
}

export function calculatePeriodTotals(rows, periodDate) {
  const income = rows
    .filter((row) => row.type === 'income')
    .reduce((total, row) => total + (row.amountsByPeriod[periodDate] || 0), 0);

  const expensesOnly = rows
    .filter((row) => row.type === 'expense')
    .reduce((total, row) => total + (row.amountsByPeriod[periodDate] || 0), 0);

  const transfers = rows
    .filter((row) => row.type === 'transfer')
    .reduce((total, row) => total + (row.amountsByPeriod[periodDate] || 0), 0);

  const expenses = expensesOnly + transfers;

  return {
    income,
    expenses,
    expensesOnly,
    transfers,
    netChequing: income - expenses,
    netSavings: transfers,
  };
}

function calculateValidatedPeriodTotals(rows, periodDate, plannerEntries) {
  const getValidatedAmount = (row) => {
    const entryKey = getEntryKey(row.id, periodDate);
    const entry = plannerEntries[entryKey];

    if (!entry?.validated) {
      return 0;
    }

    return Number(row.amountsByPeriod[periodDate]) || 0;
  };

  const income = rows
    .filter((row) => row.type === 'income')
    .reduce((total, row) => total + getValidatedAmount(row), 0);

  const expensesOnly = rows
    .filter((row) => row.type === 'expense')
    .reduce((total, row) => total + getValidatedAmount(row), 0);

  const transfers = rows
    .filter((row) => row.type === 'transfer')
    .reduce((total, row) => total + getValidatedAmount(row), 0);

  const expenses = expensesOnly + transfers;

  return {
    income,
    expenses,
    expensesOnly,
    transfers,
    netChequing: income - expenses,
    netSavings: transfers,
  };
}

  function calculateProjectionRows({
    payPeriods,
    rows,
    accounts,
    manualAdjustments,
    savingsBucketAdjustments,
    transfers = [],
    plannerEntries = {},
  }) {
  const startingChequingBalance = accounts
    .filter((account) => account.type === 'chequing')
    .reduce(
      (total, account) => total + (Number(account.startingBalance) || 0),
      0
    );

  let chequingBalance = startingChequingBalance;
  let validatedChequingBalance = startingChequingBalance;

  let savingsBalance = accounts
    .filter((account) => account.type === 'savings')
    .reduce(
      (total, account) => total + (Number(account.startingBalance) || 0),
      0
    );

  const projectedChequing = {};
  const validatedChequing = {};
  const projectedSavings = {};
  const totalIncome = {};
  const totalExpenses = {};
  const totalTransfers = {};
  const netChequingChange = {};

  payPeriods.forEach((period) => {
    const totals = calculatePeriodTotals(rows, period.date);
    const validatedTotals = calculateValidatedPeriodTotals(
      rows,
      period.date,
      plannerEntries
    );

    const chequingAccountIds = accounts
  .filter((account) => account.type === 'chequing')
  .map((account) => account.id);

    const savingsAccountIds = accounts
      .filter((account) => account.type === 'savings')
      .map((account) => account.id);

    const chequingAdjustments = manualAdjustments
      .filter(
        (adjustment) =>
          adjustment.payPeriodDate === period.date &&
          chequingAccountIds.includes(adjustment.accountId)
      )
      .reduce(
        (total, adjustment) => total + (Number(adjustment.amount) || 0),
        0
      );

    const savingsAdjustments = manualAdjustments
      .filter(
        (adjustment) =>
          adjustment.payPeriodDate === period.date &&
          savingsAccountIds.includes(adjustment.accountId)
      )
      .reduce(
        (total, adjustment) => total + (Number(adjustment.amount) || 0),
        0
      );

    const savingsBucketAdjustmentsForPeriod = savingsBucketAdjustments
      .filter((adjustment) => adjustment.payPeriodDate === period.date)
      .reduce(
        (total, adjustment) => total + (Number(adjustment.amount) || 0),
        0
      );

    const transferRecordsForPeriod = transfers.filter(
      (transfer) => transfer.payPeriodDate === period.date
    );
    const transferEffectsForPeriod = transferRecordsForPeriod.map((transfer) =>
      getTransferAccountEffects(transfer)
    );

    const chequingTransferEffect = transferEffectsForPeriod.reduce(
      (total, effect) => {
        if (chequingAccountIds.includes(effect.fromAccountId)) {
          return total + effect.fromAmount;
        }

        if (chequingAccountIds.includes(effect.toAccountId)) {
          return total + effect.toAmount;
        }

        return total;
      },
      0
    );
    const validatedChequingTransferEffect = transferRecordsForPeriod
      .filter((transfer) => transfer.validated)
      .map((transfer) => getTransferAccountEffects(transfer))
      .reduce((total, effect) => {
        if (chequingAccountIds.includes(effect.fromAccountId)) {
          return total + effect.fromAmount;
        }

        if (chequingAccountIds.includes(effect.toAccountId)) {
          return total + effect.toAmount;
        }

        return total;
      }, 0);
    const savingsTransferEffect = transferEffectsForPeriod.reduce(
      (total, effect) => {
        if (savingsAccountIds.includes(effect.fromAccountId)) {
          return total + effect.fromAmount;
        }

        if (savingsAccountIds.includes(effect.toAccountId)) {
          return total + effect.toAmount;
        }

        return total;
      },
      0
    );

    chequingBalance +=
      totals.netChequing + chequingAdjustments + chequingTransferEffect;
    validatedChequingBalance +=
      validatedTotals.netChequing +
      chequingAdjustments +
      validatedChequingTransferEffect;

    savingsBalance +=
      totals.netSavings +
      savingsAdjustments +
      savingsBucketAdjustmentsForPeriod +
      savingsTransferEffect;

    totalIncome[period.date] = totals.income;
    totalExpenses[period.date] = totals.expenses;
    totalTransfers[period.date] =
      totals.transfers +
      transferRecordsForPeriod
        .filter((transfer) => transfer.transferType === 'to_savings_bucket')
        .reduce((total, transfer) => total + (Number(transfer.amount) || 0), 0);
    netChequingChange[period.date] =
      totals.netChequing + chequingTransferEffect;
    projectedChequing[period.date] = chequingBalance;
    validatedChequing[period.date] = validatedChequingBalance;
    projectedSavings[period.date] = savingsBalance;
  });

  return [
    {
      id: 'total-income',
      name: 'Total Income',
      type: 'total',
      amountsByPeriod: totalIncome,
    },
    {
      id: 'total-expenses',
      name: 'Total Expenses',
      type: 'total',
      amountsByPeriod: totalExpenses,
    },
    {
      id: 'total-transfers',
      name: 'Total Transfers to Savings',
      type: 'total',
      amountsByPeriod: totalTransfers,
    },
    {
      id: 'net-chequing-change',
      name: 'Net Chequing Change',
      type: 'balance',
      amountsByPeriod: netChequingChange,
    },
    {
      id: 'projected-chequing',
      name: 'Projected Chequing',
      type: 'balance',
      amountsByPeriod: projectedChequing,
    },
    {
      id: 'validated-chequing',
      name: 'Validated Chequing',
      type: 'balance',
      amountsByPeriod: validatedChequing,
    },
    {
      id: 'projected-savings',
      name: 'Projected Savings',
      type: 'balance',
      amountsByPeriod: projectedSavings,
    },
  ];
}

export function getDashboardSummary(plannerData) {
  const { payPeriods, rows, projectionRows } = plannerData;
  const nextPeriod = payPeriods[0];

  if (!nextPeriod) {
    return {
      nextPayDate: '',
      nextIncome: 0,
      nextExpenses: 0,
      nextTransfers: 0,
      projectedChequingAfterNext: 0,
      projectedSavingsAfterNext: 0,
      projectedChequingEnd: 0,
      projectedSavingsEnd: 0,
      lowestChequing: 0,
    };
  }

  const totals = calculatePeriodTotals(rows, nextPeriod.date);

  const chequingRow = projectionRows.find(
    (row) => row.id === 'projected-chequing'
  );
  const savingsRow = projectionRows.find((row) => row.id === 'projected-savings');
  const transferRow = projectionRows.find((row) => row.id === 'total-transfers');

  const finalPeriod = payPeriods[payPeriods.length - 1];
  const finalPeriodDate = finalPeriod?.date || nextPeriod.date;

  const chequingValues = Object.values(chequingRow?.amountsByPeriod || {});
  const lowestChequing = Math.min(...chequingValues);

  return {
    nextPayDate: nextPeriod.date,
    nextIncome: totals.income,
    nextExpenses: totals.expenses,
    nextTransfers:
      transferRow?.amountsByPeriod?.[nextPeriod.date] ?? totals.transfers,
    projectedChequingAfterNext:
      chequingRow?.amountsByPeriod?.[nextPeriod.date] || 0,
    projectedSavingsAfterNext:
      savingsRow?.amountsByPeriod?.[nextPeriod.date] || 0,
    projectedChequingEnd: chequingRow?.amountsByPeriod?.[finalPeriodDate] || 0,
    projectedSavingsEnd: savingsRow?.amountsByPeriod?.[finalPeriodDate] || 0,
    lowestChequing: Number.isFinite(lowestChequing) ? lowestChequing : 0,
  };
}

export function buildSavingsBucketProjection({
  payPeriods,
  rows,
  savingsBuckets,
  savingsBucketAdjustments,
  transfers = [],
}) {
  return savingsBuckets.map((bucket) => {
    let balance = Number(bucket.startingAmount) || 0;

    const transfersInByPeriod = {};
    const transferRecordsInByPeriod = {};
    const transferRecordsOutByPeriod = {};
    const adjustmentsByPeriod = {};
    const balanceByPeriod = {};

    payPeriods.forEach((period) => {
      const transferIn = rows
        .filter((row) => row.type === 'transfer')
        .filter((row) => row.item?.bucketId === bucket.id)
        .reduce((total, row) => {
          return total + (Number(row.amountsByPeriod[period.date]) || 0);
        }, 0);

      const adjustmentTotal = savingsBucketAdjustments
        .filter((adjustment) => adjustment.bucketId === bucket.id)
        .filter((adjustment) => adjustment.payPeriodDate === period.date)
        .reduce((total, adjustment) => {
          return total + (Number(adjustment.amount) || 0);
        }, 0);
      const transferRecordTotals = transfers
        .filter((transfer) => transfer.bucketId === bucket.id)
        .filter((transfer) => transfer.payPeriodDate === period.date)
        .reduce(
          (totals, transfer) => {
            const amount = Number(transfer.amount) || 0;

            if (transfer.transferType === 'to_savings_bucket') {
              totals.in += amount;
            }

            if (transfer.transferType === 'from_savings_bucket') {
              totals.out += amount;
            }

            return totals;
          },
          { in: 0, out: 0 }
        );

      balance +=
        transferIn +
        adjustmentTotal +
        transferRecordTotals.in -
        transferRecordTotals.out;

      transfersInByPeriod[period.date] = transferIn;
      transferRecordsInByPeriod[period.date] = transferRecordTotals.in;
      transferRecordsOutByPeriod[period.date] = transferRecordTotals.out;
      adjustmentsByPeriod[period.date] = adjustmentTotal;
      balanceByPeriod[period.date] = balance;
    });

    return {
      bucket,
      transfersInByPeriod,
      transferRecordsInByPeriod,
      transferRecordsOutByPeriod,
      adjustmentsByPeriod,
      balanceByPeriod,
    };
  });
}
