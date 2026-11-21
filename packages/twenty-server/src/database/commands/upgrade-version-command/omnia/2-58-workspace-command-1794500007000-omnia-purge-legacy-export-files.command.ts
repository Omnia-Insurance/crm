import { InjectDataSource } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { basename, dirname } from 'path';
import { isDefined } from 'twenty-shared/utils';
import { DataSource } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { type StorageDriver } from 'src/engine/core-modules/file-storage/drivers/interfaces/storage-driver.interface';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { FileStorageService } from 'src/engine/core-modules/file-storage/services/file-storage.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

// Built by hand: the FileFolder.Export value these rows were written under is gone.
const LEGACY_EXPORT_FILE_PATH_PATTERN = 'export/exports/%';

const LEGACY_EXPORT_FILE_BATCH_SIZE = 100;

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

type LegacyExportFile = {
  id: string;
  path: string;
  applicationId: string | null;
  applicationUniversalIdentifier: string | null;
};

type StorageObjectPurgeOutcome = 'deleted' | 'missing' | 'kept';

// The removed Omnia export job kept every PHI export CSV in storage, with no
// expiry the v2.58 temporary-file cleanup would ever match.
@RegisteredWorkspaceCommand('2.58.0', 1794500007000)
@Command({
  name: 'upgrade:2-58:omnia-purge-legacy-export-files',
  description:
    'Delete the export CSVs the removed Omnia export job left in storage, and their file rows',
})
export class OmniaPurgeLegacyExportFilesCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly fileStorageDriverFactory: FileStorageDriverFactory,
    private readonly fileStorageService: FileStorageService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun === true;
    const storageDriver = this.fileStorageDriverFactory.getCurrentDriver();
    const purgedApplicationIds = new Set<string>();
    const missingObjectFileIds: string[] = [];
    const keptFileIds: string[] = [];
    let legacyExportFileCount = 0;
    let deletedObjectCount = 0;
    let deletedFileRowCount = 0;
    let afterFileId = NIL_UUID;
    let hasMoreFiles = true;

    try {
      while (hasMoreFiles) {
        const legacyExportFiles = await this.findLegacyExportFiles({
          workspaceId,
          afterFileId,
        });
        const deletedObjectFiles: LegacyExportFile[] = [];

        legacyExportFileCount += legacyExportFiles.length;

        for (const legacyExportFile of legacyExportFiles) {
          const storageObjectPurgeOutcome = await this.purgeStorageObject({
            storageDriver,
            workspaceId,
            legacyExportFile,
            isDryRun,
          });

          if (storageObjectPurgeOutcome === 'deleted') {
            deletedObjectFiles.push(legacyExportFile);
          } else if (storageObjectPurgeOutcome === 'missing') {
            missingObjectFileIds.push(legacyExportFile.id);
          } else {
            keptFileIds.push(legacyExportFile.id);
          }
        }

        deletedObjectCount += deletedObjectFiles.length;

        if (!isDryRun && deletedObjectFiles.length > 0) {
          deletedFileRowCount += await this.deleteFileRows({
            workspaceId,
            fileIds: deletedObjectFiles.map(({ id }) => id),
          });

          for (const { applicationId } of deletedObjectFiles) {
            if (isDefined(applicationId)) {
              purgedApplicationIds.add(applicationId);
            }
          }
        }

        hasMoreFiles =
          legacyExportFiles.length === LEGACY_EXPORT_FILE_BATCH_SIZE;

        if (hasMoreFiles) {
          afterFileId = legacyExportFiles[legacyExportFiles.length - 1].id;
        }
      }
    } finally {
      // Rows deleted outside FileStorageService leave its storage stock counters stale.
      for (const applicationId of purgedApplicationIds) {
        await this.fileStorageService.invalidateStorageStock({
          workspaceId,
          applicationId,
        });
      }
    }

    if (legacyExportFileCount === 0) {
      return;
    }

    const logPrefix = isDryRun ? '[DRY RUN] ' : '';

    this.logger.log(
      isDryRun
        ? `${logPrefix}Workspace ${workspaceId}: ${legacyExportFileCount} legacy export file(s), ${deletedObjectCount} found in storage and would be deleted`
        : `Workspace ${workspaceId}: deleted ${deletedFileRowCount} of ${legacyExportFileCount} legacy export file(s) and their storage objects`,
    );

    if (missingObjectFileIds.length > 0) {
      this.logger.warn(
        `${logPrefix}Workspace ${workspaceId}: kept ${missingObjectFileIds.length} legacy export file row(s) whose storage object was not found; check the storage configuration (STORAGE_TYPE, STORAGE_S3_*), then re-run upgrade:2-58:omnia-purge-legacy-export-files (file ids: ${missingObjectFileIds.join(', ')})`,
      );
    }

    if (keptFileIds.length > 0) {
      this.logger.warn(
        `${logPrefix}Workspace ${workspaceId}: kept ${keptFileIds.length} legacy export file row(s) whose storage object could not be checked or deleted; re-run upgrade:2-58:omnia-purge-legacy-export-files (file ids: ${keptFileIds.join(', ')})`,
      );
    }
  }

  // A row goes only once its object is deleted: a wrong storage config reports every object as missing,
  // and dropping those rows would leave the PHI CSVs in storage with no pointer to them.
  private async purgeStorageObject({
    storageDriver,
    workspaceId,
    legacyExportFile,
    isDryRun,
  }: {
    storageDriver: StorageDriver;
    workspaceId: string;
    legacyExportFile: LegacyExportFile;
    isDryRun: boolean;
  }): Promise<StorageObjectPurgeOutcome> {
    if (!isDefined(legacyExportFile.applicationUniversalIdentifier)) {
      return 'kept';
    }

    const storagePath = `${workspaceId}/${legacyExportFile.applicationUniversalIdentifier}/${legacyExportFile.path}`;

    try {
      if (!(await storageDriver.checkFileExists({ filePath: storagePath }))) {
        return 'missing';
      }

      if (!isDryRun) {
        await storageDriver.delete({
          folderPath: dirname(storagePath),
          filename: basename(storagePath),
        });
      }

      return 'deleted';
    } catch {
      return 'kept';
    }
  }

  private findLegacyExportFiles({
    workspaceId,
    afterFileId,
  }: {
    workspaceId: string;
    afterFileId: string;
  }): Promise<LegacyExportFile[]> {
    return this.coreDataSource.query<LegacyExportFile[]>(
      `SELECT "file"."id",
              "file"."path",
              "file"."applicationId",
              "application"."universalIdentifier" AS "applicationUniversalIdentifier"
       FROM "core"."file" "file"
       LEFT JOIN "core"."application" "application"
         ON "application"."id" = "file"."applicationId"
        AND "application"."workspaceId" = "file"."workspaceId"
       WHERE "file"."workspaceId" = $1
         AND "file"."path" LIKE $2
         AND "file"."id" > $3
       ORDER BY "file"."id"
       LIMIT $4`,
      [
        workspaceId,
        LEGACY_EXPORT_FILE_PATH_PATTERN,
        afterFileId,
        LEGACY_EXPORT_FILE_BATCH_SIZE,
      ],
    );
  }

  private async deleteFileRows({
    workspaceId,
    fileIds,
  }: {
    workspaceId: string;
    fileIds: string[];
  }): Promise<number> {
    const [, deletedFileCount] = await this.coreDataSource.query<
      [unknown[], number]
    >(
      `DELETE FROM "core"."file"
       WHERE "workspaceId" = $1
         AND "id" = ANY($2::uuid[])
         AND "path" LIKE $3`,
      [workspaceId, fileIds, LEGACY_EXPORT_FILE_PATH_PATTERN],
    );

    return deletedFileCount;
  }
}
