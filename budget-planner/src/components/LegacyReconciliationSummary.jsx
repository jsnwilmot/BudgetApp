import { useMemo, useState } from 'react';
import { summarizeHistoricalEntries } from '../logic/historicalIntegrity';

const PAGE_SIZE = 20;
const display = (value) => value == null || value === '' ? 'None' : typeof value === 'string' ? value : 'Invalid value';
function PagedTable({ rows, columns, label }) {
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const current = Math.min(page, last);
  return (
    <div className="mt-3 min-w-0">
      <div className="overflow-x-auto">
        <table aria-label={label} className="w-full text-left text-sm">
          <thead><tr>{columns.map((column) => <th key={column.label} className="border-b p-2">{column.label}</th>)}</tr></thead>
          <tbody>{rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((row) => <tr key={row.key || row.entryKey}>
            {columns.map((column) => <td key={column.label} className="max-w-xs break-words border-b p-2 align-top">{column.value(row)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {!rows.length ? <p className="mt-2 text-sm">No matching rows.</p> : null}
      {rows.length > PAGE_SIZE ? <div className="mt-2 flex items-center gap-3 text-sm">
        <button type="button" disabled={!current} onClick={() => setPage(current - 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Previous rows</button>
        <span>Page {current + 1} of {last + 1}; {rows.length} rows</span>
        <button type="button" disabled={current === last} onClick={() => setPage(current + 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Next rows</button>
      </div> : null}
    </div>
  );
}

export default function LegacyReconciliationSummary({ data }) {
  const [sourceId, setSourceId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const summary = useMemo(() => summarizeHistoricalEntries(data), [data]);
  const invalidWindow = fromDate && toDate && fromDate > toDate;
  const filtered = summary.rows.filter((row) => (!sourceId || row.sourceId === sourceId) &&
    (invalidWindow || !row.date || ((!fromDate || row.date >= fromDate) && (!toDate || row.date <= toDate))));
  const keys = new Set(filtered.map((row) => row.entryKey));
  const groups = summarizeHistoricalEntries({ ...data, plannerEntries: Object.fromEntries(
    Object.entries(data.plannerEntries || data.planner?.entries || {}).filter(([key]) => keys.has(key))
  ) }).groups;
  const exceptions = filtered.filter((row) => row.integrityIssues.length || row.amountIssues.length);
  const metadataOnly = filtered.filter((row) => row.sourceNeedsReview && !row.integrityIssues.length && !row.amountIssues.length);
  const rowColumns = [
    { label: 'Saved entry key / date', value: (row) => <>{row.entryKey}<br />{row.date || 'Unknown date'}</> },
    { label: 'Source ID / validation', value: (row) => <>{row.sourceId}<br />{row.validated ? 'Confirmed' : 'Unvalidated'}; prior corrections: {row.correctionCount}</> },
    { label: 'Details', value: (row) => [...row.integrityIssues.map((issue) => issue.message), ...row.amountIssues,
      row.sourceNeedsReview ? 'Source details not reviewed.' : 'Source acknowledgement recorded.'].join(' ') },
  ];
  return (
    <section aria-label="Read-only legacy reconciliation" className="mt-5 min-w-0 rounded-xl border border-slate-300 bg-slate-50 p-3">
      <h3 className="text-lg font-semibold text-slate-950">Legacy reconciliation — read-only</h3>
      <p className="mt-2 text-sm">Saved validation is unchanged. This inventory reads all stored entries, including off-screen history.
        Viewing, filtering and pagination do not save, verify or correct records.</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {[
          ['Stored entries', summary.total], ['Confirmed entries', summary.validated],
          ['Reference / identity problem entries', summary.integrityCount], ['Reference / identity issues', summary.integrityFieldCount],
          ['Missing or unresolved amount entries', summary.amountCount], ['Source details not reviewed', summary.sourcePendingCount],
          ['Source acknowledged with valid links', summary.sourceVerifiedCount], ['Orphan / unusable source entries', summary.orphanCount],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}
      </dl>
      <p className="mt-2 text-xs">Counts can overlap. A prior source acknowledgement does not clear a broken link.
        Removed schedules with usable snapshots remain legitimate history; inactive reference records are allowed.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-sm">Historical source ID
          <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="mt-1 w-full rounded-lg border p-2">
            <option value="">All sources</option>
            {[...new Set(summary.rows.map((row) => row.sourceId))].sort().map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="text-sm">Saved pay-period date from<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm">Saved pay-period date to<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
      </div>
      {invalidWindow ? <p role="alert" className="mt-2 text-sm text-red-800">Choose an end date on or after the start date. Date filtering is not applied.</p> : null}
      <p className="mt-2 text-sm">Showing {filtered.length} of {summary.total} stored entries. Unknown dates remain visible for integrity review.
        These are observed classifications, not proof that a source stayed unchanged over time.</p>
      <h4 className="mt-4 font-semibold text-red-900">Reference, identity and amount exceptions ({exceptions.length})</h4>
      <PagedTable key={`${sourceId}:${fromDate}:${toDate}:exceptions`} label="Historical integrity exceptions" rows={exceptions} columns={rowColumns} />
      <details className="mt-4"><summary className="cursor-pointer font-semibold">Observed source cohorts ({groups.length})</summary>
      <PagedTable key={`${sourceId}:${fromDate}:${toDate}:groups`} label="Historical source cohorts" rows={groups} columns={[
        { label: 'Source ID / display label', value: (group) => <>{group.sourceId}<br />{group.name}</> },
        { label: 'Saved date window / count', value: (group) => <>{group.fromDate || 'Unknown'} — {group.toDate || 'Unknown'}<br />{group.count} entries; {group.exceptions} exceptions</> },
        { label: 'Observed classification', value: (group) => <>{group.sourceOrigin}<br />Type: {display(group.source?.type)}; account: {display(group.source?.accountId)}; category: {display(group.source?.categoryId)}; bucket: {display(group.source?.bucketId ?? group.source?.savingsBucketId)}<br />{group.sourcePending} source reviews pending</> },
      ]} />
      </details>
      <details className="mt-4"><summary className="cursor-pointer font-semibold">Metadata-only source review entries ({metadataOnly.length})</summary>
        <PagedTable key={`${sourceId}:${fromDate}:${toDate}:metadata`} label="Historical metadata review entries" rows={metadataOnly} columns={rowColumns} />
      </details>
      <p className="mt-3 text-sm">Use the existing evidence-backed, entry-only source correction in Planner for classification problems where the saved cell is available.
        Identity conflicts and unavailable source/reference records stay unresolved. No keys, records or totals are repaired by this summary.</p>
    </section>
  );
}
