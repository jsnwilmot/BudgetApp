import { normalizeNumber } from './numbers';

export function formatCurrency(value, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
  }).format(normalizeNumber(value));
}
