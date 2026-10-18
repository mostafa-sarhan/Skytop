/**
 * Financial numbers and identifiers (amounts, paper receipt numbers, transfer
 * references) always use Western digits. Employees may type Arabic-Indic
 * (٠١٢٣٤٥٦٧٨٩) or Persian (۰۱۲۳۴۵۶۷۸۹) digits; these become 0-9, and the
 * Arabic decimal separator (٫) becomes ".". The server applies the same rule
 * (server/src/utils/digits.ts), so this is a convenience, not the guard.
 */
export const toWesternDigits = (value: string): string =>
  value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');
