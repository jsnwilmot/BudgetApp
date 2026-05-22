import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  buildSavingsBucketProjection,
  formatCurrency,
} from '../logic/projectionLogic';

function createNewBucket() {
  return {
    id: `bucket-${crypto.randomUUID()}`,
    name: '',
    linkedAccountId: 'acct-savings',
    startingAmount: 0,
    targetAmount: 0,
    active: true,
    notes: '',
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
}

function BucketEditor({ bucket, onCancel, onSave }) {
  const [formState, setFormState] = useState({
    ...bucket,
    name: bucket.name || '',
    startingAmount: bucket.startingAmount ?? 0,
    targetAmount: bucket.targetAmount ?? '',
    notes: bucket.notes ?? '',
  });

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const cleanedBucket = {
      ...formState,
      name: String(formState.name || '').trim(),
      startingAmount: Number(formState.startingAmount) || 0,
      targetAmount:
        formState.targetAmount === '' ? undefined : Number(formState.targetAmount) || 0,
      notes: String(formState.notes || '').trim(),
      active: true,
      updatedAt: new Date().toISOString(),
    };

    if (!cleanedBucket.name) {
      return;
    }

    onSave(cleanedBucket);
  }

  return (
    <div className="fixed inset-0 z-50 w-full overflow-y-auto border-slate-200 bg-white p-4 shadow-2xl sm:inset-y-0 sm:left-auto sm:w-[460px] sm:border-l sm:p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {bucket.isCustom && !bucket.updatedAt ? 'Add Savings Bucket' : 'Edit Savings Bucket'}
          </p>
          <h3 className="mt-1 break-words text-xl font-bold text-slate-950">
            {bucket.name || 'New Savings Bucket'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Buckets divide your savings account into planned purposes.
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
          <span className="text-sm font-medium text-slate-700">Bucket name</span>
          <input
            type="text"
            value={formState.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="Example: Vehicle Repairs"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Starting amount
          </span>
          <input
            type="number"
            step="0.01"
            value={formState.startingAmount}
            onChange={(event) => updateField('startingAmount', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Target amount, optional
          </span>
          <input
            type="number"
            step="0.01"
            value={formState.targetAmount}
            onChange={(event) => updateField('targetAmount', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
            placeholder="Optional"
          />
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
          className="w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
        >
          Save Bucket
        </button>
      </form>
    </div>
  );
}

function DeleteBucketDialog({
  bucket,
  bucketProjectedAmount,
  savingsBuckets,
  bucketIsUsedByTransfer,
  currency,
  onCancel,
  onDelete,
}) {
  const availableTargetBuckets = savingsBuckets.filter((item) => item.id !== bucket.id);
  const [targetBucketId, setTargetBucketId] = useState(
    availableTargetBuckets[0]?.id || ''
  );
  const [confirmText, setConfirmText] = useState('');

  const canDelete =
    !bucketIsUsedByTransfer &&
    targetBucketId &&
    confirmText.trim().toUpperCase() === 'DELETE';

  function handleSubmit(event) {
    event.preventDefault();

    if (!canDelete) {
      return;
    }

    onDelete({
      bucketId: bucket.id,
      moveToBucketId: targetBucketId,
      amountToMove: bucketProjectedAmount,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 sm:p-6">
      <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
            Delete Savings Bucket
          </p>
          <h3 className="mt-1 break-words text-xl font-bold text-slate-950 sm:text-2xl">
            Delete {bucket.name}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            This removes the bucket from the app. Any projected funds in this bucket must be moved to another bucket.
          </p>
        </div>

        {bucketIsUsedByTransfer ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            This bucket is used by a scheduled transfer. Change or remove that transfer before deleting this bucket.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Funds to move</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">
              {formatCurrency(bucketProjectedAmount, currency)}
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Move funds to
            </span>
            <select
              value={targetBucketId}
              onChange={(event) => setTargetBucketId(event.target.value)}
              disabled={bucketIsUsedByTransfer}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900 disabled:bg-slate-100"
            >
              {availableTargetBuckets.map((targetBucket) => (
                <option key={targetBucket.id} value={targetBucket.id}>
                  {targetBucket.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Type DELETE to confirm
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              disabled={bucketIsUsedByTransfer}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-red-600 disabled:bg-slate-100"
              placeholder="DELETE"
            />
          </label>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!canDelete}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
            >
              Delete Bucket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function createNewBucketAdjustment(savingsBuckets, payPeriods) {
  return {
    id: `bucket-adjustment-${crypto.randomUUID()}`,
    date: payPeriods[0]?.date || '2026-06-03',
    payPeriodDate: payPeriods[0]?.date || '2026-06-03',
    bucketId: savingsBuckets[0]?.id || 'bucket-general-savings',
    amount: 0,
    adjustmentType: 'correction',
    notes: '',
    createdAt: new Date().toISOString(),
  };
}

function BucketAdjustmentForm({
  adjustment,
  savingsBuckets,
  payPeriods,
  onCancel,
  onSave,
}) {
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
    <div className="fixed inset-0 z-50 w-full overflow-y-auto border-slate-200 bg-white p-4 shadow-2xl sm:inset-y-0 sm:left-auto sm:w-[460px] sm:border-l sm:p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Bucket Adjustment
          </p>
          <h3 className="mt-1 break-words text-xl font-bold text-slate-950">
            Transfer in or out
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Use positive amounts to add to a bucket. Use negative amounts to remove from a bucket.
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
          <span className="text-sm font-medium text-slate-700">Bucket</span>
          <select
            value={formState.bucketId}
            onChange={(event) => updateField('bucketId', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            {savingsBuckets.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
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
              onChange={(event) =>
                updateField('payPeriodDate', event.target.value)
              }
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
            onChange={(event) =>
              updateField('adjustmentType', event.target.value)
            }
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="interest">Interest</option>
            <option value="correction">Correction</option>
            <option value="transfer_in">Transfer In</option>
            <option value="transfer_out">Transfer Out</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="expense_paid">Expense Paid From Savings</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Amount</span>
          <input
            type="number"
            step="0.01"
            value={formState.amount}
            onChange={(event) => updateField('amount', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Positive adds to the bucket. Negative removes from the bucket and savings projection.
          </p>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            rows="4"
            value={formState.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="Example: property tax payment from savings"
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

export default function SavingsBuckets({
  savingsBuckets,
  savingsBucketAdjustments,
  scheduledItems,
  plannerData,
  settings,
  onSaveSavingsBucket,
  onDeleteSavingsBucket,
  onSaveSavingsBucketAdjustment,
  onDeleteSavingsBucketAdjustment,
}) {
  const [selectedAdjustment, setSelectedAdjustment] = useState(null);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [deleteBucket, setDeleteBucket] = useState(null);
  const currency = settings?.currency || 'CAD';

  const bucketProjection = useMemo(() => {
    return buildSavingsBucketProjection({
      payPeriods: plannerData.payPeriods,
      rows: plannerData.rows,
      savingsBuckets,
      savingsBucketAdjustments,
    });
  }, [plannerData, savingsBuckets, savingsBucketAdjustments]);

  const finalPeriod = plannerData.payPeriods[plannerData.payPeriods.length - 1];
  const finalPeriodDate = finalPeriod?.date || '';

  const projectedSavingsRow = plannerData.projectionRows.find(
    (row) => row.id === 'projected-savings'
  );

  const savingsProjectedEnd =
    projectedSavingsRow?.amountsByPeriod?.[finalPeriodDate] || 0;

  const bucketProjectedEnd = bucketProjection.reduce((total, item) => {
    return total + (item.balanceByPeriod[finalPeriodDate] || 0);
  }, 0);

  const bucketStartingTotal = savingsBuckets.reduce((total, bucket) => {
    return total + (Number(bucket.startingAmount) || 0);
  }, 0);

  const totalTransfersIn = bucketProjection.reduce((total, item) => {
    return (
      total +
      Object.values(item.transfersInByPeriod).reduce((innerTotal, value) => {
        return innerTotal + (Number(value) || 0);
      }, 0)
    );
  }, 0);

  const totalBucketAdjustments = savingsBucketAdjustments.reduce(
    (total, adjustment) => total + (Number(adjustment.amount) || 0),
    0
  );

  function getBucketName(bucketId) {
    return savingsBuckets.find((bucket) => bucket.id === bucketId)?.name || bucketId;
  }

  function getProjectedBucketAmount(bucketId) {
    const projection = bucketProjection.find((item) => item.bucket.id === bucketId);
    return projection?.balanceByPeriod[finalPeriodDate] || 0;
  }

  function bucketIsUsedByTransfer(bucketId) {
    return scheduledItems.some(
      (item) =>
        item.type === 'transfer' &&
        item.bucketId === bucketId &&
        item.active !== false
    );
  }

  async function handleSaveAdjustment(adjustment) {
    await onSaveSavingsBucketAdjustment(adjustment);
    setSelectedAdjustment(null);
  }

  async function handleSaveBucket(bucket) {
    await onSaveSavingsBucket(bucket);
    setSelectedBucket(null);
  }

  async function handleDeleteBucket(payload) {
    await onDeleteSavingsBucket(payload);
    setDeleteBucket(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Savings Buckets
          </p>
          <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
            Bucket balances and transfers
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Track how much is accumulated in Savings, House Maintenance, and Property Taxes.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setSelectedBucket(createNewBucket())}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Plus size={16} />
            Add Bucket
          </button>

          <button
            type="button"
            onClick={() =>
              setSelectedAdjustment(
                createNewBucketAdjustment(savingsBuckets, plannerData.payPeriods)
              )
            }
            disabled={savingsBuckets.length === 0}
            title={
              savingsBuckets.length === 0
                ? 'Add a savings bucket before adding an adjustment.'
                : undefined
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Plus size={16} />
            Add Bucket Adjustment
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm font-medium text-slate-500">
            Bucket Starting Total
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(bucketStartingTotal, currency)}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:p-5">
          <p className="text-sm font-medium text-slate-500">
            Projected Transfers In
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(totalTransfersIn, currency)}
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5">
          <p className="text-sm font-medium text-slate-500">
            Bucket Adjustments
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(totalBucketAdjustments, currency)}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
            Math.abs(savingsProjectedEnd - bucketProjectedEnd) < 0.01
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <p className="text-sm font-medium text-slate-500">
            Savings vs Buckets Difference
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(
              savingsProjectedEnd - bucketProjectedEnd,
              currency
            )}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-950">
            Bucket Projection
          </h3>
          <p className="text-sm text-slate-500">
            Starting amount plus scheduled transfers and bucket adjustments.
          </p>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full min-w-[840px]">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left text-sm font-bold">Bucket</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Starting</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Transfers In</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Adjustments</th>
              <th className="px-4 py-3 text-right text-sm font-bold">
                Projected End
              </th>
              <th className="px-4 py-3 text-right text-sm font-bold">Actions</th>
            </tr>
          </thead>

          <tbody>
            {bucketProjection.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-4 py-8 text-center text-sm text-slate-500">
                  No savings buckets yet. Add a bucket to start tracking projected balances.
                </td>
              </tr>
            ) : null}

            {bucketProjection.map((item) => {
              const transfersIn = Object.values(item.transfersInByPeriod).reduce(
                (total, value) => total + (Number(value) || 0),
                0
              );

              const adjustments = Object.values(item.adjustmentsByPeriod).reduce(
                (total, value) => total + (Number(value) || 0),
                0
              );

              const usedByTransfer = bucketIsUsedByTransfer(item.bucket.id);

              return (
                <tr key={item.bucket.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                    <div>{item.bucket.name}</div>
                    {usedByTransfer ? (
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        Used by scheduled transfer
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {formatCurrency(item.bucket.startingAmount, currency)}
                  </td>

                  <td className="px-4 py-3 text-right text-sm text-emerald-700">
                    {formatCurrency(transfersIn, currency)}
                  </td>

                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {formatCurrency(adjustments, currency)}
                  </td>

                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-950">
                    {formatCurrency(
                      item.balanceByPeriod[finalPeriodDate],
                      currency
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-sm">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedBucket(item.bucket)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteBucket(item.bucket)}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-950">
            Bucket Adjustments
          </h3>
          <p className="text-sm text-slate-500">
            Use these for transfers out, withdrawals, corrections, or interest.
          </p>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left text-sm font-bold">Date</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Pay Period</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Bucket</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Type</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Notes</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Action</th>
            </tr>
          </thead>

          <tbody>
            {savingsBucketAdjustments.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-8 text-center text-sm text-slate-500">
                  No bucket adjustments yet.
                </td>
              </tr>
            ) : null}

            {savingsBucketAdjustments.map((adjustment) => (
              <tr key={adjustment.id} className="border-t border-slate-200">
                <td className="px-4 py-3 text-sm text-slate-700">
                  {adjustment.date}
                </td>

                <td className="px-4 py-3 text-sm text-slate-700">
                  {adjustment.payPeriodDate}
                </td>

                <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                  {getBucketName(adjustment.bucketId)}
                </td>

                <td className="px-4 py-3 text-sm text-slate-700">
                  {adjustment.adjustmentType}
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
                      onClick={() => onDeleteSavingsBucketAdjustment(adjustment.id)}
                      aria-label="Delete bucket adjustment"
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

      {selectedBucket ? (
        <BucketEditor
          bucket={selectedBucket}
          onCancel={() => setSelectedBucket(null)}
          onSave={handleSaveBucket}
        />
      ) : null}

      {deleteBucket ? (
        <DeleteBucketDialog
          bucket={deleteBucket}
          bucketProjectedAmount={getProjectedBucketAmount(deleteBucket.id)}
          savingsBuckets={savingsBuckets}
          bucketIsUsedByTransfer={bucketIsUsedByTransfer(deleteBucket.id)}
          currency={currency}
          onCancel={() => setDeleteBucket(null)}
          onDelete={handleDeleteBucket}
        />
      ) : null}

      {selectedAdjustment ? (
        <BucketAdjustmentForm
          adjustment={selectedAdjustment}
          savingsBuckets={savingsBuckets}
          payPeriods={plannerData.payPeriods}
          onCancel={() => setSelectedAdjustment(null)}
          onSave={handleSaveAdjustment}
        />
      ) : null}
    </div>
  );
}
