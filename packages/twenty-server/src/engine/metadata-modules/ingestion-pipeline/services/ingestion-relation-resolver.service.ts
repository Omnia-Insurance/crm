import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

type RelationRef = {
  __relation: true;
  targetObjectName: string;
  matchFieldName: string;
  matchValue: unknown;
  autoCreate: boolean;
};

// In-memory cache scoped to a single ingestion run.
// Key: "objectName:matchField:matchValue" → resolved record ID.
type RelationCache = Map<string, string>;

@Injectable()
export class IngestionRelationResolverService {
  private readonly logger = new Logger(IngestionRelationResolverService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  createCache(): RelationCache {
    return new Map();
  }

  async resolveRelations(
    record: Record<string, unknown>,
    workspaceId: string,
    cache: RelationCache,
  ): Promise<Record<string, unknown>> {
    const resolved = { ...record };

    for (const [fieldName, value] of Object.entries(record)) {
      if (!isRelationRef(value)) {
        continue;
      }

      const resolvedId = await this.resolveRelation(
        value,
        workspaceId,
        cache,
      );

      if (isDefined(resolvedId)) {
        resolved[fieldName] = resolvedId;
      } else {
        delete resolved[fieldName];
      }
    }

    return resolved;
  }

  private async resolveRelation(
    ref: RelationRef,
    workspaceId: string,
    cache: RelationCache,
  ): Promise<string | null> {
    const cacheKey = `${ref.targetObjectName}:${ref.matchFieldName}:${String(ref.matchValue)}`;
    const cached = cache.get(cacheKey);

    if (isDefined(cached)) {
      return cached;
    }

    try {
      const repository = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        ref.targetObjectName,
        { shouldBypassPermissionChecks: true },
      );

      const existing = await repository.findOne({
        where: { [ref.matchFieldName]: ref.matchValue },
      });

      if (isDefined(existing)) {
        const id = (existing as Record<string, unknown>).id as string;

        cache.set(cacheKey, id);

        return id;
      }

      if (ref.autoCreate) {
        const created = await repository.save({
          [ref.matchFieldName]: ref.matchValue,
        });

        const id = (created as Record<string, unknown>).id as string;

        cache.set(cacheKey, id);

        return id;
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve relation ${ref.targetObjectName}.${ref.matchFieldName}=${String(ref.matchValue)}: ${error}`,
      );

      return null;
    }
  }
}

const isRelationRef = (value: unknown): value is RelationRef =>
  isDefined(value) &&
  typeof value === 'object' &&
  (value as Record<string, unknown>).__relation === true;
