const MS_PER_DAY = 24 * 60 * 60 * 1000;
const shortDateFormatter = new Intl.DateTimeFormat('en-CA', { month: 'short', day: '2-digit' });

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

export function getLocalToday() {
  return formatDateKey(new Date());
}

export function formatShortDate(dateString) {
  const date = parseLocalDate(dateString);

  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }

  return shortDateFormatter.format(date);
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
  const monthDay = nextDate.getDate();
  nextDate.setMonth(nextDate.getMonth() + months, 1);
  const lastDay = new Date(nextDate);
  lastDay.setMonth(lastDay.getMonth() + 1, 0);
  nextDate.setDate(Math.min(monthDay, lastDay.getDate()));
  return nextDate;
}

export function daysBetween(startDate, endDate) {
  return Math.round((endDate - startDate) / MS_PER_DAY);
}

function generatePayPeriods(anchorDate, frequencyDays, endDate) {
  const payPeriods = [];

  let currentDate = anchorDate;

  while (currentDate <= endDate) {
    const date = formatDateKey(currentDate);
    payPeriods.push({
      date,
      label: shortDateFormatter.format(currentDate),
    });

    currentDate = addDays(currentDate, frequencyDays);
  }

  return payPeriods;
}

export function getPlannerPeriods(anchorDateString, frequencyDays, forecastMonths, today, throughYear) {
  const anchor = parseLocalDate(anchorDateString);
  const localDate = parseLocalDate(today);
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(localDate.getTime()) ||
      !Number.isInteger(frequencyDays) || frequencyDays <= 0 ||
      !Number.isInteger(forecastMonths) || forecastMonths <= 0) {
    return {
      payPeriods: [], forecastPayPeriods: [], currentPayPeriod: null,
      calculationEndDate: '', forecastEndDate: '',
    };
  }

  const offset = Math.floor(daysBetween(anchor, localDate) / frequencyDays);
  const forecastStart = addDays(anchor, Math.max(0, offset) * frequencyDays);
  const forecastEnd = addMonths(forecastStart, forecastMonths);
  // December's next-year coverage becomes the current-year coverage in January.
  const coverageYear = localDate.getFullYear() + (localDate.getMonth() === 11 ? 1 : 0);
  const calendarEnd = new Date(coverageYear, 11, 31);
  const requestedEnd = Number.isInteger(throughYear) && throughYear >= 1000 && throughYear <= 9999
    ? new Date(throughYear, 11, 31)
    : calendarEnd;
  const calculationEnd = new Date(Math.max(forecastEnd, calendarEnd, requestedEnd));
  const payPeriods = generatePayPeriods(anchor, frequencyDays, calculationEnd);
  const forecastEndDate = formatDateKey(forecastEnd);
  const forecastPayPeriods = payPeriods.slice(Math.max(0, offset))
    .filter((period) => period.date <= forecastEndDate);
  return {
    payPeriods,
    forecastPayPeriods,
    currentPayPeriod: offset < 0 ? null : (payPeriods[offset] ?? null),
    calculationEndDate: formatDateKey(calculationEnd),
    forecastEndDate,
  };
}

export function getPayPeriodsForYear(payPeriods, year) {
  return payPeriods.filter(({ date }) => date.startsWith(`${year}-`));
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
