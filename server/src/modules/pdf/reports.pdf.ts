import { COMPANY_NAME_AR } from '../../config/app';
import {
  FONT_BOLD,
  FONT_REGULAR,
  MARGIN,
  RtlText,
  createPdfDocument,
} from './pdfDocument';
import { formatArabicDate } from './format';

export interface PdfColumn {
  key: string;
  header: string;
  /** Relative weight: columns are scaled to fill the printable width. */
  width: number;
  align?: 'right' | 'left' | 'center';
}

export interface PdfTableInput {
  title: string;
  subtitle?: string;
  meta?: Record<string, string>;
  columns: PdfColumn[];
  rows: Array<Record<string, string | number>>;
  landscape?: boolean;
  summary?: Array<{ label: string; value: string }>;
  footerNote?: string;
}

export const streamToBuffer = (doc: PDFKit.PDFDocument): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });

const PAGE_PADDING = MARGIN;
const FOOTER_SPACE = 22;
const CELL_PAD_X = 6;
const CELL_PAD_Y = 5;
const BODY_SIZE = 10;
const BODY_GAP = 2;
const BRAND = '#7422f0';

/**
 * Column widths that fill the page: every column is at least as wide as its
 * longest unbreakable word (so IDs, passport numbers and dates are not split),
 * and the remaining space is shared by the columns' relative weights.
 */
const columnWidths = (rtl: RtlText, input: PdfTableInput, contentWidth: number): number[] => {
  const longestToken = (text: string, font: string) =>
    Math.max(0, ...text.split(/\s+/).filter(Boolean).map((t) => rtl.measure(t, font, BODY_SIZE)));
  const mins = input.columns.map((column) => {
    const cells = input.rows.map((row) => longestToken(String(row[column.key] ?? ''), FONT_REGULAR));
    const widest = Math.max(longestToken(column.header, FONT_BOLD), ...cells);
    return Math.min(widest + CELL_PAD_X * 2 + 2, contentWidth * 0.35);
  });
  const weights = input.columns.map((c) => Math.max(c.width, 1));

  const minTotal = mins.reduce((sum, m) => sum + m, 0);
  if (minTotal >= contentWidth) return mins.map((m) => (m / minTotal) * contentWidth);

  // Proportional widths; pin columns that would fall below their minimum.
  const pinned = new Set<number>();
  for (;;) {
    const free = contentWidth - [...pinned].reduce((sum, i) => sum + mins[i]!, 0);
    const freeWeight = weights.reduce((sum, w, i) => (pinned.has(i) ? sum : sum + w), 0);
    const widths = weights.map((w, i) => (pinned.has(i) ? mins[i]! : (w / freeWeight) * free));
    const under = widths.findIndex((w, i) => !pinned.has(i) && w < mins[i]!);
    if (under === -1) return widths;
    pinned.add(under);
  }
};

/**
 * Arabic RTL table report: the first column is on the right, columns fill the
 * page proportionally, long values wrap, rows never cross the page bottom and
 * the table header repeats on every page. Pages are numbered at the end.
 */
export const renderTablePdf = async (input: PdfTableInput): Promise<Buffer> => {
  const landscape = input.landscape ?? false;
  const doc = createPdfDocument({
    size: landscape ? 'A4-Landscape' : 'A4',
    info: { Title: input.title, Author: COMPANY_NAME_AR, Subject: input.title },
  });

  const rtl = new RtlText(doc);
  rtl.registerFonts();

  const contentWidth = doc.page.width - PAGE_PADDING * 2;
  const bottomLimit = doc.page.height - PAGE_PADDING - FOOTER_SPACE;
  const right = PAGE_PADDING + contentWidth;

  const widths = columnWidths(rtl, input, contentWidth);
  // Column geometry, laid out right-to-left (first column on the right).
  const columns = (() => {
    let edge = right;
    return input.columns.map((column, i) => {
      const width = widths[i]!;
      edge -= width;
      return { ...column, x: edge, width };
    });
  })();

  const drawHeader = (firstPage: boolean): number => {
    let y = PAGE_PADDING;
    doc.fillColor(BRAND);
    y += rtl.draw(COMPANY_NAME_AR, PAGE_PADDING, y, {
      width: contentWidth,
      align: 'right',
      font: FONT_BOLD,
      size: firstPage ? 15 : 11,
    });
    doc.fillColor('#111827');
    y += rtl.draw(input.subtitle && !firstPage ? `${input.title} — ${input.subtitle}` : input.title, PAGE_PADDING, y, {
      width: contentWidth,
      align: 'right',
      font: FONT_BOLD,
      size: firstPage ? 14 : 11,
    });

    if (firstPage) {
      if (input.subtitle) {
        doc.fillColor('#4b5563');
        y += rtl.draw(input.subtitle, PAGE_PADDING, y, { width: contentWidth, align: 'right', size: 11 });
      }
      const metaEntries = Object.entries(input.meta ?? {}).filter(([, v]) => Boolean(v));
      if (metaEntries.length > 0) {
        doc.fillColor('#6b7280');
        const text = metaEntries.map(([k, v]) => `${k}: ${v}`).join('   |   ');
        y += rtl.draw(text, PAGE_PADDING, y, { width: contentWidth, align: 'right', size: 10 });
      }
      doc.fillColor('#9ca3af');
      y += rtl.draw(`تاريخ التقرير: ${formatArabicDate(new Date())}`, PAGE_PADDING, y, {
        width: contentWidth,
        align: 'right',
        size: 10,
      });
    }

    y += 6;
    doc.moveTo(PAGE_PADDING, y).lineTo(right, y).strokeColor(BRAND).lineWidth(1.2).stroke();
    return y + 12;
  };

  const headerOptions = { font: FONT_BOLD, size: BODY_SIZE, lineGap: BODY_GAP };
  const tableHeaderHeight =
    Math.max(...columns.map((c) => rtl.height(c.header, c.width - CELL_PAD_X * 2, headerOptions))) +
    CELL_PAD_Y * 2;

  const drawTableHeader = (y: number): number => {
    doc.rect(PAGE_PADDING, y, contentWidth, tableHeaderHeight).fill(BRAND);
    for (const column of columns) {
      doc.fillColor('#ffffff');
      rtl.draw(column.header, column.x + CELL_PAD_X, y + CELL_PAD_Y, {
        ...headerOptions,
        width: column.width - CELL_PAD_X * 2,
        align: column.align ?? 'right',
      });
    }
    return y + tableHeaderHeight;
  };

  const bodyOptions = { font: FONT_REGULAR, size: BODY_SIZE, lineGap: BODY_GAP };
  const cellText = (row: Record<string, string | number>, key: string) => String(row[key] ?? '');
  const rowHeightOf = (row: Record<string, string | number>) =>
    Math.max(
      ...columns.map((c) => rtl.height(cellText(row, c.key), c.width - CELL_PAD_X * 2, bodyOptions)),
    ) +
    CELL_PAD_Y * 2;

  const newPage = (): number => {
    doc.addPage();
    return drawTableHeader(drawHeader(false));
  };

  let y = drawTableHeader(drawHeader(true));

  if (input.rows.length === 0) {
    doc.fillColor('#6b7280');
    y += 8 + rtl.draw('لا توجد بيانات مطابقة لعوامل التصفية الحالية.', PAGE_PADDING, y + 8, {
      width: contentWidth,
      align: 'center',
      size: 12,
    });
  }

  input.rows.forEach((row, index) => {
    const rowHeight = rowHeightOf(row);
    if (y + rowHeight > bottomLimit) y = newPage();

    if (index % 2 === 1) doc.rect(PAGE_PADDING, y, contentWidth, rowHeight).fill('#f6f8fb');
    for (const column of columns) {
      doc.fillColor('#111827');
      rtl.draw(cellText(row, column.key), column.x + CELL_PAD_X, y + CELL_PAD_Y, {
        ...bodyOptions,
        width: column.width - CELL_PAD_X * 2,
        align: column.align ?? 'right',
      });
    }
    doc
      .moveTo(PAGE_PADDING, y + rowHeight)
      .lineTo(right, y + rowHeight)
      .strokeColor('#e5e7eb')
      .lineWidth(0.5)
      .stroke();
    y += rowHeight;
  });

  if (input.summary && input.summary.length > 0) {
    const labelWidth = Math.min(260, contentWidth * 0.45);
    const valueWidth = contentWidth - 24 - labelWidth;
    const itemHeights = input.summary.map((item) =>
      Math.max(
        rtl.height(item.label, labelWidth, { size: 11 }),
        rtl.height(item.value, valueWidth, { font: FONT_BOLD, size: 11 }),
      ),
    );
    const boxHeight = 34 + itemHeights.reduce((sum, h) => sum + h, 0);
    y += 14;
    if (y + boxHeight > bottomLimit) {
      doc.addPage();
      y = drawHeader(false);
    }
    doc.rect(PAGE_PADDING, y, contentWidth, boxHeight).fill('#f3f6fa');
    let sy = y + 10;
    doc.fillColor(BRAND);
    sy += rtl.draw('الإجماليات', PAGE_PADDING + 12, sy, {
      width: contentWidth - 24,
      align: 'right',
      font: FONT_BOLD,
      size: 12,
    });
    input.summary.forEach((item, i) => {
      doc.fillColor('#111827');
      rtl.draw(item.label, right - 12 - labelWidth, sy, { width: labelWidth, align: 'right', size: 11 });
      rtl.draw(item.value, PAGE_PADDING + 12, sy, {
        width: valueWidth,
        align: 'left',
        font: FONT_BOLD,
        size: 11,
      });
      sy += itemHeights[i]!;
    });
    y += boxHeight;
  }

  if (input.footerNote) {
    const noteHeight = rtl.height(input.footerNote, contentWidth, { size: 9 });
    y += 14;
    if (y + noteHeight > bottomLimit) {
      doc.addPage();
      y = drawHeader(false);
    }
    doc.fillColor('#6b7280');
    rtl.draw(input.footerNote, PAGE_PADDING, y, { width: contentWidth, align: 'center', size: 9 });
  }

  // Page numbers (drawn inside the bottom margin, which must not trigger a
  // new page).
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor('#9ca3af');
    rtl.draw(`صفحة ${i + 1} من ${range.count}`, PAGE_PADDING, doc.page.height - PAGE_PADDING - 6, {
      width: contentWidth,
      align: 'center',
      size: 9,
    });
    doc.page.margins.bottom = savedBottom;
  }

  return streamToBuffer(doc);
};

/** Delegate account export: required per trip, payments, and the totals. */
export const renderStatementPdf = async (input: {
  delegate: { name: string; phone: string; address: string };
  statusLabel: string;
  columns: PdfColumn[];
  rows: Array<Record<string, string | number>>;
  summary: Array<{ label: string; value: string }>;
}): Promise<Buffer> =>
  renderTablePdf({
    title: 'حساب المندوب',
    subtitle: input.delegate.name,
    meta: {
      الهاتف: input.delegate.phone,
      العنوان: input.delegate.address,
      'حالة الحساب': input.statusLabel,
    },
    columns: input.columns,
    rows: input.rows,
    landscape: true,
    summary: input.summary,
    footerNote:
      'المطلوب محسوب من عدد المعتمرين الحاليين × سعر الفرد المتفق عليه لكل رحلة، والمدفوع من الدفعات السارية.',
  });
