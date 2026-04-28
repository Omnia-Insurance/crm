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
import { readFileContent } from 'src/engine/core-modules/file-storage/utils/read-file-content';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import type { GenericRow } from 'src/modules/reconciliation/types/reconciliation';


@Injectable()
export class ReconciliationAttachmentService {
  private readonly logger = new Logger(ReconciliationAttachmentService.name);

  constructor(
    private readonly fileStorageService: FileStorageService,
    private readonly fileService: FileService,
    @InjectDataSource() private readonly dataSource: DataSource,
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
    // 1. Query the attachment table for the file linked to this reconciliation.
    //    Attachments use a polymorphic relation — the DB column is "reconciliationId"
    //    but the workspace ORM doesn't expose it as a typed field. Use raw SQL.
    const schemaName = getWorkspaceSchemaName(workspaceId);

    const attachmentRows: { id: string; name: string; file: unknown }[] =
      await this.dataSource.query(
        `SELECT id, name, file FROM "${schemaName}"."attachment"
         WHERE "targetReconciliationId" = $1
         ORDER BY "createdAt" DESC LIMIT 1`,
        [reconciliationId],
      );

    if (!attachmentRows || attachmentRows.length === 0) {
      throw new Error(
        `No attachment found for reconciliation ${reconciliationId}`,
      );
    }

    // 2. Extract fileId from the FILES field (JSON array: [{ fileId, label }])
    const fileField = attachmentRows[0].file;
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
        `Attachment ${attachmentRows[0].id} has no file data for reconciliation ${reconciliationId}`,
      );
    }

    this.logger.log(
      `Reading source file: attachment=${attachmentRows[0].id}, fileId=${fileId}`,
    );

    // 3. Use FileService.getFileContentById — the production pattern for
    //    reading uploaded files. Handles FileEntity lookup, application
    //    resolution, and storage abstraction (local + S3).
    const { buffer } = await this.fileService.getFileContentById({
      fileId,
      workspaceId,
      fileFolder: FileFolder.FilesField,
    });

    return buffer;
  }

  // --- Commission Statement ---

  async writeCommissionParsedData(
    workspaceId: string,
    statementId: string,
    data: Record<string, unknown>[],
  ): Promise<void> {
    await this.writeJsonToStorage(
      workspaceId,
      statementId,
      'commission-parsed-data.json',
      data,
    );

    this.logger.log(
      `Wrote commission-parsed-data.json (${data.length} rows) for statement ${statementId}`,
    );
  }

  async readCommissionParsedData(
    workspaceId: string,
    statementId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.readJsonFromStorage<Record<string, unknown>[]>(
      workspaceId,
      statementId,
      'commission-parsed-data.json',
    );
  }

  async readCommissionStatementFile(
    workspaceId: string,
    statementId: string,
  ): Promise<Buffer> {
    // Same pattern as readSourceFile but for commissionStatement attachments
    const schemaName = getWorkspaceSchemaName(workspaceId);

    const attachmentRows: { id: string; name: string; file: unknown }[] =
      await this.dataSource.query(
        `SELECT id, name, file FROM "${schemaName}"."attachment"
         WHERE "targetCommissionStatementId" = $1
         ORDER BY "createdAt" DESC LIMIT 1`,
        [statementId],
      );

    if (!attachmentRows || attachmentRows.length === 0) {
      throw new Error(
        `No attachment found for commission statement ${statementId}`,
      );
    }

    let fileId: string | null = null;
    const fileField = attachmentRows[0].file;

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
        `Attachment ${attachmentRows[0].id} has no file data for commission statement ${statementId}`,
      );
    }

    const { buffer } = await this.fileService.getFileContentById({
      fileId,
      workspaceId,
      fileFolder: FileFolder.FilesField,
    });

    return buffer;
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
      mimeType: 'application/json',
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

    const content = await readFileContent(stream);

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
