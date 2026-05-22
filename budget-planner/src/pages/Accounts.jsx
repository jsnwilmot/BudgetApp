import { useMemo, useState } from 'react';

import { Plus, Trash2 } from 'lucide-react';

import { formatCurrency } from '../logic/projectionLogic';

const ACCOUNT_TYPES = [
  { value: 'chequing', label: 'Chequing' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

const MANUAL_ADJUSTMENT_TYPES = [
  { value: 'correction', label: 'Correction' },
  { value: 'interest', label: 'Interest' },
  { value: 'fee', label: 'Fee' },
  { value: 'unexpected_deposit', label: 'Unexpected Deposit' },
  { value: 'unexpected_withdrawal', label: 'Unexpected Withdrawal' },
  { value: 'refund', label: 'Refund' },
  { value: 'other', label: 'Other' },
];

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getAccountTypeLabel(type) {
  return ACCOUNT_TYPES.find((option) => option.value === type)?.label || type || 'Account';
}

function getAdjustmentTypeLabel(type) {
  return (
    MANUAL_ADJUSTMENT_TYPES.find((option) => option.value === type)?.label ||
    type ||
    'Adjustment'
  );
}

function getCategoryName(categoryId, categories = []) {
  if (!categoryId) {
    return 'Uncategorized';
  }

  return (
    categories.find((category) => category.id === categoryId)?.name ||
    'Missing category'
  );
}

function getAdjustmentCategoryTypes(adjustmentType) {
  if (
    adjustmentType === 'interest' ||
    adjustmentType === 'unexpected_deposit' ||
    adjustmentType === 'refund'
  ) {
    return ['income', 'general'];
  }

  if (adjustmentType === 'fee' || adjustmentType === 'unexpected_withdrawal') {
    return ['expense', 'debt', 'general'];
  }

  return ['income', 'expense', 'debt', 'general', 'transfer'];
}

function createNewAccount() {
  return {
    id: `account-${crypto.randomUUID()}`,
    name: '',
    type: 'chequing',
    startingBalance: 0,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createNewAdjustment(accounts, payPeriods) {
  const activeAccounts = accounts.filter((account) => account.active !== false);
  const firstAccount = activeAccounts[0];
  const defaultDate = payPeriods[0]?.date || getTodayDate();

  return {
    id: `adjustment-${crypto.randomUUID()}`,
    date: defaultDate,
    payPeriodDate: defaultDate,
    accountId: firstAccount?.id || '',
    amount: 0,
    adjustmentType: 'correction',
    categoryId: '',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function AccountBalanceForm({ account, onSave }) {
  const [startingBalance, setStartingBalance] = useState(
    account.startingBalance ?? 0
  );

  function handleSubmit(event) {
    event.preventDefault();

    onSave({
      ...account,
      startingBalance: Number(startingBalance) || 0,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {getAccountTypeLabel(account.type)}
          </p>
          <h3 className="text-lg font-bold text-slate-950">{account.name}</h3>
        </div>
      </div>

      <label className="block text-sm font-semibold text-slate-600">
        Starting balance
        <input
          type="number"
          step="0.01"
          value={startingBalance}
          onChange={(event) => setStartingBalance(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
        />
      </label>

      <button
        type="submit"
        className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
      >
        Save Balance
      </button>
    </form>
  );
}

function AccountCreateForm({ accounts, onCancel, onSave }) {
  const [formState, setFormState] = useState(createNewAccount());
  const [error, setError] = useState('');

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const name = String(formState.name || '').trim();
    const duplicateName = accounts.some(
      (account) =>
        String(account.name || '').trim().toLowerCase() === name.toLowerCase()
    );

    if (!name) {
      setError('Enter an account name.');
      return;
    }

    if (!formState.type) {
      setError('Choose an account type.');
      return;
    }

    if (duplicateName) {
      setError('An account with this name already exists.');
      return;
    }

    const startingBalance = Number(formState.startingBalance);

    if (Number.isNaN(startingBalance)) {
      setError('Enter a valid starting balance.');
      return;
    }

    onSave({
      ...formState,
      name,
      startingBalance,
      active: true,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Account Setup
            </p>
            <h3 className="text-xl font-bold text-slate-950">Add account</h3>
            <p className="mt-1 text-sm text-slate-500">
              Add a chequing, savings, credit card, cash, or other account.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <label className="block text-sm font-semibold text-slate-600">
          Account name
          <input
            type="text"
            value={formState.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="Example: Main Chequing"
            required
          />
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Account type
          <select
            value={formState.type}
            onChange={(event) => updateField('type', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Starting balance
          <input
            type="number"
            step="0.01"
            value={formState.startingBalance}
            onChange={(event) =>
              updateField('startingBalance', event.target.value)
            }
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
            required
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
        >
          Save Account
        </button>
      </form>
    </div>
  );
}

function AdjustmentForm({
  adjustment,
  accounts,
  categories,
  payPeriods,
  onCancel,
  onSave,
}) {
  const activeAccounts = accounts.filter((account) => account.active !== false);
  const hasAccounts = activeAccounts.length > 0;

  const [formState, setFormState] = useState(() => {
    const selectedAccountExists = activeAccounts.some(
      (account) => account.id === adjustment.accountId
    );

    return {
      ...adjustment,
      accountId: selectedAccountExists
        ? adjustment.accountId
        : activeAccounts[0]?.id || '',
      adjustmentType: adjustment.adjustmentType || 'correction',
      date: adjustment.date || getTodayDate(),
      payPeriodDate:
        adjustment.payPeriodDate || payPeriods[0]?.date || getTodayDate(),
      amount: adjustment.amount ?? 0,
      categoryId: adjustment.categoryId || '',
      notes: adjustment.notes || '',
    };
  });

  const categoryOptions = useMemo(() => {
    const allowedTypes = getAdjustmentCategoryTypes(formState.adjustmentType);
    const selectedCategory = categories.find(
      (category) => category.id === formState.categoryId
    );

    const options = categories
      .filter(
        (category) =>
          allowedTypes.includes(category.type) &&
          (category.active !== false || category.id === formState.categoryId)
      )
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
  }, [categories, formState.adjustmentType, formState.categoryId]);

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!hasAccounts || !formState.accountId) {
      return;
    }

    const amount = Number(formState.amount);

    if (Number.isNaN(amount)) {
      return;
    }

    onSave({
      ...formState,
      amount,
      categoryId: formState.categoryId || undefined,
      notes: String(formState.notes || '').trim(),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Manual Adjustment
            </p>
            <h3 className="text-xl font-bold text-slate-950">
              Account correction
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Use this for savings interest, corrections, fees, refunds, or
              unexpected changes.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {!hasAccounts ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Add an account before saving a manual adjustment.
          </p>
        ) : null}

        <label className="block text-sm font-semibold text-slate-600">
          Account
          <select
            value={formState.accountId || ''}
            onChange={(event) => updateField('accountId', event.target.value)}
            disabled={!hasAccounts}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          >
            {!hasAccounts ? <option value="">No accounts yet</option> : null}

            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Category
          <select
            value={formState.categoryId || ''}
            onChange={(event) => updateField('categoryId', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="">Uncategorized</option>

            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.active === false ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Date
          <input
            type="date"
            value={formState.date}
            onChange={(event) => updateField('date', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            required
          />
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Pay period
          <select
            value={formState.payPeriodDate}
            onChange={(event) =>
              updateField('payPeriodDate', event.target.value)
            }
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            {payPeriods.length === 0 ? (
              <option value={formState.payPeriodDate || getTodayDate()}>
                Current date
              </option>
            ) : null}

            {payPeriods.map((period) => (
              <option key={period.id || period.date} value={period.date}>
                {period.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Type
          <select
            value={formState.adjustmentType}
            onChange={(event) =>
              updateField('adjustmentType', event.target.value)
            }
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            {MANUAL_ADJUSTMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Amount
          <input
            type="number"
            step="0.01"
            value={formState.amount}
            onChange={(event) => updateField('amount', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
            required
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Use positive numbers to add money. Use negative numbers to remove
            money.
          </span>
        </label>

        <label className="block text-sm font-semibold text-slate-600">
          Notes
          <textarea
            value={formState.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="Example: savings interest added"
          />
        </label>

        <button
          type="submit"
          disabled={!hasAccounts}
          className="w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save Adjustment
        </button>
      </form>
    </div>
  );
}

export default function Accounts({
  accounts = [],
  categories = [],
  manualAdjustments = [],
  payPeriods = [],
  settings,
  onSaveAccount,
  onSaveManualAdjustment,
  onDeleteManualAdjustment,
}) {
  const [selectedAdjustment, setSelectedAdjustment] = useState(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  const currency = settings?.currency || 'CAD';
  const activeAccounts = accounts.filter((account) => account.active !== false);
  const hasAccounts = activeAccounts.length > 0;

  const adjustmentSummary = useMemo(() => {
    return manualAdjustments.reduce(
      (summary, adjustment) => {
        const account = accounts.find((item) => item.id === adjustment.accountId);
        const amount = Number(adjustment.amount) || 0;

        if (account?.type === 'savings') {
          summary.savings += amount;
        } else {
          summary.chequing += amount;
        }

        return summary;
      },
      { chequing: 0, savings: 0 }
    );
  }, [accounts, manualAdjustments]);

  function getAccountName(accountId) {
    if (!accountId) {
      return 'No account';
    }

    return accounts.find((account) => account.id === accountId)?.name || accountId;
  }

  function handleAddAdjustment() {
    setSelectedAdjustment(createNewAdjustment(accounts, payPeriods));
  }

  async function handleSaveAdjustment(adjustment) {
    await onSaveManualAdjustment(adjustment);
    setSelectedAdjustment(null);
  }

  async function handleSaveNewAccount(account) {
    await onSaveAccount(account);
    setIsAddingAccount(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Accounts
          </p>
          <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
            Balances and manual adjustments
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Set starting balances and add corrections like interest, fees, or
            unexpected deposits.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsAddingAccount(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Plus size={16} />
            Add Account
          </button>

          <button
            type="button"
            onClick={handleAddAdjustment}
            disabled={!hasAccounts}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Plus size={16} />
            Add Adjustment
          </button>
        </div>
      </div>

      {hasAccounts ? (
        <div className="grid gap-4 md:grid-cols-2">
          {activeAccounts.map((account) => (
            <AccountBalanceForm
              key={account.id}
              account={account}
              onSave={onSaveAccount}
            />
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">
            Set up your first account
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Add a chequing, savings, credit card, or cash account before
            entering balances or manual adjustments.
          </p>
          <button
            type="button"
            onClick={() => setIsAddingAccount(true)}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            Add Account
          </button>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm font-medium text-slate-500">
            Chequing Adjustments
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(adjustmentSummary.chequing, currency)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm font-medium text-slate-500">
            Savings Adjustments
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(adjustmentSummary.savings, currency)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm font-medium text-slate-500">
            Total Manual Adjustments
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(
              adjustmentSummary.chequing + adjustmentSummary.savings,
              currency
            )}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-950">
            Manual Adjustments
          </h3>
          <p className="text-sm text-slate-500">
            These affect projected account balances in the assigned pay period.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-4 py-3 text-left text-sm font-bold">Date</th>
                <th className="px-4 py-3 text-left text-sm font-bold">
                  Pay Period
                </th>
                <th className="px-4 py-3 text-left text-sm font-bold">
                  Account
                </th>
                <th className="px-4 py-3 text-left text-sm font-bold">Type</th>
                <th className="px-4 py-3 text-left text-sm font-bold">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-sm font-bold">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-sm font-bold">
                  Notes
                </th>
                <th className="px-4 py-3 text-right text-sm font-bold">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {manualAdjustments.length === 0 ? (
                <tr>
                  <td
                    colSpan="8"
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No manual adjustments yet.
                  </td>
                </tr>
              ) : null}

              {manualAdjustments.map((adjustment) => (
                <tr key={adjustment.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {adjustment.date}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {adjustment.payPeriodDate}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                    {getAccountName(adjustment.accountId)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {getAdjustmentTypeLabel(adjustment.adjustmentType)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    <span className="block max-w-[160px] truncate">
                      {getCategoryName(adjustment.categoryId, categories)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-950">
                    {formatCurrency(adjustment.amount, currency)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {adjustment.notes || '--'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAdjustment(adjustment)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteManualAdjustment(adjustment.id)}
                        aria-label="Delete manual adjustment"
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAddingAccount ? (
        <AccountCreateForm
          accounts={accounts}
          onCancel={() => setIsAddingAccount(false)}
          onSave={handleSaveNewAccount}
        />
      ) : null}

      {selectedAdjustment ? (
        <AdjustmentForm
          adjustment={selectedAdjustment}
          accounts={accounts}
          categories={categories}
          payPeriods={payPeriods}
          onCancel={() => setSelectedAdjustment(null)}
          onSave={handleSaveAdjustment}
        />
      ) : null}
    </div>
  );
}