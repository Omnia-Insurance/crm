import { Injectable, Logger } from '@nestjs/common';

import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

const LIST_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class ConvosoLeadPreprocessor {
  private readonly logger = new Logger(ConvosoLeadPreprocessor.name);
  private listMap: Record<string, string> | null = null;
  private listMapFetchedAt = 0;

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async preProcess(
    payload: Record<string, unknown>,
    _pipeline: IngestionPipelineEntity,
    workspaceId: string,
  ): Promise<Record<string, unknown> | null> {
    const listId = payload.list_id?.toString();

    if (!listId) {
      return payload;
    }

    const leadSourceId = await this.findOrCreateLeadSource(listId, workspaceId);

    return {
      ...payload,
      _leadSourceId: leadSourceId,
    };
  }

  private async findOrCreateLeadSource(
    listId: string,
    workspaceId: string,
  ): Promise<string | null> {
    const leadSourceRepo = await this.globalWorkspaceOrmManager.getRepository(
      workspaceId,
      'leadSource',
      { shouldBypassPermissionChecks: true },
    );

    // Try matching by convosoListId first (if the field exists on Lead Source)
    try {
      const byListId = await leadSourceRepo.findOne({
        where: { convosoListId: listId },
      });

      if (byListId) {
        return (byListId as Record<string, unknown>).id as string;
      }
    } catch {
      // convosoListId field may not exist yet — fall through to name-based lookup
    }

    // Resolve list name from Convoso API
    const listName = await this.resolveConvosoListName(listId);

    if (!listName) {
      this.logger.warn(
        `Could not resolve Convoso list name for list_id ${listId}`,
      );

      return null;
    }

    // Find by name
    const existing = await leadSourceRepo.findOne({
      where: { name: listName },
    });

    if (existing) {
      return (existing as Record<string, unknown>).id as string;
    }

    // Create new Lead Source with name and convosoListId
    try {
      const created = await leadSourceRepo.save({
        name: listName,
        convosoListId: listId,
      });

      this.logger.log(
        `Created Lead Source "${listName}" for Convoso list_id ${listId}`,
      );

      return (created as Record<string, unknown>).id as string;
    } catch (error) {
      this.logger.error(
        `Failed to create Lead Source "${listName}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return null;
    }
  }

  private async resolveConvosoListName(listId: string): Promise<string | null> {
    const now = Date.now();

    if (!this.listMap || now - this.listMapFetchedAt > LIST_CACHE_TTL_MS) {
      const apiToken = process.env.CONVOSO_API_TOKEN;

      if (!apiToken) {
        this.logger.warn(
          'CONVOSO_API_TOKEN not set, cannot resolve list_id to name',
        );

        return null;
      }

      try {
        const response = await fetch(
          `https://api.convoso.com/v1/lists/search?auth_token=${apiToken}`,
          { headers: { 'Content-Type': 'application/json' } },
        );

        if (!response.ok) {
          this.logger.error(`Convoso Lists API returned ${response.status}`);

          return null;
        }

        const json = (await response.json()) as {
          success: boolean;
          data?: Array<{ id: number; name: string }>;
        };

        if (!json.success || !json.data?.length) {
          return null;
        }

        this.listMap = {};

        for (const list of json.data) {
          this.listMap[String(list.id)] = list.name;
        }

        this.listMapFetchedAt = now;
        this.logger.log(`Cached ${json.data.length} Convoso lists`);
      } catch (error) {
        this.logger.error(
          `Failed to fetch Convoso lists: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );

        return null;
      }
    }

    return this.listMap?.[listId] ?? null;
  }
}
