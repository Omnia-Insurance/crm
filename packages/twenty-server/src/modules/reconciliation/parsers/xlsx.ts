import * as XLSX from 'xlsx';

// Blast-radius limits for the unpatched xlsx parser. xlsx@0.18.5 has known
// prototype-pollution/ReDoS CVEs; until the dependency is replaced, capping
// input size and output rows bounds the damage a malicious carrier file can do.
export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_PARSED_ROWS = 50_000;

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
  // cellFormula/cellHTML: false — formulae (.f) and HTML renderings (.h) are
  // never read by sheet_to_json (it returns .v values), so skipping them is
  // output-neutral and shrinks the attack surface of the untrusted parse.
  // cellText (.w) is left at its default: sheet_to_json can fall back to
  // formatted text in edge cases, so flipping it could change cell values.
  const workbook = XLSX.read(buffer, {
    type,
    cellDates: false,
    raw: true,
    cellFormula: false,
    cellHTML: false,
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

  if (rows.length > MAX_PARSED_ROWS) {
    throw new Error(
      `Sheet "${targetSheet}" has ${rows.length} rows, exceeding the maximum of ${MAX_PARSED_ROWS}. Split the file into smaller batches.`,
    );
  }

  return rows;
};

// List available sheet names in a workbook
export const listSheetNames = (buffer: Buffer): string[] => {
  // bookSheets: true parses sheet names only, skipping cell content entirely —
  // minimal exposure of the untrusted buffer to the unpatched parser.
  const workbook = XLSX.read(buffer, { type: 'buffer', bookSheets: true });

  return workbook.SheetNames;
};
