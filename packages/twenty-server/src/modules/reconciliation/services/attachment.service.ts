import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { FileFolder } from 'twenty-shared/types';
import { v4 } from 'uuid';
import { type DataSource } from 'typeorm';

import {
  FileStorageService,
  type ResourceIdentifier,
} from 'src/engine/core-modules/file-storage/file-storage.service';
import { FileService } from 'src/engine/core-modules/file/services/file.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { MAX_SOURCE_FILE_BYTES } from 'src/modules/reconciliation/parsers/xlsx';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';
import type { GenericRow } from 'src/modules/reconciliation/types/reconciliation';
import { streamToBuffer } from 'src/utils/stream-to-buffer';

type AttachmentRow = { id: string; name: string; file: unknown };

@Injectable()
export class ReconciliationAttachmentService {
  private readonly logger = new Logger(ReconciliationAttachmentService.name);

  constructor(
    private readonly fileStorageService: FileStorageService,
    private readonly fileService: FileService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dataService: ReconciliationDataService,
    private readonly mutationService: ReconciliationMutationService,
  ) {}

  // --- Write ---

  async writeParsedData(
    workspaceId: string,
    reconciliationId: string,
    data: Record<string, unknown>[],
  ): Promise<void> {
    await this.writeJsonToStorage(
      workspaceId,
      reconciliationId,
      'parsed-data.json',
      data,
    );

    this.logger.log(
      `Wrote parsed-data.json (${data.length} rows) for reconciliation ${reconciliationId}`,
    );
  }

  // --- Read ---

  async readParsedData(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<GenericRow[]> {
    return this.readJsonFromStorage<GenericRow[]>(
      workspaceId,
      reconciliationId,
      'parsed-data.json',
    );
  }

  async readSourceFile(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<Buffer> {
    // 1. Resolve the source attachment. The reconciliation pins the chosen
    //    attachment id (sourceAttachmentId) the first time it is resolved so
    //    re-runs always read the same file — an unrelated attachment added
    //    later (note, screenshot, carrier email) can no longer silently
    //    replace the BOB source. Attachments use a polymorphic relation —
    //    the DB column is "targetReconciliationId" but the workspace ORM
    //    doesn't expose it as a typed field. Use raw SQL.
    const attachment = await this.resolveSourceAttachment(
      workspaceId,
      reconciliationId,
    );

    // 2. Extract fileId from the FILES field (JSON array: [{ fileId, label }])
    const fileField = attachment.file;
    let fileId: string | null = null;

    if (Array.isArray(fileField) && fileField.length > 0) {
      fileId = fileField[0].fileId ?? fileField[0].id ?? null;
    } else if (typeof fileField === 'string') {
      try {
        const parsed = JSON.parse(fileField);

        if (Array.isArray(parsed) && parsed.length > 0) {
          fileId = parsed[0].fileId ?? parsed[0].id ?? null;
        }
      } catch { /* not JSON */ }
    }

    if (!fileId) {
      throw new Error(
        `Attachment ${attachment.id} has no file data for reconciliation ${reconciliationId}`,
      );
    }

    this.logger.log(
      `Reading source file: attachment=${attachment.id} ("${attachment.name}"), fileId=${fileId}`,
    );

    // 3. Use FileService.getFileContentById — the production pattern for
    //    reading uploaded files. Handles FileEntity lookup, application
    //    resolution, and storage abstraction (local + S3).
    const fileContent = await this.fileService.getFileContentById({
      fileId,
      workspaceId,
      fileFolder: FileFolder.FilesField,
    });

    if (!fileContent) {
      throw new Error(
        `Failed to read source file content for attachment ${attachment.id} (fileId=${fileId}) in reconciliation ${reconciliationId}`,
      );
    }

    const { buffer } = fileContent;

    // Cap input size before handing the untrusted buffer to the unpatched
    // xlsx parser (prototype-pollution/ReDoS CVEs) — bounds blast radius.
    if (buffer.byteLength > MAX_SOURCE_FILE_BYTES) {
      throw new Error(
        `Source file for reconciliation ${reconciliationId} is ${buffer.byteLength} bytes, exceeding the maximum of ${MAX_SOURCE_FILE_BYTES} bytes (25 MB)`,
      );
    }

    return buffer;
  }

  /**
   * Resolve the attachment row holding the BOB source file.
   *
   * Order of preference:
   *   1. The attachment id pinned on the reconciliation record
   *      (sourceAttachmentId) — set the first time this resolves.
   *   2. Fallback: the newest attachment with a spreadsheet extension
   *      (.xlsx/.xls/.csv) — NOT newest-of-any-kind. The resolved choice is
   *      logged and pinned for subsequent reads.
   */
  private async resolveSourceAttachment(
    workspaceId: string,
    reconciliationId: string,
  ): Promise<AttachmentRow> {
    const schemaName = getWorkspaceSchemaName(workspaceId);

    const reconciliation = await this.dataService.getReconciliation(
      workspaceId,
      reconciliationId,
    );
    const pinnedAttachmentId = reconciliation.sourceAttachmentId ?? null;

    if (pinnedAttachmentId) {
      const pinnedRows: AttachmentRow[] = await this.dataSource.query(
        `SELECT id, name, file FROM "${schemaName}"."attachment"
         WHERE id = $1 AND "targetReconciliationId" = $2
         LIMIT 1`,
        [pinnedAttachmentId, reconciliationId],
      );

      if (pinnedRows && pinnedRows.length > 0) {
        this.logger.log(
          `Using pinned source attachment ${pinnedAttachmentId} for reconciliation ${reconciliationId}`,
        );

        return pinnedRows[0];
      }

      this.logger.warn(
        `Pinned source attachment ${pinnedAttachmentId} no longer exists on reconciliation ${reconciliationId} — falling back to newest spreadsheet attachment`,
      );
    }

    const fallbackRows: AttachmentRow[] = await this.dataSource.query(
      `SELECT id, name, file FROM "${schemaName}"."attachment"
       WHERE "targetReconciliationId" = $1
         AND name ~* '\\.(xlsx|xls|csv)$'
       ORDER BY "createdAt" DESC LIMIT 1`,
      [reconciliationId],
    );

    if (!fallbackRows || fallbackRows.length === 0) {
      throw new Error(
        `No spreadsheet attachment (.xlsx/.xls/.csv) found for reconciliation ${reconciliationId}`,
      );
    }

    const chosen = fallbackRows[0];

    this.logger.log(
      `Resolved source attachment by newest-spreadsheet fallback: ${chosen.id} ("${chosen.name}") for reconciliation ${reconciliationId}`,
    );

    // Pin the choice so every subsequent read uses exactly this file.
    // Best-effort: a workspace whose sourceAttachmentId field hasn't been
    // seeded yet should still be able to parse.
    try {
      await this.mutationService.updateReconciliation(
        workspaceId,
        reconciliationId,
        { sourceAttachmentId: chosen.id },
      );

      this.logger.log(
        `Pinned source attachment ${chosen.id} on reconciliation ${reconciliationId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Could not pin source attachment ${chosen.id} on reconciliation ${reconciliationId} ` +
          `(is the sourceAttachmentId field seeded?): ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }

    return chosen;
  }

  // --- Helpers ---

  private async writeJsonToStorage(
    workspaceId: string,
    reconciliationId: string,
    filename: string,
    data: unknown,
  ): Promise<void> {
    const json = JSON.stringify(data);

    await this.fileStorageService.writeFile({
      ...this.buildResourceId(workspaceId, reconciliationId, filename),
      sourceFile: json,
      fileId: v4(),
      settings: { isTemporaryFile: false, toDelete: false },
    });
  }

  private async readJsonFromStorage<T>(
    workspaceId: string,
    reconciliationId: string,
    filename: string,
  ): Promise<T> {
    const stream = await this.fileStorageService.readFile(
      this.buildResourceId(workspaceId, reconciliationId, filename),
    );

    const content = (await streamToBuffer(stream)).toString('utf8');

    return JSON.parse(content) as T;
  }

  private buildResourceId(
    workspaceId: string,
    reconciliationId: string,
    filename: string,
  ): ResourceIdentifier {
    return {
      workspaceId,
      applicationUniversalIdentifier: TWENTY_STANDARD_APPLICATION.universalIdentifier,
      fileFolder: FileFolder.FilesField,
      resourcePath: `reconciliation/${reconciliationId}/${filename}`,
    };
  }
}
