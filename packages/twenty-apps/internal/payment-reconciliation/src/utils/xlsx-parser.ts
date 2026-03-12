import * as XLSX from 'xlsx';

export type ParsedRow = Record<string, unknown>;

// Parse an XLSX buffer, returning rows from the specified sheet as header-keyed objects.
export const parseXlsxSheet = (
  buffer: Buffer,
  sheetName?: string,
): ParsedRow[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const targetSheet = sheetName ?? workbook.SheetNames[0];

  if (!targetSheet || !workbook.Sheets[targetSheet]) {
    const available = workbook.SheetNames.join(', ');

    throw new Error(
      `Sheet "${sheetName}" not found. Available sheets: ${available}`,
    );
  }

  const sheet = workbook.Sheets[targetSheet];

  // Convert sheet to JSON with header row as keys
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, {
    defval: null,
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  return rows;
};

// List available sheet names in a workbook
export const listSheetNames = (buffer: Buffer): string[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  return workbook.SheetNames;
};
