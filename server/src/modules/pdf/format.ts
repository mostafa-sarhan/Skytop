const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export const formatArabicDate = (value: string | Date): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCDate()} ${AR_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

/** Groups a decimal string for display without converting it to a float. */
export const formatMoney = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '0.00';
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  const negative = raw.startsWith('-');
  const [intPart = '0', decPart = ''] = (negative ? raw.slice(1) : raw).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${decPart.padEnd(2, '0').slice(0, 2)}`;
};
