import { addDays, formatDateKey, parseLocalDate } from './dateLogic';
import {
  getProjectionType,
  getScheduledItemOccurrences,
  normalizeScheduledItem,
  scheduledItemRequiresAccount,
} from './scheduledItemLogic';

function normalizeNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function isValidDateString(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const date = parseLocalDate(value);
  return !Number.isNaN(date.getTime()) && formatDateKey(date) === value;
}

function getDateValue(value) {
  return isValidDateString(value) ? value : '';
}

function buildNameMap(records = [], fallbackLabel) {
  return new Map(
    records
      .filter((record) => record?.id)
      .map((record) => [record.id, record.name || fallbackLabel])
  );
}

function resolveName(id, nameMap, fallbackLabel, missingLabel = fallbackLabel) {
  if (!id) {
    return fallbackLabel;
  }

  return nameMap.get(id) || missingLabel;
}

function getManualAdjustmentType(adjustment) {
  const adjustmentType = String(adjustment.adjustmentType || '').toLowerCase();
  const recordType = String(adjustment.type || '').toLowerCase();
  const amount = normalizeNumber(adjustment.amount);

  if (adjustmentType === 'interest' || adjustmentType === 'unexpected_deposit') {
    return 'income';
  }

  if (
    recordType === 'misc-expense' ||
    adjustmentType === 'fee' ||
    adjustmentType === 'unexpected_withdrawal' ||
    amount < 0
  ) {
    return 'expense';
  }

  return 'adjustment';
}

function getSavingsAdjustmentType(adjustment) {
  const adjustmentType = String(adjustment.adjustmentType || '').toLowerCase();
  const amount = normalizeNumber(adjustment.amount);

  if (
    adjustmentType === 'transfer_out' ||
    adjustmentType === 'withdrawal' ||
    adjustmentType === 'expense_paid' ||
    amount < 0
  ) {
    return 'transfer-out';
  }

  return 'transfer-in';
}

function getScheduledTransactionType(item) {
  const projectionType = getProjectionType(item.type);

  if (projectionType === 'income') return 'income';
  if (projectionType === 'transfer') return 'transfer-out';
  return 'expense';
}

function getTransactionSignedAmount(transaction) {
  const amount = normalizeNumber(transaction.amount);

  if (transaction.type === 'income' || transaction.type === 'transfer-in') {
    return Math.abs(amount);
  }

  if (transaction.type === 'transfer') {
    return 0;
  }

  if (
    transaction.type === 'expense' ||
    transaction.type === 'transfer-out' ||
    transaction.type === 'savings'
  ) {
    return -Math.abs(amount);
  }

  return amount;
}

export function buildTransactionsFromAppData({
  scheduledItems = [],
  manualAdjustments = [],
  savingsBucketAdjustments = [],
  transfers = [],
  savingsBuckets = [],
  accounts = [],
  categories = [],
  currentDate = new Date(),
} = {}) {
  const categoryNames = buildNameMap(categories, 'Uncategorized');
  const accountNames = buildNameMap(accounts, 'No account');
  const bucketNames = buildNameMap(savingsBuckets, 'No bucket');
  const today = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate()
  );
  const nextYear = addDays(today, 365);

  const manualRows = manualAdjustments.map((adjustment) => {
    const accountId = adjustment.accountId || null;
    const categoryId = adjustment.categoryId || null;

    return {
      id: `manual-adjustment-${adjustment.id}`,
      date: getDateValue(adjustment.date || adjustment.payPeriodDate),
      payPeriodDate: getDateValue(adjustment.payPeriodDate || adjustment.date),
      description: adjustment.notes || adjustment.adjustmentType || 'Manual adjustment',
      type: getManualAdjustmentType(adjustment),
      amount: normalizeNumber(adjustment.amount),
      categoryId,
      categoryName: resolveName(
        categoryId,
        categoryNames,
        'Uncategorized',
        'Missing category'
      ),
      accountId,
      accountName: resolveName(
        accountId,
        accountNames,
        'No account',
        'Missing account'
      ),
      savingsBucketId: null,
      savingsBucketName: 'No bucket',
      source: 'manual-adjustment',
      sourceId: adjustment.id,
      notes: adjustment.notes || '',
    };
  });

  const savingsRows = savingsBucketAdjustments.map((adjustment) => {
    const bucketId = adjustment.bucketId || adjustment.savingsBucketId || null;

    return {
      id: `savings-bucket-adjustment-${adjustment.id}`,
      date: getDateValue(adjustment.date || adjustment.payPeriodDate),
      payPeriodDate: getDateValue(adjustment.payPeriodDate || adjustment.date),
      description:
        adjustment.notes ||
        adjustment.adjustmentType ||
        resolveName(
          bucketId,
          bucketNames,
          'Savings activity',
          'Missing savings bucket'
        ),
      type: getSavingsAdjustmentType(adjustment),
      amount: Math.abs(normalizeNumber(adjustment.amount)),
      categoryId: null,
      categoryName: 'Uncategorized',
      accountId: null,
      accountName: 'No account',
      savingsBucketId: bucketId,
      savingsBucketName: resolveName(
        bucketId,
        bucketNames,
        'No bucket',
        'Missing savings bucket'
      ),
      source: 'savings-bucket-adjustment',
      sourceId: adjustment.id,
      notes: adjustment.notes || '',
    };
  });

  const transferRows = transfers.map((transfer) => {
    const bucketId = transfer.bucketId || transfer.savingsBucketId || null;
    const fromAccountName = resolveName(
      transfer.fromAccountId,
      accountNames,
      'No account',
      'Missing account'
    );
    const toAccountName = resolveName(
      transfer.toAccountId,
      accountNames,
      'No account',
      'Missing account'
    );
    const transferType =
      transfer.transferType === 'from_savings_bucket'
        ? 'transfer-in'
        : 'transfer-out';

    return {
      id: `transfer-${transfer.id}`,
      date: getDateValue(transfer.date || transfer.payPeriodDate),
      payPeriodDate: getDateValue(transfer.payPeriodDate || transfer.date),
      description: transfer.notes || `${fromAccountName} to ${toAccountName}`,
      type:
        transfer.transferType === 'account_transfer'
          ? 'transfer'
          : transferType,
      amount: Math.abs(normalizeNumber(transfer.amount)),
      categoryId: null,
      categoryName: 'Uncategorized',
      accountId: transfer.toAccountId || transfer.fromAccountId || null,
      accountName: `${fromAccountName} to ${toAccountName}`,
      savingsBucketId: bucketId,
      savingsBucketName: resolveName(
        bucketId,
        bucketNames,
        'No bucket',
        'Missing savings bucket'
      ),
      source: 'transfer',
      sourceId: transfer.id,
      notes: transfer.notes || '',
    };
  });

  const scheduledRows = scheduledItems
    .map((item) => normalizeScheduledItem(item))
    .filter((item) => item.active)
    .map((item) => {
      const occurrence = getScheduledItemOccurrences(item, today, nextYear)[0];

      if (!occurrence) {
        return null;
      }

      const categoryId = item.categoryId || null;
      const accountId = item.accountId || null;
      const bucketId = item.savingsBucketId || item.bucketId || null;

      return {
        id: `scheduled-item-${item.id}-${occurrence}`,
        date: occurrence,
        payPeriodDate: occurrence,
        description: item.name || 'Scheduled item',
        type: getScheduledTransactionType(item),
        amount: normalizeNumber(item.amount),
        categoryId,
        categoryName: resolveName(
          categoryId,
          categoryNames,
          'Uncategorized',
          'Missing category'
        ),
        accountId,
        accountName: accountId
          ? resolveName(accountId, accountNames, 'No account', 'Missing account')
          : scheduledItemRequiresAccount(item.type)
            ? 'Missing account'
            : 'No account',
        savingsBucketId: bucketId,
        savingsBucketName: resolveName(
          bucketId,
          bucketNames,
          'No bucket',
          'Missing savings bucket'
        ),
        source: 'scheduled-item',
        sourceId: item.id,
        notes: item.notes || '',
      };
    })
    .filter(Boolean);

  return [...manualRows, ...savingsRows, ...transferRows, ...scheduledRows];
}

export function getTransactionAmountLabel(transaction) {
  const signedAmount = getTransactionSignedAmount(transaction);
  return signedAmount;
}

export function calculateTransactionSummary(transactions = []) {
  return transactions.reduce(
    (summary, transaction) => {
      const amount = normalizeNumber(transaction.amount);
      const signedAmount = getTransactionSignedAmount(transaction);

      if (transaction.type === 'income') {
        summary.income += Math.abs(amount);
      }

      if (transaction.type === 'expense') {
        summary.expenses += Math.abs(amount);
      }

      if (
        transaction.type === 'transfer-in' ||
        transaction.type === 'transfer-out' ||
        transaction.type === 'transfer' ||
        transaction.type === 'savings'
      ) {
        summary.transfers += Math.abs(amount);
      }

      summary.netTotal += signedAmount;

      return summary;
    },
    {
      income: 0,
      expenses: 0,
      netTotal: 0,
      transfers: 0,
    }
  );
}

export function transactionMatchesDateRange(
  transaction,
  range,
  customStartDate = '',
  customEndDate = '',
  currentDate = new Date()
) {
  if (range === 'all') {
    return true;
  }

  if (!transaction.date) {
    return false;
  }

  const transactionDate = parseLocalDate(transaction.date);
  const today = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate()
  );

  if (Number.isNaN(transactionDate.getTime())) {
    return false;
  }

  if (range === 'this-month') {
    return (
      transactionDate.getFullYear() === today.getFullYear() &&
      transactionDate.getMonth() === today.getMonth()
    );
  }

  if (range === 'last-30-days') {
    return transactionDate >= addDays(today, -30) && transactionDate <= today;
  }

  if (range === 'last-90-days') {
    return transactionDate >= addDays(today, -90) && transactionDate <= today;
  }

  if (range === 'custom') {
    const startDate = customStartDate ? parseLocalDate(customStartDate) : null;
    const endDate = customEndDate ? parseLocalDate(customEndDate) : null;

    if (startDate && !Number.isNaN(startDate.getTime()) && transactionDate < startDate) {
      return false;
    }

    if (endDate && !Number.isNaN(endDate.getTime()) && transactionDate > endDate) {
      return false;
    }
  }

  return true;
}
