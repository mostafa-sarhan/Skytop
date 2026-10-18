/**
 * Arabic-friendly text matching for client-side search (e.g. searchable
 * selects): diacritics and tatweel are ignored, and common spelling variants
 * match each other (أ/إ/آ/ٱ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي).
 */
export const normalizeArabic = (text: string): string =>
  text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Every word of the query appears somewhere in the text (order-free). */
export const matchesArabic = (text: string, query: string): boolean => {
  const haystack = normalizeArabic(text);
  return normalizeArabic(query)
    .split(' ')
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};
