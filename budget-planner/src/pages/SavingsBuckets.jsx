import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  buildSavingsBucketProjection,
  formatCurrency,
} from '../logic/projectionLogic';

function BucketForm({ bucket, onSave }) {
  const [startingAmount, setStartingAmount] = useState(bucket.startingAmount);

  function handleSubmit(event) {
    event.preventDefault();

    onSave({
      ...bucket,
      startingAmount: Number(startingAmount) || 0,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Savings bucket</p>
          <h3 className="text-xl font-bold text-slate-950">{bucket.name}</h3>
        </div>

        <Pencil size={18} className="text-slate-400" />
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Starting amount
        </span>
        <input
          type="number"
          step="0.01"
          value={startingAmount}
          onChange={(event) => setStartingAmount(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
        />
      </label>

      <button
        type="submit"
        className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
      >
        Save Bucket
      </button>
    </form>
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
    <div className="fixed inset-y-0 right-0 z-50 w-[460px] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Bucket Adjustment
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">
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
  plannerData,
  onSaveSavingsBucket,
  onSaveSavingsBucketAdjustment,
  onDeleteSavingsBucketAdjustment,
}) {
  const [selectedAdjustment, setSelectedAdjustment] = useState(null);

  const bucketProjection = useMemo(() => {
    return buildSavingsBucketProjection({
      payPeriods: plannerData.payPeriods,
      rows: plannerData.rows,
      savingsBuckets,
      savingsBucketAdjustments,
    });
  }, [plannerData, savingsBuckets, savingsBucketAdjustments]);

  const finalPeriod = plannerData.payPeriods[plannerData.payPeriods.length - 1];

  const projectedSavingsRow = plannerData.projectionRows.find(
    (row) => row.id === 'projected-savings'
  );

  const savingsProjectedEnd =
    projectedSavingsRow?.amountsByPeriod[finalPeriod?.date] || 0;

  const bucketProjectedEnd = bucketProjection.reduce((total, item) => {
    return total + (item.balanceByPeriod[finalPeriod?.date] || 0);
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

  async function handleSaveAdjustment(adjustment) {
    await onSaveSavingsBucketAdjustment(adjustment);
    setSelectedAdjustment(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Savings Buckets
          </p>
          <h2 className="text-3xl font-bold text-slate-950">
            Bucket balances and transfers
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Track how much is accumulated in Savings, House Maintenance, and Property Taxes.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setSelectedAdjustment(
              createNewBucketAdjustment(savingsBuckets, plannerData.payPeriods)
            )
          }
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Add Bucket Adjustment
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Bucket Starting Total
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(bucketStartingTotal)}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Projected Transfers In
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(totalTransfersIn)}
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Bucket Adjustments
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(totalBucketAdjustments)}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-5 shadow-sm ${
            Math.abs(savingsProjectedEnd - bucketProjectedEnd) < 0.01
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <p className="text-sm font-medium text-slate-500">
            Savings vs Buckets Difference
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(savingsProjectedEnd - bucketProjectedEnd)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {savingsBuckets.map((bucket) => (
          <BucketForm
            key={bucket.id}
            bucket={bucket}
            onSave={onSaveSavingsBucket}
          />
        ))}
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

        <table className="w-full">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left text-sm font-bold">Bucket</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Starting</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Transfers In</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Adjustments</th>
              <th className="px-4 py-3 text-right text-sm font-bold">
                Projected End
              </th>
            </tr>
          </thead>

          <tbody>
            {bucketProjection.map((item) => {
              const transfersIn = Object.values(item.transfersInByPeriod).reduce(
                (total, value) => total + (Number(value) || 0),
                0
              );

              const adjustments = Object.values(item.adjustmentsByPeriod).reduce(
                (total, value) => total + (Number(value) || 0),
                0
              );

              return (
                <tr key={item.bucket.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                    {item.bucket.name}
                  </td>

                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {formatCurrency(item.bucket.startingAmount)}
                  </td>

                  <td className="px-4 py-3 text-right text-sm text-emerald-700">
                    {formatCurrency(transfersIn)}
                  </td>

                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {formatCurrency(adjustments)}
                  </td>

                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-950">
                    {formatCurrency(item.balanceByPeriod[finalPeriod.date])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

        <table className="w-full">
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
                  {formatCurrency(adjustment.amount)}
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
                      onClick={() => onDeleteSavingsBucketAdjustment(adjustment.id)}
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