/**
 * Exportiert Daten als CSV mit UTF-8 BOM für optimale Kompatibilität mit Excel auf macOS & Windows.
 * Verwendet Semikolon als Trennzeichen (Schweizer Standard in Excel).
 *
 * Unterstützt zwei Signaturen:
 * 1) downloadCsv(filename, headers, rows)
 * 2) downloadCsv(rowsAsObjects, filename)
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void;
export function downloadCsv(
  rows: Record<string, unknown>[],
  filename: string
): void;
export function downloadCsv(
  arg1: string | Record<string, unknown>[],
  arg2?: string | string[],
  arg3?: (string | number | boolean | null | undefined)[][]
): void {
  let filename = 'export.csv';
  let headers: string[] = [];
  let rows: (string | number | boolean | null | undefined)[][] = [];

  const escapeCell = (cell: unknown): string => {
    if (cell === null || cell === undefined) return '';
    const str = String(cell);
    if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  if (typeof arg1 === 'string') {
    filename = arg1;
    if (Array.isArray(arg2) && Array.isArray(arg3)) {
      headers = arg2;
      rows = arg3;
    }
  } else if (Array.isArray(arg1)) {
    filename = typeof arg2 === 'string' ? arg2 : 'export.csv';
    const objs = arg1;
    if (objs.length > 0) {
      headers = Object.keys(objs[0]);
      rows = objs.map((obj) => headers.map((h) => obj[h] as string | number | boolean | null | undefined));
    }
  }

  const lines = [
    headers.map(escapeCell).join(';'),
    ...rows.map((row) => row.map(escapeCell).join(';')),
  ];

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
