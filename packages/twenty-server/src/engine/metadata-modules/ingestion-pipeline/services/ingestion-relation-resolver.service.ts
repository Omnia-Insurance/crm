import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { getIngestionErrorLogLabel } from 'src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-error-log-label.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

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

  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  createCache(): RelationCache {
    return new Map();
  }

  async resolveRelations(
    record: Record<string, unknown>,
    cache: RelationCache,
  ): Promise<Record<string, unknown>> {
    const resolved = { ...record };

    for (const [fieldName, value] of Object.entries(record)) {
      if (!isRelationRef(value)) {
        continue;
      }

      const resolvedId = await this.resolveRelation(value, cache);

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
    cache: RelationCache,
  ): Promise<string | null> {
    const cacheKey = `${ref.targetObjectName}:${ref.matchFieldName}:${String(ref.matchValue)}`;
    const cached = cache.get(cacheKey);

    if (isDefined(cached)) {
      return cached;
    }

    try {
      // Ingestion is system work, not on behalf of the settings user
      const repository =
        this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
          ref.targetObjectName,
        );

      const existing = await repository.findOne({
        where: { [ref.matchFieldName]: ref.matchValue },
      });

      if (isDefined(existing)) {
        cache.set(cacheKey, existing.id);

        return existing.id;
      }

      if (ref.autoCreate) {
        const [created] = await repository.save({
          [ref.matchFieldName]: ref.matchValue,
        });

        if (!isDefined(created)) {
          throw new Error(
            `Saving a new ${ref.targetObjectName} returned no record`,
          );
        }

        cache.set(cacheKey, created.id);

        return created.id;
      }

      return null;
    } catch (error) {
      // The match value is a record value (phone, email, name): never log it
      this.logger.warn(
        `Failed to resolve relation ${ref.targetObjectName}.${ref.matchFieldName}: ${getIngestionErrorLogLabel(error)}`,
      );

      return null;
    }
  }
}

const isRelationRef = (value: unknown): value is RelationRef =>
  isDefined(value) &&
  typeof value === 'object' &&
  (value as Record<string, unknown>).__relation === true;
