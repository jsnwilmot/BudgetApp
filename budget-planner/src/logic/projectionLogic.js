import {
  appSettings as defaultAppSettings,
} from '../data/seedData';
import {
  findPreviousPayPeriod,
  formatDateKey,
  generatePayPeriods,
  getMonthDate,
  isSameBiweeklyCycle,
  parseLocalDate,
} from './dateLogic';

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

function shouldPlaceBiweeklyItem(item, period, settings) {
  if (!item.startDate) {
    return false;
  }

  return isSameBiweeklyCycle(
    item.startDate,
    period.date,
    settings.payFrequencyDays
  );
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

function buildMonthlyPlacements(item, payPeriods, settings) {
  const placements = new Set();

  if (payPeriods.length === 0) {
    return placements;
  }

  const firstPeriodDate = parseLocalDate(payPeriods[0].date);
  const lastPeriodDate = parseLocalDate(payPeriods[payPeriods.length - 1].date);
  const assignmentRule = getMonthlyBillAssignmentRule(settings);

  for (
    let year = firstPeriodDate.getFullYear();
    year <= lastPeriodDate.getFullYear();
    year += 1
  ) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const dueDate = getMonthDate(year, monthIndex, item.dueDay || 1);

      if (dueDate < firstPeriodDate) {
        // If a due date lands just before the first generated pay period,
        // keep it visible by placing it in the first period instead of dropping it.
        if (isSameCalendarMonth(dueDate, firstPeriodDate)) {
          placements.add(payPeriods[0].date);
        }

        continue;
      }

      if (dueDate > lastPeriodDate) {
        continue;
      }

      const assignedPeriod =
        assignmentRule === 'same-pay-period'
          ? findSamePayPeriod(payPeriods, dueDate)
          : findPreviousPayPeriod(payPeriods, dueDate);
      placements.add(assignedPeriod.date);
    }
  }

  return placements;
}

function buildAnnualPlacements(item, payPeriods) {
  const placements = new Set();

  if (payPeriods.length === 0) {
    return placements;
  }

  const firstPeriodDate = parseLocalDate(payPeriods[0].date);
  const lastPeriodDate = parseLocalDate(payPeriods[payPeriods.length - 1].date);

  for (
    let year = firstPeriodDate.getFullYear();
    year <= lastPeriodDate.getFullYear();
    year += 1
  ) {
    const dueDate = getMonthDate(
      year,
      (item.dueMonth || 1) - 1,
      item.dueDay || 1
    );

    if (dueDate < firstPeriodDate) {
      // Same safe fallback as monthly items for annual due dates near the anchor.
      if (isSameCalendarMonth(dueDate, firstPeriodDate)) {
        placements.add(payPeriods[0].date);
      }

      continue;
    }

    if (dueDate > lastPeriodDate) {
      continue;
    }

    const assignedPeriod = findPreviousPayPeriod(payPeriods, dueDate);
    placements.add(assignedPeriod.date);
  }

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
  plannerEntries = {},
}) {
  const normalizedSettings = normalizeProjectionSettings(settings);
  const payPeriods = generatePayPeriods(
    normalizedSettings.payPeriodAnchorDate,
    normalizedSettings.payFrequencyDays,
    normalizedSettings.projectionMonths
  );

  const rows = scheduledItems
    .filter((item) => item.active)
    .filter((item) => item.frequency !== 'manual')
    .map((item) => {
      let placementDates = new Set();

      if (item.frequency === 'biweekly') {
        placementDates = new Set(
          payPeriods
            .filter((period) =>
              shouldPlaceBiweeklyItem(item, period, normalizedSettings)
            )
            .map((period) => period.date)
        );
      }

      if (item.frequency === 'monthly') {
        placementDates = buildMonthlyPlacements(
          item,
          payPeriods,
          normalizedSettings
        );
      }

      if (item.frequency === 'annual') {
        placementDates = buildAnnualPlacements(item, payPeriods);
      }

      const plannedByPeriod = {};
      const amountsByPeriod = {};

      payPeriods.forEach((period) => {
        const plannedAmount = placementDates.has(period.date) ? item.amount : 0;

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
        type: item.type,
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

  const expenses = rows
    .filter((row) => row.type === 'expense')
    .reduce((total, row) => total + (row.amountsByPeriod[periodDate] || 0), 0);

  const transfers = rows
    .filter((row) => row.type === 'transfer')
    .reduce((total, row) => total + (row.amountsByPeriod[periodDate] || 0), 0);

  return {
    income,
    expenses,
    transfers,
    netChequing: income - expenses - transfers,
    netSavings: transfers,
  };
}

function calculateProjectionRows({
  payPeriods,
  rows,
  accounts,
  manualAdjustments,
  savingsBucketAdjustments,
}) {
  let chequingBalance =
    accounts.find((account) => account.type === 'chequing')?.startingBalance ||
    0;

  let savingsBalance =
    accounts.find((account) => account.type === 'savings')?.startingBalance ||
    0;

  const projectedChequing = {};
  const projectedSavings = {};
  const totalIncome = {};
  const totalExpenses = {};
  const totalTransfers = {};
  const netChequingChange = {};

  payPeriods.forEach((period) => {
    const totals = calculatePeriodTotals(rows, period.date);

    const chequingAdjustments = manualAdjustments
      .filter(
        (adjustment) =>
          adjustment.payPeriodDate === period.date &&
          adjustment.accountId === 'acct-chequing'
      )
      .reduce((total, adjustment) => total + adjustment.amount, 0);

    const savingsAdjustments = manualAdjustments
      .filter(
        (adjustment) =>
          adjustment.payPeriodDate === period.date &&
          adjustment.accountId === 'acct-savings'
      )
      .reduce((total, adjustment) => total + adjustment.amount, 0);

    const savingsBucketAdjustmentsForPeriod = savingsBucketAdjustments
      .filter((adjustment) => adjustment.payPeriodDate === period.date)
      .reduce((total, adjustment) => total + adjustment.amount, 0);

    chequingBalance += totals.netChequing + chequingAdjustments;
    savingsBalance +=
      totals.netSavings + savingsAdjustments + savingsBucketAdjustmentsForPeriod;

    totalIncome[period.date] = totals.income;
    totalExpenses[period.date] = totals.expenses;
    totalTransfers[period.date] = totals.transfers;
    netChequingChange[period.date] = totals.netChequing;
    projectedChequing[period.date] = chequingBalance;
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

  const finalPeriod = payPeriods[payPeriods.length - 1];

  const chequingValues = Object.values(chequingRow?.amountsByPeriod || {});
  const lowestChequing = Math.min(...chequingValues);

  return {
    nextPayDate: nextPeriod.date,
    nextIncome: totals.income,
    nextExpenses: totals.expenses,
    nextTransfers: totals.transfers,
    projectedChequingAfterNext:
      chequingRow?.amountsByPeriod?.[nextPeriod.date] || 0,
    projectedSavingsAfterNext:
      savingsRow?.amountsByPeriod?.[nextPeriod.date] || 0,
    projectedChequingEnd: chequingRow?.amountsByPeriod?.[finalPeriod.date] || 0,
    projectedSavingsEnd: savingsRow?.amountsByPeriod?.[finalPeriod.date] || 0,
    lowestChequing: Number.isFinite(lowestChequing) ? lowestChequing : 0,
  };
}

export function buildSavingsBucketProjection({
  payPeriods,
  rows,
  savingsBuckets,
  savingsBucketAdjustments,
}) {
  return savingsBuckets.map((bucket) => {
    let balance = Number(bucket.startingAmount) || 0;

    const transfersInByPeriod = {};
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

      balance += transferIn + adjustmentTotal;

      transfersInByPeriod[period.date] = transferIn;
      adjustmentsByPeriod[period.date] = adjustmentTotal;
      balanceByPeriod[period.date] = balance;
    });

    return {
      bucket,
      transfersInByPeriod,
      adjustmentsByPeriod,
      balanceByPeriod,
    };
  });
}
