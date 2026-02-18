import { isDefined } from 'twenty-shared/utils';

import { type IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { applyFieldTransform } from 'src/engine/metadata-modules/ingestion-pipeline/utils/apply-field-transform.util';
import { extractValueByPath } from 'src/engine/metadata-modules/ingestion-pipeline/utils/extract-value-by-path.util';

// Assembles a CRM record from source data using field mappings.
// Handles composite fields (FullName, Phones, Address, etc.) by grouping
// sub-fields under a single parent key.
export const buildRecordFromMappings = (
  sourceData: Record<string, unknown>,
  mappings: IngestionFieldMappingEntity[],
): Record<string, unknown> => {
  const record: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const rawValue = extractValueByPath(sourceData, mapping.sourceFieldPath);

    if (!isDefined(rawValue) || rawValue === '') {
      continue;
    }

    const transformedValue = applyFieldTransform(rawValue, mapping.transform);

    if (!isDefined(transformedValue) || transformedValue === '') {
      continue;
    }

    if (isDefined(mapping.targetCompositeSubField)) {
      // Composite field: group sub-fields under the parent field name
      const existing = record[mapping.targetFieldName];
      const compositeValue =
        isDefined(existing) && typeof existing === 'object'
          ? (existing as Record<string, unknown>)
          : {};

      compositeValue[mapping.targetCompositeSubField] = transformedValue;
      record[mapping.targetFieldName] = compositeValue;
    } else if (
      isDefined(mapping.relationTargetObjectName) &&
      isDefined(mapping.relationMatchFieldName)
    ) {
      // Relation field: store as a reference to resolve later
      record[mapping.targetFieldName] = {
        __relation: true,
        targetObjectName: mapping.relationTargetObjectName,
        matchFieldName: mapping.relationMatchFieldName,
        matchValue: transformedValue,
        autoCreate: mapping.relationAutoCreate,
      };
    } else {
      // Direct field
      record[mapping.targetFieldName] = transformedValue;
    }
  }

  return record;
};
