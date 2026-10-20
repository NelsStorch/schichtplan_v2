/** CSV-Zelle für Excel (Semikolon). Formeln am Anfang werden entschärft, damit Excel nichts ausführt. */
export function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV mit BOM herunterladen, damit Excel die Umlaute richtig liest */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const content = rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const PRINT_CSS = `
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 12px; margin: 0 0 16px; }
  h2 { font-size: 16px; margin: 22px 0 6px; break-after: avoid; }
  h3 { font-size: 13px; margin: 14px 0 4px; break-after: avoid; }
  h2 small, h3 small { font-weight: normal; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; break-inside: avoid; margin-bottom: 6px; }
  th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  .box { width: 32px; text-align: center; }
  .muted { color: #777; }
  @media print { .day { break-before: page; } .day:first-of-type { break-before: auto; } }
`;

/**
 * Druckansicht in einem neuen Fenster öffnen. `bodyHtml` muss bereits escaped sein.
 * Gibt false zurück, wenn der Browser das Fenster blockiert hat.
 */
export function openPrintWindow(title: string, bodyHtml: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
