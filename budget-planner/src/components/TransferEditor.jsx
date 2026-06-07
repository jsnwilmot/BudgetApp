import { useMemo, useState } from 'react';

import {
  createNewTransfer,
  inferTransferType,
  validateTransfer,
} from '../logic/transferLogic';
import { getLocalToday } from '../logic/dateLogic';

const TRANSFER_TYPE_OPTIONS = [
  { value: 'to_savings_bucket', label: 'To Savings Bucket' },
  { value: 'from_savings_bucket', label: 'From Savings Bucket' },
  { value: 'account_transfer', label: 'Account Transfer' },
];

export default function TransferEditor({
  transfer,
  accounts = [],
  savingsBuckets = [],
  payPeriods = [],
  onCancel,
  onSave,
}) {
  const activeAccounts = accounts.filter((account) => account.active !== false);
  const activeBuckets = savingsBuckets.filter((bucket) => bucket.active !== false);
  const hasEnoughAccounts = activeAccounts.length >= 2;
  const hasSavingsBuckets = activeBuckets.length > 0;

  const [formState, setFormState] = useState(() => {
    const baseTransfer = createNewTransfer(activeAccounts, activeBuckets, payPeriods);

    return {
      ...baseTransfer,
      ...transfer,
      date: transfer?.date || baseTransfer.date || getLocalToday(),
      payPeriodDate:
        transfer?.payPeriodDate || baseTransfer.payPeriodDate || getLocalToday(),
      amount: transfer?.amount ?? baseTransfer.amount ?? 0,
      bucketId:
        transfer?.bucketId ||
        transfer?.savingsBucketId ||
        baseTransfer.bucketId ||
        activeBuckets[0]?.id ||
        '',
      transferType: transfer?.transferType || baseTransfer.transferType,
      notes: transfer?.notes || '',
      validated: Boolean(transfer?.validated),
    };
  });
  const [error, setError] = useState('');

  const transferTypeOptions = useMemo(() => {
    if (hasSavingsBuckets) {
      return TRANSFER_TYPE_OPTIONS;
    }

    return TRANSFER_TYPE_OPTIONS.filter(
      (option) => option.value === 'account_transfer'
    );
  }, [hasSavingsBuckets]);

  function updateField(fieldName, value) {
    setFormState((current) => {
      const nextState = {
        ...current,
        [fieldName]: value,
      };

      if (fieldName === 'fromAccountId' || fieldName === 'toAccountId') {
        const nextType = inferTransferType(nextState, activeAccounts, activeBuckets);

        return {
          ...nextState,
          transferType: nextType,
          bucketId:
            nextType === 'account_transfer'
              ? ''
              : nextState.bucketId || activeBuckets[0]?.id || '',
        };
      }

      if (fieldName === 'transferType') {
        return {
          ...nextState,
          bucketId:
            value === 'account_transfer'
              ? ''
              : nextState.bucketId || activeBuckets[0]?.id || '',
        };
      }

      return nextState;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const validation = validateTransfer(
      {
        ...formState,
        amount: Number(formState.amount),
        bucketId:
          formState.transferType === 'account_transfer'
            ? null
            : formState.bucketId || null,
        notes: String(formState.notes || '').trim(),
        updatedAt: new Date().toISOString(),
      },
      accounts,
      savingsBuckets
    );

    if (!validation.valid) {
      setError(validation.errors.join(' '));
      return;
    }

    onSave(validation.transfer);
  }

  return (
    <div className="fixed inset-0 z-50 max-h-[100dvh] w-full overflow-y-auto border-slate-200 bg-white p-4 shadow-2xl sm:inset-y-0 sm:left-auto sm:w-[480px] sm:border-l sm:p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Transfer
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-950">
              {transfer?.id ? 'Edit transfer' : 'Add transfer'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Move money between your own accounts and optionally update a
              savings bucket at the same time.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {!hasEnoughAccounts ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Add at least two accounts before saving a transfer.
          </p>
        ) : null}

        {!hasSavingsBuckets ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No savings buckets exist yet, so this transfer will be saved as an
            account transfer only.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date</span>
            <input
              type="date"
              value={formState.date || ''}
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
              value={formState.payPeriodDate || ''}
              onChange={(event) =>
                updateField('payPeriodDate', event.target.value)
              }
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
              required
            >
              {payPeriods.length === 0 ? (
                <option value={formState.payPeriodDate || getLocalToday()}>
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
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">From account</span>
          <select
            value={formState.fromAccountId || ''}
            onChange={(event) => updateField('fromAccountId', event.target.value)}
            disabled={!hasEnoughAccounts}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900 disabled:bg-slate-100"
            required
          >
            <option value="">Choose account</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">To account</span>
          <select
            value={formState.toAccountId || ''}
            onChange={(event) => updateField('toAccountId', event.target.value)}
            disabled={!hasEnoughAccounts}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900 disabled:bg-slate-100"
            required
          >
            <option value="">Choose account</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Transfer type
          </span>
          <select
            value={formState.transferType}
            onChange={(event) => updateField('transferType', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
          >
            {transferTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {formState.transferType !== 'account_transfer' ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Savings bucket
            </span>
            <select
              value={formState.bucketId || ''}
              onChange={(event) => updateField('bucketId', event.target.value)}
              disabled={!hasSavingsBuckets}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900 disabled:bg-slate-100"
              required
            >
              <option value="">Choose bucket</option>
              {activeBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Amount</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={formState.amount}
            onChange={(event) => updateField('amount', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
            required
          />
          <span className="mt-1 block text-xs text-slate-500">
            Enter a positive amount. The from and to accounts control direction.
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={formState.validated}
            onChange={(event) => updateField('validated', event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span>
            Validated
            <span className="block text-xs font-normal text-slate-500">
              Include this transfer in Validated Chequing when it affects
              chequing.
            </span>
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            rows="4"
            value={formState.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="Optional note"
          />
        </label>

        <button
          type="submit"
          disabled={!hasEnoughAccounts}
          className="min-h-11 w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save Transfer
        </button>
      </form>
    </div>
  );
}
