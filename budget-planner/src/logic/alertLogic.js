import { addDays, formatShortDate, parseLocalDate } from './dateLogic';
import { getBackupReminderStatus } from '../data/migrations';
import {
  getProjectionType,
  getScheduledItemOccurrences,
  isValidDateString,
  normalizeScheduledItem,
} from './scheduledItemLogic';

function normalizeNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getToday(currentDate = new Date()) {
  return new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate()
  );
}

function formatAlertCurrency(value, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
  }).format(normalizeNumber(value));
}

function getDaysUntil(dateString, currentDate = new Date()) {
  const dueDate = parseLocalDate(dateString);
  const today = getToday(currentDate);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  return Math.round((dueDate - today) / (24 * 60 * 60 * 1000));
}

function getDuePhrase(dateString, currentDate = new Date()) {
  const daysUntil = getDaysUntil(dateString, currentDate);

  if (daysUntil === null) return 'soon';
  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
}

function buildCategoryMap(categories = []) {
  return new Map(
    categories
      .filter((category) => category?.id)
      .map((category) => [category.id, category])
  );
}

function buildBucketMap(savingsBuckets = []) {
  return new Map(
    savingsBuckets
      .filter((bucket) => bucket?.id)
      .map((bucket) => [bucket.id, bucket])
  );
}

function buildAccountMap(accounts = []) {
  return new Map(
    accounts
      .filter((account) => account?.id)
      .map((account) => [account.id, account])
  );
}

export function getLowBalanceAlerts({
  plannerData,
  settings,
  warningThreshold = 100,
  dangerThreshold = 0,
} = {}) {
  const payPeriods = Array.isArray(plannerData?.payPeriods)
    ? plannerData.payPeriods
    : [];
  const projectedChequingRow = plannerData?.projectionRows?.find(
    (row) => row.id === 'projected-chequing'
  );

  if (!projectedChequingRow || payPeriods.length === 0) {
    return [];
  }

  return payPeriods
    .map((period) => {
      const balance = normalizeNumber(
        projectedChequingRow.amountsByPeriod?.[period.date]
      );

      if (balance < dangerThreshold) {
        return {
          id: `low-balance-danger-${period.date}`,
          type: 'low-balance',
          severity: 'danger',
          title: 'Negative projected balance',
          message: `Projected chequing is ${formatAlertCurrency(
            balance,
            settings?.currency
          )} for ${formatShortDate(period.date)}.`,
          source: 'planner',
          sourceId: period.date,
          actionLabel: 'Review planner',
          actionPage: 'planner',
          date: period.date,
        };
      }

      if (balance >= dangerThreshold && balance < warningThreshold) {
        return {
          id: `low-balance-warning-${period.date}`,
          type: 'low-balance',
          severity: 'warning',
          title: 'Low projected balance',
          message: `Projected chequing is ${formatAlertCurrency(
            balance,
            settings?.currency
          )} for ${formatShortDate(period.date)}.`,
          source: 'planner',
          sourceId: period.date,
          actionLabel: 'Review planner',
          actionPage: 'planner',
          date: period.date,
        };
      }

      return null;
    })
    .filter(Boolean);
}

export function getBudgetAlerts(budgetUsageRows = [], settings = {}) {
  return budgetUsageRows
    .filter((row) => row?.active && normalizeNumber(row.amount) > 0)
    .map((row) => {
      if (row.status === 'over') {
        return {
          id: `over-budget-${row.id}`,
          type: 'over-budget',
          severity: 'danger',
          title: 'Over budget',
          message: `${row.name} is over by ${formatAlertCurrency(
            Math.abs(row.remaining),
            settings?.currency
          )}.`,
          source: 'budgets',
          sourceId: row.id,
          actionLabel: 'Review budgets',
          actionPage: 'budgets',
        };
      }

      if (row.status === 'near') {
        return {
          id: `near-budget-${row.id}`,
          type: 'near-budget',
          severity: 'warning',
          title: 'Near budget limit',
          message: `${row.name} is ${row.usedPercentage}% used with ${formatAlertCurrency(
            row.remaining,
            settings?.currency
          )} remaining.`,
          source: 'budgets',
          sourceId: row.id,
          actionLabel: 'Review budgets',
          actionPage: 'budgets',
        };
      }

      return null;
    })
    .filter(Boolean);
}

export function getUpcomingBillAlerts({
  scheduledItems = [],
  settings = {},
  currentDate = new Date(),
  daysAhead = 7,
} = {}) {
  const today = getToday(currentDate);
  const rangeEnd = addDays(today, daysAhead);

  return scheduledItems
    .map((item) => normalizeScheduledItem(item))
    .filter((item) => {
      return (
        item.active &&
        (getProjectionType(item.type) === 'expense' || item.type === 'debt')
      );
    })
    .map((item) => {
      const occurrence = getScheduledItemOccurrences(item, today, rangeEnd)[0];

      if (!occurrence) {
        return null;
      }

      return {
        id: `upcoming-bill-${item.id}-${occurrence}`,
        type: 'upcoming-bill',
        severity: 'info',
        title: 'Upcoming bill',
        message: `${item.name || 'Scheduled item'} is due ${getDuePhrase(
          occurrence,
          currentDate
        )} for ${formatAlertCurrency(item.amount, settings?.currency)}.`,
        source: 'scheduled-items',
        sourceId: item.id,
        actionLabel: 'Review scheduled items',
        actionPage: 'scheduled-items',
        date: occurrence,
      };
    })
    .filter(Boolean);
}

export function getMissingSetupAlerts({
  accounts = [],
  scheduledItems = [],
  categories = [],
  budgetTargets = [],
} = {}) {
  const alerts = [];
  const activeScheduledItems = scheduledItems
    .map((item) => normalizeScheduledItem(item))
    .filter((item) => item.active);
  const activeCategories = categories.filter(
    (category) => category?.active !== false
  );
  const activeBudgetTargets = budgetTargets.filter(
    (target) => target?.active !== false
  );

  if (accounts.length === 0) {
    alerts.push({
      id: 'missing-setup-accounts',
      type: 'missing-setup',
      severity: 'info',
      title: 'No accounts added',
      message: 'Add account balances so projections have a clear starting point.',
      source: 'accounts',
      sourceId: null,
      actionLabel: 'Review accounts',
      actionPage: 'accounts',
    });
  }

  if (activeScheduledItems.length === 0) {
    alerts.push({
      id: 'missing-setup-scheduled-items',
      type: 'missing-setup',
      severity: 'info',
      title: 'No scheduled items added',
      message: 'Add recurring income and bills to build useful projections.',
      source: 'scheduled-items',
      sourceId: null,
      actionLabel: 'Review scheduled items',
      actionPage: 'scheduled-items',
    });
  }

  if (activeCategories.length === 0) {
    alerts.push({
      id: 'missing-setup-categories',
      type: 'missing-setup',
      severity: 'info',
      title: 'No categories found',
      message: 'Categories make reports, transactions, and budgets easier to read.',
      source: 'data',
      sourceId: null,
      actionLabel: 'Review categories',
      actionPage: 'categories',
    });
  }

  if (activeBudgetTargets.length === 0) {
    alerts.push({
      id: 'missing-setup-budget-targets',
      type: 'missing-setup',
      severity: 'info',
      title: 'No budget targets added',
      message: 'Add monthly budget targets to track remaining spending room.',
      source: 'budgets',
      sourceId: null,
      actionLabel: 'Review budgets',
      actionPage: 'budgets',
    });
  }

  return alerts;
}

export function getDataWarningAlerts({
  scheduledItems = [],
  budgetTargets = [],
  transactions = [],
  categories = [],
  accounts = [],
  savingsBuckets = [],
  savingsBucketAdjustments = [],
  transfers = [],
} = {}) {
  const alerts = [];
  const categoryMap = buildCategoryMap(categories);
  const accountMap = buildAccountMap(accounts);
  const bucketMap = buildBucketMap(savingsBuckets);

  scheduledItems.forEach((item) => {
    const normalizedItem = normalizeScheduledItem(item);

    if (item?.startDate && !isValidDateString(item.startDate)) {
      alerts.push({
        id: `data-warning-invalid-scheduled-date-${normalizedItem.id}`,
        type: 'data-warning',
        severity: 'warning',
        title: 'Scheduled item date needs review',
        message: `${normalizedItem.name || 'A scheduled item'} has an invalid start date and may be skipped.`,
        source: 'scheduled-items',
        sourceId: normalizedItem.id,
        actionLabel: 'Review scheduled items',
        actionPage: 'scheduled-items',
      });
    }
  });

  budgetTargets.forEach((target) => {
    if (target?.categoryId && !categoryMap.has(target.categoryId)) {
      alerts.push({
        id: `data-warning-budget-category-${target.id}`,
        type: 'data-warning',
        severity: 'warning',
        title: 'Budget category missing',
        message: `${target.name || 'A budget target'} references a missing category.`,
        source: 'budgets',
        sourceId: target.id || null,
        actionLabel: 'Review budgets',
        actionPage: 'budgets',
      });
    }
  });

  transactions.forEach((transaction) => {
    if (transaction.categoryId && !categoryMap.has(transaction.categoryId)) {
      alerts.push({
        id: `data-warning-transaction-category-${transaction.id}`,
        type: 'data-warning',
        severity: 'info',
        title: 'Transaction category missing',
        message: `${transaction.description || 'A transaction'} references a missing category.`,
        source: 'data',
        sourceId: transaction.id || null,
        actionLabel: 'Review transactions',
        actionPage: 'transactions',
      });
    }

    if (transaction.accountId && !accountMap.has(transaction.accountId)) {
      alerts.push({
        id: `data-warning-transaction-account-${transaction.id}`,
        type: 'data-warning',
        severity: 'info',
        title: 'Transaction account missing',
        message: `${transaction.description || 'A transaction'} references a missing account.`,
        source: 'data',
        sourceId: transaction.id || null,
        actionLabel: 'Review transactions',
        actionPage: 'transactions',
      });
    }
  });

  savingsBucketAdjustments.forEach((adjustment) => {
    const bucketId = adjustment.bucketId || adjustment.savingsBucketId;

    if (bucketId && !bucketMap.has(bucketId)) {
      alerts.push({
        id: `data-warning-savings-bucket-${adjustment.id}`,
        type: 'data-warning',
        severity: 'warning',
        title: 'Savings bucket missing',
        message: 'A savings bucket adjustment references a missing bucket.',
        source: 'data',
        sourceId: adjustment.id || null,
        actionLabel: 'Review savings buckets',
        actionPage: 'savings-buckets',
      });
    }
  });

  transfers.forEach((transfer) => {
    if (transfer.fromAccountId && !accountMap.has(transfer.fromAccountId)) {
      alerts.push({
        id: `data-warning-transfer-from-account-${transfer.id}`,
        type: 'data-warning',
        severity: 'warning',
        title: 'Transfer account missing',
        message: 'A transfer references a missing from account.',
        source: 'data',
        sourceId: transfer.id || null,
        actionLabel: 'Review accounts',
        actionPage: 'accounts',
      });
    }

    if (transfer.toAccountId && !accountMap.has(transfer.toAccountId)) {
      alerts.push({
        id: `data-warning-transfer-to-account-${transfer.id}`,
        type: 'data-warning',
        severity: 'warning',
        title: 'Transfer account missing',
        message: 'A transfer references a missing to account.',
        source: 'data',
        sourceId: transfer.id || null,
        actionLabel: 'Review accounts',
        actionPage: 'accounts',
      });
    }

    if (transfer.bucketId && !bucketMap.has(transfer.bucketId)) {
      alerts.push({
        id: `data-warning-transfer-bucket-${transfer.id}`,
        type: 'data-warning',
        severity: 'warning',
        title: 'Transfer bucket missing',
        message: 'A transfer references a missing savings bucket.',
        source: 'data',
        sourceId: transfer.id || null,
        actionLabel: 'Review savings buckets',
        actionPage: 'savings-buckets',
      });
    }
  });

  return alerts;
}

export function getBackupReminderAlerts(appMetadata = {}, currentDate = new Date()) {
  const backupStatus = getBackupReminderStatus(
    appMetadata?.lastBackupAt,
    currentDate
  );

  if (!backupStatus.isReminderDue) {
    return [];
  }

  return [
    {
      id: `backup-reminder-${backupStatus.status}`,
      type: 'backup-reminder',
      severity: backupStatus.severity,
      title: 'Backup recommended',
      message:
        'Your data is stored locally on this browser and device. Export a backup regularly to protect your budget data.',
      source: 'settings',
      sourceId: null,
      actionLabel: 'Go to Settings',
      actionPage: 'settings',
    },
  ];
}

export function getAlertCounts(alerts = []) {
  return alerts.reduce(
    (counts, alert) => {
      counts.total += 1;

      if (alert.severity === 'warning') {
        counts.warning += 1;
      }

      if (alert.severity === 'danger') {
        counts.danger += 1;
      }

      return counts;
    },
    {
      total: 0,
      warning: 0,
      danger: 0,
    }
  );
}

export function sortAlertsBySeverity(alerts = []) {
  const severityOrder = {
    danger: 0,
    warning: 1,
    info: 2,
  };

  return [...alerts].sort((left, right) => {
    return (
      (severityOrder[left.severity] ?? 99) -
        (severityOrder[right.severity] ?? 99) ||
      String(left.date || '').localeCompare(String(right.date || '')) ||
      String(left.title || '').localeCompare(String(right.title || ''))
    );
  });
}

export function generateAlerts({
  plannerData,
  budgetUsageRows = [],
  scheduledItems = [],
  accounts = [],
  categories = [],
  budgetTargets = [],
  transactions = [],
  savingsBuckets = [],
  savingsBucketAdjustments = [],
  transfers = [],
  settings = {},
  appMetadata = {},
  currentDate = new Date(),
} = {}) {
  const alerts = [
    ...getBackupReminderAlerts(appMetadata, currentDate),
    ...getLowBalanceAlerts({ plannerData, settings }),
    ...getBudgetAlerts(budgetUsageRows, settings),
    ...getUpcomingBillAlerts({ scheduledItems, settings, currentDate }),
    ...getMissingSetupAlerts({
      accounts,
      scheduledItems,
      categories,
      budgetTargets,
    }),
    ...getDataWarningAlerts({
      scheduledItems,
      budgetTargets,
      transactions,
      categories,
      accounts,
      savingsBuckets,
      savingsBucketAdjustments,
      transfers,
    }),
  ];

  const uniqueAlerts = new Map();

  alerts.forEach((alert) => {
    if (alert?.id && !uniqueAlerts.has(alert.id)) {
      uniqueAlerts.set(alert.id, alert);
    }
  });

  return sortAlertsBySeverity(Array.from(uniqueAlerts.values()));
}
