import { safeBoolean } from '../data/migrations';
import { isSameBiweeklyCycle } from './dateLogic';
import { getPlannerEntryIdentity } from './plannerHistory';

export function hasSamePlannerCadence(current, proposed) {
  return current.payPeriodAnchorDate === proposed.payPeriodAnchorDate &&
    Number(current.payFrequencyDays) === Number(proposed.payFrequencyDays);
}

export function getPlannerCadenceImpact(entries, current, proposed) {
  let alreadyOffCadence = 0;
  let newlyStranded = 0;
  const seen = new Set();

  for (const entry of entries) {
    if (!safeBoolean(entry?.validated)) continue;
    const key = entry.entryKey;
    const identity = getPlannerEntryIdentity(key, entry);
    if (!identity || seen.has(key)) continue;
    seen.add(key);

    if (!isSameBiweeklyCycle(current.payPeriodAnchorDate, identity.date, Number(current.payFrequencyDays))) {
      alreadyOffCadence += 1;
    } else if (!isSameBiweeklyCycle(proposed.payPeriodAnchorDate, identity.date, Number(proposed.payFrequencyDays))) {
      newlyStranded += 1;
    }
  }

  return { alreadyOffCadence, newlyStranded };
}

export class PlannerCadenceChangeError extends Error {
  constructor(impact) {
    super('This change would exclude validated Planner entries.');
    this.impact = impact;
  }
}
