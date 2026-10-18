import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { PDF_TEXT_FEATURES, toVisualRuns } from './arabicText';

export const FONT_REGULAR = 'AmiriRegular';
export const FONT_BOLD = 'AmiriBold';

/**
 * Bundled Amiri fonts (Arabic + Latin + digits, OFL). They sit next to this
 * module in src/ and are copied next to the compiled module by `npm run build`
 * (dist/src/modules/pdf/fonts), so __dirname resolves in dev and production.
 */
const FONTS_DIR = path.resolve(__dirname, 'fonts');
const FONT_FILES: Record<string, string> = {
  [FONT_REGULAR]: path.join(FONTS_DIR, 'Amiri-Regular.ttf'),
  [FONT_BOLD]: path.join(FONTS_DIR, 'Amiri-Bold.ttf'),
};

export const MARGIN = 40;

export interface LayoutLine {
  logical: string;
  height: number;
}

export interface TextLayoutOptions {
  font?: string;
  size?: number;
  align?: 'right' | 'left' | 'center';
  lineGap?: number;
}

/**
 * Amiri's line box (ascent+descent) is 1.76em, far taller than its text needs.
 * Lines are stacked at 1.55em and the glyphs shifted up by half the
 * difference, which keeps them centred without clipping.
 */
const LINE_HEIGHT_EM = 1.55;

const normalize = (text: unknown): string =>
  text === null || text === undefined ? '' : String(text);

/**
 * Draws Arabic / mixed-direction text with PDFKit. Wrapping happens on the
 * logical string; every resulting line is converted to visual runs by
 * arabicText.ts (bidi + mirroring) and the runs are placed left to right.
 */
export class RtlText {
  constructor(private readonly doc: PDFKit.PDFDocument) {}

  registerFonts(): void {
    for (const [name, file] of Object.entries(FONT_FILES)) {
      if (!fs.existsSync(file)) {
        throw new Error(`PDF font not found: ${file} (run "npm run build" to copy fonts)`);
      }
      this.doc.registerFont(name, file);
    }
  }

  private withFont(font: string, size: number): void {
    this.doc.font(font).fontSize(size);
  }

  private runWidth(text: string): number {
    return this.doc.widthOfString(text, { features: PDF_TEXT_FEATURES });
  }

  /** Width of a single line once shaped, in the current font. */
  private lineWidth(line: string): number {
    return toVisualRuns(line).reduce((sum, run) => sum + this.runWidth(run.text), 0);
  }

  measure(text: string, font = FONT_REGULAR, size = 11): number {
    this.withFont(font, size);
    return Math.max(0, ...normalize(text).split('\n').map((line) => this.lineWidth(line)));
  }

  /** Breaks a token that is wider than the column (long codes, numbers). */
  private splitLongToken(token: string, maxWidth: number): string[] {
    const parts: string[] = [];
    let current = '';
    for (const char of Array.from(token)) {
      if (current && this.lineWidth(current + char) > maxWidth) {
        parts.push(current);
        current = char;
      } else {
        current += char;
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  layout(text: string, maxWidth: number, options: TextLayoutOptions = {}): LayoutLine[] {
    const font = options.font ?? FONT_REGULAR;
    const size = options.size ?? 11;
    const lineGap = options.lineGap ?? 4;
    this.withFont(font, size);

    const lineHeight = Math.min(this.doc.currentLineHeight(), size * LINE_HEIGHT_EM) + lineGap;
    const out: LayoutLine[] = [];

    for (const paragraph of normalize(text).split('\n')) {
      const words = paragraph
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .flatMap((w) => (this.lineWidth(w) > maxWidth ? this.splitLongToken(w, maxWidth) : [w]));
      if (words.length === 0) {
        out.push({ logical: '', height: lineHeight });
        continue;
      }

      let current = words[0]!;
      for (let i = 1; i < words.length; i += 1) {
        const candidate = `${current} ${words[i]}`;
        if (this.lineWidth(candidate) <= maxWidth) {
          current = candidate;
        } else {
          out.push({ logical: current, height: lineHeight });
          current = words[i]!;
        }
      }
      out.push({ logical: current, height: lineHeight });
    }

    return out;
  }

  /** Total height `text` will take when drawn with `draw` at this width. */
  height(text: string, width: number, options: TextLayoutOptions = {}): number {
    return this.layout(text, width, options).reduce((sum, line) => sum + line.height, 0);
  }

  draw(
    text: string,
    x: number,
    y: number,
    options: TextLayoutOptions & { width: number },
  ): number {
    const { font = FONT_REGULAR, size = 11, align = 'right', lineGap = 4, width } = options;
    const lines = this.layout(text, width, { font, size, lineGap });
    this.withFont(font, size);
    const lift = Math.max(0, (this.doc.currentLineHeight() - size * LINE_HEIGHT_EM) / 2);
    let cursor = y;

    for (const line of lines) {
      const runs = toVisualRuns(line.logical);
      const widths = runs.map((run) => this.runWidth(run.text));
      const total = widths.reduce((sum, w) => sum + w, 0);
      let cx = align === 'left' ? x : align === 'center' ? x + (width - total) / 2 : x + width - total;
      runs.forEach((run, index) => {
        this.doc.text(run.text, cx, cursor - lift, { lineBreak: false, features: PDF_TEXT_FEATURES });
        cx += widths[index]!;
      });
      cursor += line.height;
    }

    return cursor - y;
  }
}

export interface CreatePdfOptions {
  info?: { Title?: string; Author?: string; Subject?: string; Keywords?: string };
  margin?: number;
  size?: 'A4' | 'A4-Landscape';
}

export const createPdfDocument = (options: CreatePdfOptions = {}): PDFKit.PDFDocument => {
  const margin = options.margin ?? MARGIN;
  const landscape = options.size === 'A4-Landscape';
  const doc = new PDFDocument({
    size: 'A4',
    layout: landscape ? 'landscape' : 'portrait',
    margin,
    info: {
      Title: options.info?.Title ?? '',
      Author: options.info?.Author ?? '',
      Subject: options.info?.Subject ?? '',
      Keywords: options.info?.Keywords ?? '',
      CreationDate: new Date(),
    },
    autoFirstPage: true,
    bufferPages: true,
  });

  return doc;
};
