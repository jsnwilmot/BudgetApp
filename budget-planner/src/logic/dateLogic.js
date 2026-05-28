const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseLocalDate(dateString) {
  if (typeof dateString !== 'string') {
    return new Date(Number.NaN);
  }

  const [year, month, day] = dateString.split('-').map(Number);

  if (!year || !month || !day) {
    return new Date(Number.NaN);
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return new Date(Number.NaN);
  }

  return date;
}

export function formatDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatShortDate(dateString) {
  const date = parseLocalDate(dateString);

  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }

  return date.toLocaleDateString('en-CA', {
    month: 'short',
    day: '2-digit',
  });
}

export function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function addMonths(date, months) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

export function daysBetween(startDate, endDate) {
  return Math.round((endDate - startDate) / MS_PER_DAY);
}

export function getTodayDateKey() {
  return formatDateKey(new Date());
}

function getLaterDate(leftDate, rightDate) {
  return leftDate > rightDate ? leftDate : rightDate;
}

function getCycleDateOnOrBefore(anchorDate, targetDate, frequencyDays) {
  const offsetDays =
    Math.floor(daysBetween(anchorDate, targetDate) / frequencyDays) * frequencyDays;

  return addDays(anchorDate, offsetDays);
}

function getCycleDateOnOrAfter(anchorDate, targetDate, frequencyDays) {
  const cycleDate = getCycleDateOnOrBefore(
    anchorDate,
    targetDate,
    frequencyDays
  );

  if (cycleDate >= targetDate) {
    return cycleDate;
  }

  return addDays(cycleDate, frequencyDays);
}

export function generatePayPeriods(
  anchorDateString,
  frequencyDays,
  monthsToProject,
  options = {}
) {
  const anchorDate = parseLocalDate(anchorDateString);
  const safeFrequencyDays = Number(frequencyDays);
  const safeMonthsToProject = Number(monthsToProject);
  const referenceDate = parseLocalDate(
    options.referenceDateString || getTodayDateKey()
  );

  if (
    Number.isNaN(anchorDate.getTime()) ||
    Number.isNaN(referenceDate.getTime()) ||
    !Number.isFinite(safeFrequencyDays) ||
    safeFrequencyDays <= 0 ||
    !Number.isFinite(safeMonthsToProject) ||
    safeMonthsToProject <= 0
  ) {
    return [];
  }

  const configuredEndDate = addMonths(anchorDate, safeMonthsToProject);
  const rollingEndDate = addMonths(referenceDate, safeMonthsToProject);
  const requiredEndDate = getCycleDateOnOrAfter(
    anchorDate,
    getLaterDate(configuredEndDate, rollingEndDate),
    safeFrequencyDays
  );
  const startDate =
    referenceDate < anchorDate
      ? getCycleDateOnOrBefore(anchorDate, referenceDate, safeFrequencyDays)
      : anchorDate;
  const payPeriods = [];

  let currentDate = startDate;

  while (currentDate <= requiredEndDate) {
    const dateKey = formatDateKey(currentDate);

    payPeriods.push({
      date: dateKey,
      label: formatShortDate(dateKey),
    });

    currentDate = addDays(currentDate, safeFrequencyDays);
  }

  return payPeriods;
}

export function getCurrentPayPeriodIndex(
  payPeriods,
  referenceDateString = getTodayDateKey()
) {
  if (!Array.isArray(payPeriods) || payPeriods.length === 0) {
    return -1;
  }

  const referenceDate = parseLocalDate(referenceDateString);
  const referenceKey = Number.isNaN(referenceDate.getTime())
    ? getTodayDateKey()
    : formatDateKey(referenceDate);

  const currentIndex = payPeriods.findIndex((period, index) => {
    const nextPeriod = payPeriods[index + 1];

    return (
      period.date <= referenceKey && (!nextPeriod || referenceKey < nextPeriod.date)
    );
  });

  if (currentIndex >= 0) {
    return currentIndex;
  }

  return payPeriods.findIndex((period) => period.date >= referenceKey);
}

export function getCurrentPayPeriod(
  payPeriods,
  referenceDateString = getTodayDateKey()
) {
  const currentIndex = getCurrentPayPeriodIndex(
    payPeriods,
    referenceDateString
  );

  return currentIndex >= 0 ? payPeriods[currentIndex] : null;
}

export function getMonthDate(year, monthIndex, day) {
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.min(day, lastDayOfMonth);
  return new Date(year, monthIndex, safeDay);
}

export function findPreviousPayPeriod(payPeriods, dueDate) {
  const dueDateKey = formatDateKey(dueDate);

  const previousPeriods = payPeriods.filter((period) => {
    return period.date < dueDateKey;
  });

  return previousPeriods[previousPeriods.length - 1] || payPeriods[0];
}

export function isSameBiweeklyCycle(itemStartDateString, payPeriodDateString, frequencyDays) {
  const itemStartDate = parseLocalDate(itemStartDateString);
  const payPeriodDate = parseLocalDate(payPeriodDateString);
  const diffDays = daysBetween(itemStartDate, payPeriodDate);

  return diffDays >= 0 && diffDays % frequencyDays === 0;
}
