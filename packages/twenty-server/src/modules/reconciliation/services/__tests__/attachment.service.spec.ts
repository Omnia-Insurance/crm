import { Logger } from '@nestjs/common';

import { Readable } from 'stream';

import { FileFolder } from 'twenty-shared/types';
import { type DataSource } from 'typeorm';

import { type FileStorageService } from 'src/engine/core-modules/file-storage/services/file-storage.service';
import { type FileService } from 'src/engine/core-modules/file/services/file.service';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { type ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { type ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';

// getWorkspaceSchemaName requires a real UUID (base36 conversion)
const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const RECONCILIATION_ID = '20202020-aaaa-4bbb-8ccc-000000000001';
const ATTACHMENT_NAME = 'Jane Doe 1980-01-01 BOB.xlsx';

const ATTACHMENT_ROW = {
  id: 'attachment-id',
  name: ATTACHMENT_NAME,
  file: [{ fileId: 'file-id', label: ATTACHMENT_NAME }],
};

const buildService = ({
  fileContent = null as { buffer: Buffer; mimeType: string } | null,
  queryResults = [] as unknown[][],
} = {}) => {
  const query = jest.fn();

  for (const result of queryResults) {
    query.mockResolvedValueOnce(result);
  }
  query.mockResolvedValue([]);

  const fileStorageService = {
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn(),
  };
  const fileService = {
    getFileContentById: jest.fn().mockResolvedValue(fileContent),
  };
  const dataService = {
    getReconciliation: jest.fn().mockResolvedValue({
      id: RECONCILIATION_ID,
      sourceAttachmentId: null,
    }),
  };
  const mutationService = {
    updateReconciliation: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ReconciliationAttachmentService(
    fileStorageService as unknown as FileStorageService,
    fileService as unknown as FileService,
    { query } as unknown as DataSource,
    dataService as unknown as ReconciliationDataService,
    mutationService as unknown as ReconciliationMutationService,
  );

  return { service, query, fileStorageService, fileService };
};

describe('ReconciliationAttachmentService', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('readSourceFile', () => {
    it('reports an unfinished upload when the source file is still PENDING', async () => {
      const { service, query, fileService } = buildService({
        queryResults: [[ATTACHMENT_ROW], [{ status: 'PENDING' }]],
      });

      await expect(
        service.readSourceFile(WORKSPACE_ID, RECONCILIATION_ID),
      ).rejects.toThrow(/has not finished uploading \(file status PENDING\)/);

      expect(fileService.getFileContentById).toHaveBeenCalledWith({
        fileId: 'file-id',
        workspaceId: WORKSPACE_ID,
        fileFolder: FileFolder.FilesField,
      });
      expect(query).toHaveBeenLastCalledWith(
        expect.stringContaining('FROM core."file"'),
        ['file-id', WORKSPACE_ID],
      );
    });

    it('reports a missing file when no file row exists', async () => {
      const { service } = buildService({ queryResults: [[ATTACHMENT_ROW]] });

      await expect(
        service.readSourceFile(WORKSPACE_ID, RECONCILIATION_ID),
      ).rejects.toThrow(/fileId=file-id, file status missing/);
    });

    it('never logs the attachment name, which can carry PHI', async () => {
      const { service } = buildService({
        fileContent: {
          buffer: Buffer.from('small file'),
          mimeType: 'application/octet-stream',
        },
        queryResults: [[ATTACHMENT_ROW]],
      });

      await service.readSourceFile(WORKSPACE_ID, RECONCILIATION_ID);

      expect(logSpy).toHaveBeenCalled();
      for (const [message] of logSpy.mock.calls) {
        expect(String(message)).not.toContain(ATTACHMENT_NAME);
      }
    });
  });

  describe('parsed data storage', () => {
    it('writes parsed rows under the reconciliation folder of the standard application', async () => {
      const { service, fileStorageService } = buildService();
      const rows = [{ 'Policy Number': 'U123' }];

      await service.writeParsedData(WORKSPACE_ID, RECONCILIATION_ID, rows);

      expect(fileStorageService.writeFile).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
        fileFolder: FileFolder.FilesField,
        resourcePath: `reconciliation/${RECONCILIATION_ID}/parsed-data.json`,
        sourceFile: JSON.stringify(rows),
        fileId: expect.any(String),
        settings: { isTemporaryFile: false, toDelete: false },
      });
    });

    it('reads parsed rows back from the same resource', async () => {
      const { service, fileStorageService } = buildService();
      const rows = [{ 'Policy Number': 'U123' }];

      fileStorageService.readFile.mockResolvedValue(
        Readable.from([Buffer.from(JSON.stringify(rows))]),
      );

      await expect(
        service.readParsedData(WORKSPACE_ID, RECONCILIATION_ID),
      ).resolves.toEqual(rows);
      expect(fileStorageService.readFile).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
        fileFolder: FileFolder.FilesField,
        resourcePath: `reconciliation/${RECONCILIATION_ID}/parsed-data.json`,
      });
    });
  });
});
