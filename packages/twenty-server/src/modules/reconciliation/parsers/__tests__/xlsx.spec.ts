// Guards around the unpatched xlsx parser (0.18.5, known
// prototype-pollution/ReDoS CVEs): row-count cap, byte cap, and
// regression coverage that hardened read options keep cell values identical.

import * as XLSX from 'xlsx';

import { type DataSource } from 'typeorm';

import { type FileStorageService } from 'src/engine/core-modules/file-storage/file-storage.service';
import { type FileService } from 'src/engine/core-modules/file/services/file.service';
import {
  MAX_PARSED_ROWS,
  MAX_SOURCE_FILE_BYTES,
  parseXlsxSheet,
} from 'src/modules/reconciliation/parsers/xlsx';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { type ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { type ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';

const buildXlsxBuffer = (rows: unknown[][], sheetName = 'Sheet1'): Buffer => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    sheetName,
  );

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

describe('parseXlsxSheet', () => {
  it('parses a small sheet preserving raw cell values', () => {
    const buffer = buildXlsxBuffer([
      ['Policy Number', 'Effective Date', 'Amount'],
      ['U123', '01/01/2026', 42.5],
      ['U456', '12/31/2025', 0],
    ]);

    const rows = parseXlsxSheet(buffer);

    expect(rows).toEqual([
      // Date-like strings must stay raw strings (no Excel serial conversion)
      { 'Policy Number': 'U123', 'Effective Date': '01/01/2026', Amount: 42.5 },
      { 'Policy Number': 'U456', 'Effective Date': '12/31/2025', Amount: 0 },
    ]);
  });

  it('surfaces cached values for formula cells with formula parsing disabled', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['a', 'b', 'sum']]);

    sheet['A2'] = { t: 'n', v: 1 };
    sheet['B2'] = { t: 'n', v: 2 };
    sheet['C2'] = { t: 'n', v: 3, f: 'A2+B2' };
    sheet['!ref'] = 'A1:C2';

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const rows = parseXlsxSheet(buffer);

    expect(rows).toEqual([{ a: 1, b: 2, sum: 3 }]);
  });

  it('parses CSV buffers preserving raw date strings', () => {
    const buffer = Buffer.from(
      'Policy Number,Effective Date\nU123,01/01/2026\n',
    );

    const rows = parseXlsxSheet(buffer);

    expect(rows).toEqual([
      { 'Policy Number': 'U123', 'Effective Date': '01/01/2026' },
    ]);
  });

  it('accepts a sheet with exactly MAX_PARSED_ROWS rows', () => {
    const aoa: unknown[][] = [['id']];

    for (let rowIndex = 0; rowIndex < MAX_PARSED_ROWS; rowIndex++) {
      aoa.push([rowIndex]);
    }

    const rows = parseXlsxSheet(buildXlsxBuffer(aoa));

    expect(rows).toHaveLength(MAX_PARSED_ROWS);
  });

  it('throws when row count exceeds MAX_PARSED_ROWS', () => {
    const aoa: unknown[][] = [['id']];

    for (let rowIndex = 0; rowIndex < MAX_PARSED_ROWS + 1; rowIndex++) {
      aoa.push([rowIndex]);
    }

    expect(() => parseXlsxSheet(buildXlsxBuffer(aoa))).toThrow(
      `has ${MAX_PARSED_ROWS + 1} rows, exceeding the maximum of ${MAX_PARSED_ROWS}`,
    );
  });

  it('throws a descriptive error for a missing sheet', () => {
    const buffer = buildXlsxBuffer([['a'], [1]]);

    expect(() => parseXlsxSheet(buffer, 'Missing')).toThrow(
      'Sheet "Missing" not found. Available sheets: Sheet1',
    );
  });
});

describe('ReconciliationAttachmentService.readSourceFile', () => {
  // getWorkspaceSchemaName requires a real UUID (base36 conversion)
  const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
  const reconciliationId = '20202020-aaaa-4bbb-8ccc-000000000001';

  const defaultAttachmentRow = {
    id: 'attachment-id',
    name: 'bob.xlsx',
    file: [{ fileId: 'file-id' }],
  };

  const buildService = ({
    buffer = Buffer.from('small file'),
    pinnedAttachmentId = null as string | null,
    queryResults = [[defaultAttachmentRow]] as unknown[][],
    pinWriteFails = false,
  } = {}) => {
    const fileService = {
      getFileContentById: jest.fn().mockResolvedValue({ buffer }),
    } as unknown as FileService;

    const query = jest.fn();

    for (const result of queryResults) {
      query.mockResolvedValueOnce(result);
    }
    query.mockResolvedValue([]);

    const dataSource = { query } as unknown as DataSource;

    const getReconciliation = jest.fn().mockResolvedValue({
      id: reconciliationId,
      sourceAttachmentId: pinnedAttachmentId,
    });
    const dataService = {
      getReconciliation,
    } as unknown as ReconciliationDataService;

    const updateReconciliation = pinWriteFails
      ? jest.fn().mockRejectedValue(new Error('column does not exist'))
      : jest.fn().mockResolvedValue(undefined);
    const mutationService = {
      updateReconciliation,
    } as unknown as ReconciliationMutationService;

    const service = new ReconciliationAttachmentService(
      {} as FileStorageService,
      fileService,
      dataSource,
      dataService,
      mutationService,
    );

    return { service, query, updateReconciliation };
  };

  describe('byte cap', () => {
    it('throws when the source file exceeds MAX_SOURCE_FILE_BYTES', async () => {
      const oversizedBuffer = Buffer.alloc(MAX_SOURCE_FILE_BYTES + 1);
      const { service } = buildService({ buffer: oversizedBuffer });

      await expect(
        service.readSourceFile(workspaceId, reconciliationId),
      ).rejects.toThrow(
        `is ${MAX_SOURCE_FILE_BYTES + 1} bytes, exceeding the maximum of ${MAX_SOURCE_FILE_BYTES} bytes`,
      );
    });

    it('returns the buffer when the source file is within the cap', async () => {
      const smallBuffer = Buffer.from('small file');
      const { service } = buildService({ buffer: smallBuffer });

      const result = await service.readSourceFile(
        workspaceId,
        reconciliationId,
      );

      expect(result).toBe(smallBuffer);
    });
  });

  describe('source attachment pinning', () => {
    it('reads the pinned attachment when sourceAttachmentId is set and does not re-pin', async () => {
      const { service, query, updateReconciliation } = buildService({
        pinnedAttachmentId: 'pinned-id',
        queryResults: [[{ ...defaultAttachmentRow, id: 'pinned-id' }]],
      });

      await service.readSourceFile(workspaceId, reconciliationId);

      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('WHERE id = $1');
      expect(query.mock.calls[0][1]).toEqual(['pinned-id', reconciliationId]);
      expect(updateReconciliation).not.toHaveBeenCalled();
    });

    it('falls back to the newest spreadsheet attachment and pins the choice', async () => {
      const { service, query, updateReconciliation } = buildService();

      await service.readSourceFile(workspaceId, reconciliationId);

      // No pinned id → single fallback query filtered by extension
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain(String.raw`\.(xlsx|xls|csv)$`);
      expect(query.mock.calls[0][0]).toContain('ORDER BY "createdAt" DESC');

      expect(updateReconciliation).toHaveBeenCalledWith(
        workspaceId,
        reconciliationId,
        { sourceAttachmentId: 'attachment-id' },
      );
    });

    it('falls back when the pinned attachment no longer exists', async () => {
      const { service, query, updateReconciliation } = buildService({
        pinnedAttachmentId: 'deleted-id',
        queryResults: [
          [], // pinned lookup misses
          [defaultAttachmentRow], // extension fallback hits
        ],
      });

      const result = await service.readSourceFile(
        workspaceId,
        reconciliationId,
      );

      expect(result).toEqual(Buffer.from('small file'));
      expect(query).toHaveBeenCalledTimes(2);
      expect(updateReconciliation).toHaveBeenCalledWith(
        workspaceId,
        reconciliationId,
        { sourceAttachmentId: 'attachment-id' },
      );
    });

    it('throws when no spreadsheet-extension attachment exists', async () => {
      const { service } = buildService({ queryResults: [[]] });

      await expect(
        service.readSourceFile(workspaceId, reconciliationId),
      ).rejects.toThrow(
        `No spreadsheet attachment (.xlsx/.xls/.csv) found for reconciliation ${reconciliationId}`,
      );
    });

    it('still returns the file when pin persistence fails (field not yet seeded)', async () => {
      const { service, updateReconciliation } = buildService({
        pinWriteFails: true,
      });

      const result = await service.readSourceFile(
        workspaceId,
        reconciliationId,
      );

      expect(result).toEqual(Buffer.from('small file'));
      expect(updateReconciliation).toHaveBeenCalled();
    });
  });
});
