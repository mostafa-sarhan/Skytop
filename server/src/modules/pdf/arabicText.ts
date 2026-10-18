import bidiFactory from 'bidi-js';

/**
 * Arabic / bidi text preparation for PDFKit — the single place that knows how
 * mixed Arabic + Latin + digits must be handed to the PDF engine.
 *
 * How the pieces fit:
 * - PDFKit lays text out with fontkit, which DOES perform OpenType shaping
 *   (joined Arabic letters, lam-alef ligatures, marks). Text must therefore be
 *   passed in LOGICAL order and never pre-shaped into presentation forms.
 * - fontkit decides the direction of a run from its first character that has
 *   a real script: an Arabic one makes the run RTL and fontkit reverses the
 *   glyphs. It does not run the Unicode bidi algorithm, so a mixed line (e.g.
 *   Arabic with a date) would come out with reversed digits.
 * - Arabic letters never join across a space, so each word can be shaped on
 *   its own. pdfDocument.ts draws word by word (positions computed there), which
 *   also lets PDFKit reuse its per-word shaping cache — fontkit shaping is the
 *   slow part of long reports.
 *
 * So each line is split here into directional runs with the Unicode Bidi
 * Algorithm (bidi-js), the runs are put in visual (left-to-right) order, RTL
 * brackets are mirrored, and every word is handed to fontkit so that fontkit's
 * own reversal yields the correct visual order. No manual string reversal is
 * applied to Arabic letters.
 */

const bidi = bidiFactory();

const STRONG_RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const HAS_REAL_SCRIPT = /[^\p{Script=Common}\p{Script=Inherited}\p{Script=Unknown}]/u;

/** Same rule fontkit uses: RTL iff the first character with a script is RTL. */
const fontkitLaysOutRtl = (text: string): boolean => {
  const first = text.match(HAS_REAL_SCRIPT);
  return first !== null && STRONG_RTL.test(first[0]);
};

const reverseCodePoints = (text: string): string => Array.from(text).reverse().join('');

export interface VisualRun {
  /** String to pass to PDFKit for this run. */
  text: string;
  /** The run's characters in logical order (before any compensation). */
  logical: string;
  /** Whether the run reads right-to-left (odd bidi level). */
  rtl: boolean;
}

/**
 * Paragraph direction: RTL when the text contains Arabic letters, LTR
 * otherwise. Pure numbers, money, dates and Latin codes therefore keep their
 * natural order (e.g. "-11,500.00", "2026-10-18", "IP-778").
 */
export const paragraphDirection = (text: string): 'rtl' | 'ltr' =>
  STRONG_RTL.test(text) ? 'rtl' : 'ltr';

/**
 * Splits ONE line (no newlines) into runs in visual left-to-right order, each
 * prepared so that PDFKit/fontkit renders it correctly.
 */
export const toVisualRuns = (line: string): VisualRun[] => {
  if (line.length === 0) return [];
  const levels = bidi.getEmbeddingLevels(line, paragraphDirection(line));
  const mirrors = bidi.getMirroredCharactersMap(line, levels.levels);
  const chars = line.split('');
  for (const [index, mirrored] of mirrors) chars[index] = mirrored;

  // Visual order of logical indices, then grouped back into level runs.
  const order = bidi.getReorderedIndices(line, levels);
  const runs: Array<{ from: number; to: number; level: number }> = [];
  for (const index of order) {
    const level = levels.levels[index]!;
    const last = runs[runs.length - 1];
    const contiguous =
      last !== undefined &&
      last.level === level &&
      (level % 2 === 1 ? index === last.from - 1 : index === last.to + 1);
    if (contiguous) {
      if (level % 2 === 1) last.from = index;
      else last.to = index;
    } else {
      runs.push({ from: index, to: index, level });
    }
  }

  return runs.map(({ from, to, level }) => {
    const logical = chars.slice(from, to + 1).join('');
    const rtl = level % 2 === 1;
    // fontkit reverses some runs on its own; compensate only when its choice
    // differs from the bidi result (e.g. an RTL run of punctuation only).
    const text = fontkitLaysOutRtl(logical) === rtl ? logical : reverseCodePoints(logical);
    return { text, logical, rtl };
  });
};

/**
 * One word of a run, drawn on its own: apply the same rule per word, so a
 * word fontkit would lay out in the other direction is compensated.
 */
export const wordForFontkit = (logicalWord: string, rtl: boolean): string =>
  fontkitLaysOutRtl(logicalWord) === rtl ? logicalWord : reverseCodePoints(logicalWord);
