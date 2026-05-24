const TRANSFER_TYPES = [
  'to_savings_bucket',
  'from_savings_bucket',
  'account_transfer',
];

function createTimestamp() {
  return new Date().toISOString();
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentPayPeriod(payPeriods = []) {
  const today = getTodayDate();

  return (
    [...payPeriods].reverse().find((period) => period.date <= today) ||
    payPeriods[0] ||
    null
  );
}

function normalizeTransferType(type) {
  return TRANSFER_TYPES.includes(type) ? type : 'account_transfer';
}

function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

export function inferTransferType(transfer, accounts = [], savingsBuckets = []) {
  const fromAccount = accounts.find((account) => account.id === transfer?.fromAccountId);
  const toAccount = accounts.find((account) => account.id === transfer?.toAccountId);

  if (savingsBuckets.length === 0) {
    return 'account_transfer';
  }

  if (fromAccount?.type === 'chequing' && toAccount?.type === 'savings') {
    return 'to_savings_bucket';
  }

  if (fromAccount?.type === 'savings' && toAccount?.type === 'chequing') {
    return 'from_savings_bucket';
  }

  return 'account_transfer';
}

export function createNewTransfer(accounts = [], savingsBuckets = [], payPeriods = []) {
  const activeAccounts = accounts.filter((account) => account.active !== false);
  const fromAccount =
    activeAccounts.find((account) => account.type === 'chequing') ||
    activeAccounts[0] ||
    null;
  const toAccount =
    activeAccounts.find(
      (account) => account.id !== fromAccount?.id && account.type === 'savings'
    ) ||
    activeAccounts.find((account) => account.id !== fromAccount?.id) ||
    null;
  const currentPeriod = getCurrentPayPeriod(payPeriods);
  const timestamp = createTimestamp();
  const transfer = {
    id: `transfer-${crypto.randomUUID()}`,
    date: getTodayDate(),
    payPeriodDate: currentPeriod?.date || getTodayDate(),
    fromAccountId: fromAccount?.id || '',
    toAccountId: toAccount?.id || '',
    amount: 0,
    bucketId: savingsBuckets[0]?.id || null,
    transferType: 'account_transfer',
    notes: '',
    validated: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    ...transfer,
    transferType: inferTransferType(transfer, accounts, savingsBuckets),
  };
}

export function normalizeTransfer(transfer = {}) {
  const timestamp = createTimestamp();
  const safeTransfer =
    transfer && typeof transfer === 'object' && !Array.isArray(transfer)
      ? transfer
      : {};
  const transferType = normalizeTransferType(
    safeTransfer.transferType || safeTransfer.direction || safeTransfer.type
  );

  return {
    ...safeTransfer,
    id: safeTransfer.id || `transfer-${crypto.randomUUID()}`,
    date: isValidDateString(safeTransfer.date) ? safeTransfer.date : '',
    payPeriodDate: isValidDateString(safeTransfer.payPeriodDate)
      ? safeTransfer.payPeriodDate
      : '',
    fromAccountId: safeTransfer.fromAccountId || null,
    toAccountId: safeTransfer.toAccountId || null,
    amount: normalizeAmount(safeTransfer.amount),
    bucketId: safeTransfer.bucketId || safeTransfer.savingsBucketId || null,
    savingsBucketId:
      safeTransfer.savingsBucketId || safeTransfer.bucketId || null,
    transferType,
    notes: String(safeTransfer.notes || ''),
    validated: Boolean(safeTransfer.validated),
    createdAt: safeTransfer.createdAt || timestamp,
    updatedAt: safeTransfer.updatedAt || timestamp,
  };
}

export function getTransferAccountEffects(transfer = {}) {
  const normalizedTransfer = normalizeTransfer(transfer);
  const amount = Number(normalizedTransfer.amount) || 0;

  return {
    fromAccountId: normalizedTransfer.fromAccountId,
    toAccountId: normalizedTransfer.toAccountId,
    fromAmount: -amount,
    toAmount: amount,
  };
}

export function getTransferBucketEffect(transfer = {}) {
  const normalizedTransfer = normalizeTransfer(transfer);
  const amount = Number(normalizedTransfer.amount) || 0;

  if (
    normalizedTransfer.transferType === 'to_savings_bucket' &&
    normalizedTransfer.bucketId
  ) {
    return {
      bucketId: normalizedTransfer.bucketId,
      amount,
      transfersIn: amount,
      transfersOut: 0,
    };
  }

  if (
    normalizedTransfer.transferType === 'from_savings_bucket' &&
    normalizedTransfer.bucketId
  ) {
    return {
      bucketId: normalizedTransfer.bucketId,
      amount: -amount,
      transfersIn: 0,
      transfersOut: amount,
    };
  }

  return {
    bucketId: normalizedTransfer.bucketId,
    amount: 0,
    transfersIn: 0,
    transfersOut: 0,
  };
}

export function validateTransfer(transfer = {}, accounts = [], savingsBuckets = []) {
  const normalizedTransfer = normalizeTransfer(transfer);
  const accountIds = new Set(accounts.map((account) => account.id));
  const bucketIds = new Set(savingsBuckets.map((bucket) => bucket.id));
  const errors = [];

  if (!normalizedTransfer.fromAccountId) {
    errors.push('Choose the account money is moving from.');
  } else if (!accountIds.has(normalizedTransfer.fromAccountId)) {
    errors.push('The from account could not be found.');
  }

  if (!normalizedTransfer.toAccountId) {
    errors.push('Choose the account money is moving to.');
  } else if (!accountIds.has(normalizedTransfer.toAccountId)) {
    errors.push('The to account could not be found.');
  }

  if (
    normalizedTransfer.fromAccountId &&
    normalizedTransfer.toAccountId &&
    normalizedTransfer.fromAccountId === normalizedTransfer.toAccountId
  ) {
    errors.push('From and to accounts must be different.');
  }

  if (!normalizedTransfer.date) {
    errors.push('Enter a valid transfer date.');
  }

  if (!normalizedTransfer.payPeriodDate) {
    errors.push('Choose a pay period.');
  }

  if (normalizedTransfer.amount <= 0) {
    errors.push('Enter an amount greater than 0.');
  }

  if (
    normalizedTransfer.transferType === 'to_savings_bucket' ||
    normalizedTransfer.transferType === 'from_savings_bucket'
  ) {
    if (!normalizedTransfer.bucketId) {
      errors.push('Choose a savings bucket for this transfer.');
    } else if (!bucketIds.has(normalizedTransfer.bucketId)) {
      errors.push('The savings bucket could not be found.');
    }
  } else if (normalizedTransfer.bucketId && !bucketIds.has(normalizedTransfer.bucketId)) {
    errors.push('The savings bucket could not be found.');
  }

  return {
    valid: errors.length === 0,
    errors,
    transfer: normalizedTransfer,
  };
}
