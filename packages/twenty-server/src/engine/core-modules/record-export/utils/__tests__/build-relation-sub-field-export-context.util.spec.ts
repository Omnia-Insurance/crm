import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

import { CSV_INJECTION_PREVENTION_ZWJ } from 'twenty-shared/constants';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import {
  buildRecordExportColumns,
  formatRecordExportHeader,
  formatRecordExportRow,
  isDefined,
} from 'twenty-shared/utils';

import { type CommonSelectedFields } from 'src/engine/api/common/types/common-selected-fields-result.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildRelationSubFieldExportContext } from 'src/engine/core-modules/record-export/utils/build-relation-sub-field-export-context.util';
import { expandMorphRelationExportFields } from 'src/engine/core-modules/record-export/utils/expand-morph-relation-export-fields.util';
import { flattenRelationSubFieldExportValues } from 'src/engine/core-modules/record-export/utils/flatten-relation-sub-field-export-values.util';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type EffectiveEntityI18nContext } from 'src/engine/metadata-modules/overrides/types/effective-entity-i18n-context.type';
import { NO_RECORD_READ_RESTRICTIONS } from 'src/engine/permissions/constants/no-record-read-restrictions.constant';
import { type RecordReadRestrictions } from 'src/engine/permissions/types/record-read-restrictions.type';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const APPLICATION_ID = 'application-id';
const WORKSPACE_CUSTOM_APPLICATION = 'workspace-custom-application';
const POLICY = 'policy-object';
const PERSON = 'person-object';
const CARRIER = 'carrier-object';
const LEAD_SOURCE = 'lead-source-object';
const FAMILY_MEMBER = 'family-member-object';

const buildField = (
  overrides: Pick<
    FlatFieldMetadata,
    'id' | 'objectMetadataId' | 'name' | 'label' | 'type'
  > &
    Partial<FlatFieldMetadata>,
): FlatFieldMetadata =>
  getFlatFieldMetadataMock({
    universalIdentifier: overrides.id,
    applicationId: APPLICATION_ID,
    ...overrides,
  });

const buildRelationField = ({
  relationType,
  ...overrides
}: Pick<
  FlatFieldMetadata,
  | 'id'
  | 'objectMetadataId'
  | 'name'
  | 'label'
  | 'relationTargetObjectMetadataId'
> &
  Partial<FlatFieldMetadata> & { relationType: RelationType }) =>
  buildField({
    type: FieldMetadataType.RELATION,
    settings: { relationType },
    ...overrides,
  });

const policyFields = {
  id: buildField({
    id: 'policy-id',
    objectMetadataId: POLICY,
    name: 'id',
    label: 'Id',
    type: FieldMetadataType.UUID,
  }),
  name: buildField({
    id: 'policy-name',
    objectMetadataId: POLICY,
    name: 'name',
    label: 'Name',
    type: FieldMetadataType.TEXT,
  }),
  lead: buildRelationField({
    id: 'policy-lead',
    objectMetadataId: POLICY,
    name: 'lead',
    label: 'Lead',
    relationType: RelationType.MANY_TO_ONE,
    relationTargetObjectMetadataId: PERSON,
    relationTargetFieldMetadataId: 'person-policies',
    overrides: {
      [WORKSPACE_CUSTOM_APPLICATION]: {
        translations: { 'fr-FR': { label: 'Prospect' } },
      },
    },
  }),
  carrier: buildRelationField({
    id: 'policy-carrier',
    objectMetadataId: POLICY,
    name: 'carrier',
    label: 'Carrier',
    relationType: RelationType.MANY_TO_ONE,
    relationTargetObjectMetadataId: CARRIER,
  }),
  notes: buildRelationField({
    id: 'policy-notes',
    objectMetadataId: POLICY,
    name: 'notes',
    label: 'Notes',
    relationType: RelationType.ONE_TO_MANY,
    relationTargetObjectMetadataId: PERSON,
  }),
  emails: buildField({
    id: 'policy-emails',
    objectMetadataId: POLICY,
    name: 'emails',
    label: 'Emails',
    type: FieldMetadataType.EMAILS,
  }),
  mailingAddress: buildField({
    id: 'policy-mailing-address',
    objectMetadataId: POLICY,
    name: 'mailingAddress',
    label: 'Mailing Address',
    type: FieldMetadataType.ADDRESS,
  }),
};

const personFields = {
  id: buildField({
    id: 'person-id',
    objectMetadataId: PERSON,
    name: 'id',
    label: 'Id',
    type: FieldMetadataType.UUID,
  }),
  name: buildField({
    id: 'person-name',
    objectMetadataId: PERSON,
    name: 'name',
    label: 'Name',
    type: FieldMetadataType.FULL_NAME,
  }),
  dateOfBirth: buildField({
    id: 'person-date-of-birth',
    objectMetadataId: PERSON,
    name: 'dateOfBirth',
    label: 'Date of Birth',
    type: FieldMetadataType.DATE,
  }),
  phones: buildField({
    id: 'person-phones',
    objectMetadataId: PERSON,
    name: 'phones',
    label: 'Phones',
    type: FieldMetadataType.PHONES,
  }),
  address: buildField({
    id: 'person-address',
    objectMetadataId: PERSON,
    name: 'address',
    label: 'Address',
    type: FieldMetadataType.ADDRESS,
  }),
  ssn: buildField({
    id: 'person-ssn',
    objectMetadataId: PERSON,
    name: 'ssn',
    label: 'SSN',
    type: FieldMetadataType.TEXT,
  }),
  nickname: buildField({
    id: 'person-nickname',
    objectMetadataId: PERSON,
    name: 'nickname',
    label: 'Nickname',
    type: FieldMetadataType.TEXT,
    isActive: false,
  }),
  leadSource: buildRelationField({
    id: 'person-lead-source',
    objectMetadataId: PERSON,
    name: 'leadSource',
    label: 'Lead Source',
    relationType: RelationType.MANY_TO_ONE,
    relationTargetObjectMetadataId: LEAD_SOURCE,
  }),
  familyMembers: buildRelationField({
    id: 'person-family-members',
    objectMetadataId: PERSON,
    name: 'familyMembers',
    label: 'Family Members',
    relationType: RelationType.ONE_TO_MANY,
    relationTargetObjectMetadataId: FAMILY_MEMBER,
    relationTargetFieldMetadataId: 'family-member-lead',
  }),
  policies: buildRelationField({
    id: 'person-policies',
    objectMetadataId: PERSON,
    name: 'policies',
    label: 'Policies',
    relationType: RelationType.ONE_TO_MANY,
    relationTargetObjectMetadataId: POLICY,
    relationTargetFieldMetadataId: 'policy-lead',
  }),
};

const carrierFields = [
  buildField({
    id: 'carrier-id',
    objectMetadataId: CARRIER,
    name: 'id',
    label: 'Id',
    type: FieldMetadataType.UUID,
  }),
  buildField({
    id: 'carrier-name',
    objectMetadataId: CARRIER,
    name: 'name',
    label: 'Name',
    type: FieldMetadataType.TEXT,
  }),
];

const leadSourceFields = [
  buildField({
    id: 'lead-source-id',
    objectMetadataId: LEAD_SOURCE,
    name: 'id',
    label: 'Id',
    type: FieldMetadataType.UUID,
  }),
  buildField({
    id: 'lead-source-name',
    objectMetadataId: LEAD_SOURCE,
    name: 'name',
    label: 'Name',
    type: FieldMetadataType.TEXT,
  }),
];

const familyMemberFields = [
  buildField({
    id: 'family-member-id',
    objectMetadataId: FAMILY_MEMBER,
    name: 'id',
    label: 'Id',
    type: FieldMetadataType.UUID,
  }),
  buildField({
    id: 'family-member-name',
    objectMetadataId: FAMILY_MEMBER,
    name: 'name',
    label: 'Name',
    type: FieldMetadataType.TEXT,
  }),
  buildField({
    id: 'family-member-date-of-birth',
    objectMetadataId: FAMILY_MEMBER,
    name: 'dateOfBirth',
    label: 'Date of Birth',
    type: FieldMetadataType.DATE,
  }),
  buildField({
    id: 'family-member-member-type',
    objectMetadataId: FAMILY_MEMBER,
    name: 'memberType',
    label: 'Member Type',
    type: FieldMetadataType.SELECT,
  }),
  buildField({
    id: 'family-member-created-at',
    objectMetadataId: FAMILY_MEMBER,
    name: 'createdAt',
    label: 'Creation date',
    type: FieldMetadataType.DATE_TIME,
  }),
  buildRelationField({
    id: 'family-member-lead',
    objectMetadataId: FAMILY_MEMBER,
    name: 'lead',
    label: 'Lead',
    relationType: RelationType.MANY_TO_ONE,
    relationTargetObjectMetadataId: PERSON,
  }),
];

const buildObject = ({
  id,
  nameSingular,
  fields,
  labelIdentifierFieldMetadataId,
}: {
  id: string;
  nameSingular: string;
  fields: FlatFieldMetadata[];
  labelIdentifierFieldMetadataId: string;
}) =>
  getFlatObjectMetadataMock({
    id,
    universalIdentifier: id,
    nameSingular,
    fieldIds: fields.map((field) => field.id),
    labelIdentifierFieldMetadataId,
  });

const policy = buildObject({
  id: POLICY,
  nameSingular: 'policy',
  fields: Object.values(policyFields),
  labelIdentifierFieldMetadataId: policyFields.name.id,
});
const flatObjectMetadataMaps = [
  policy,
  buildObject({
    id: PERSON,
    nameSingular: 'person',
    fields: Object.values(personFields),
    labelIdentifierFieldMetadataId: personFields.name.id,
  }),
  buildObject({
    id: CARRIER,
    nameSingular: 'carrier',
    fields: carrierFields,
    labelIdentifierFieldMetadataId: 'carrier-name',
  }),
  buildObject({
    id: LEAD_SOURCE,
    nameSingular: 'leadSource',
    fields: leadSourceFields,
    labelIdentifierFieldMetadataId: 'lead-source-name',
  }),
  buildObject({
    id: FAMILY_MEMBER,
    nameSingular: 'familyMember',
    fields: familyMemberFields,
    labelIdentifierFieldMetadataId: 'family-member-name',
  }),
].reduce<FlatEntityMaps<FlatObjectMetadata>>(
  (flatEntityMaps, flatEntity) =>
    addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
  createEmptyFlatEntityMaps(),
);
const flatFieldMetadataMaps = [
  ...Object.values(policyFields),
  ...Object.values(personFields),
  ...carrierFields,
  ...leadSourceFields,
  ...familyMemberFields,
].reduce<FlatEntityMaps<FlatFieldMetadata>>(
  (flatEntityMaps, flatEntity) =>
    addFlatEntityToFlatEntityMapsOrThrow({ flatEntity, flatEntityMaps }),
  createEmptyFlatEntityMaps(),
);

const untranslatedI18nContext: EffectiveEntityI18nContext = {
  locale: undefined,
  i18nInstance: { _: (messageId: string) => messageId },
  isStandardApp: false,
  workspaceCustomApplicationUniversalIdentifier: WORKSPACE_CUSTOM_APPLICATION,
  ownerApplicationUniversalIdentifier: undefined,
};

// Mirrors the column and node building of RecordExportQueryService.buildContext
const buildUpstreamContext = (fields: FlatFieldMetadata[]) => {
  const columns = buildRecordExportColumns(
    expandMorphRelationExportFields({
      fields,
      flatObjectMetadata: policy,
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
    }),
  );
  const node: CommonSelectedFields = {};

  for (const column of columns) {
    if (isDefined(column.subFieldName)) {
      const nested = node[column.fieldName];

      node[column.fieldName] = {
        ...(typeof nested === 'object' ? nested : {}),
        [column.subFieldName]: true,
      };
    } else {
      node[column.fieldName] = true;
    }
  }

  return { columns, node };
};

const buildContext = ({
  fields = [policyFields.name, policyFields.lead],
  relationSubFields = [],
  recordReadRestrictions = NO_RECORD_READ_RESTRICTIONS,
  getI18nContextByApplicationIds = async () => () => untranslatedI18nContext,
}: {
  fields?: FlatFieldMetadata[];
  relationSubFields?: { fieldMetadataId: string; subFieldName: string }[];
  recordReadRestrictions?: RecordReadRestrictions;
  getI18nContextByApplicationIds?: (
    applicationIds: string[],
  ) => Promise<(applicationId: string) => EffectiveEntityI18nContext>;
} = {}) =>
  buildRelationSubFieldExportContext({
    parameters: {
      fieldMetadataIds: fields.map((field) => field.id),
      relationSubFields,
    },
    ...buildUpstreamContext(fields),
    flatObjectMetadata: policy,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
    recordReadRestrictions,
    getI18nContextByApplicationIds,
  });

const leadSubField = (subFieldName: string) => ({
  fieldMetadataId: policyFields.lead.id,
  subFieldName,
});

const getHeader = ({ columns }: { columns: { label: string }[] }) =>
  formatRecordExportHeader(columns).replace(/^﻿/, '').trimEnd();

describe('buildRelationSubFieldExportContext', () => {
  // OMN-465: without the related record's id a re-import falls back to fuzzy matching,
  // which re-pointed policies onto new blank leads
  it('always includes the related record id', async () => {
    const context = await buildContext({
      relationSubFields: [leadSubField('dateOfBirth')],
    });

    expect(context.columns).toContainEqual({
      fieldName: 'lead__id',
      label: 'Lead / Id',
      type: FieldMetadataType.UUID,
    });
    expect(context.plan.cells).toContainEqual({
      kind: 'joinColumn',
      key: 'lead__id',
      joinColumnName: 'leadId',
    });
  });

  it('puts the id first, then the label identifier, then the sub-fields in request order', async () => {
    const context = await buildContext({
      relationSubFields: [leadSubField('dateOfBirth'), leadSubField('ssn')],
    });

    expect(getHeader(context)).toBe(
      'Id,Name,Lead / Id,Lead / Name / First Name,Lead / Name / Last Name,Lead / Date of Birth,Lead / SSN',
    );
  });

  it('does not duplicate the id or the label identifier when they are requested', async () => {
    const context = await buildContext({
      relationSubFields: [
        leadSubField('dateOfBirth'),
        leadSubField('name'),
        leadSubField('id'),
        leadSubField('dateOfBirth'),
      ],
    });

    expect(getHeader(context)).toBe(
      'Id,Name,Lead / Id,Lead / Name / First Name,Lead / Name / Last Name,Lead / Date of Birth',
    );
  });

  it('replaces the upstream relation id column and keeps the root join column selected', async () => {
    const context = await buildContext({
      relationSubFields: [leadSubField('dateOfBirth')],
    });

    expect(context.columns.map(({ label }) => label)).not.toContain('Lead Id');
    expect(context.node).toEqual({
      id: true,
      name: true,
      leadId: true,
      lead: {
        id: true,
        name: { firstName: true, lastName: true },
        dateOfBirth: true,
      },
    });
  });

  it('adds a label column before the upstream id column of a to-one relation without sub-fields', async () => {
    const context = await buildContext({
      fields: [policyFields.name, policyFields.carrier],
    });

    expect(getHeader(context)).toBe('Id,Name,Carrier,Carrier Id');
    expect(context.node.carrier).toEqual({
      id: true,
      name: true,
    });
    expect(context.plan.cells).toEqual([
      {
        kind: 'label',
        key: 'carrier__label',
        recordPath: ['carrier'],
        labelFieldName: 'name',
      },
    ]);
  });

  it('appends the group when its relation is not one of the exported fields', async () => {
    const context = await buildContext({
      fields: [policyFields.name, policyFields.carrier],
      relationSubFields: [leadSubField('dateOfBirth')],
    });

    expect(getHeader(context)).toBe(
      'Id,Name,Carrier,Carrier Id,Lead / Id,Lead / Name / First Name,Lead / Name / Last Name,Lead / Date of Birth',
    );
    expect(context.node.leadId).toBe(true);
  });

  it('skips a one-to-many back-reference to the exported object', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const context = await buildContext({
      relationSubFields: [leadSubField('policies')],
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping ONE_TO_MANY back-reference'),
    );
    expect(getHeader(context)).toBe('Id,Name,Lead,Lead Id');
    expect(context.node.lead).toEqual({
      id: true,
      name: { firstName: true, lastName: true },
    });

    warnSpy.mockRestore();
  });

  it('keeps only the Omnia composite sub-fields, on the exported object and on related records', async () => {
    const context = await buildContext({
      fields: [policyFields.emails, policyFields.mailingAddress],
      relationSubFields: [leadSubField('phones'), leadSubField('address')],
    });

    expect(getHeader(context)).toBe(
      [
        'Id',
        'Emails / Primary Email',
        'Mailing Address / Address 1',
        'Mailing Address / Address 2',
        'Mailing Address / City',
        'Mailing Address / State',
        'Mailing Address / Post Code',
        'Lead / Id',
        'Lead / Name / First Name',
        'Lead / Name / Last Name',
        'Lead / Phones / Primary Phone Number',
        'Lead / Address / Address 1',
        'Lead / Address / Address 2',
        'Lead / Address / City',
        'Lead / Address / State',
        'Lead / Address / Post Code',
      ].join(','),
    );
    expect(context.node.emails).toEqual({ primaryEmail: true });
    expect(context.node.mailingAddress).toEqual({
      addressStreet1: true,
      addressStreet2: true,
      addressCity: true,
      addressState: true,
      addressPostcode: true,
    });
    expect(context.plan.addressFieldNames).toEqual(['mailingAddress']);
    expect(context.plan.cells).toContainEqual({
      kind: 'value',
      key: 'lead__address',
      relationFieldName: 'lead',
      fieldName: 'address',
      isAddress: true,
    });
  });

  it('selects the label of a nested to-one record and the fields one-to-many items need', async () => {
    const context = await buildContext({
      relationSubFields: [
        leadSubField('leadSource'),
        leadSubField('familyMembers'),
      ],
    });

    expect(getHeader(context)).toBe(
      'Id,Name,Lead / Id,Lead / Name / First Name,Lead / Name / Last Name,Lead / Lead Source,Lead / Family Members',
    );
    expect(context.node.lead).toEqual({
      id: true,
      name: { firstName: true, lastName: true },
      leadSource: { id: true, name: true },
      familyMembers: {
        id: true,
        name: true,
        dateOfBirth: true,
        memberType: true,
        createdAt: true,
      },
    });
    expect(context.plan.cells).toContainEqual({
      kind: 'list',
      key: 'lead__familyMembers',
      relationFieldName: 'lead',
      fieldName: 'familyMembers',
      labelFieldName: 'name',
      childObjectNameSingular: 'familyMember',
      childJoinColumnName: 'leadId',
    });
  });

  it.each([
    ['an unknown sub-field', leadSubField('unknownField')],
    ['an inactive sub-field', leadSubField('nickname')],
    [
      'a sub-field of a one-to-many relation',
      { fieldMetadataId: policyFields.notes.id, subFieldName: 'name' },
    ],
    [
      'a relation of another object',
      { fieldMetadataId: personFields.leadSource.id, subFieldName: 'name' },
    ],
    [
      'an unknown relation',
      { fieldMetadataId: 'unknown-field', subFieldName: 'name' },
    ],
  ])('rejects %s', async (_description, relationSubField) => {
    await expect(
      buildContext({ relationSubFields: [relationSubField] }),
    ).rejects.toThrow(
      new BadRequestException('An export field is no longer available.'),
    );
  });

  it('rejects a sub-field the requester cannot read, one-to-many relations included', async () => {
    for (const unreadableField of [
      personFields.ssn,
      personFields.familyMembers,
    ]) {
      await expect(
        buildContext({
          relationSubFields: [leadSubField(unreadableField.name)],
          recordReadRestrictions: {
            unreadableObjectMetadataIds: new Set(),
            unreadableFieldMetadataIds: new Set([unreadableField.id]),
          },
        }),
      ).rejects.toThrow(ForbiddenException);
    }
  });

  it.each([
    ['the related object', 'dateOfBirth', PERSON],
    ['a nested to-one object', 'leadSource', LEAD_SOURCE],
    ['a one-to-many child object', 'familyMembers', FAMILY_MEMBER],
  ])(
    'rejects a sub-field when the requester cannot read %s',
    async (_description, subFieldName, unreadableObjectMetadataId) => {
      await expect(
        buildContext({
          relationSubFields: [leadSubField(subFieldName)],
          recordReadRestrictions: {
            unreadableObjectMetadataIds: new Set([unreadableObjectMetadataId]),
            unreadableFieldMetadataIds: new Set(),
          },
        }),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('leaves out a label the requester cannot read', async () => {
    const context = await buildContext({
      fields: [policyFields.name, policyFields.lead, policyFields.carrier],
      relationSubFields: [leadSubField('dateOfBirth')],
      recordReadRestrictions: {
        unreadableObjectMetadataIds: new Set([CARRIER]),
        unreadableFieldMetadataIds: new Set([personFields.name.id]),
      },
    });

    expect(getHeader(context)).toBe(
      'Id,Name,Lead / Id,Lead / Date of Birth,Carrier Id',
    );
    expect(context.node.lead).toEqual({
      id: true,
      dateOfBirth: true,
    });
    expect(context.node.carrier).toBeUndefined();
  });

  it('labels the columns with the effective field labels of the requester locale', async () => {
    const getI18nContextByApplicationIds = jest.fn(async () => () => ({
      ...untranslatedI18nContext,
      locale: 'fr-FR' as const,
    }));

    const context = await buildContext({
      relationSubFields: [leadSubField('dateOfBirth')],
      getI18nContextByApplicationIds,
    });

    expect(getI18nContextByApplicationIds).toHaveBeenCalledWith([
      APPLICATION_ID,
    ]);
    expect(getHeader(context)).toBe(
      'Id,Name,Prospect / Id,Prospect / Name / First Name,Prospect / Name / Last Name,Prospect / Date of Birth',
    );
  });

  it('writes rows the upstream formatter turns into the Omnia CSV', async () => {
    const context = await buildContext({
      fields: [policyFields.name, policyFields.lead, policyFields.carrier],
      relationSubFields: [
        leadSubField('dateOfBirth'),
        leadSubField('phones'),
        leadSubField('leadSource'),
        leadSubField('familyMembers'),
      ],
    });
    const record = {
      id: 'policy-1',
      name: 'Gold Plan',
      leadId: 'lead-1',
      carrierId: 'carrier-1',
      carrier: { id: 'carrier-1', name: 'Ambetter' },
      lead: {
        id: 'lead-1',
        name: { firstName: 'Ann', lastName: 'Lee' },
        dateOfBirth: '1980-02-03',
        phones: { primaryPhoneNumber: '+15550100' },
        leadSource: { id: 'source-1', name: 'Referral' },
        familyMembers: [
          {
            id: 'member-1',
            name: 'Bo Lee',
            memberType: 'SPOUSE',
            dateOfBirth: '1981-04-05',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
    };

    await flattenRelationSubFieldExportValues({
      records: [record],
      plan: context.plan,
      workspaceOrmManager: {} as WorkspaceOrmManager,
      authContext: {} as WorkspaceAuthContext,
    });

    expect(getHeader(context)).toBe(
      'Id,Name,Lead / Id,Lead / Name / First Name,Lead / Name / Last Name,Lead / Date of Birth,Lead / Phones / Primary Phone Number,Lead / Lead Source,Lead / Family Members,Carrier,Carrier Id',
    );
    expect(formatRecordExportRow({ columns: context.columns, record })).toBe(
      `policy-1,Gold Plan,lead-1,Ann,Lee,1980-02-03,${CSV_INJECTION_PREVENTION_ZWJ}+15550100,Referral,Bo Lee • Spouse • 04/05/81,Ambetter,carrier-1\n`,
    );
  });
});
