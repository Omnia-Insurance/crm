import { type IngestionFieldMappingEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-field-mapping.entity';
import { buildRecordFromMappings } from 'src/engine/metadata-modules/ingestion-pipeline/utils/build-record-from-mappings.util';

const createMapping = (
  overrides: Partial<IngestionFieldMappingEntity>,
): IngestionFieldMappingEntity =>
  ({
    id: 'test-id',
    pipelineId: 'pipeline-id',
    sourceFieldPath: '',
    targetFieldName: '',
    targetCompositeSubField: null,
    transform: null,
    relationTargetObjectName: null,
    relationMatchFieldName: null,
    relationAutoCreate: false,
    position: 0,
    ...overrides,
  }) as IngestionFieldMappingEntity;

describe('buildRecordFromMappings', () => {
  it('should map direct fields', () => {
    const sourceData = { first_name: 'John', last_name: 'Doe' };
    const mappings = [
      createMapping({
        sourceFieldPath: 'first_name',
        targetFieldName: 'firstName',
      }),
      createMapping({
        sourceFieldPath: 'last_name',
        targetFieldName: 'lastName',
      }),
    ];

    const result = buildRecordFromMappings(sourceData, mappings);

    expect(result).toEqual({ firstName: 'John', lastName: 'Doe' });
  });

  it('should assemble composite fields', () => {
    const sourceData = { fname: 'John', lname: 'Doe' };
    const mappings = [
      createMapping({
        sourceFieldPath: 'fname',
        targetFieldName: 'name',
        targetCompositeSubField: 'firstName',
      }),
      createMapping({
        sourceFieldPath: 'lname',
        targetFieldName: 'name',
        targetCompositeSubField: 'lastName',
      }),
    ];

    const result = buildRecordFromMappings(sourceData, mappings);

    expect(result).toEqual({
      name: { firstName: 'John', lastName: 'Doe' },
    });
  });

  it('should mark relation fields for later resolution', () => {
    const sourceData = { lead_source: 'Facebook' };
    const mappings = [
      createMapping({
        sourceFieldPath: 'lead_source',
        targetFieldName: 'leadSourceId',
        relationTargetObjectName: 'leadSource',
        relationMatchFieldName: 'name',
        relationAutoCreate: true,
      }),
    ];

    const result = buildRecordFromMappings(sourceData, mappings);

    expect(result.leadSourceId).toEqual({
      __relation: true,
      targetObjectName: 'leadSource',
      matchFieldName: 'name',
      matchValue: 'Facebook',
      autoCreate: true,
    });
  });

  it('should apply transforms', () => {
    const sourceData = { phone: '(555) 123-4567' };
    const mappings = [
      createMapping({
        sourceFieldPath: 'phone',
        targetFieldName: 'phones',
        targetCompositeSubField: 'primaryPhoneNumber',
        transform: { type: 'phoneNormalize' },
      }),
    ];

    const result = buildRecordFromMappings(sourceData, mappings);

    expect(result).toEqual({
      phones: { primaryPhoneNumber: '+15551234567' },
    });
  });

  it('should skip undefined source values', () => {
    const sourceData = { existing: 'value' };
    const mappings = [
      createMapping({
        sourceFieldPath: 'missing',
        targetFieldName: 'field',
      }),
      createMapping({
        sourceFieldPath: 'existing',
        targetFieldName: 'field2',
      }),
    ];

    const result = buildRecordFromMappings(sourceData, mappings);

    expect(result).toEqual({ field2: 'value' });
  });

  it('should handle nested source paths', () => {
    const sourceData = {
      custom_fields: { field_101: 'Medicare' },
    };
    const mappings = [
      createMapping({
        sourceFieldPath: 'custom_fields.field_101',
        targetFieldName: 'insuranceType',
      }),
    ];

    const result = buildRecordFromMappings(sourceData, mappings);

    expect(result).toEqual({ insuranceType: 'Medicare' });
  });
});
