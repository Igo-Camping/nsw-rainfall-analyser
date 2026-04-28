import { autoFitSheet } from './exportHelpers.js';

export function appendWorkbookSheet(wb, name, rows) {
  if (!rows?.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitSheet(ws);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}
