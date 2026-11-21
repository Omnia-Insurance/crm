import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaPurgeLegacyExportFilesCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500007000-omnia-purge-legacy-export-files.command';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { FileStorageService } from 'src/engine/core-modules/file-storage/services/file-storage.service';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const OTHER_WORKSPACE_ID = '20202020-0000-4000-8000-000000000002';
const CUSTOM_APPLICATION_ID = '20202020-0000-4000-8000-0000000000a1';
const CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-0000-4000-8000-0000000000b1';

type FileRow = {
  id: string;
  workspaceId: string;
  path: string;
  applicationId: string | null;
  applicationUniversalIdentifier: string | null;
};

const buildFileId = (index: number) =>
  `20202020-0000-4000-8000-${index.toString().padStart(12, '0')}`;

const buildFileRow = (
  fileRow: Partial<FileRow> & Pick<FileRow, 'id'>,
): FileRow => ({
  workspaceId: WORKSPACE_ID,
  path: `export/exports/${fileRow.id}.csv`,
  applicationId: CUSTOM_APPLICATION_ID,
  applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
  ...fileRow,
});

const toStoragePath = (fileRow: FileRow) =>
  `${fileRow.workspaceId}/${fileRow.applicationUniversalIdentifier}/${fileRow.path}`;

const matchesPrefixPattern = (path: string, pattern: string) => {
  const prefix = pattern.slice(0, -1);

  if (!pattern.endsWith('%') || /[%_]/.test(prefix)) {
    throw new Error(`Unexpected LIKE pattern ${pattern}`);
  }

  return path.startsWith(prefix);
};

// Answers the command's statements from an in-memory core.file table.
const buildFakeCoreDataSource = (fileRows: FileRow[], callLog: string[]) => {
  const query = jest.fn(async (sql: string, parameters: unknown[]) => {
    const statement = sql.trimStart();

    if (statement.startsWith('SELECT')) {
      const [workspaceId, pattern, afterFileId, limit] = parameters as [
        string,
        string,
        string,
        number,
      ];

      return fileRows
        .filter(
          (fileRow) =>
            fileRow.workspaceId === workspaceId &&
            matchesPrefixPattern(fileRow.path, pattern) &&
            fileRow.id > afterFileId,
        )
        .sort((fileRowA, fileRowB) => (fileRowA.id < fileRowB.id ? -1 : 1))
        .slice(0, limit)
        .map(({ id, path, applicationId, applicationUniversalIdentifier }) => ({
          id,
          path,
          applicationId,
          applicationUniversalIdentifier,
        }));
    }

    if (statement.startsWith('DELETE')) {
      const [workspaceId, fileIds, pattern] = parameters as [
        string,
        string[],
        string,
      ];

      const deletedFileRows = fileRows.filter(
        (fileRow) =>
          fileRow.workspaceId === workspaceId &&
          fileIds.includes(fileRow.id) &&
          matchesPrefixPattern(fileRow.path, pattern),
      );

      for (const deletedFileRow of deletedFileRows) {
        fileRows.splice(fileRows.indexOf(deletedFileRow), 1);
        callLog.push(`row:${deletedFileRow.id}`);
      }

      return [[], deletedFileRows.length];
    }

    throw new Error(`Unexpected statement: ${statement}`);
  });

  return { query };
};

const setup = async ({
  fileRows,
  storedObjectPaths,
  failingObjectPaths = [],
}: {
  fileRows: FileRow[];
  storedObjectPaths: string[];
  failingObjectPaths?: string[];
}) => {
  const callLog: string[] = [];
  const storedObjects = new Set(storedObjectPaths);
  const coreDataSource = buildFakeCoreDataSource(fileRows, callLog);
  const storageDriver = {
    checkFileExists: jest.fn(async ({ filePath }: { filePath: string }) =>
      storedObjects.has(filePath),
    ),
    delete: jest.fn(
      async ({
        folderPath,
        filename,
      }: {
        folderPath: string;
        filename?: string;
      }) => {
        const filePath = `${folderPath}/${filename}`;

        if (failingObjectPaths.includes(filePath)) {
          throw new Error('Access denied');
        }

        storedObjects.delete(filePath);
        callLog.push(`storage:${filePath}`);
      },
    ),
  };
  const invalidateStorageStock = jest.fn();

  const module = await Test.createTestingModule({
    providers: [
      OmniaPurgeLegacyExportFilesCommand,
      { provide: WorkspaceIteratorService, useValue: {} },
      {
        provide: FileStorageDriverFactory,
        useValue: { getCurrentDriver: () => storageDriver },
      },
      { provide: FileStorageService, useValue: { invalidateStorageStock } },
      { provide: getDataSourceToken(), useValue: coreDataSource },
    ],
  }).compile();

  const command = module.get(OmniaPurgeLegacyExportFilesCommand);

  const run = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  return {
    run,
    callLog,
    storedObjects,
    storageDriver,
    coreDataSource,
    invalidateStorageStock,
  };
};

describe('OmniaPurgeLegacyExportFilesCommand', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // The dry run checks every object, so a rehearsal shows whether the storage config reaches the bucket
  it('deletes nothing on a dry run and reports which objects storage finds', async () => {
    const storedLegacyExportFile = buildFileRow({ id: buildFileId(1) });
    const missingLegacyExportFile = buildFileRow({ id: buildFileId(2) });
    const fileRows = [storedLegacyExportFile, missingLegacyExportFile];

    const { run, storedObjects, storageDriver, invalidateStorageStock } =
      await setup({
        fileRows,
        storedObjectPaths: [toStoragePath(storedLegacyExportFile)],
      });

    await run(true);

    expect(fileRows).toEqual([storedLegacyExportFile, missingLegacyExportFile]);
    expect(storedObjects.has(toStoragePath(storedLegacyExportFile))).toBe(true);
    expect(storageDriver.checkFileExists).toHaveBeenCalledTimes(2);
    expect(storageDriver.delete).not.toHaveBeenCalled();
    expect(invalidateStorageStock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      `[DRY RUN] Workspace ${WORKSPACE_ID}: 2 legacy export file(s), 1 found in storage and would be deleted`,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`(file ids: ${missingLegacyExportFile.id})`),
    );
  });

  it('deletes each storage object before its file row and recomputes the storage stock', async () => {
    const legacyExportFiles = [
      buildFileRow({ id: buildFileId(1) }),
      buildFileRow({ id: buildFileId(2) }),
    ];
    const fileRows = [...legacyExportFiles];

    const { run, callLog, storedObjects, invalidateStorageStock } = await setup(
      {
        fileRows,
        storedObjectPaths: legacyExportFiles.map(toStoragePath),
      },
    );

    await run();

    expect(fileRows).toEqual([]);
    expect(storedObjects.size).toBe(0);

    for (const legacyExportFile of legacyExportFiles) {
      expect(
        callLog.indexOf(`storage:${toStoragePath(legacyExportFile)}`),
      ).toBeLessThan(callLog.indexOf(`row:${legacyExportFile.id}`));
    }

    expect(invalidateStorageStock).toHaveBeenCalledTimes(1);
    expect(invalidateStorageStock).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      applicationId: CUSTOM_APPLICATION_ID,
    });
  });

  it('leaves files outside export/exports/ and other workspaces untouched', async () => {
    const legacyExportFile = buildFileRow({ id: buildFileId(1) });
    const untouchedFiles = [
      buildFileRow({
        id: buildFileId(2),
        path: `record-export/${buildFileId(2)}.csv`,
      }),
      buildFileRow({
        id: buildFileId(3),
        path: `export/${buildFileId(3)}.csv`,
      }),
      buildFileRow({
        id: buildFileId(4),
        path: `workspace-data-export/${buildFileId(4)}.zip`,
      }),
      buildFileRow({ id: buildFileId(5), workspaceId: OTHER_WORKSPACE_ID }),
    ];
    const fileRows = [legacyExportFile, ...untouchedFiles];

    const { run, storedObjects, storageDriver } = await setup({
      fileRows,
      storedObjectPaths: fileRows.map(toStoragePath),
    });

    await run();

    expect(fileRows).toEqual(untouchedFiles);
    expect([...storedObjects]).toEqual(untouchedFiles.map(toStoragePath));
    expect(storageDriver.delete).toHaveBeenCalledTimes(1);
  });

  // A driver pointed at the wrong storage finds no object at all; dropping the rows would orphan the PHI CSVs
  it('keeps every row whose storage object is not found and warns', async () => {
    const legacyExportFiles = [
      buildFileRow({ id: buildFileId(1) }),
      buildFileRow({ id: buildFileId(2) }),
    ];
    const fileRows = [...legacyExportFiles];

    const { run, storageDriver, invalidateStorageStock } = await setup({
      fileRows,
      storedObjectPaths: [],
    });

    await run();

    expect(fileRows).toEqual(legacyExportFiles);
    expect(storageDriver.delete).not.toHaveBeenCalled();
    expect(invalidateStorageStock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      `Workspace ${WORKSPACE_ID}: deleted 0 of 2 legacy export file(s) and their storage objects`,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `kept 2 legacy export file row(s) whose storage object was not found`,
      ),
    );
  });

  it('keeps the row and logs its id when the storage object cannot be deleted', async () => {
    const failingLegacyExportFile = buildFileRow({ id: buildFileId(1) });
    const unlocatableLegacyExportFile = buildFileRow({
      id: buildFileId(2),
      applicationId: null,
      applicationUniversalIdentifier: null,
    });
    const purgeableLegacyExportFile = buildFileRow({ id: buildFileId(3) });
    const fileRows = [
      failingLegacyExportFile,
      unlocatableLegacyExportFile,
      purgeableLegacyExportFile,
    ];

    const { run } = await setup({
      fileRows,
      storedObjectPaths: [
        toStoragePath(failingLegacyExportFile),
        toStoragePath(purgeableLegacyExportFile),
      ],
      failingObjectPaths: [toStoragePath(failingLegacyExportFile)],
    });

    await run();

    expect(fileRows).toEqual([
      failingLegacyExportFile,
      unlocatableLegacyExportFile,
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `${failingLegacyExportFile.id}, ${unlocatableLegacyExportFile.id}`,
      ),
    );
  });

  it('pages through more legacy export files than one batch', async () => {
    const legacyExportFiles = Array.from({ length: 150 }, (_, index) =>
      buildFileRow({ id: buildFileId(index + 1) }),
    );
    const fileRows = [...legacyExportFiles];

    const { run, storedObjects, coreDataSource } = await setup({
      fileRows,
      storedObjectPaths: legacyExportFiles.map(toStoragePath),
    });

    await run();

    expect(fileRows).toEqual([]);
    expect(storedObjects.size).toBe(0);
    expect(
      coreDataSource.query.mock.calls.filter(([sql]) =>
        sql.trimStart().startsWith('DELETE'),
      ),
    ).toHaveLength(2);
  });
});
