const severityLabels = {
  info: 'Info',
  warning: 'Warning',
  danger: 'Critical',
};

const severityClasses = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
};

function getSeverityClass(severity) {
  return severityClasses[severity] || severityClasses.info;
}

export default function AlertList({
  alerts = [],
  title,
  helper,
  emptyMessage = 'No alerts right now.',
  maxItems,
  onAction,
  onDismiss,
  showEmpty = false,
}) {
  const visibleAlerts =
    typeof maxItems === 'number' ? alerts.slice(0, maxItems) : alerts;

  if (visibleAlerts.length === 0 && !showEmpty) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {title ? (
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-950 sm:text-xl">
            {title}
          </h3>
          {helper ? <p className="mt-1 text-sm text-slate-600">{helper}</p> : null}
        </div>
      ) : null}

      {visibleAlerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm font-medium text-slate-600">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleAlerts.map((alert) => (
            <article
              key={alert.id}
              className={`rounded-xl border px-4 py-3 ${getSeverityClass(
                alert.severity
              )}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide">
                    {severityLabels[alert.severity] || 'Info'}
                  </p>
                  <h4 className="mt-1 font-bold">{alert.title}</h4>
                  <p className="mt-1 text-sm">{alert.message}</p>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {alert.actionPage && alert.actionLabel && onAction ? (
                    <button
                      type="button"
                      onClick={() => onAction(alert)}
                      className="rounded-lg border border-current px-3 py-2 text-sm font-semibold hover:bg-white/60"
                    >
                      {alert.actionLabel}
                    </button>
                  ) : null}

                  {onDismiss && alert.severity !== 'danger' ? (
                    <button
                      type="button"
                      onClick={() => onDismiss(alert)}
                      className="rounded-lg border border-current px-3 py-2 text-sm font-semibold hover:bg-white/60"
                    >
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
