export const RELEASE_NOTES_STORAGE_KEY =
  'budgetApp:lastSeenReleaseNotesVersion';

export default function ReleaseNotesModal({
  releaseNotes,
  onClose,
  onViewHelp,
  onExportBackup,
}) {
  if (!releaseNotes) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-notes-title"
        aria-describedby="release-notes-description"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Version {releaseNotes.version} | {releaseNotes.date}
          </p>
          <h2
            id="release-notes-title"
            className="mt-1 text-2xl font-bold text-slate-950"
          >
            {releaseNotes.title}
          </h2>
          <p id="release-notes-description" className="mt-2 text-sm text-slate-600">
            Here are the main changes in this update.
          </p>
        </div>

        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          {releaseNotes.highlights.slice(0, 6).map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>

        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your data stays local in this browser/device. Export a backup from
          Settings after major updates, or use the button below.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={onViewHelp}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            View Help
          </button>
          {typeof onExportBackup === 'function' ? (
            <button
              type="button"
              onClick={onExportBackup}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Export Backup
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
