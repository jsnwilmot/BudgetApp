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


export function getCurrentMonthKey() {
  return formatDateKey(new Date()).slice(0, 7);
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

export function generatePayPeriods(anchorDateString, frequencyDays, monthsToProject) {
  const anchorDate = parseLocalDate(anchorDateString);
  const safeFrequencyDays = Number(frequencyDays);
  const safeMonthsToProject = Number(monthsToProject);

  if (
    Number.isNaN(anchorDate.getTime()) ||
    !Number.isFinite(safeFrequencyDays) ||
    safeFrequencyDays <= 0 ||
    !Number.isFinite(safeMonthsToProject) ||
    safeMonthsToProject <= 0
  ) {
    return [];
  }

  const endDate = addMonths(anchorDate, monthsToProject);
  const payPeriods = [];

  let currentDate = anchorDate;

  while (currentDate <= endDate) {
    payPeriods.push({
      date: formatDateKey(currentDate),
      label: formatShortDate(formatDateKey(currentDate)),
    });

    currentDate = addDays(currentDate, safeFrequencyDays);
  }

  return payPeriods;
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
