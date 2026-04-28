import * as XLSX from 'xlsx';

export type ParsedRow = Record<string, unknown>;

// Parse an XLSX buffer, returning rows from the specified sheet as header-keyed objects.
export const parseXlsxSheet = (
  buffer: Buffer | ArrayBuffer,
  sheetName?: string,
): ParsedRow[] => {
  const type = buffer instanceof ArrayBuffer ? 'array' : 'buffer';
  // raw: true on READ — critical. Without it, xlsx converts CSV date-like
  // strings ("01/01/2026") to Excel serials + applies timezone-aware format
  // output, producing shifted values like "12/31/25" (1-day back, 2-digit year).
  // raw: true preserves the original CSV cell strings.
  const workbook = XLSX.read(buffer, {
    type,
    cellDates: false,
    raw: true,
  } as XLSX.ParsingOptions);

  const targetSheet = sheetName ?? workbook.SheetNames[0];

  if (!targetSheet || !workbook.Sheets[targetSheet]) {
    const available = workbook.SheetNames.join(', ');

    throw new Error(
      `Sheet "${sheetName}" not found. Available sheets: ${available}`,
    );
  }

  const sheet = workbook.Sheets[targetSheet];

  // With raw: true on read, cells are preserved as raw strings (CSV) or
  // serials (XLSX date cells). raw: true here keeps them as-is.
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, {
    defval: null,
    raw: true,
  });

  return rows;
};

// List available sheet names in a workbook
export const listSheetNames = (buffer: Buffer): string[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  return workbook.SheetNames;
};
