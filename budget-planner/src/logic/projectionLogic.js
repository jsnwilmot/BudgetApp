import {
  findPreviousPayPeriod,
  generatePayPeriods,
  getMonthDate,
  isSameBiweeklyCycle,
  parseLocalDate,
} from './dateLogic';

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
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
  return isSameBiweeklyCycle(
    item.startDate,
    period.date,
    settings.payFrequencyDays
  );
}

function buildMonthlyPlacements(item, payPeriods) {
  const placements = new Set();

  const firstPeriodDate = parseLocalDate(payPeriods[0].date);
  const lastPeriodDate = parseLocalDate(payPeriods[payPeriods.length - 1].date);

  for (
    let year = firstPeriodDate.getFullYear();
    year <= lastPeriodDate.getFullYear();
    year += 1
  ) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const dueDate = getMonthDate(year, monthIndex, item.dueDay || 1);

      if (dueDate < firstPeriodDate || dueDate > lastPeriodDate) {
        continue;
      }

      const assignedPeriod = findPreviousPayPeriod(payPeriods, dueDate);
      placements.add(assignedPeriod.date);
    }
  }

  return placements;
}

function buildAnnualPlacements(item, payPeriods) {
  const placements = new Set();

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

    if (dueDate < firstPeriodDate || dueDate > lastPeriodDate) {
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
  plannerEntries = {},
}) {
  const payPeriods = generatePayPeriods(
    settings.payPeriodAnchorDate,
    settings.payFrequencyDays,
    settings.projectionMonths
  );

  const rows = scheduledItems
    .filter((item) => item.active)
    .filter((item) => item.frequency !== 'manual')
    .map((item) => {
      let placementDates = new Set();

      if (item.frequency === 'biweekly') {
        placementDates = new Set(
          payPeriods
            .filter((period) => shouldPlaceBiweeklyItem(item, period, settings))
            .map((period) => period.date)
        );
      }

      if (item.frequency === 'monthly') {
        placementDates = buildMonthlyPlacements(item, payPeriods);
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

    chequingBalance += totals.netChequing + chequingAdjustments;
    savingsBalance += totals.netSavings + savingsAdjustments;

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

  const totals = calculatePeriodTotals(rows, nextPeriod.date);

  const chequingRow = projectionRows.find(
    (row) => row.id === 'projected-chequing'
  );
  const savingsRow = projectionRows.find((row) => row.id === 'projected-savings');

  const finalPeriod = payPeriods[payPeriods.length - 1];

  const chequingValues = Object.values(chequingRow.amountsByPeriod);
  const lowestChequing = Math.min(...chequingValues);

  return {
    nextPayDate: nextPeriod.date,
    nextIncome: totals.income,
    nextExpenses: totals.expenses,
    nextTransfers: totals.transfers,
    projectedChequingAfterNext: chequingRow.amountsByPeriod[nextPeriod.date],
    projectedSavingsAfterNext: savingsRow.amountsByPeriod[nextPeriod.date],
    projectedChequingEnd: chequingRow.amountsByPeriod[finalPeriod.date],
    projectedSavingsEnd: savingsRow.amountsByPeriod[finalPeriod.date],
    lowestChequing,
  };
}