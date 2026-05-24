import { useMemo, useState } from 'react';
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react';
import AlertList from '../components/AlertList';
import {
  calculateBudgetUsage,
  normalizeBudgetTarget,
  validateBudgetTarget,
} from '../logic/budgetLogic';
import { formatCurrency } from '../logic/projectionLogic';
import { buildTransactionsFromAppData } from '../logic/transactionLogic';

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthKey(dateValue) {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function getMonthLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);

  if (Number.isNaN(date.getTime())) {
    return 'Current month';
  }

  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function getStatusLabel(status, remaining) {
  if (status === 'inactive') return 'Inactive';
  if (status === 'over') return `Over by ${Math.abs(remaining).toFixed(2)}`;
  if (status === 'near') return 'Near limit';
  return 'Under budget';
}

function getStatusClass(status) {
  if (status === 'over') return 'bg-red-100 text-red-700';
  if (status === 'near') return 'bg-amber-100 text-amber-800';
  if (status === 'inactive') return 'bg-slate-100 text-slate-500';
  return 'bg-emerald-100 text-emerald-700';
}

function SummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function createBudgetTarget(categories) {
  const firstExpenseCategory =
    categories.find((category) => category.active !== false && category.type === 'expense') ||
    categories.find((category) => category.active !== false);

  return normalizeBudgetTarget({
    id: `budget-${crypto.randomUUID()}`,
    name: '',
    categoryId: firstExpenseCategory?.id || '',
    amount: 0,
    rollover: false,
    active: true,
    notes: '',
    isNew: true,
    createdAt: new Date().toISOString(),
  });
}

function BudgetTargetForm({
  target,
  categories,
  budgetTargets,
  onCancel,
  onSave,
}) {
  const normalizedTarget = normalizeBudgetTarget(target);
  const [formState, setFormState] = useState({
    ...normalizedTarget,
    amount: String(normalizedTarget.amount ?? 0),
    categoryId: normalizedTarget.categoryId || '',
    notes: normalizedTarget.notes || '',
  });
  const [errorMessage, setErrorMessage] = useState('');

  const categoryOptions = useMemo(() => {
    const selectedCategory = categories.find(
      (category) => category.id === formState.categoryId
    );
    const options = categories
      .filter((category) => {
        return (
          ['expense', 'debt', 'general'].includes(category.type) &&
          (category.active !== false || category.id === formState.categoryId)
        );
      })
      .sort(
        (left, right) =>
          Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
          left.name.localeCompare(right.name)
      );

    if (
      selectedCategory &&
      !options.some((category) => category.id === selectedCategory.id)
    ) {
      return [...options, selectedCategory];
    }

    return options;
  }, [categories, formState.categoryId]);

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
    setErrorMessage('');
  }

  function handleSubmit(event) {
    event.preventDefault();

    const validation = validateBudgetTarget(formState, budgetTargets);

    if (!validation.valid) {
      setErrorMessage(validation.errors[0]);
      return;
    }

    const targetToSave = { ...validation.target };
    delete targetToSave.isNew;

    onSave({
      ...targetToSave,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {target.isNew ? 'Add Budget Target' : 'Edit Budget Target'}
          </p>
          <h3 className="mt-1 break-words text-xl font-bold text-slate-950 sm:text-2xl">
            {formState.name || 'Monthly target'}
          </h3>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>

      {errorMessage ? (
        <div
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              type="text"
              value={formState.name}
              onChange={(event) => updateField('name', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="Example: Groceries"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              value={formState.categoryId}
              onChange={(event) => updateField('categoryId', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="">Choose category</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.active === false ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Monthly Amount
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={formState.amount}
            onChange={(event) => updateField('amount', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            required
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={formState.rollover}
              onChange={(event) => updateField('rollover', event.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Store rollover preference
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={formState.active}
              onChange={(event) => updateField('active', event.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Active budget target
            </span>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            rows="3"
            value={formState.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            placeholder="Optional note"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Save Budget Target
        </button>
      </form>
    </section>
  );
}

export default function Budgets({
  settings,
  budgetTargets = [],
  categories = [],
  scheduledItems = [],
  manualAdjustments = [],
  savingsBucketAdjustments = [],
  transfers = [],
  savingsBuckets = [],
  accounts = [],
  alerts = [],
  onAlertAction,
  onDismissAlert,
  onSaveBudgetTarget,
  onArchiveBudgetTarget,
  onResetBudgetTargets,
}) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const currency = settings?.currency || 'CAD';

  const transactions = useMemo(
    () =>
      buildTransactionsFromAppData({
        scheduledItems,
        manualAdjustments,
        savingsBucketAdjustments,
        transfers,
        savingsBuckets,
        accounts,
        categories,
      }),
    [
      accounts,
      categories,
      manualAdjustments,
      savingsBucketAdjustments,
      transfers,
      savingsBuckets,
      scheduledItems,
    ]
  );

  const availableMonths = useMemo(() => {
    const monthSet = new Set([getCurrentMonthKey()]);

    transactions.forEach((transaction) => {
      const monthKey = getMonthKey(transaction.date);

      if (monthKey) {
        monthSet.add(monthKey);
      }
    });

    return Array.from(monthSet).sort().reverse();
  }, [transactions]);

  const budgetUsage = useMemo(
    () =>
      calculateBudgetUsage({
        budgetTargets,
        transactions,
        categories,
        selectedMonth,
      }),
    [budgetTargets, categories, selectedMonth, transactions]
  );

  async function handleSave(target) {
    try {
      const savedTarget = await onSaveBudgetTarget(target);
      setSelectedTarget(null);
      setMessage(`${savedTarget.name} saved.`);
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not save budget target.');
      setMessage('');
    }
  }

  async function handleArchive(target) {
    try {
      await onArchiveBudgetTarget(target.id);
      setMessage(`${target.name} archived.`);
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not archive budget target.');
      setMessage('');
    }
  }

  async function handleReactivate(target) {
    try {
      const validation = validateBudgetTarget(
        { ...target, active: true },
        budgetTargets
      );

      if (!validation.valid) {
        setErrorMessage(validation.errors[0]);
        setMessage('');
        return;
      }

      await onSaveBudgetTarget({ ...target, active: true });
      setMessage(`${target.name} reactivated.`);
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not reactivate budget target.');
      setMessage('');
    }
  }

  async function handleReset() {
    const confirmed = window.confirm('Reset all budget targets?');

    if (!confirmed) {
      return;
    }

    try {
      await onResetBudgetTargets();
      setSelectedTarget(null);
      setMessage('Budget targets reset.');
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not reset budget targets.');
      setMessage('');
    }
  }

  const activeBudgetCount = budgetTargets.filter((target) => target.active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Budgets
          </p>
          <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
            Budget targets
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Set monthly category targets and track remaining spending room.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedTarget(createBudgetTarget(categories));
              setMessage('');
              setErrorMessage('');
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            Add Budget Target
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <RotateCcw size={16} />
            Reset Targets
          </button>
        </div>
      </div>

      {message ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          role="status"
        >
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <AlertList
        title="Budget Warnings"
        helper="Budget targets that are near or over their monthly amount."
        alerts={alerts}
        maxItems={4}
        onAction={onAlertAction}
        onDismiss={onDismissAlert}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="block max-w-xs">
          <span className="text-sm font-medium text-slate-700">Budget Month</span>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            {availableMonths.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {getMonthLabel(monthKey)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Monthly Budget"
          value={formatCurrency(budgetUsage.summary.totalBudget, currency)}
          helper={`${activeBudgetCount} active category targets.`}
        />
        <SummaryCard
          label="Total Spent"
          value={formatCurrency(budgetUsage.summary.totalUsed, currency)}
          helper={`Tracked for ${getMonthLabel(selectedMonth)}.`}
        />
        <SummaryCard
          label="Remaining Budget"
          value={formatCurrency(budgetUsage.summary.remainingBudget, currency)}
          helper="Monthly budget minus tracked spending."
        />
        <SummaryCard
          label="Over Budget Categories"
          value={budgetUsage.summary.overBudgetCount}
          helper="Active targets over their monthly amount."
        />
      </div>

      {selectedTarget ? (
        <BudgetTargetForm
          key={selectedTarget.id}
          target={selectedTarget}
          categories={categories}
          budgetTargets={budgetTargets}
          onCancel={() => setSelectedTarget(null)}
          onSave={handleSave}
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {budgetTargets.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-semibold text-slate-950">
              No budget targets yet
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
              Add monthly category targets to see how much spending room remains.
              Budgets use transaction-style data from scheduled items, manual
              adjustments, and savings activity where it applies.
            </p>
          </div>
        ) : (
          <>
          <div className="grid gap-3 p-3 md:hidden">
            {budgetUsage.rows.map((row) => {
              const progressWidth =
                row.amount > 0 ? Math.min(row.usedPercentage, 100) : 0;

              return (
                <article
                  key={row.id}
                  className={`rounded-xl border border-slate-200 p-4 ${
                    row.active ? 'bg-white' : 'bg-slate-50 text-slate-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-anywhere text-sm font-semibold text-slate-950">
                        {row.name}
                      </p>
                      <p className="mt-1 break-anywhere text-xs text-slate-500">
                        {row.categoryName}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${getStatusClass(
                        row.status
                      )}`}
                    >
                      {row.status === 'over'
                        ? `Over ${formatCurrency(Math.abs(row.remaining), currency)}`
                        : getStatusLabel(row.status, row.remaining)}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-xl bg-slate-50 p-2">
                      <dt className="text-xs text-slate-500">Target</dt>
                      <dd className="mt-1 font-bold text-slate-950">
                        {formatCurrency(row.amount, currency)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <dt className="text-xs text-slate-500">Used</dt>
                      <dd className="mt-1 font-bold text-slate-950">
                        {formatCurrency(row.used, currency)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <dt className="text-xs text-slate-500">Remaining</dt>
                      <dd className="mt-1 font-bold text-slate-950">
                        {row.remaining < 0
                          ? `-${formatCurrency(Math.abs(row.remaining), currency)}`
                          : formatCurrency(row.remaining, currency)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <div
                      className="h-3 overflow-hidden rounded-full bg-slate-100"
                      aria-label={`${row.name} used ${row.usedPercentage}%`}
                    >
                      <div
                        className={`h-full rounded-full ${
                          row.status === 'over'
                            ? 'bg-red-500'
                            : row.status === 'near'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${progressWidth}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.amount > 0
                        ? `${row.usedPercentage}% used`
                        : 'No target amount'}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTarget(row);
                        setMessage('');
                        setErrorMessage('');
                      }}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil size={14} />
                      Edit
                    </button>

                    {row.active ? (
                      <button
                        type="button"
                        onClick={() => handleArchive(row)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Archive size={14} />
                        Archive
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivate(row)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1050px]">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-4 py-3 text-left text-sm font-bold">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">Category</th>
                  <th className="px-4 py-3 text-right text-sm font-bold">Target</th>
                  <th className="px-4 py-3 text-right text-sm font-bold">Used</th>
                  <th className="px-4 py-3 text-right text-sm font-bold">Remaining</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">Progress</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">Status</th>
                  <th className="px-4 py-3 text-center text-sm font-bold">Active</th>
                  <th className="px-4 py-3 text-right text-sm font-bold">Actions</th>
                </tr>
              </thead>

              <tbody>
                {budgetUsage.rows.map((row) => {
                  const progressWidth =
                    row.amount > 0 ? Math.min(row.usedPercentage, 100) : 0;

                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-slate-200 ${
                        row.active ? 'bg-white' : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                        <span className="block max-w-[180px] truncate">{row.name}</span>
                        {row.rollover ? (
                          <span className="text-xs font-normal text-slate-500">
                            Rollover stored
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <span className="block max-w-[160px] truncate">
                          {row.categoryName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-950">
                        {formatCurrency(row.amount, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-950">
                        {formatCurrency(row.used, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-950">
                        {row.remaining < 0
                          ? `-${formatCurrency(Math.abs(row.remaining), currency)}`
                          : formatCurrency(row.remaining, currency)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div
                          className="h-3 overflow-hidden rounded-full bg-slate-100"
                          aria-label={`${row.name} used ${row.usedPercentage}%`}
                        >
                          <div
                            className={`h-full rounded-full ${
                              row.status === 'over'
                                ? 'bg-red-500'
                                : row.status === 'near'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.amount > 0
                            ? `${row.usedPercentage}% used`
                            : 'No target amount'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${getStatusClass(
                            row.status
                          )}`}
                        >
                          {row.status === 'over'
                            ? `Over by ${formatCurrency(Math.abs(row.remaining), currency)}`
                            : getStatusLabel(row.status, row.remaining)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {row.active ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTarget(row);
                              setMessage('');
                              setErrorMessage('');
                            }}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <Pencil size={14} />
                            Edit
                          </button>

                          {row.active ? (
                            <button
                              type="button"
                              onClick={() => handleArchive(row)}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <Archive size={14} />
                              Archive
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReactivate(row)}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}
