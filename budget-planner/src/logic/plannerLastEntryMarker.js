const EDITABLE_PLANNER_TYPES = new Set(['income', 'expense', 'transfer']);

function getPlannerEntryKey(plannerItemId, occurrenceId) {
  return `${plannerItemId}__${occurrenceId}`;
}

export function getPlannerCellMarker(rowId, periodDate) {
  if (!rowId || !periodDate) {
    return null;
  }

  return {
    plannerItemId: rowId,
    occurrenceId: periodDate,
    cellKey: getPlannerEntryKey(rowId, periodDate),
  };
}

export function normalizePlannerLastEntryMarker(marker) {
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
    return null;
  }

  const plannerItemId =
    typeof marker.plannerItemId === 'string'
      ? marker.plannerItemId.trim()
      : '';
  const occurrenceId =
    typeof marker.occurrenceId === 'string' ? marker.occurrenceId.trim() : '';
  const cellKey =
    typeof marker.cellKey === 'string' ? marker.cellKey.trim() : '';

  if (!plannerItemId || !occurrenceId) {
    return null;
  }

  return {
    plannerItemId,
    occurrenceId,
    cellKey: cellKey || getPlannerEntryKey(plannerItemId, occurrenceId),
  };
}

export function isPlannerCellMarked(marker, rowId, periodDate) {
  const normalizedMarker = normalizePlannerLastEntryMarker(marker);
  const cellMarker = getPlannerCellMarker(rowId, periodDate);

  return Boolean(
    normalizedMarker &&
      cellMarker &&
      normalizedMarker.plannerItemId === cellMarker.plannerItemId &&
      normalizedMarker.occurrenceId === cellMarker.occurrenceId &&
      normalizedMarker.cellKey === cellMarker.cellKey
  );
}

export function updatePlannerLastEntryMarker({
  currentMarker = null,
  rowId,
  periodDate,
  checked,
}) {
  if (!checked) {
    return isPlannerCellMarked(currentMarker, rowId, periodDate)
      ? null
      : normalizePlannerLastEntryMarker(currentMarker);
  }

  return getPlannerCellMarker(rowId, periodDate);
}

export function getLastEntrySaveAction({ wasMarked, shouldBeMarked }) {
  if (shouldBeMarked) {
    return 'set';
  }

  if (wasMarked) {
    return 'clear';
  }

  return 'unchanged';
}

export function applyPlannerLastEntrySaveAction({
  currentMarker = null,
  rowId,
  periodDate,
  lastEntryAction = 'unchanged',
}) {
  if (lastEntryAction === 'set') {
    return getPlannerCellMarker(rowId, periodDate);
  }

  if (lastEntryAction === 'clear') {
    return isPlannerCellMarked(currentMarker, rowId, periodDate)
      ? null
      : normalizePlannerLastEntryMarker(currentMarker);
  }

  return normalizePlannerLastEntryMarker(currentMarker);
}

export function isPlannerLastEntryMarkerValid(marker, plannerData = {}) {
  const normalizedMarker = normalizePlannerLastEntryMarker(marker);

  if (!normalizedMarker) {
    return false;
  }

  const periodExists = (plannerData.payPeriods || []).some(
    (period) => period?.date === normalizedMarker.occurrenceId
  );

  if (!periodExists) {
    return false;
  }

  return (plannerData.rows || []).some((row) => {
    return (
      EDITABLE_PLANNER_TYPES.has(row?.type) &&
      row.id === normalizedMarker.plannerItemId &&
      Object.prototype.hasOwnProperty.call(
        row.amountsByPeriod || {},
        normalizedMarker.occurrenceId
      ) &&
      normalizedMarker.cellKey ===
        getPlannerEntryKey(row.id, normalizedMarker.occurrenceId)
    );
  });
}
