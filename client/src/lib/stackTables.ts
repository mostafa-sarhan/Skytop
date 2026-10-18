/**
 * Card layouts for list tables marked `stack-on-phone` / `stack-on-tablet`:
 * CSS turns each row into a card and shows `data-label` (the column header)
 * with each value. This fills those labels from the table's own header, so
 * tables only need the class. Re-run on DOM changes (see AppLayout); only
 * writes when a label actually changes.
 */
export const labelStackTables = (root: ParentNode = document): void => {
  for (const table of root.querySelectorAll<HTMLTableElement>('table.stack-on-phone, table.stack-on-tablet')) {
    const headers: string[] = [];
    for (const th of table.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th')) {
      for (let i = 0; i < th.colSpan; i += 1) headers.push(th.textContent?.trim() ?? '');
    }
    for (const row of table.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
      let column = 0;
      for (const cell of row.cells) {
        const label = cell.colSpan > 1 ? '' : (headers[column] ?? '');
        if (cell.dataset.label !== label) cell.dataset.label = label;
        column += cell.colSpan;
      }
    }
  }
};
