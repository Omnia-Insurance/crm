import * as XLSX from 'xlsx';

// Blast-radius limits for the unpatched xlsx parser. xlsx@0.18.5 has known
// prototype-pollution/ReDoS CVEs; until the dependency is replaced, capping
// input size and output rows bounds the damage a malicious carrier file can do.
export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_PARSED_ROWS = 50_000;

export type ParsedRow = Record<string, unknown>;

export type ParseXlsxSheetOptions = {
  /**
   * 1-based header row (carrierConfig parseSettings.headerRow, OMN-12).
   * Rows ABOVE it are ignored entirely; the row itself becomes the header
   * row of the parsed output. Values ≤ 1 (and absent) keep the historical
   * no-range behavior bit-identical — `range: 0` is deliberately never
   * passed, because on sheets whose !ref does not start at A1 it is not
   * equivalent to omitting the option.
   */
  headerRow?: number;
};

// Parse an XLSX buffer, returning rows from the specified sheet as header-keyed objects.
export const parseXlsxSheet = (
  buffer: Buffer | ArrayBuffer,
  sheetName?: string,
  options: ParseXlsxSheetOptions = {},
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
  //
  // headerRow > 1 passes a numeric `range` (0-based start row): sheet_to_json
  // then keys rows by THAT row's cells and ignores everything above it —
  // banner/title rows in BCBS-style exports never become headers or data.
  const headerRow = options.headerRow ?? 1;
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, {
    defval: null,
    raw: true,
    ...(headerRow > 1 ? { range: headerRow - 1 } : {}),
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
