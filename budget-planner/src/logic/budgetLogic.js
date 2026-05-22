function normalizeNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getMonthKey(dateValue) {
  if (typeof dateValue !== 'string') {
    return '';
  }

  const match = dateValue.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function buildCategoryNameMap(categories = []) {
  return new Map(
    categories
      .filter((category) => category?.id)
      .map((category) => [category.id, category.name || 'Uncategorized'])
  );
}

export function normalizeBudgetTarget(target = {}) {
  const timestamp = new Date().toISOString();

  return {
    ...target,
    id: target.id || `budget-${crypto.randomUUID()}`,
    name: String(target.name || '').trim(),
    categoryId: target.categoryId || '',
    period: 'monthly',
    amount: normalizeNumber(target.amount),
    rollover: Boolean(target.rollover),
    active: target.active !== false,
    notes: String(target.notes || ''),
    createdAt: target.createdAt || timestamp,
    updatedAt: target.updatedAt || timestamp,
  };
}

export function validateBudgetTarget(target, existingTargets = []) {
  const normalizedTarget = normalizeBudgetTarget(target);
  const errors = [];

  if (!normalizedTarget.name) {
    errors.push('Name is required.');
  }

  if (!normalizedTarget.categoryId) {
    errors.push('Category is required.');
  }

  if (target.amount === '' || target.amount === null || target.amount === undefined) {
    errors.push('Monthly amount is required.');
  }

  if (!Number.isFinite(Number(target.amount))) {
    errors.push('Monthly amount must be a valid number.');
  }

  if (Number(target.amount) < 0) {
    errors.push('Monthly amount must be greater than or equal to 0.');
  }

  const duplicateActiveTarget = existingTargets.some((existingTarget) => {
    const normalizedExistingTarget = normalizeBudgetTarget(existingTarget);

    return (
      normalizedExistingTarget.id !== normalizedTarget.id &&
      normalizedExistingTarget.active &&
      normalizedTarget.active &&
      normalizedExistingTarget.categoryId === normalizedTarget.categoryId
    );
  });

  if (duplicateActiveTarget) {
    errors.push('An active budget already exists for this category.');
  }

  return {
    valid: errors.length === 0,
    errors,
    target: normalizedTarget,
  };
}

export function getBudgetStatus(used, amount, active = true) {
  if (!active) {
    return 'inactive';
  }

  const safeAmount = normalizeNumber(amount);

  if (safeAmount <= 0) {
    return 'under';
  }

  const usedRatio = normalizeNumber(used) / safeAmount;

  if (usedRatio > 1) return 'over';
  if (usedRatio >= 0.8) return 'near';
  return 'under';
}

export function calculateBudgetUsage({
  budgetTargets = [],
  transactions = [],
  categories = [],
  selectedMonth = '',
} = {}) {
  const categoryNames = buildCategoryNameMap(categories);
  const spentByCategory = transactions.reduce((result, transaction) => {
    if (transaction.type !== 'expense') {
      return result;
    }

    if (selectedMonth && getMonthKey(transaction.date) !== selectedMonth) {
      return result;
    }

    const categoryId = transaction.categoryId || '';

    if (!categoryId) {
      return result;
    }

    result.set(
      categoryId,
      normalizeNumber(result.get(categoryId)) + Math.abs(normalizeNumber(transaction.amount))
    );
    return result;
  }, new Map());

  const rows = budgetTargets.map((target) => {
    const normalizedTarget = normalizeBudgetTarget(target);
    const used = normalizeNumber(spentByCategory.get(normalizedTarget.categoryId));
    const amount = normalizeNumber(normalizedTarget.amount);
    const remaining = amount - used;
    const usedPercentage = amount > 0 ? Math.round((used / amount) * 100) : 0;

    return {
      ...normalizedTarget,
      categoryName:
        categoryNames.get(normalizedTarget.categoryId) || 'Missing category',
      used,
      remaining,
      usedPercentage,
      status: getBudgetStatus(used, amount, normalizedTarget.active),
    };
  });

  const summary = rows
    .filter((row) => row.active)
    .reduce(
      (result, row) => {
        result.totalBudget += row.amount;
        result.totalUsed += row.used;

        if (row.status === 'over') {
          result.overBudgetCount += 1;
        }

        return result;
      },
      {
        totalBudget: 0,
        totalUsed: 0,
        remainingBudget: 0,
        overBudgetCount: 0,
      }
    );

  summary.remainingBudget = summary.totalBudget - summary.totalUsed;

  return {
    rows,
    summary,
  };
}
