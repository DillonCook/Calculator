const DECIMAL_SCALE = 2;

export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: DECIMAL_SCALE
});

export const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: DECIMAL_SCALE,
  maximumFractionDigits: DECIMAL_SCALE
});
