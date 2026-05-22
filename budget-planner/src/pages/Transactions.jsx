import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatCurrency } from '../logic/projectionLogic';
import {
  buildTransactionsFromAppData,
  calculateTransactionSummary,
  getTransactionAmountLabel,
  transactionMatchesDateRange,
} from '../logic/transactionLogic';
import { rowsToCsv } from '../utils/csv';
import { downloadTextFile } from '../utils/downloadFile';

const typeLabels = {
  income: 'Income',
  expense: 'Expense',
  'transfer-in': 'Transfer In',
  'transfer-out': 'Transfer Out',
  savings: 'Savings',
  adjustment: 'Adjustment',
};

const sourceLabels = {
  'scheduled-item': 'Scheduled Item',
  'manual-adjustment': 'Manual Adjustment',
  'savings-bucket-adjustment': 'Savings Bucket',
};

function formatDate(value) {
  if (!value) {
    return 'No date';
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getTypeClass(type) {
  if (type === 'income') return 'bg-emerald-100 text-emerald-800';
  if (type === 'expense') return 'bg-blue-100 text-blue-800';
  if (type === 'transfer-in') return 'bg-teal-100 text-teal-800';
  if (type === 'transfer-out') return 'bg-amber-100 text-amber-800';
  if (type === 'savings') return 'bg-cyan-100 text-cyan-800';
  return 'bg-slate-100 text-slate-700';
}

function SummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function compareDate(left, right) {
  const leftDate = left.date || '';
  const rightDate = right.date || '';
  return leftDate.localeCompare(rightDate);
}

export default function Transactions({
  settings,
  scheduledItems = [],
  manualAdjustments = [],
  savingsBucketAdjustments = [],
  savingsBuckets = [],
  accounts = [],
  categories = [],
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [bucketFilter, setBucketFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [exportMessage, setExportMessage] = useState('');
  const currency = settings?.currency || 'CAD';

  const transactions = useMemo(
    () =>
      buildTransactionsFromAppData({
        scheduledItems,
        manualAdjustments,
        savingsBucketAdjustments,
        savingsBuckets,
        accounts,
        categories,
      }),
    [
      accounts,
      categories,
      manualAdjustments,
      savingsBucketAdjustments,
      savingsBuckets,
      scheduledItems,
    ]
  );

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return transactions
      .filter((transaction) => {
        if (
          normalizedSearch &&
          ![
            transaction.description,
            transaction.categoryName,
            transaction.accountName,
            transaction.savingsBucketName,
            transaction.notes,
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedSearch)
        ) {
          return false;
        }

        if (typeFilter !== 'all' && transaction.type !== typeFilter) {
          return false;
        }

        if (categoryFilter === '__uncategorized' && transaction.categoryId) {
          return false;
        }

        if (
          categoryFilter !== 'all' &&
          categoryFilter !== '__uncategorized' &&
          transaction.categoryId !== categoryFilter
        ) {
          return false;
        }

        if (accountFilter === '__none' && transaction.accountId) {
          return false;
        }

        if (
          accountFilter !== 'all' &&
          accountFilter !== '__none' &&
          transaction.accountId !== accountFilter
        ) {
          return false;
        }

        if (bucketFilter === '__none' && transaction.savingsBucketId) {
          return false;
        }

        if (
          bucketFilter !== 'all' &&
          bucketFilter !== '__none' &&
          transaction.savingsBucketId !== bucketFilter
        ) {
          return false;
        }

        return transactionMatchesDateRange(
          transaction,
          dateRangeFilter,
          customStartDate,
          customEndDate
        );
      })
      .sort((left, right) => {
        if (sortOrder === 'date-asc') return compareDate(left, right);
        if (sortOrder === 'amount-desc') {
          return Math.abs(right.amount) - Math.abs(left.amount);
        }
        if (sortOrder === 'amount-asc') {
          return Math.abs(left.amount) - Math.abs(right.amount);
        }
        return compareDate(right, left);
      });
  }, [
    accountFilter,
    bucketFilter,
    categoryFilter,
    customEndDate,
    customStartDate,
    dateRangeFilter,
    searchTerm,
    sortOrder,
    transactions,
    typeFilter,
  ]);

  const summary = useMemo(
    () => calculateTransactionSummary(filteredTransactions),
    [filteredTransactions]
  );

  function handleExportCsv() {
    const headers = [
      'Date',
      'Description',
      'Type',
      'Category',
      'Account',
      'Savings Bucket',
      'Amount',
      'Source',
      'Notes',
    ];
    const rows = filteredTransactions.map((transaction) => ({
      Date: transaction.date,
      Description: transaction.description,
      Type: typeLabels[transaction.type] || transaction.type,
      Category: transaction.categoryName,
      Account: transaction.accountName,
      'Savings Bucket': transaction.savingsBucketName,
      Amount: getTransactionAmountLabel(transaction),
      Source: sourceLabels[transaction.source] || transaction.source,
      Notes: transaction.notes,
    }));
    const filename = `transactions-export-${getTodayKey()}.csv`;

    downloadTextFile({
      content: rowsToCsv(headers, rows),
      filename,
      mimeType: 'text/csv;charset=utf-8',
    });

    setExportMessage(`Exported ${filename}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Transactions
          </p>
          <h2 className="text-3xl font-bold text-slate-950">
            Transaction history
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Review income, expenses, transfers, and manual adjustments in one
            place.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Download size={16} />
          Export Transactions CSV
        </button>
      </div>

      {exportMessage ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          role="status"
        >
          {exportMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Income"
          value={formatCurrency(summary.income, currency)}
          helper="Income transactions in this view."
        />
        <SummaryCard
          label="Total Expenses"
          value={formatCurrency(summary.expenses, currency)}
          helper="Expense transactions in this view."
        />
        <SummaryCard
          label="Net Total"
          value={formatCurrency(summary.netTotal, currency)}
          helper="Income minus expenses and adjustments."
        />
        <SummaryCard
          label="Transfers"
          value={formatCurrency(summary.transfers, currency)}
          helper="Transfer movement in this view."
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Search</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="Search descriptions"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">All types</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">All categories</option>
              <option value="__uncategorized">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.active === false ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Account</span>
            <select
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">All accounts</option>
              <option value="__none">No account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Savings Bucket
            </span>
            <select
              value={bucketFilter}
              onChange={(event) => setBucketFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">All buckets</option>
              <option value="__none">No bucket</option>
              {savingsBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date Range</span>
            <select
              value={dateRangeFilter}
              onChange={(event) => setDateRangeFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">All</option>
              <option value="this-month">This month</option>
              <option value="last-30-days">Last 30 days</option>
              <option value="last-90-days">Last 90 days</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Sort</span>
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="date-desc">Date newest first</option>
              <option value="date-asc">Date oldest first</option>
              <option value="amount-desc">Amount high to low</option>
              <option value="amount-asc">Amount low to high</option>
            </select>
          </label>

          {dateRangeFilter === 'custom' ? (
            <div className="grid gap-3 md:grid-cols-2 xl:col-span-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Start Date
                </span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  End Date
                </span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-semibold text-slate-950">
              No transactions found
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Transactions will appear from manual adjustments, savings
              activity, and scheduled or planned items.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px]">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-4 py-3 text-left text-sm font-bold">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold">
                    Account or Bucket
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-bold">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold">
                    Source
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredTransactions.map((transaction) => {
                  const signedAmount = getTransactionAmountLabel(transaction);
                  const location =
                    transaction.savingsBucketId
                      ? transaction.savingsBucketName
                      : transaction.accountName;

                  return (
                    <tr key={transaction.id} className="border-t border-slate-200">
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatDate(transaction.date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                        <span className="block max-w-[240px] truncate">
                          {transaction.description}
                        </span>
                        {transaction.notes ? (
                          <span className="block max-w-[240px] truncate text-xs font-normal text-slate-500">
                            {transaction.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${getTypeClass(
                            transaction.type
                          )}`}
                        >
                          {typeLabels[transaction.type] || transaction.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <span className="block max-w-[160px] truncate">
                          {transaction.categoryName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <span className="block max-w-[180px] truncate">
                          {location}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-950">
                        <span>
                          {signedAmount < 0 ? '-' : '+'}
                          {formatCurrency(Math.abs(signedAmount), currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {sourceLabels[transaction.source] || transaction.source}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
