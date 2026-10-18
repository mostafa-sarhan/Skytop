/**
 * Arabic alphabetical order. Database collation is platform dependent (macOS
 * libc sorts Arabic incorrectly), so lists of names are ordered here.
 */
const collator = new Intl.Collator('ar', { sensitivity: 'base', numeric: true });

export const compareArabic = (a: string, b: string): number => collator.compare(a, b);

/** Stable sort by several text keys, first key first. */
export const sortByArabic = <T>(items: T[], ...keys: Array<(item: T) => string>): T[] =>
  [...items].sort((x, y) => {
    for (const key of keys) {
      const diff = compareArabic(key(x), key(y));
      if (diff !== 0) return diff;
    }
    return 0;
  });
