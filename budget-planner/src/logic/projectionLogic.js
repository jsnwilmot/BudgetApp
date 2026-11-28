import {
  appSettings as defaultAppSettings,
} from '../data/seedData';
import {
  addDays,
  getLocalToday,
  getPlannerPeriods,
  parseLocalDate,
} from './dateLogic';
import {
  getProjectionType,
  getScheduledItemOccurrences,
  normalizeScheduledItem,
} from './scheduledItemLogic';
import { getTransferAccountEffects } from './transferLogic';
import {
  getConfirmedAmount,
  getPlannerEntryIdentity,
  getSavedAmount,
  getSavedPlannerSource,
  isConfirmedPlannerSource,
} from './plannerHistory';
import { formatCurrency } from '../utils/currency';

export { formatCurrency };

export function getEntryKey(scheduledItemId, payPeriodDate) {
  return `${scheduledItemId}__${payPeriodDate}`;
}

export function getPlannerPeriodSource(row, date) {
  return row.sourcesByPeriod?.[date] ?? row.item ?? row;
}

export function getPlannerPeriodType(row, date) {
  const source = row.sourcesByPeriod?.[date];
  return source ? getProjectionType(source.type) : row.type;
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

function findAssignedPayPeriod(payPeriods, occurrence, assignPrevious) {
  let first = 0;
  let end = payPeriods.length;
  while (first < end) {
    const mid = Math.floor((first + end) / 2);
    const date = payPeriods[mid].date;
    if (date < occurrence || (!assignPrevious && date === occurrence)) first = mid + 1;
    else end = mid;
  }
  return payPeriods[Math.max(0, first - 1)];
}

function buildScheduledItemPlacements(item, payPeriods, settings) {
  const placements = new Map();

  if (payPeriods.length === 0) {
    return placements;
  }

  const firstPeriodDate = parseLocalDate(payPeriods[0].date);
  const lastPeriodDate = parseLocalDate(payPeriods[payPeriods.length - 1].date);
  const assignPrevious = item.frequency === 'yearly' ||
    (item.frequency === 'monthly' && getMonthlyBillAssignmentRule(settings) === 'previous-pay-period');
  const occurrenceRangeStart =
    item.frequency === 'monthly'
      ? new Date(firstPeriodDate.getFullYear(), firstPeriodDate.getMonth(), 1)
      : firstPeriodDate;
  // Finish the last pay period before applying the horizon cutoff. A due date
  // on the next start can belong to the last period under the previous rule.
  const occurrenceRangeEnd = addDays(lastPeriodDate, settings.payFrequencyDays - (assignPrevious ? 0 : 1));
  const occurrences = getScheduledItemOccurrences(
    item,
    occurrenceRangeStart,
    occurrenceRangeEnd
  );

  occurrences.forEach((occurrence) => {
    const assignedPeriod = findAssignedPayPeriod(payPeriods, occurrence, assignPrevious);

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
  today = getLocalToday(),
  throughYear,
}) {
  const normalizedSettings = normalizeProjectionSettings(settings);
  const periods = getPlannerPeriods(
    normalizedSettings.payPeriodAnchorDate,
    normalizedSettings.payFrequencyDays,
    normalizedSettings.projectionMonths,
    today,
    throughYear
  );
  const { payPeriods } = periods;
  const savedScheduleIds = new Set();
  for (const [key, entry] of Object.entries(plannerEntries)) {
    const identity = getPlannerEntryIdentity(key, entry);
    if (identity) savedScheduleIds.add(identity.id);
  }

  const rows = scheduledItems
    .map((item) => normalizeScheduledItem(item))
    .filter((item) => item.active || savedScheduleIds.has(String(item.id)))
    .map((item) => {
      const placements = item.active ? buildScheduledItemPlacements(
        item,
        payPeriods,
        normalizedSettings
      ) : new Map();
      const plannedByPeriod = {};
      const amountsByPeriod = {};
      const sourcesByPeriod = {};
      const historyWarningsByPeriod = {};

      payPeriods.forEach((period) => {
        const date = period.date;
        const key = getEntryKey(item.id, date);
        const entry = plannerEntries[key];
        const plannedAmount = (placements.get(date) || 0) * item.amount;
        if (entry?.validated) {
          const identity = getPlannerEntryIdentity(key, entry);
          const source = getSavedPlannerSource(entry, item.id);
          const sourceConflict = !identity || (entry.scheduledItemSnapshot != null && !source);
          const amount = getConfirmedAmount(entry);
          plannedByPeriod[date] = getSavedAmount(entry.plannedAmount);
          amountsByPeriod[date] = sourceConflict ? 0 : (amount ?? 0);
          if (source && identity) sourcesByPeriod[date] = source;
          const sourceVerified = source && isConfirmedPlannerSource(entry) && !entry.historicalSourceNeedsReview;
          const sourceWarning = sourceConflict ? 'Source conflict' : sourceVerified ? '' : 'Source unverified';
          const amountWarning = amount === undefined ? 'Amount needs review' : '';
          if (sourceWarning || amountWarning) {
            historyWarningsByPeriod[date] = { source: sourceWarning, amount: amountWarning };
          }
          return;
        }

        const forecastAllowed = item.active && (!item.endDate || date <= item.endDate);
        plannedByPeriod[date] = forecastAllowed ? plannedAmount : getSavedAmount(entry?.plannedAmount);
        amountsByPeriod[date] = forecastAllowed ? getEffectiveAmount(
          item,
          date,
          plannedAmount,
          plannerEntries
        ) : 0;
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
        sourcesByPeriod,
        historyWarningsByPeriod,
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
    ...periods,
    today,
    forecastMonths: normalizedSettings.projectionMonths,
    rows,
    projectionRows,
  };
}

export function calculatePeriodTotals(rows, periodDate) {
  const income = rows
    .filter((row) => getPlannerPeriodType(row, periodDate) === 'income')
    .reduce((total, row) => total + (row.amountsByPeriod[periodDate] || 0), 0);

  const expensesOnly = rows
    .filter((row) => getPlannerPeriodType(row, periodDate) === 'expense')
    .reduce((total, row) => total + (row.amountsByPeriod[periodDate] || 0), 0);

  const transfers = rows
    .filter((row) => getPlannerPeriodType(row, periodDate) === 'transfer')
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

      const type = getPlannerPeriodType(row, periodDate);
      if (type === 'transfer') {
        effects.chequing -= amount;
        effects.savings += amount;
        return effects;
      }

      const accountType = accountTypeById.get(getPlannerPeriodSource(row, periodDate).accountId);
      const signedAmount = type === 'income' ? amount : -amount;

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
  const { forecastPayPeriods = plannerData.payPeriods, rows, projectionRows, today } = plannerData;
  const nextPeriod = forecastPayPeriods.find((period) => !today || period.date >= today);

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

  const finalPeriod = forecastPayPeriods.at(-1);
  const finalPeriodDate = finalPeriod?.date || nextPeriod.date;

  const chequingValues = forecastPayPeriods.map((period) => chequingRow?.amountsByPeriod?.[period.date] || 0);
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

export function getCurrentPayPeriod(payPeriods = [], today = getLocalToday()) {
  return payPeriods.findLast((period) => period.date <= today) ?? null;
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
  return rows.flatMap((row) => payPeriods.flatMap(({ date }) => {
    const entry = plannerEntries[getEntryKey(row.id, date)];
    const amount = Number(row.amountsByPeriod?.[date]) || 0;
    const source = getPlannerPeriodSource(row, date);
    const bucketId = source.bucketId ?? source.savingsBucketId;
    if (getPlannerPeriodType(row, date) !== 'transfer' || !bucketId ||
        !entry?.validated || amount === 0) return [];

    return [{
      id: `planner-transfer-${row.id}-${date}`,
      source: 'planner',
      readOnly: true,
      date,
      payPeriodDate: date,
      fromAccountId: null,
      toAccountId: null,
      bucketId,
      transferType: 'validated_planner_transfer',
      direction: 'to_savings_bucket',
      amount,
      validated: true,
      notes: String(entry.notes || '').trim(),
    }];
  }));
}

export function buildSavingsBucketProjection({
  payPeriods = [],
  rows = [],
  savingsBuckets = [],
  savingsBucketAdjustments = [],
  transfers = [],
  plannerEntries = {},
  today = getLocalToday(),
  forecastPayPeriods = payPeriods,
}) {
  const currentPayPeriod = getCurrentPayPeriod(payPeriods, today);
  const currentPayPeriodDate = currentPayPeriod?.date || '';
  const finalPeriodDate = forecastPayPeriods.at(-1)?.date || '';

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
      const bucketRows = rows.filter((row) => {
        const source = getPlannerPeriodSource(row, period.date);
        return getPlannerPeriodType(row, period.date) === 'transfer' &&
          (source.bucketId ?? source.savingsBucketId) === bucket.id;
      });
      const transferIn = bucketRows
        .reduce((total, row) => {
          return total + (Number(row.amountsByPeriod[period.date]) || 0);
        }, 0);
      const validatedTransferIn = bucketRows
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
