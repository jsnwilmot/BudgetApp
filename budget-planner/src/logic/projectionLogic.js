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

export function getLineItemTotal(entry = {}, fallbackAmount = 0) {
  if (entry.lineItems?.length > 0) {
    return sumLineItems(entry.lineItems);
  }

  if (entry.useActual) {
    const actualAmount = Number(entry.actualAmount);

    if (!Number.isNaN(actualAmount)) {
      return actualAmount;
    }
  }

  return Number(fallbackAmount) || 0;
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
    return getLineItemTotal(entry, plannedAmount);
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
        accountId: item.accountId,
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


export function buildExportPlannerRows(plannerData) {
  const projectedChequingRow = plannerData.projectionRows.find(
    (row) => row.id === 'projected-chequing'
  );

  return plannerData.payPeriods.map((period) => {
    const totals = calculatePeriodTotals(plannerData.rows, period.date);

    return {
      payPeriodLabel: period.label,
      date: period.date,
      income: totals.income,
      fixedExpenses: totals.expenses,
      savingsTransfersIn: totals.transfers,
      remainingBalance:
        projectedChequingRow?.amountsByPeriod?.[period.date] ?? 0,
    };
  });
}

function getValidatedRowAmount(row, periodDate, plannerEntries) {
  const entryKey = getEntryKey(row.id, periodDate);
  const entry = plannerEntries[entryKey];

  if (!entry?.validated) {
    return 0;
  }

  return Number(row.amountsByPeriod[periodDate]) || 0;
}

function calculateScheduledAccountEffects(
  rows,
  periodDate,
  accountTypeById,
  plannerEntries = null
) {
  return rows.reduce(
    (effects, row) => {
      const amount = plannerEntries
        ? getValidatedRowAmount(row, periodDate, plannerEntries)
        : Number(row.amountsByPeriod[periodDate]) || 0;

      if (row.type === 'transfer') {
        effects.chequing -= amount;
        effects.savings += amount;
        return effects;
      }

      const accountType = accountTypeById.get(row.accountId);
      const signedAmount = row.type === 'income' ? amount : -amount;

      if (!accountType || accountType === 'chequing') {
        effects.chequing += signedAmount;
      } else if (accountType === 'savings') {
        effects.savings += signedAmount;
      }

      return effects;
    },
    {
      chequing: 0,
      savings: 0,
    }
  );
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
  const accountTypeById = new Map(
    accounts.map((account) => [account.id, account.type])
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
    const scheduledAccountEffects = calculateScheduledAccountEffects(
      rows,
      period.date,
      accountTypeById
    );
    const validatedScheduledAccountEffects = calculateScheduledAccountEffects(
      rows,
      period.date,
      accountTypeById,
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
      scheduledAccountEffects.chequing +
      chequingAdjustments +
      chequingTransferEffect;
    validatedChequingBalance +=
      validatedScheduledAccountEffects.chequing +
      chequingAdjustments +
      validatedChequingTransferEffect;

    savingsBalance +=
      scheduledAccountEffects.savings +
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
      scheduledAccountEffects.chequing + chequingTransferEffect;
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

export function getCurrentPayPeriod(payPeriods = [], today = formatDateKey(new Date())) {
  if (!Array.isArray(payPeriods) || payPeriods.length === 0) {
    return null;
  }

  return (
    [...payPeriods].reverse().find((period) => period.date <= today) ||
    payPeriods[0] ||
    null
  );
}

function isPeriodThroughCurrent(periodDate, currentPayPeriodDate) {
  return Boolean(currentPayPeriodDate && periodDate <= currentPayPeriodDate);
}

function getValidatedPlannerAmount(row, periodDate, plannerEntries = {}) {
  const entryKey = getEntryKey(row.id, periodDate);
  const entry = plannerEntries[entryKey];

  if (!entry?.validated) {
    return 0;
  }

  return Number(row.amountsByPeriod?.[periodDate]) || 0;
}

export function buildValidatedPlannerBucketActivities({
  payPeriods = [],
  rows = [],
  plannerEntries = {},
}) {
  return rows
    .filter((row) => row.type === 'transfer' && row.item?.bucketId)
    .flatMap((row) => {
      return payPeriods
        .map((period) => {
          const entryKey = getEntryKey(row.id, period.date);
          const entry = plannerEntries[entryKey];
          const amount = Number(row.amountsByPeriod?.[period.date]) || 0;

          if (!entry?.validated || amount === 0) {
            return null;
          }

          return {
            id: `planner-transfer-${row.id}-${period.date}`,
            source: 'planner',
            readOnly: true,
            date: period.date,
            payPeriodDate: period.date,
            fromAccountId: null,
            toAccountId: null,
            bucketId: row.item.bucketId,
            transferType: 'validated_planner_transfer',
            direction: 'to_savings_bucket',
            amount,
            validated: true,
            notes: String(entry.notes || '').trim(),
          };
        })
        .filter(Boolean);
    });
}

export function buildSavingsBucketProjection({
  payPeriods = [],
  rows = [],
  savingsBuckets = [],
  savingsBucketAdjustments = [],
  transfers = [],
  plannerEntries = {},
}) {
  const currentPayPeriod = getCurrentPayPeriod(payPeriods);
  const currentPayPeriodDate = currentPayPeriod?.date || '';
  const finalPeriodDate = payPeriods[payPeriods.length - 1]?.date || '';

  return savingsBuckets.map((bucket) => {
    let balance = Number(bucket.startingAmount) || 0;
    let validatedBalance = balance;
    let plannedTransfersToDate = 0;
    let validatedPlannerTransfersToDate = 0;
    let transferRecordsInToDate = 0;
    let transferRecordsOutToDate = 0;
    let validatedTransferRecordsInToDate = 0;
    let validatedTransferRecordsOutToDate = 0;
    let adjustmentsToDate = 0;
    let currentProjectedBalance = balance;
    let currentValidatedBalance = balance;

    const transfersInByPeriod = {};
    const validatedTransfersInByPeriod = {};
    const transferRecordsInByPeriod = {};
    const transferRecordsOutByPeriod = {};
    const validatedTransferRecordsInByPeriod = {};
    const validatedTransferRecordsOutByPeriod = {};
    const adjustmentsByPeriod = {};
    const balanceByPeriod = {};
    const validatedBalanceByPeriod = {};

    payPeriods.forEach((period) => {
      const transferIn = rows
        .filter((row) => row.type === 'transfer')
        .filter((row) => row.item?.bucketId === bucket.id)
        .reduce((total, row) => {
          return total + (Number(row.amountsByPeriod[period.date]) || 0);
        }, 0);
      const validatedTransferIn = rows
        .filter((row) => row.type === 'transfer')
        .filter((row) => row.item?.bucketId === bucket.id)
        .reduce((total, row) => {
          return total + getValidatedPlannerAmount(row, period.date, plannerEntries);
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
          { in: 0, out: 0, validatedIn: 0, validatedOut: 0 }
        );

      transfers
        .filter((transfer) => transfer.bucketId === bucket.id)
        .filter((transfer) => transfer.payPeriodDate === period.date)
        .filter((transfer) => transfer.validated)
        .forEach((transfer) => {
          const amount = Number(transfer.amount) || 0;

          if (transfer.transferType === 'to_savings_bucket') {
            transferRecordTotals.validatedIn += amount;
          }

          if (transfer.transferType === 'from_savings_bucket') {
            transferRecordTotals.validatedOut += amount;
          }
        });

      balance +=
        transferIn +
        adjustmentTotal +
        transferRecordTotals.in -
        transferRecordTotals.out;

      validatedBalance +=
        validatedTransferIn +
        adjustmentTotal +
        transferRecordTotals.validatedIn -
        transferRecordTotals.validatedOut;

      transfersInByPeriod[period.date] = transferIn;
      validatedTransfersInByPeriod[period.date] = validatedTransferIn;
      transferRecordsInByPeriod[period.date] = transferRecordTotals.in;
      transferRecordsOutByPeriod[period.date] = transferRecordTotals.out;
      validatedTransferRecordsInByPeriod[period.date] =
        transferRecordTotals.validatedIn;
      validatedTransferRecordsOutByPeriod[period.date] =
        transferRecordTotals.validatedOut;
      adjustmentsByPeriod[period.date] = adjustmentTotal;
      balanceByPeriod[period.date] = balance;
      validatedBalanceByPeriod[period.date] = validatedBalance;

      if (isPeriodThroughCurrent(period.date, currentPayPeriodDate)) {
        plannedTransfersToDate += transferIn;
        validatedPlannerTransfersToDate += validatedTransferIn;
        transferRecordsInToDate += transferRecordTotals.in;
        transferRecordsOutToDate += transferRecordTotals.out;
        validatedTransferRecordsInToDate += transferRecordTotals.validatedIn;
        validatedTransferRecordsOutToDate += transferRecordTotals.validatedOut;
        adjustmentsToDate += adjustmentTotal;
        currentProjectedBalance = balance;
        currentValidatedBalance = validatedBalance;
      }
    });

    return {
      bucket,
      startingAmount: Number(bucket.startingAmount) || 0,
      plannedTransfersToDate,
      validatedPlannerTransfersToDate,
      transferRecordsInToDate,
      transferRecordsOutToDate,
      validatedTransferRecordsInToDate,
      validatedTransferRecordsOutToDate,
      adjustmentsToDate,
      currentProjectedBalance,
      currentValidatedBalance,
      finalProjectedBalance:
        (balanceByPeriod[finalPeriodDate] ?? Number(bucket.startingAmount)) || 0,
      transfersInByPeriod,
      validatedTransfersInByPeriod,
      transferRecordsInByPeriod,
      transferRecordsOutByPeriod,
      validatedTransferRecordsInByPeriod,
      validatedTransferRecordsOutByPeriod,
      adjustmentsByPeriod,
      balanceByPeriod,
      validatedBalanceByPeriod,
    };
  });
}
