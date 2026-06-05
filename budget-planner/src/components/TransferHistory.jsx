import { Trash2 } from 'lucide-react';

import { formatCurrency } from '../logic/projectionLogic';

const transferTypeLabels = {
  to_savings_bucket: 'To Savings Bucket',
  from_savings_bucket: 'From Savings Bucket',
  account_transfer: 'Account Transfer',
  validated_planner_transfer: 'Validated Planner Transfer',
};

function resolveAccountName(accountId, accounts = []) {
  if (!accountId) return 'No account';
  return accounts.find((account) => account.id === accountId)?.name || 'Missing account';
}

function resolveBucketName(bucketId, savingsBuckets = []) {
  if (!bucketId) return 'No bucket';
  return (
    savingsBuckets.find((bucket) => bucket.id === bucketId)?.name ||
    'Missing savings bucket'
  );
}

function sortTransfers(transfers = []) {
  return [...transfers].sort((left, right) => {
    const rightDate = right.date || right.payPeriodDate || '';
    const leftDate = left.date || left.payPeriodDate || '';

    return String(rightDate).localeCompare(String(leftDate));
  });
}

export default function TransferHistory({
  transfers = [],
  plannerActivities = [],
  accounts = [],
  savingsBuckets = [],
  currency = 'CAD',
  onEdit,
  onDelete,
}) {
  const activityRows = sortTransfers([
    ...transfers.map((transfer) => ({
      ...transfer,
      source: 'transfer-record',
      readOnly: false,
    })),
    ...plannerActivities,
  ]);

  function handleDelete(transfer) {
    const confirmed = window.confirm(
      'Delete this transfer record? This only removes the transfer record and does not delete any accounts or buckets.'
    );

    if (confirmed) {
      onDelete(transfer.id);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-bold text-slate-950">Bucket Activity</h3>
        <p className="text-sm text-slate-500">
          Saved transfer records can be edited or deleted. Validated planner
          transfers are read-only activity derived from planner cells.
        </p>
        <p className="mt-1 text-sm text-amber-700">
          If you already validated a planner transfer, do not also add the same
          movement as a manual transfer record unless you need to correct the
          balance.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px]">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left text-sm font-bold">Date</th>
              <th className="px-4 py-3 text-left text-sm font-bold">
                Pay Period
              </th>
              <th className="px-4 py-3 text-left text-sm font-bold">From</th>
              <th className="px-4 py-3 text-left text-sm font-bold">To</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Bucket</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Type</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Amount</th>
              <th className="px-4 py-3 text-left text-sm font-bold">
                Validated
              </th>
              <th className="px-4 py-3 text-left text-sm font-bold">Notes</th>
              <th className="px-4 py-3 text-right text-sm font-bold">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {activityRows.length === 0 ? (
              <tr>
                <td
                  colSpan="10"
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No bucket activity yet.
                </td>
              </tr>
            ) : null}

            {activityRows.map((transfer) => (
              <tr key={transfer.id} className="border-t border-slate-200">
                <td className="px-4 py-3 text-sm text-slate-700">
                  {transfer.date || '--'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {transfer.payPeriodDate || '--'}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                  {transfer.readOnly
                    ? 'Planner'
                    : resolveAccountName(transfer.fromAccountId, accounts)}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                  {transfer.readOnly
                    ? 'Savings'
                    : resolveAccountName(transfer.toAccountId, accounts)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {resolveBucketName(transfer.bucketId, savingsBuckets)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {transferTypeLabels[transfer.transferType] || 'Account Transfer'}
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-950">
                  {formatCurrency(transfer.amount, currency)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {transfer.validated ? 'Validated' : 'Not validated'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  <span className="block max-w-[220px] whitespace-pre-wrap break-words">
                    {transfer.notes || '--'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {transfer.readOnly ? (
                    <span className="text-sm font-medium text-slate-500">
                      Read-only
                    </span>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(transfer)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(transfer)}
                        aria-label="Delete transfer"
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
