import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '../logic/projectionLogic';

function AccountBalanceForm({ account, onSave }) {
  const [startingBalance, setStartingBalance] = useState(account.startingBalance);

  function handleSubmit(event) {
    event.preventDefault();

    onSave({
      ...account,
      startingBalance: Number(startingBalance) || 0,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{account.type}</p>
          <h3 className="text-xl font-bold text-slate-950">{account.name}</h3>
        </div>

        <Pencil size={18} className="text-slate-400" />
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Starting balance
        </span>
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

function createNewAdjustment(accounts, payPeriods) {
  return {
    id: `adjustment-${crypto.randomUUID()}`,
    date: payPeriods[0]?.date || '2026-06-03',
    payPeriodDate: payPeriods[0]?.date || '2026-06-03',
    accountId: accounts[0]?.id || 'acct-chequing',
    amount: 0,
    adjustmentType: 'correction',
    notes: '',
    createdAt: new Date().toISOString(),
  };
}

function AdjustmentForm({ adjustment, accounts, payPeriods, onCancel, onSave }) {
  const [formState, setFormState] = useState(adjustment);

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    onSave({
      ...formState,
      amount: Number(formState.amount) || 0,
      notes: String(formState.notes || '').trim(),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[460px] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Manual Adjustment
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Account correction
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Use this for savings interest, corrections, fees, or unexpected changes.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Account</span>
          <select
            value={formState.accountId}
            onChange={(event) => updateField('accountId', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={formState.date}
              onChange={(event) => updateField('date', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Pay period
            </span>
            <select
              value={formState.payPeriodDate}
              onChange={(event) => updateField('payPeriodDate', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            >
              {payPeriods.map((period) => (
                <option key={period.date} value={period.date}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Type</span>
          <select
            value={formState.adjustmentType}
            onChange={(event) => updateField('adjustmentType', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="interest">Interest</option>
            <option value="correction">Correction</option>
            <option value="fee">Fee</option>
            <option value="unexpected_deposit">Unexpected Deposit</option>
            <option value="unexpected_withdrawal">Unexpected Withdrawal</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Amount
          </span>
          <input
            type="number"
            step="0.01"
            value={formState.amount}
            onChange={(event) => updateField('amount', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Use positive numbers to add money. Use negative numbers to remove money.
          </p>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            rows="4"
            value={formState.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="Example: savings interest added"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
        >
          Save Adjustment
        </button>
      </form>
    </div>
  );
}

export default function Accounts({
  accounts,
  manualAdjustments,
  payPeriods,
  settings,
  onSaveAccount,
  onSaveManualAdjustment,
  onDeleteManualAdjustment,
}) {
  const [selectedAdjustment, setSelectedAdjustment] = useState(null);
  const currency = settings?.currency || 'CAD';

  const adjustmentSummary = useMemo(() => {
    return manualAdjustments.reduce(
      (summary, adjustment) => {
        if (adjustment.accountId === 'acct-chequing') {
          summary.chequing += Number(adjustment.amount) || 0;
        }

        if (adjustment.accountId === 'acct-savings') {
          summary.savings += Number(adjustment.amount) || 0;
        }

        return summary;
      },
      {
        chequing: 0,
        savings: 0,
      }
    );
  }, [manualAdjustments]);

  function getAccountName(accountId) {
    return accounts.find((account) => account.id === accountId)?.name || accountId;
  }

  function handleAddAdjustment() {
    setSelectedAdjustment(createNewAdjustment(accounts, payPeriods));
  }

  async function handleSaveAdjustment(adjustment) {
    await onSaveManualAdjustment(adjustment);
    setSelectedAdjustment(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Accounts
          </p>
          <h2 className="text-3xl font-bold text-slate-950">
            Balances and manual adjustments
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Set starting balances and add corrections like interest, fees, or unexpected deposits.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddAdjustment}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Add Adjustment
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {accounts.map((account) => (
          <AccountBalanceForm
            key={account.id}
            account={account}
            onSave={onSaveAccount}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Chequing Adjustments
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(adjustmentSummary.chequing, currency)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Savings Adjustments
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(adjustmentSummary.savings, currency)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

        <table className="w-full">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left text-sm font-bold">Date</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Pay Period</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Account</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Type</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Notes</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Action</th>
            </tr>
          </thead>

          <tbody>
            {manualAdjustments.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-sm text-slate-500">
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
                  {adjustment.adjustmentType}
                </td>

                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-950">
                  {formatCurrency(adjustment.amount, currency)}
                </td>

                <td className="px-4 py-3 text-sm text-slate-600">
                  {adjustment.notes || '—'}
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
      </section>

      {selectedAdjustment ? (
        <AdjustmentForm
          adjustment={selectedAdjustment}
          accounts={accounts}
          payPeriods={payPeriods}
          onCancel={() => setSelectedAdjustment(null)}
          onSave={handleSaveAdjustment}
        />
      ) : null}
    </div>
  );
}
