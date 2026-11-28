import {
  getConfirmedAmount, getSavedAmount, getSavedPlannerSource, isConfirmedPlannerSource,
} from '../logic/plannerHistory';
import { isPlannerCellMarked } from '../logic/plannerLastEntryMarker';
import { formatCurrency } from '../logic/projectionLogic';

function savedText(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function SavedEntry({ record, marker, currency }) {
  const { entry, id, date, key } = record;
  const source = getSavedPlannerSource(entry, id);
  const conflict = entry.scheduledItemSnapshot != null && !source;
  const verified = source && isConfirmedPlannerSource(entry) && !entry.historicalSourceNeedsReview;
  const confirmed = entry.validated ? getConfirmedAmount(entry) : undefined;
  const planned = getSavedAmount(entry.plannedAmount);
  const actual = getSavedAmount(entry.actualAmount);
  const lineItems = Array.isArray(entry.lineItems) ? entry.lineItems : [];
  const notes = savedText(entry.notes);
  const fields = [
    ['Entry key', key],
    ['Scheduled item ID', id],
    ['Saved type', source?.type],
    ['Saved account ID', savedText(source?.accountId)],
    ['Saved destination account ID', savedText(source?.toAccountId)],
    ['Saved category ID', savedText(source?.categoryId)],
    ['Saved savings bucket ID', savedText(source?.bucketId ?? source?.savingsBucketId)],
    ['Planned amount', planned === undefined ? '' : formatCurrency(planned, currency)],
    ['Actual amount', actual === undefined ? '' : formatCurrency(actual, currency)],
  ];

  return (
    <details className="rounded-lg border border-slate-200">
      <summary className="cursor-pointer break-words px-4 py-3 text-sm font-medium text-slate-900">
        <time dateTime={date}>{date}</time>{' · '}{savedText(source?.name) || id}{' · '}
        {entry.validated ? 'Validated' : 'Saved draft'}
        {confirmed !== undefined && ` · Confirmed amount ${formatCurrency(confirmed, currency)}`}
        {isPlannerCellMarked(marker, id, date) && ' · Marked as Last Entry'}
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-700">
        {entry.validated && confirmed === undefined && (
          <p className="font-medium text-amber-900">Amount needs review.</p>
        )}
        {conflict ? (
          <p className="font-medium text-amber-900">Source conflict. The saved source does not match this entry.</p>
        ) : !verified && (
          <p>The original source details could not be verified. Any source details shown come from the saved record.</p>
        )}
        <dl className="space-y-1">
          {fields.filter(([, value]) => value).map(([label, value]) => (
            <div key={label} className="flex flex-wrap gap-x-2 break-all">
              <dt className="font-medium">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {notes && <p className="whitespace-pre-wrap break-words"><strong>Notes</strong> {notes}</p>}
        {lineItems.length > 0 && (
          <ul aria-label="Saved line items" className="list-disc space-y-1 pl-5">
            {lineItems.map((line, index) => {
              const amount = getSavedAmount(line?.amount);
              return (
                <li key={index} className="break-words">
                  {savedText(line?.description) || 'Line item'}{' · '}
                  {amount === undefined ? 'Amount needs review' : formatCurrency(amount, currency)}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

export default function SavedPlannerHistory({ records, marker, currency }) {
  if (records.length === 0) return null;

  return (
    <section aria-labelledby="saved-planner-history" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 id="saved-planner-history" className="text-lg font-semibold text-slate-950">
        Saved entries before the Planner start
      </h3>
      <p className="text-sm text-slate-600">
        These saved records are read-only. They are outside the calculated pay periods and excluded from Planner totals.
      </p>
      {records.map((record) => (
        <SavedEntry key={record.key} record={record} marker={marker} currency={currency} />
      ))}
    </section>
  );
}
