export default function StatCard({ label, value, helper, tone = 'default' }) {
  const tones = {
    default: 'bg-white border-slate-200',
    good: 'bg-emerald-50 border-emerald-200',
    warning: 'bg-amber-50 border-amber-200',
    danger: 'bg-red-50 border-red-200',
    blue: 'bg-blue-50 border-blue-200',
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${tones[tone]}`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-bold text-slate-950 sm:text-2xl">
        {value}
      </p>
      {helper ? (
        <p className="mt-1 text-sm text-slate-500">{helper}</p>
      ) : null}
    </div>
  );
}
