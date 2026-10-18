/**
 * Physical paper receipt numbers are entered by employees from the company's
 * receipt books. The application never generates them.
 */
import { toWesternDigits } from './digits';

/** Display form: Arabic-Indic / Persian digits → Latin digits, trimmed, single spaces. */
export const normalizeReceiptNumber = (raw: string): string =>
  toWesternDigits(raw)
    .trim()
    .replace(/\s+/g, ' ');

/**
 * Permanent identity stored in Payment.receiptKey (unique across all payments,
 * including voided ones — a receipt number can never be reused). Case and
 * spaces are ignored and purely numeric values drop leading zeros, so
 * "000123", "123" and " 123 " are the same paper receipt.
 *
 * This is the single place that defines receipt identity: if receipt books are
 * introduced later, fold the book identifier in here (e.g. `${book}#${number}`).
 */
export const receiptKey = (receiptNumber: string): string => {
  const compact = normalizeReceiptNumber(receiptNumber).toUpperCase().replace(/\s+/g, '');
  return /^\d+$/.test(compact) ? compact.replace(/^0+(?=\d)/, '') : compact;
};
