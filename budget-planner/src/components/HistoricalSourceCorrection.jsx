import { useState } from 'react';
import { getHistoricalSourceRevision } from '../logic/plannerHistory';

// A separate form deliberately submits no amount, validation, note or marker fields.
export default function HistoricalSourceCorrection({ entry, source, accounts, categories, savingsBuckets, onCorrect }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expectedRevision] = useState(() => getHistoricalSourceRevision(entry));
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setSaving(true);
    try {
      await onCorrect(entry.entryKey, {
        type: String(form.get('historicalType')),
        accountId: String(form.get('historicalAccount') || ''),
        categoryId: String(form.get('historicalCategory') || ''),
        bucketId: String(form.get('historicalBucket') || ''),
      }, {
        confirmed: form.get('confirmSourceCorrection') === 'on',
        evidence: String(form.get('sourceCorrectionEvidence') || ''),
        expectedRevision,
      });
    } catch (failure) {
      setError(failure.message || 'Could not correct this entry. No changes were saved.');
    } finally {
      setSaving(false);
    }
  }
  const select = (name, label, records, selected) => (
    <label className="block text-sm">
      {label}
      <select name={name} defaultValue={selected || ''} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
        <option value="">None</option>
        {selected && !records.some((record) => record.id === selected)
          ? <option value={selected}>Missing record — choose an existing record</option> : null}
        {records.map((record) => <option key={record.id} value={record.id}>
          {record.name}{record.active === false ? ' (inactive)' : ''}
        </option>)}
      </select>
    </label>
  );
  return (
    <details className="mb-4 min-w-0 rounded-xl border border-slate-300 p-3">
      <summary className="cursor-pointer font-semibold text-slate-950">Correct source for this saved entry</summary>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <p className="text-sm text-slate-700">
          Correct only this entry&apos;s historical classification using original evidence.
          Amounts, validation, notes, marker and the current recurring schedule stay unchanged.
          Unsaved changes in the other form are not included. Later balances will recalculate.
        </p>
        <label className="block text-sm">
          Historical type
          <select name="historicalType" defaultValue={source?.type || 'expense'} required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
            {['income', 'expense', 'debt', 'transfer', 'savings', 'general'].map((type) =>
              <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        {select('historicalAccount', 'Historical account', accounts, source?.accountId)}
        {select('historicalCategory', 'Historical category', categories, source?.categoryId)}
        {select('historicalBucket', 'Historical bucket', savingsBuckets, source?.bucketId || source?.savingsBucketId)}
        <p className="text-xs text-slate-600">
          Income and expenses require an existing account. Inactive records can be used for history.
          Transfers retain FinPath&apos;s existing chequing-to-savings calculation; a bucket is optional.
        </p>
        <label className="block text-sm">
          Source correction evidence reference
          <input name="sourceCorrectionEvidence" required maxLength="500"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Original backup or statement and entry date" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input name="confirmSourceCorrection" type="checkbox" required className="mt-1" />
          <span>I checked the original evidence and confirm this source correction for this saved entry only.</span>
        </label>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={saving}
          className="min-h-11 w-full rounded-lg bg-slate-950 px-3 py-2 font-semibold text-white disabled:opacity-50">
          {saving ? 'Saving correction…' : 'Save historical source correction'}
        </button>
      </form>
    </details>
  );
}
