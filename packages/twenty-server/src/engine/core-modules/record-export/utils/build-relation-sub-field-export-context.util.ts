import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

import { t } from '@lingui/core/macro';
import { COMPOSITE_FIELD_SUB_FIELD_LABELS } from 'twenty-shared/constants';
import { doNotTranslate } from 'twenty-shared/i18n';
import { checkIfFieldIsLabelIdentifier } from 'twenty-shared/metadata';
import {
  FieldMetadataType,
  type RecordExportColumn,
  RelationType,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type CommonSelectedFields } from 'src/engine/api/common/types/common-selected-fields-result.type';
import { type RecordExportParameters } from 'src/engine/core-modules/record-export/types/record-export-parameters.type';
import {
  type RecordExportRelationSubFieldCell,
  type RecordExportRelationSubFieldPlan,
} from 'src/engine/core-modules/record-export/types/record-export-relation-sub-field-plan.type';
import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { findManyFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-many-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isFlatFieldMetadataOfType } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-type.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type EffectiveEntityI18nContext } from 'src/engine/metadata-modules/overrides/types/effective-entity-i18n-context.type';
import { resolveEffectiveTranslatedFlatEntity } from 'src/engine/metadata-modules/overrides/utils/resolve-effective-translated-flat-entity.util';
import { type RecordReadRestrictions } from 'src/engine/permissions/types/record-read-restrictions.type';

const logger = new Logger('RecordExportRelationSubFields');

const COMPOSITE_SUB_FIELD_LABELS_BY_TYPE: Partial<
  Record<FieldMetadataType, Record<string, string>>
> = COMPOSITE_FIELD_SUB_FIELD_LABELS;

const ADDRESS_SUB_FIELDS_LEFT_OUT = new Set([
  'addressCountry',
  'addressLat',
  'addressLng',
]);

const UNSUPPORTED_SUB_FIELD_TYPES = new Set<FieldMetadataType>([
  FieldMetadataType.MORPH_RELATION,
  FieldMetadataType.TS_VECTOR,
]);

// Children are listed newest first, and family members as "Name • Type • MM/DD/YY"
const ONE_TO_MANY_ITEM_FIELD_NAMES = new Set([
  'createdAt',
  'memberType',
  'dateOfBirth',
]);

type ExportedRelationGroup = {
  relationField: FlatFieldMetadata;
  labelField?: FlatFieldMetadata;
  subFields: FlatFieldMetadata[];
};

type ExportedRelationColumns = {
  columns: RecordExportColumn[];
  cells: RecordExportRelationSubFieldCell[];
  node: CommonSelectedFields;
};

type RelationSubFieldExportMetadata = {
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  recordReadRestrictions: RecordReadRestrictions;
  shouldIncludeInactiveFields: boolean;
};

const createExportFieldUnavailableException = () =>
  new BadRequestException(t`An export field is no longer available.`);

const getRelationType = (field: FlatFieldMetadata): RelationType | undefined =>
  isFlatFieldMetadataOfType(field, FieldMetadataType.RELATION)
    ? field.settings?.relationType
    : undefined;

// Q11: the Omnia re-import workflow expects primary email, primary phone and no country, latitude or longitude
const isExportedCompositeSubField = ({
  type,
  subFieldName,
}: {
  type: FieldMetadataType;
  subFieldName: string;
}): boolean => {
  switch (type) {
    case FieldMetadataType.EMAILS:
      return subFieldName === 'primaryEmail';
    case FieldMetadataType.PHONES:
      return subFieldName === 'primaryPhoneNumber';
    case FieldMetadataType.ADDRESS:
      return !ADDRESS_SUB_FIELDS_LEFT_OUT.has(subFieldName);
    default:
      return true;
  }
};

const getExportedCompositeSubFieldNames = (
  type: FieldMetadataType,
): string[] | undefined => {
  const subFieldLabels = COMPOSITE_SUB_FIELD_LABELS_BY_TYPE[type];

  return isDefined(subFieldLabels)
    ? Object.keys(subFieldLabels).filter((subFieldName) =>
        isExportedCompositeSubField({ type, subFieldName }),
      )
    : undefined;
};

const buildFieldSelection = (
  field: FlatFieldMetadata,
): boolean | CommonSelectedFields => {
  const subFieldNames = getExportedCompositeSubFieldNames(field.type);

  return isDefined(subFieldNames)
    ? Object.fromEntries(
        subFieldNames.map((subFieldName) => [subFieldName, true]),
      )
    : true;
};

const buildCellKey = (relationFieldName: string, suffix: string) =>
  `${relationFieldName}__${suffix}`;

const mergeSelectedFields = (
  target: CommonSelectedFields,
  patch: CommonSelectedFields,
): CommonSelectedFields =>
  Object.entries(patch).reduce<CommonSelectedFields>(
    (merged, [key, value]) => {
      const existing = merged[key];

      return {
        ...merged,
        [key]:
          typeof existing === 'object' && typeof value === 'object'
            ? mergeSelectedFields(existing, value)
            : value,
      };
    },
    { ...target },
  );

const findFlatObjectMetadata = (
  flatObjectMetadataId: string | null,
  { flatObjectMetadataMaps }: RelationSubFieldExportMetadata,
): FlatObjectMetadata | undefined =>
  isDefined(flatObjectMetadataId)
    ? findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: flatObjectMetadataId,
        flatEntityMaps: flatObjectMetadataMaps,
      })
    : undefined;

const findFlatFieldMetadata = (
  flatFieldMetadataId: string | null,
  { flatFieldMetadataMaps }: RelationSubFieldExportMetadata,
): FlatFieldMetadata | undefined =>
  isDefined(flatFieldMetadataId)
    ? findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: flatFieldMetadataId,
        flatEntityMaps: flatFieldMetadataMaps,
      })
    : undefined;

const getObjectFields = (
  flatObjectMetadata: FlatObjectMetadata,
  { flatFieldMetadataMaps }: RelationSubFieldExportMetadata,
): FlatFieldMetadata[] =>
  findManyFlatEntityByIdInFlatEntityMaps({
    flatEntityIds: flatObjectMetadata.fieldIds,
    flatEntityMaps: flatFieldMetadataMaps,
  });

const isFieldAvailable = (
  field: FlatFieldMetadata,
  { shouldIncludeInactiveFields }: RelationSubFieldExportMetadata,
) => shouldIncludeInactiveFields || field.isActive;

const isFieldReadable = (
  field: FlatFieldMetadata,
  { recordReadRestrictions }: RelationSubFieldExportMetadata,
) => !recordReadRestrictions.unreadableFieldMetadataIds.has(field.id);

const isObjectReadable = (
  flatObjectMetadataId: string | null,
  { recordReadRestrictions }: RelationSubFieldExportMetadata,
) =>
  !isDefined(flatObjectMetadataId) ||
  !recordReadRestrictions.unreadableObjectMetadataIds.has(flatObjectMetadataId);

// The export adds labels on its own, so an unreadable one is left out rather than failing the export
const findExportableLabelField = (
  flatObjectMetadata: FlatObjectMetadata,
  metadata: RelationSubFieldExportMetadata,
): FlatFieldMetadata | undefined => {
  if (!isObjectReadable(flatObjectMetadata.id, metadata)) {
    return undefined;
  }

  const labelField = getObjectFields(flatObjectMetadata, metadata).find(
    (field) => checkIfFieldIsLabelIdentifier(field, flatObjectMetadata),
  );

  return isDefined(labelField) &&
    labelField.name !== 'id' &&
    isFieldAvailable(labelField, metadata) &&
    isFieldReadable(labelField, metadata)
    ? labelField
    : undefined;
};

const resolveExportedRelationGroups = ({
  relationSubFields,
  rootFlatObjectMetadata,
  metadata,
}: {
  relationSubFields: NonNullable<RecordExportParameters['relationSubFields']>;
  rootFlatObjectMetadata: FlatObjectMetadata;
  metadata: RelationSubFieldExportMetadata;
}): ExportedRelationGroup[] => {
  const groupByRelationFieldId = new Map<string, ExportedRelationGroup>();
  const requestedSubFieldKeys = new Set<string>();

  for (const { fieldMetadataId, subFieldName } of relationSubFields) {
    const requestedSubFieldKey = `${fieldMetadataId}:${subFieldName}`;

    if (requestedSubFieldKeys.has(requestedSubFieldKey)) {
      continue;
    }

    requestedSubFieldKeys.add(requestedSubFieldKey);

    const relationField = findFlatFieldMetadata(fieldMetadataId, metadata);

    if (
      !isDefined(relationField) ||
      relationField.objectMetadataId !== rootFlatObjectMetadata.id ||
      getRelationType(relationField) !== RelationType.MANY_TO_ONE ||
      !isFieldAvailable(relationField, metadata)
    ) {
      throw createExportFieldUnavailableException();
    }

    const targetObject = findFlatObjectMetadata(
      relationField.relationTargetObjectMetadataId,
      metadata,
    );
    const subField = isDefined(targetObject)
      ? getObjectFields(targetObject, metadata).find(
          (field) => field.name === subFieldName,
        )
      : undefined;

    if (
      !isDefined(targetObject) ||
      !isDefined(subField) ||
      !isFieldAvailable(subField, metadata) ||
      UNSUPPORTED_SUB_FIELD_TYPES.has(subField.type)
    ) {
      throw createExportFieldUnavailableException();
    }

    // A list of the exported object's own records would repeat every sibling in every row
    if (
      getRelationType(subField) === RelationType.ONE_TO_MANY &&
      subField.relationTargetObjectMetadataId === rootFlatObjectMetadata.id
    ) {
      logger.warn(
        `Skipping ONE_TO_MANY back-reference ${targetObject.nameSingular}.${subField.name} -> ${rootFlatObjectMetadata.nameSingular} (export root object)`,
      );

      continue;
    }

    // The query runner checks selected columns only, and a one-to-many sub-field has none. A nested read of
    // an object the role cannot read would only fail inside the job, with a generic error.
    if (
      !isFieldReadable(relationField, metadata) ||
      !isFieldReadable(subField, metadata) ||
      !isObjectReadable(targetObject.id, metadata) ||
      (isDefined(getRelationType(subField)) &&
        !isObjectReadable(subField.relationTargetObjectMetadataId, metadata))
    ) {
      throw new ForbiddenException(
        t`You do not have permission to export one of the selected columns.`,
      );
    }

    const group = groupByRelationFieldId.get(relationField.id) ?? {
      relationField,
      labelField: findExportableLabelField(targetObject, metadata),
      subFields: [],
    };

    group.subFields.push(subField);
    groupByRelationFieldId.set(relationField.id, group);
  }

  return [...groupByRelationFieldId.values()];
};

const buildNestedRelationLabelColumn = ({
  key,
  label,
  relationFieldName,
  field,
  metadata,
}: {
  key: string;
  label: string;
  relationFieldName: string;
  field: FlatFieldMetadata;
  metadata: RelationSubFieldExportMetadata;
}): ExportedRelationColumns => {
  const nestedTargetObject = findFlatObjectMetadata(
    field.relationTargetObjectMetadataId,
    metadata,
  );
  const nestedLabelField = isDefined(nestedTargetObject)
    ? findExportableLabelField(nestedTargetObject, metadata)
    : undefined;

  return {
    columns: [{ fieldName: key, label, type: FieldMetadataType.TEXT }],
    cells: [
      {
        kind: 'label',
        key,
        recordPath: [relationFieldName, field.name],
        labelFieldName: nestedLabelField?.name,
      },
    ],
    node: {
      [field.name]: {
        id: true,
        ...(isDefined(nestedLabelField)
          ? { [nestedLabelField.name]: buildFieldSelection(nestedLabelField) }
          : {}),
      },
    },
  };
};

const buildOneToManyListColumn = ({
  key,
  label,
  relationFieldName,
  field,
  metadata,
}: {
  key: string;
  label: string;
  relationFieldName: string;
  field: FlatFieldMetadata;
  metadata: RelationSubFieldExportMetadata;
}): ExportedRelationColumns => {
  const childObject = findFlatObjectMetadata(
    field.relationTargetObjectMetadataId,
    metadata,
  );
  const childJoinField = findFlatFieldMetadata(
    field.relationTargetFieldMetadataId,
    metadata,
  );

  if (!isDefined(childObject) || !isDefined(childJoinField)) {
    throw createExportFieldUnavailableException();
  }

  const childLabelField = findExportableLabelField(childObject, metadata);
  const childItemFields = getObjectFields(childObject, metadata).filter(
    (childField) =>
      ONE_TO_MANY_ITEM_FIELD_NAMES.has(childField.name) &&
      isFieldAvailable(childField, metadata) &&
      isFieldReadable(childField, metadata),
  );

  return {
    columns: [{ fieldName: key, label, type: FieldMetadataType.TEXT }],
    cells: [
      {
        kind: 'list',
        key,
        relationFieldName,
        fieldName: field.name,
        labelFieldName: childLabelField?.name,
        childObjectNameSingular: childObject.nameSingular,
        childJoinColumnName: computeMorphOrRelationFieldJoinColumnName({
          name: childJoinField.name,
        }),
      },
    ],
    node: {
      [field.name]: {
        id: true,
        ...Object.fromEntries(
          childItemFields.map((childField) => [childField.name, true]),
        ),
        ...(isDefined(childLabelField)
          ? { [childLabelField.name]: buildFieldSelection(childLabelField) }
          : {}),
      },
    },
  };
};

const buildRelatedValueColumns = ({
  key,
  label,
  relationFieldName,
  field,
}: {
  key: string;
  label: string;
  relationFieldName: string;
  field: FlatFieldMetadata;
}): ExportedRelationColumns => {
  const compositeSubFieldNames = getExportedCompositeSubFieldNames(field.type);

  return {
    columns: isDefined(compositeSubFieldNames)
      ? compositeSubFieldNames.map((subFieldName) => ({
          fieldName: key,
          label: `${label} / ${COMPOSITE_SUB_FIELD_LABELS_BY_TYPE[field.type]?.[subFieldName] ?? subFieldName}`,
          type: field.type,
          subFieldName,
        }))
      : [{ fieldName: key, label, type: field.type }],
    cells: [
      {
        kind: 'value',
        key,
        relationFieldName,
        fieldName: field.name,
        isAddress: field.type === FieldMetadataType.ADDRESS,
      },
    ],
    node: { [field.name]: buildFieldSelection(field) },
  };
};

const buildRelationGroupColumns = ({
  group,
  getFieldLabel,
  metadata,
}: {
  group: ExportedRelationGroup;
  getFieldLabel: (field: FlatFieldMetadata) => string;
  metadata: RelationSubFieldExportMetadata;
}): ExportedRelationColumns => {
  const { relationField, labelField, subFields } = group;
  const relationFieldName = relationField.name;
  const relationLabel = getFieldLabel(relationField);
  const joinColumnName = computeMorphOrRelationFieldJoinColumnName({
    name: relationFieldName,
  });
  const idKey = buildCellKey(relationFieldName, 'id');
  const valueFields = [
    ...(isDefined(labelField) ? [labelField] : []),
    ...subFields.filter(
      (subField) => subField.name !== 'id' && subField.id !== labelField?.id,
    ),
  ];
  const valueColumns = valueFields.map((field) => {
    const columnArgs = {
      key: buildCellKey(relationFieldName, field.name),
      label: `${relationLabel} / ${getFieldLabel(field)}`,
      relationFieldName,
      field,
      metadata,
    };

    switch (getRelationType(field)) {
      case RelationType.MANY_TO_ONE:
        return buildNestedRelationLabelColumn(columnArgs);
      case RelationType.ONE_TO_MANY:
        return buildOneToManyListColumn(columnArgs);
      default:
        return buildRelatedValueColumns(columnArgs);
    }
  });

  return {
    columns: [
      {
        fieldName: idKey,
        label: `${relationLabel} / ${doNotTranslate('Id')}`,
        type: FieldMetadataType.UUID,
      },
      ...valueColumns.flatMap(({ columns }) => columns),
    ],
    // OMN-465: re-import reconnects by this id, read from the root join column because RLS can hide the related record
    cells: [
      { kind: 'joinColumn', key: idKey, joinColumnName },
      ...valueColumns.flatMap(({ cells }) => cells),
    ],
    node: {
      [relationFieldName]: valueColumns.reduce<CommonSelectedFields>(
        (relationNode, { node }) => mergeSelectedFields(relationNode, node),
        { id: true },
      ),
      [joinColumnName]: true,
    },
  };
};

const buildRelationLabelColumn = ({
  relationField,
  labelField,
  getFieldLabel,
}: {
  relationField: FlatFieldMetadata;
  labelField: FlatFieldMetadata;
  getFieldLabel: (field: FlatFieldMetadata) => string;
}): ExportedRelationColumns => {
  const key = buildCellKey(relationField.name, 'label');

  return {
    columns: [
      {
        fieldName: key,
        label: getFieldLabel(relationField),
        type: FieldMetadataType.TEXT,
      },
    ],
    cells: [
      {
        kind: 'label',
        key,
        recordPath: [relationField.name],
        labelFieldName: labelField.name,
      },
    ],
    node: {
      [relationField.name]: {
        id: true,
        [labelField.name]: buildFieldSelection(labelField),
      },
    },
  };
};

// Lays Omnia's relation columns over upstream's: a "<Rel> / Id, <Rel> / <Label>, <Rel> / <Sub>" group replaces
// "<Rel> Id" for a relation with sub-fields, and any other to-one relation gains a "<Rel>" label column before it.
// A group whose relation is not among fieldMetadataIds goes after every other column.
export const buildRelationSubFieldExportContext = async ({
  parameters,
  columns,
  node,
  flatObjectMetadata,
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  recordReadRestrictions,
  shouldIncludeInactiveFields = false,
  getI18nContextByApplicationIds,
}: {
  parameters: Pick<
    RecordExportParameters,
    'fieldMetadataIds' | 'relationSubFields'
  >;
  columns: RecordExportColumn[];
  node: CommonSelectedFields;
  flatObjectMetadata: FlatObjectMetadata;
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  recordReadRestrictions: RecordReadRestrictions;
  shouldIncludeInactiveFields?: boolean;
  getI18nContextByApplicationIds: (
    applicationIds: string[],
  ) => Promise<(applicationId: string) => EffectiveEntityI18nContext>;
}): Promise<{
  columns: RecordExportColumn[];
  node: CommonSelectedFields;
  plan: RecordExportRelationSubFieldPlan;
}> => {
  const metadata: RelationSubFieldExportMetadata = {
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
    recordReadRestrictions,
    shouldIncludeInactiveFields,
  };
  const groups = resolveExportedRelationGroups({
    relationSubFields: parameters.relationSubFields ?? [],
    rootFlatObjectMetadata: flatObjectMetadata,
    metadata,
  });
  const groupRelationFieldIds = new Set(
    groups.map(({ relationField }) => relationField.id),
  );
  const labelledRelations = parameters.fieldMetadataIds.flatMap(
    (fieldMetadataId) => {
      const relationField = findFlatFieldMetadata(fieldMetadataId, metadata);

      if (
        !isDefined(relationField) ||
        getRelationType(relationField) !== RelationType.MANY_TO_ONE ||
        groupRelationFieldIds.has(relationField.id)
      ) {
        return [];
      }

      const targetObject = findFlatObjectMetadata(
        relationField.relationTargetObjectMetadataId,
        metadata,
      );
      const labelField = isDefined(targetObject)
        ? findExportableLabelField(targetObject, metadata)
        : undefined;

      return isDefined(labelField) ? [{ relationField, labelField }] : [];
    },
  );

  const labelledFields = [
    ...groups.flatMap(({ relationField, labelField, subFields }) => [
      relationField,
      ...(isDefined(labelField) ? [labelField] : []),
      ...subFields,
    ]),
    ...labelledRelations.map(({ relationField }) => relationField),
  ];
  const getI18nContext =
    labelledFields.length > 0
      ? await getI18nContextByApplicationIds([
          ...new Set(labelledFields.map(({ applicationId }) => applicationId)),
        ])
      : undefined;
  const getFieldLabel = (field: FlatFieldMetadata): string =>
    isDefined(getI18nContext)
      ? resolveEffectiveTranslatedFlatEntity({
          metadataName: 'fieldMetadata',
          flatEntity: field,
          i18nContext: getI18nContext(field.applicationId),
        }).label
      : field.label;

  const exportedFieldIds = new Set(parameters.fieldMetadataIds);
  const groupColumnsByJoinColumnName = new Map<string, RecordExportColumn[]>();
  const labelColumnsByJoinColumnName = new Map<string, RecordExportColumn[]>();
  const trailingColumns: RecordExportColumn[] = [];
  const cells: RecordExportRelationSubFieldCell[] = [];
  let exportedNode: CommonSelectedFields = { ...node };

  for (const group of groups) {
    const groupColumns = buildRelationGroupColumns({
      group,
      getFieldLabel,
      metadata,
    });

    cells.push(...groupColumns.cells);
    exportedNode = mergeSelectedFields(exportedNode, groupColumns.node);

    if (exportedFieldIds.has(group.relationField.id)) {
      groupColumnsByJoinColumnName.set(
        computeMorphOrRelationFieldJoinColumnName({
          name: group.relationField.name,
        }),
        groupColumns.columns,
      );
    } else {
      trailingColumns.push(...groupColumns.columns);
    }
  }

  for (const { relationField, labelField } of labelledRelations) {
    const labelColumn = buildRelationLabelColumn({
      relationField,
      labelField,
      getFieldLabel,
    });

    cells.push(...labelColumn.cells);
    exportedNode = mergeSelectedFields(exportedNode, labelColumn.node);
    labelColumnsByJoinColumnName.set(
      computeMorphOrRelationFieldJoinColumnName({ name: relationField.name }),
      labelColumn.columns,
    );
  }

  const exportedColumns: RecordExportColumn[] = [];

  for (const column of columns) {
    if (!isDefined(column.subFieldName)) {
      const joinColumnName =
        column.type === FieldMetadataType.UUID ? column.fieldName : undefined;
      const groupColumns = isDefined(joinColumnName)
        ? groupColumnsByJoinColumnName.get(joinColumnName)
        : undefined;
      const labelColumns = isDefined(joinColumnName)
        ? labelColumnsByJoinColumnName.get(joinColumnName)
        : undefined;

      exportedColumns.push(
        ...(groupColumns ?? [...(labelColumns ?? []), column]),
      );

      continue;
    }

    if (
      isExportedCompositeSubField({
        type: column.type,
        subFieldName: column.subFieldName,
      })
    ) {
      exportedColumns.push(column);

      continue;
    }

    const compositeNode = exportedNode[column.fieldName];

    if (typeof compositeNode === 'object') {
      const { [column.subFieldName]: _, ...exportedSubFields } = compositeNode;

      exportedNode = { ...exportedNode, [column.fieldName]: exportedSubFields };
    }
  }

  return {
    columns: [...exportedColumns, ...trailingColumns],
    node: exportedNode,
    plan: {
      cells,
      addressFieldNames: [
        ...new Set(
          columns
            .filter(
              (column) =>
                column.type === FieldMetadataType.ADDRESS &&
                column.subFieldName === 'addressState',
            )
            .map((column) => column.fieldName),
        ),
      ],
    },
  };
};
