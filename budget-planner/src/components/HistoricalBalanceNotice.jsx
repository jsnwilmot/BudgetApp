export default function HistoricalBalanceNotice({ summary }) {
  const financial = summary.integrityCount || summary.amountCount;
  if (!financial && !summary.sourcePendingCount) return null;
  return (
    <aside aria-label="Historical balance limitations" className={`mb-4 rounded-xl border p-3 text-sm ${financial
      ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-300 bg-slate-50 text-slate-700'}`}>
      <p className="font-semibold">{financial ? 'Historical balances need attention' : 'Historical source details not reviewed'}</p>
      <p>Saved validation is unchanged. {summary.integrityCount} entries have reference or identity issues;
        {' '}{summary.amountCount} have unresolved amount evidence; {summary.sourcePendingCount} have source details not reviewed.
        Counts can overlap.</p>
      <p>{financial ? 'Some activity may be unrepresented or classified through incomplete links. Review Data Health before relying on affected balances.'
        : 'Calculated balances may use unverified historical classification. Review Data Health when original evidence is available.'}
        {' '}This notice does not change calculations or records.</p>
    </aside>
  );
}
