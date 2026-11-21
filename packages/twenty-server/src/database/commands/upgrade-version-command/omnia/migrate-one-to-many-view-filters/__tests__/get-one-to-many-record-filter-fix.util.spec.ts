import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { buildOneToManyRelationFilterLookup } from 'src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/build-one-to-many-relation-filter-lookup.util';
import {
  getOneToManyRecordFilterFix,
  type StoredRecordFilterShape,
} from 'src/database/commands/upgrade-version-command/omnia/migrate-one-to-many-view-filters/utils/get-one-to-many-record-filter-fix.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';

const PERSON_OBJECT_ID = 'person-object-id';
const POLICY_OBJECT_ID = 'policy-object-id';

const lookup = buildOneToManyRelationFilterLookup([
  getFlatFieldMetadataMock({
    id: 'person-policies-field-id',
    universalIdentifier: 'person-policies-field-id',
    objectMetadataId: PERSON_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'policies',
    relationTargetObjectMetadataId: POLICY_OBJECT_ID,
    settings: { relationType: RelationType.ONE_TO_MANY },
  }),
  getFlatFieldMetadataMock({
    id: 'policy-person-field-id',
    universalIdentifier: 'policy-person-field-id',
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'person',
    relationTargetObjectMetadataId: PERSON_OBJECT_ID,
    settings: { relationType: RelationType.MANY_TO_ONE },
  }),
  getFlatFieldMetadataMock({
    id: 'policy-status-field-id',
    universalIdentifier: 'policy-status-field-id',
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.SELECT,
    name: 'status',
  }),
  getFlatFieldMetadataMock({
    id: 'policy-payments-field-id',
    universalIdentifier: 'policy-payments-field-id',
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.RELATION,
    name: 'payments',
    relationTargetObjectMetadataId: 'payment-object-id',
    settings: { relationType: RelationType.ONE_TO_MANY },
  }),
  getFlatFieldMetadataMock({
    id: 'policy-owner-field-id',
    universalIdentifier: 'policy-owner-field-id',
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.MORPH_RELATION,
    name: 'ownerCompany',
    morphId: 'policy-owner-morph-id',
    relationTargetObjectMetadataId: 'company-object-id',
    settings: { relationType: RelationType.MANY_TO_ONE },
  }),
  getFlatFieldMetadataMock({
    id: 'policy-legacy-code-field-id',
    universalIdentifier: 'policy-legacy-code-field-id',
    objectMetadataId: POLICY_OBJECT_ID,
    type: FieldMetadataType.TEXT,
    name: 'legacyCode',
    isActive: false,
  }),
]);

const getFix = (recordFilter: Partial<StoredRecordFilterShape>) =>
  getOneToManyRecordFilterFix({
    recordFilter: {
      fieldMetadataId: 'person-policies-field-id',
      relationTargetFieldMetadataId: null,
      subFieldName: null,
      operand: 'IS',
      ...recordFilter,
    },
    lookup,
  });

describe('getOneToManyRecordFilterFix', () => {
  it('ignores filters on fields that are not one-to-many relations', () => {
    expect(
      getFix({ fieldMetadataId: 'policy-person-field-id' }),
    ).toBeUndefined();
    expect(
      getFix({ fieldMetadataId: 'policy-status-field-id' }),
    ).toBeUndefined();
  });

  it('ignores filters that already traverse to a relation target', () => {
    expect(
      getFix({
        relationTargetFieldMetadataId: 'policy-status-field-id',
        subFieldName: 'status',
      }),
    ).toBeUndefined();
  });

  it('points a sub-field filter at the active target field it names', () => {
    expect(getFix({ subFieldName: 'status', operand: 'IS_NOT' })).toEqual({
      kind: 'setRelationTarget',
      relationTargetFieldMetadataId: 'policy-status-field-id',
    });
    expect(getFix({ subFieldName: 'person', operand: 'IS' })).toEqual({
      kind: 'setRelationTarget',
      relationTargetFieldMetadataId: 'policy-person-field-id',
    });
  });

  it('clears any sub-field name from a has any / has no filter', () => {
    expect(getFix({ subFieldName: 'status', operand: 'IS_EMPTY' })).toEqual({
      kind: 'clearSubFieldName',
    });
    expect(getFix({ subFieldName: '', operand: 'IS_NOT_EMPTY' })).toEqual({
      kind: 'clearSubFieldName',
    });
    expect(
      getFix({ subFieldName: null, operand: 'IS_NOT_EMPTY' }),
    ).toBeUndefined();
  });

  it('deletes a filter by record on the relation itself', () => {
    expect(getFix({ subFieldName: null, operand: 'IS' })).toEqual({
      kind: 'delete',
    });
    expect(getFix({ subFieldName: '', operand: 'IS_NOT' })).toEqual({
      kind: 'delete',
    });
  });

  it('leaves the other shapes for a manual fix', () => {
    expect(getFix({ subFieldName: null, operand: 'CONTAINS' })).toEqual({
      kind: 'manualFix',
      reason: 'operandNotSupported',
    });
    expect(getFix({ subFieldName: 'status', operand: 'CONTAINS' })).toEqual({
      kind: 'manualFix',
      reason: 'operandNotSupported',
    });
    expect(getFix({ subFieldName: 'unknownField' })).toEqual({
      kind: 'manualFix',
      reason: 'targetFieldNotFound',
    });
    expect(getFix({ subFieldName: 'legacyCode', operand: 'CONTAINS' })).toEqual(
      { kind: 'manualFix', reason: 'targetFieldNotFound' },
    );
    expect(getFix({ subFieldName: 'payments' })).toEqual({
      kind: 'manualFix',
      reason: 'targetFieldNotTraversable',
    });
    expect(getFix({ subFieldName: 'ownerCompany' })).toEqual({
      kind: 'manualFix',
      reason: 'targetFieldNotTraversable',
    });
  });
});
