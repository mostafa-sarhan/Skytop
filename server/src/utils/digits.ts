/**
 * Financial numbers and identifiers are stored with Western digits (0-9).
 * Employees may type Arabic-Indic (٠١٢٣٤٥٦٧٨٩) or Persian (۰۱۲۳۴۵۶۷۸۹)
 * digits; both map to 0-9 and the Arabic decimal separator (٫) maps to ".".
 * Pure character mapping — no number parsing, so Decimal money stays exact.
 * Mirrored on the client in client/src/lib/digits.ts.
 */
export const toWesternDigits = (value: string): string =>
  value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');
