/**
 * Phone layout for list tables marked `stack-on-phone`: CSS turns each row
 * into a stacked block and shows `data-label` (the column header) beside each
 * value. This fills those labels from the table's own header, so tables only
 * need the class. Re-run on DOM changes (see AppLayout); only writes when a
 * label actually changes.
 */
export const labelStackTables = (root: ParentNode = document): void => {
  for (const table of root.querySelectorAll<HTMLTableElement>('table.stack-on-phone')) {
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
