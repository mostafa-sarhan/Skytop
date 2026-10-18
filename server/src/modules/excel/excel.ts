import ExcelJS from 'exceljs';

export interface ExcelColumn {
  key: string;
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  /** Numeric money column (2 decimals). Other numbers are whole counts. */
  money?: boolean;
}

export interface ExcelInput {
  sheetName: string;
  title?: string;
  /** Context lines under the title, e.g. الرحلة / المندوب / تاريخ السفر. */
  context?: Array<{ label: string; value: string | number }>;
  columns: ExcelColumn[];
  rows: Array<Record<string, string | number>>;
  summary?: Array<{ label: string; value: string | number }>;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF7422F0' },
};

const ALT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF6F8FB' },
};

export const buildExcelBuffer = async (input: ExcelInput): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sky Top';
  workbook.created = new Date();

  // Rows above the table header (title + context + spacer) stay frozen with it.
  const contextRows = input.context?.length ? input.context.length + 1 : 0;
  const headerRowIndex = (input.title ? 1 : 0) + contextRows + 1;
  const sheet = workbook.addWorksheet(input.sheetName.slice(0, 31), {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: headerRowIndex }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;

  let rowIndex = 1;

  if (input.title) {
    sheet.mergeCells(rowIndex, 1, rowIndex, input.columns.length);
    const titleCell = sheet.getCell(rowIndex, 1);
    titleCell.value = input.title;
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF7422F0' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(rowIndex).height = 26;
    rowIndex += 1;
  }

  if (input.context?.length) {
    for (const item of input.context) {
      sheet.mergeCells(rowIndex, 2, rowIndex, Math.max(2, input.columns.length));
      const label = sheet.getCell(rowIndex, 1);
      label.value = item.label;
      label.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF4B5563' } };
      label.alignment = { horizontal: 'right' };
      const value = sheet.getCell(rowIndex, 2);
      value.value = item.value;
      value.font = { name: 'Arial', size: 10, bold: true };
      value.alignment = { horizontal: 'right' };
      rowIndex += 1;
    }
    rowIndex += 1;
  }

  const headerRow = sheet.getRow(rowIndex);
  input.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.fill = HEADER_FILL;
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF7422F0' } },
      top: { style: 'thin', color: { argb: 'FF7422F0' } },
      left: { style: 'thin', color: { argb: 'FF7422F0' } },
      right: { style: 'thin', color: { argb: 'FF7422F0' } },
    };
    sheet.getColumn(index + 1).width = column.width;
  });
  headerRow.height = 22;
  rowIndex += 1;

  input.rows.forEach((row) => {
    const dataRow = sheet.getRow(rowIndex);
    input.columns.forEach((column, index) => {
      const cell = dataRow.getCell(index + 1);
      const raw = row[column.key];
      cell.value = raw === undefined || raw === null ? '' : raw;
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = {
        horizontal: column.align ?? 'right',
        vertical: 'middle',
        wrapText: true,
      };
      if (typeof raw === 'number') cell.numFmt = column.money ? '#,##0.00' : '0';
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        left: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        right: { style: 'hair', color: { argb: 'FFE5E7EB' } },
      };
      if ((rowIndex - headerRowIndex) % 2 === 0) cell.fill = ALT_FILL;
    });
    // No fixed height: wrapped names / addresses keep their full text.
    rowIndex += 1;
  });

  if (input.summary && input.summary.length > 0) {
    rowIndex += 1;
    input.summary.forEach((item) => {
      sheet.mergeCells(rowIndex, 1, rowIndex, Math.max(1, input.columns.length - 1));
      const labelCell = sheet.getCell(rowIndex, 1);
      labelCell.value = item.label;
      labelCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF7422F0' } };
      labelCell.alignment = { horizontal: 'right' };
      const valueCell = sheet.getCell(rowIndex, input.columns.length);
      valueCell.value = item.value;
      valueCell.font = { name: 'Arial', size: 11, bold: true };
      valueCell.alignment = { horizontal: 'left' };
      rowIndex += 1;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
