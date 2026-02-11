import { msg } from '@lingui/core/macro';
import {
  compositeTypeDefinitions,
  FieldMetadataType,
  RelationType,
} from 'twenty-shared/types';
import { capitalize, isDefined } from 'twenty-shared/utils';
import { type WhereExpressionBuilder } from 'typeorm';

import { STANDARD_ERROR_MESSAGE } from 'src/engine/api/common/common-query-runners/errors/standard-error-message.constant';
import {
  GraphqlQueryRunnerException,
  GraphqlQueryRunnerExceptionCode,
} from 'src/engine/api/graphql/graphql-query-runner/errors/graphql-query-runner.exception';
import { computeWhereConditionParts } from 'src/engine/api/graphql/graphql-query-runner/utils/compute-where-condition-parts';
import { type CompositeFieldMetadataType } from 'src/engine/metadata-modules/field-metadata/types/composite-field-metadata-type.type';
import { isCompositeFieldMetadataType } from 'src/engine/metadata-modules/field-metadata/utils/is-composite-field-metadata-type.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { buildFieldMapsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { computeTableName } from 'src/engine/utils/compute-table-name.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const ARRAY_OPERATORS = ['in', 'contains', 'notContains'];

export class GraphqlQueryFilterFieldParser {
  private flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  private flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  private workspaceSchemaName: string;
  private fieldIdByName: Record<string, string>;
  private fieldIdByJoinColumnName: Record<string, string>;

  constructor(
    flatObjectMetadata: FlatObjectMetadata,
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
  ) {
    this.flatFieldMetadataMaps = flatFieldMetadataMaps;
    this.flatObjectMetadataMaps = flatObjectMetadataMaps;
    this.workspaceSchemaName = getWorkspaceSchemaName(
      flatObjectMetadata.workspaceId,
    );

    const fieldMaps = buildFieldMapsFromFlatObjectMetadata(
      flatFieldMetadataMaps,
      flatObjectMetadata,
    );

    this.fieldIdByName = fieldMaps.fieldIdByName;
    this.fieldIdByJoinColumnName = fieldMaps.fieldIdByJoinColumnName;
  }

  public parse(
    queryBuilder: WhereExpressionBuilder,
    objectNameSingular: string,
    key: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filterValue: any,
    isFirst = false,
    useDirectTableReference = false,
  ): void {
    const fieldMetadataId =
      this.fieldIdByName[`${key}`] || this.fieldIdByJoinColumnName[`${key}`];

    const fieldMetadata = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: fieldMetadataId,
      flatEntityMaps: this.flatFieldMetadataMaps,
    });

    if (!isDefined(fieldMetadata)) {
      throw new Error(`Field metadata not found for field: ${key}`);
    }

    if (
      fieldMetadata.type === FieldMetadataType.RELATION &&
      (fieldMetadata.settings as { relationType?: string } | undefined)
        ?.relationType === RelationType.ONE_TO_MANY
    ) {
      return this.parseOneToManyRelationFilter(
        queryBuilder,
        fieldMetadata,
        objectNameSingular,
        filterValue,
        isFirst,
      );
    }

    if (isCompositeFieldMetadataType(fieldMetadata.type)) {
      return this.parseCompositeFieldForFilter(
        queryBuilder,
        fieldMetadata,
        objectNameSingular,
        filterValue,
        isFirst,
        useDirectTableReference,
      );
    }
    const [[operator, value]] = Object.entries(filterValue);

    if (
      ARRAY_OPERATORS.includes(operator) &&
      (!Array.isArray(value) || value.length === 0)
    ) {
      throw new GraphqlQueryRunnerException(
        `Invalid filter value for field ${key}. Expected non-empty array`,
        GraphqlQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: msg`Invalid filter value: "${value}"` },
      );
    }
    const { sql, params } = computeWhereConditionParts({
      operator,
      objectNameSingular,
      key,
      value,
      fieldMetadataType: fieldMetadata.type,
      useDirectTableReference,
    });

    if (isFirst) {
      queryBuilder.where(sql, params);
    } else {
      queryBuilder.andWhere(sql, params);
    }
  }

  private parseCompositeFieldForFilter(
    queryBuilder: WhereExpressionBuilder,
    fieldMetadata: FlatFieldMetadata,
    objectNameSingular: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fieldValue: any,
    isFirst = false,
    useDirectTableReference = false,
  ): void {
    const compositeType = compositeTypeDefinitions.get(
      fieldMetadata.type as CompositeFieldMetadataType,
    );

    if (!compositeType) {
      throw new Error(
        `Composite type definition not found for type: ${fieldMetadata.type}`,
      );
    }

    Object.entries(fieldValue).map(([subFieldKey, subFieldFilter], index) => {
      const subFieldMetadata = compositeType.properties.find(
        (property) => property.name === subFieldKey,
      );

      if (!subFieldMetadata) {
        throw new Error(
          `Sub field metadata not found for composite type: ${fieldMetadata.type}`,
        );
      }

      const fullFieldName = `${fieldMetadata.name}${capitalize(subFieldKey)}`;

      const [[operator, value]] = Object.entries(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subFieldFilter as Record<string, any>,
      );

      if (
        ARRAY_OPERATORS.includes(operator) &&
        (!Array.isArray(value) || value.length === 0)
      ) {
        throw new GraphqlQueryRunnerException(
          `Invalid filter value for field ${subFieldKey}. Expected non-empty array`,
          GraphqlQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
          { userFriendlyMessage: msg`Invalid filter value: "${value}"` },
        );
      }

      const { sql, params } = computeWhereConditionParts({
        operator,
        objectNameSingular,
        key: fullFieldName,
        subFieldKey,
        value,
        fieldMetadataType: fieldMetadata.type,
        useDirectTableReference,
      });

      if (isFirst && index === 0) {
        queryBuilder.where(sql, params);
      }

      queryBuilder.andWhere(sql, params);
    });
  }

  private parseOneToManyRelationFilter(
    queryBuilder: WhereExpressionBuilder,
    fieldMetadata: FlatFieldMetadata,
    objectNameSingular: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filterValue: any,
    isFirst = false,
  ): void {
    const entries = Object.entries(filterValue);

    const targetObjectMetadataId = fieldMetadata.relationTargetObjectMetadataId;
    const inverseFieldMetadataId = fieldMetadata.relationTargetFieldMetadataId;

    if (
      !isDefined(targetObjectMetadataId) ||
      !isDefined(inverseFieldMetadataId)
    ) {
      throw new Error(
        `Missing relation metadata for ONE_TO_MANY field: ${fieldMetadata.name}`,
      );
    }

    const targetObjectMetadata = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: targetObjectMetadataId,
      flatEntityMaps: this.flatObjectMetadataMaps,
    });

    if (!isDefined(targetObjectMetadata)) {
      throw new Error(
        `Target object metadata not found for ONE_TO_MANY field: ${fieldMetadata.name}`,
      );
    }

    const inverseFieldMetadata = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: inverseFieldMetadataId,
      flatEntityMaps: this.flatFieldMetadataMaps,
    });

    if (!isDefined(inverseFieldMetadata)) {
      throw new Error(
        `Inverse field metadata not found for ONE_TO_MANY field: ${fieldMetadata.name}`,
      );
    }

    const foreignKeyColumnName = (
      inverseFieldMetadata.settings as { joinColumnName?: string } | undefined
    )?.joinColumnName;

    if (!isDefined(foreignKeyColumnName)) {
      throw new Error(
        `Join column name not found on inverse field for ONE_TO_MANY field: ${fieldMetadata.name}`,
      );
    }

    const targetTableName = computeTableName(
      targetObjectMetadata.nameSingular,
      targetObjectMetadata.isCustom,
    );

    // Existence check: { is: 'NULL' | 'NOT_NULL' }
    if (entries.length === 1 && entries[0][0] === 'is') {
      const value = entries[0][1];

      if (value !== 'NULL' && value !== 'NOT_NULL') {
        throw new GraphqlQueryRunnerException(
          `Invalid value for ONE_TO_MANY relation filter. Expected "NULL" or "NOT_NULL"`,
          GraphqlQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
          { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
        );
      }

      const existsPrefix = value === 'NULL' ? 'NOT EXISTS' : 'EXISTS';
      const subqueryAlias = `${targetTableName}_exists`;

      const sql =
        `${existsPrefix} (SELECT 1 FROM "${this.workspaceSchemaName}"."${targetTableName}" "${subqueryAlias}" ` +
        `WHERE "${subqueryAlias}"."${foreignKeyColumnName}" = "${objectNameSingular}"."id" ` +
        `AND "${subqueryAlias}"."deletedAt" IS NULL)`;

      if (isFirst) {
        queryBuilder.where(sql);
      } else {
        queryBuilder.andWhere(sql);
      }

      return;
    }

    // Sub-field filter: { status: { in: ['submitted'] } }
    const subqueryAlias = `${targetTableName}_subfield`;
    const subFieldConditions: string[] = [];
    const allParams: Record<string, unknown> = {};

    const targetFieldMaps = buildFieldMapsFromFlatObjectMetadata(
      this.flatFieldMetadataMaps,
      targetObjectMetadata,
    );

    for (const [fieldName, fieldFilter] of entries) {
      const targetFieldId = targetFieldMaps.fieldIdByName[fieldName];

      if (!isDefined(targetFieldId)) {
        throw new GraphqlQueryRunnerException(
          `Unknown field "${fieldName}" on target object for ONE_TO_MANY filter`,
          GraphqlQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
          { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
        );
      }

      const targetField = findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: targetFieldId,
        flatEntityMaps: this.flatFieldMetadataMaps,
      });

      if (!isDefined(targetField)) {
        throw new Error(
          `Target field metadata not found for field: ${fieldName}`,
        );
      }

      const filterEntries = Object.entries(
        fieldFilter as Record<string, unknown>,
      );

      for (const [operator, value] of filterEntries) {
        const { sql, params } = computeWhereConditionParts({
          operator,
          objectNameSingular: subqueryAlias,
          key: fieldName,
          value,
          fieldMetadataType: targetField.type,
        });

        subFieldConditions.push(sql);
        Object.assign(allParams, params);
      }
    }

    const sql =
      `EXISTS (SELECT 1 FROM "${this.workspaceSchemaName}"."${targetTableName}" "${subqueryAlias}" ` +
      `WHERE "${subqueryAlias}"."${foreignKeyColumnName}" = "${objectNameSingular}"."id" ` +
      `AND ${subFieldConditions.join(' AND ')} ` +
      `AND "${subqueryAlias}"."deletedAt" IS NULL)`;

    if (isFirst) {
      queryBuilder.where(sql, allParams);
    } else {
      queryBuilder.andWhere(sql, allParams);
    }
  }
}
