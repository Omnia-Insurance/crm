import { getLinksVariant } from '@/object-record/spreadsheet-import/utils/getLinksVariant';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';

import { getSpreadSheetFieldValidationDefinitions } from '@/object-record/spreadsheet-import/utils/getSpreadSheetFieldValidationDefinitions';
import { getRelationConnectSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadSheetGetRelationConnectSubFieldKey';
import { getCompositeSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetCompositeSubFieldKey';
import { getCompositeSubFieldLabelWithFieldLabel } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetCompositeSubFieldLabelWithFieldLabel';
import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { getRelationConnectSubFieldLabel } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationConnectSubFieldLabel';
import { getRelationUpdateSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldKey';
import { getRelationUpdateSubFieldLabel } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetRelationUpdateSubFieldLabel';
import { SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS } from '@/settings/data-model/constants/SettingsCompositeFieldTypeConfigs';
import { type CompositeFieldType } from '@/settings/data-model/types/CompositeFieldType';
import {
  type SpreadsheetImportField,
  type SpreadsheetImportFields,
} from '@/spreadsheet-import/types';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { type MessageDescriptor } from '@lingui/core';
import { COMPOSITE_FIELD_SUB_FIELD_LABELS } from 'twenty-shared/constants';
import { doNotTranslate } from 'twenty-shared/i18n';
import {
  assertUnreachable,
  getUniqueConstraintsFields,
  isDefined,
} from 'twenty-shared/utils';
import { useIcons } from 'twenty-ui/icon/provider';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';
import { useLingui } from '@lingui/react/macro';

const getSourceLocaleAlternateMatches = ({
  label,
  sourceLocaleLabel,
}: {
  label: string;
  sourceLocaleLabel: string;
}): Partial<SpreadsheetImportField> =>
  label === sourceLocaleLabel ? {} : { alternateMatches: [sourceLocaleLabel] };

export const useBuildSpreadsheetImportFields = () => {
  const { t } = useLingui();
  const { getIcon } = useIcons();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);

  const buildSpreadsheetImportFields = (
    fieldMetadataItems: FieldMetadataItem[],
  ): SpreadsheetImportFields => {
    return fieldMetadataItems
      .filter((field) => field.type !== FieldMetadataType.ACTOR)
      .flatMap((fieldMetadataItem) =>
        buildSpreadsheetImportField(fieldMetadataItem),
      );
  };

  const buildSpreadsheetImportField = (
    fieldMetadataItem: FieldMetadataItem,
    relationConnectFieldOverrides?: Partial<SpreadsheetImportField>,
  ) => {
    switch (fieldMetadataItem.type) {
      case FieldMetadataType.ADDRESS:
      case FieldMetadataType.CURRENCY:
      case FieldMetadataType.EMAILS:
      case FieldMetadataType.FULL_NAME:
      case FieldMetadataType.LINKS:
      case FieldMetadataType.PHONES:
      case FieldMetadataType.RICH_TEXT:
        return handleCompositeFields({
          fieldMetadataItem,
          fieldType: fieldMetadataItem.type,
        });
      case FieldMetadataType.RELATION:
        return handleRelationField(fieldMetadataItem);
      case FieldMetadataType.SELECT:
      case FieldMetadataType.MULTI_SELECT:
        return [
          handleSelectField(
            fieldMetadataItem,
            fieldMetadataItem.type === FieldMetadataType.MULTI_SELECT,
            relationConnectFieldOverrides,
          ),
        ];
      case FieldMetadataType.BOOLEAN:
        return [
          createBaseField(fieldMetadataItem, {
            fieldType: { type: 'checkbox' },
            ...(isDefined(relationConnectFieldOverrides)
              ? relationConnectFieldOverrides
              : {}),
          }),
        ];
      case FieldMetadataType.DATE_TIME:
      case FieldMetadataType.DATE:
      case FieldMetadataType.NUMBER:
      case FieldMetadataType.NUMERIC:
      case FieldMetadataType.TEXT:
      case FieldMetadataType.UUID:
      case FieldMetadataType.ARRAY:
      case FieldMetadataType.RATING:
      case FieldMetadataType.RAW_JSON:
        return [
          createBaseField(fieldMetadataItem, relationConnectFieldOverrides),
        ];

      case FieldMetadataType.FILES:
      case FieldMetadataType.POSITION:
      case FieldMetadataType.MORPH_RELATION:
      case FieldMetadataType.ACTOR:
      case FieldMetadataType.TS_VECTOR:
        return [];

      default:
        return assertUnreachable(fieldMetadataItem.type);
    }
  };

  const createBaseField = (
    fieldMetadataItem: FieldMetadataItem,
    overrides: Partial<SpreadsheetImportField> = {},
  ): SpreadsheetImportField => {
    return {
      Icon: getIcon(fieldMetadataItem.icon),
      label: fieldMetadataItem.label,
      key: fieldMetadataItem.name,
      fieldMetadataItemId: fieldMetadataItem.id,
      fieldType: { type: 'input' },
      fieldMetadataType: fieldMetadataItem.type,
      fieldValidationDefinitions: getSpreadSheetFieldValidationDefinitions(
        fieldMetadataItem.type,
        fieldMetadataItem.label,
        undefined,
        getLinksVariant(fieldMetadataItem),
      ),
      isNestedField: false,
      ...overrides,
    };
  };

  const handleCompositeFields = ({
    fieldMetadataItem,
    fieldType,
  }: {
    fieldMetadataItem: FieldMetadataItem;
    fieldType: CompositeFieldType;
  }) => {
    const spreadsheetImportFields: SpreadsheetImportField[] = [];

    SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[fieldType].subFields.forEach(
      ({ subFieldName, isImportable, subFieldLabel }) => {
        if (!isImportable) {
          return;
        }
        const label = getCompositeSubFieldLabelWithFieldLabel(
          fieldMetadataItem,
          t(subFieldLabel),
        );

        spreadsheetImportFields.push(
          createBaseField(fieldMetadataItem, {
            label,
            ...getSourceLocaleAlternateMatches({
              label,
              sourceLocaleLabel: getCompositeSubFieldLabelWithFieldLabel(
                fieldMetadataItem,
                COMPOSITE_FIELD_SUB_FIELD_LABELS[fieldType][subFieldName],
              ),
            }),
            key: getCompositeSubFieldKey(fieldMetadataItem, subFieldName),
            fieldValidationDefinitions:
              getSpreadSheetFieldValidationDefinitions(
                fieldMetadataItem.type,
                label,
                subFieldName,
                getLinksVariant(fieldMetadataItem),
              ),
            isNestedField: true,
            isCompositeSubField: true,
            compositeSubFieldKey: subFieldName,
          }),
        );
      },
    );

    return spreadsheetImportFields;
  };

  const handleCompositeFieldFromRelationConnectField = ({
    fieldMetadataItem,
    uniqueConstraintField,
    uniqueConstraintType,
  }: {
    fieldMetadataItem: FieldMetadataItem;
    uniqueConstraintField: FieldMetadataItem;
    uniqueConstraintType: CompositeFieldType;
  }) => {
    const spreadsheetImportFields: SpreadsheetImportField[] = [];

    SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[
      uniqueConstraintType
    ].subFields.forEach(
      ({
        subFieldName,
        subFieldLabel,
        isImportable,
        isIncludedInUniqueConstraint,
      }) => {
        if (!isImportable || !isIncludedInUniqueConstraint) {
          return;
        }

        const label = getRelationConnectSubFieldLabel(
          fieldMetadataItem,
          uniqueConstraintField,
          t(subFieldLabel),
        );

        spreadsheetImportFields.push(
          createBaseField(fieldMetadataItem, {
            label,
            ...getSourceLocaleAlternateMatches({
              label,
              sourceLocaleLabel: getRelationConnectSubFieldLabel(
                fieldMetadataItem,
                uniqueConstraintField,
                COMPOSITE_FIELD_SUB_FIELD_LABELS[uniqueConstraintType][
                  subFieldName
                ],
              ),
            }),
            key: getRelationConnectSubFieldKey(
              fieldMetadataItem,
              uniqueConstraintField,
              subFieldName,
            ),
            fieldValidationDefinitions:
              getSpreadSheetFieldValidationDefinitions(
                uniqueConstraintField.type,
                uniqueConstraintField.name,
                subFieldName,
                getLinksVariant(uniqueConstraintField),
              ),
            isNestedField: true,
            isCompositeSubField: true,
            compositeSubFieldKey: subFieldName,
            uniqueFieldMetadataItem: uniqueConstraintField,
            isRelationConnectField: true,
          }),
        );
      },
    );

    return spreadsheetImportFields;
  };

  // OMNIA-CUSTOM: fields of the related record, so a re-imported export updates them through the
  // relation column; columns the import must not change still match, as read-only fields.
  const createReadOnlyField = (
    fieldMetadataItem: FieldMetadataItem,
    overrides: Partial<SpreadsheetImportField>,
  ) =>
    createBaseField(fieldMetadataItem, {
      isNestedField: true,
      isReadOnly: true,
      description: t`Read-only — exported for reference`,
      fieldValidationDefinitions: [],
      ...overrides,
    });

  const createReadOnlyCompositeSubField = ({
    fieldMetadataItem,
    targetFieldMetadataItem,
    targetFieldType,
    subFieldName,
    subFieldLabel,
  }: {
    fieldMetadataItem: FieldMetadataItem;
    targetFieldMetadataItem: FieldMetadataItem;
    targetFieldType: CompositeFieldType;
    subFieldName: string;
    subFieldLabel: MessageDescriptor;
  }) => {
    const label = getRelationUpdateSubFieldLabel(
      fieldMetadataItem,
      targetFieldMetadataItem,
      t(subFieldLabel),
    );

    return createReadOnlyField(fieldMetadataItem, {
      label,
      ...getSourceLocaleAlternateMatches({
        label,
        sourceLocaleLabel: getRelationUpdateSubFieldLabel(
          fieldMetadataItem,
          targetFieldMetadataItem,
          COMPOSITE_FIELD_SUB_FIELD_LABELS[targetFieldType][subFieldName],
        ),
      }),
      key: `__readOnly:${fieldMetadataItem.name}.${targetFieldMetadataItem.name}.${subFieldName}`,
      isCompositeSubField: true,
      compositeSubFieldKey: subFieldName,
    });
  };

  const handleCompositeFieldFromRelationUpdateField = ({
    fieldMetadataItem,
    targetFieldMetadataItem,
    targetFieldType,
  }: {
    fieldMetadataItem: FieldMetadataItem;
    targetFieldMetadataItem: FieldMetadataItem;
    targetFieldType: CompositeFieldType;
  }) => {
    const spreadsheetImportFields: SpreadsheetImportField[] = [];

    SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[targetFieldType].subFields.forEach(
      ({ subFieldName, subFieldLabel, isImportable }) => {
        if (!isImportable) {
          return;
        }

        const label = getRelationUpdateSubFieldLabel(
          fieldMetadataItem,
          targetFieldMetadataItem,
          t(subFieldLabel),
        );

        spreadsheetImportFields.push(
          createBaseField(fieldMetadataItem, {
            label,
            ...getSourceLocaleAlternateMatches({
              label,
              sourceLocaleLabel: getRelationUpdateSubFieldLabel(
                fieldMetadataItem,
                targetFieldMetadataItem,
                COMPOSITE_FIELD_SUB_FIELD_LABELS[targetFieldType][subFieldName],
              ),
            }),
            key: getRelationUpdateSubFieldKey(
              fieldMetadataItem,
              targetFieldMetadataItem,
              subFieldName,
            ),
            fieldValidationDefinitions:
              getSpreadSheetFieldValidationDefinitions(
                targetFieldMetadataItem.type,
                label,
                subFieldName,
                getLinksVariant(targetFieldMetadataItem),
              ),
            isNestedField: true,
            isCompositeSubField: true,
            compositeSubFieldKey: subFieldName,
            isRelationUpdateField: true,
            targetFieldMetadataItem,
          }),
        );
      },
    );

    return spreadsheetImportFields;
  };

  const handleRelationUpdateFields = ({
    fieldMetadataItem,
    targetObjectMetadataItem,
    uniqueConstraintFields,
    relationConnectFields,
  }: {
    fieldMetadataItem: FieldMetadataItem;
    targetObjectMetadataItem: EnrichedObjectMetadataItem;
    uniqueConstraintFields: FieldMetadataItem[];
    relationConnectFields: SpreadsheetImportField[];
  }) => {
    const spreadsheetImportFields: SpreadsheetImportField[] = [];

    const uniqueConstraintFieldIds = new Set(
      uniqueConstraintFields.map(({ id }) => id),
    );

    const availableTargetFieldMetadataItems =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        targetObjectMetadataItem.updatableFields,
      );

    for (const targetFieldMetadataItem of availableTargetFieldMetadataItems) {
      if (uniqueConstraintFieldIds.has(targetFieldMetadataItem.id)) {
        // A composite connect field matches on its unique sub-fields only
        if (isCompositeFieldType(targetFieldMetadataItem.type)) {
          for (const subField of SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[
            targetFieldMetadataItem.type
          ].subFields) {
            if (
              subField.isImportable &&
              !subField.isIncludedInUniqueConstraint
            ) {
              spreadsheetImportFields.push(
                createReadOnlyCompositeSubField({
                  fieldMetadataItem,
                  targetFieldMetadataItem,
                  targetFieldType: targetFieldMetadataItem.type,
                  subFieldName: subField.subFieldName,
                  subFieldLabel: subField.subFieldLabel,
                }),
              );
            }
          }
        }

        continue;
      }

      if (targetFieldMetadataItem.type === FieldMetadataType.ACTOR) {
        continue;
      }

      if (targetFieldMetadataItem.type === FieldMetadataType.RELATION) {
        spreadsheetImportFields.push(
          createReadOnlyField(fieldMetadataItem, {
            label: getRelationUpdateSubFieldLabel(
              fieldMetadataItem,
              targetFieldMetadataItem,
            ),
            key: `__readOnly:${fieldMetadataItem.name}.${targetFieldMetadataItem.name}`,
          }),
        );
        continue;
      }

      if (isCompositeFieldType(targetFieldMetadataItem.type)) {
        spreadsheetImportFields.push(
          ...handleCompositeFieldFromRelationUpdateField({
            fieldMetadataItem,
            targetFieldMetadataItem,
            targetFieldType: targetFieldMetadataItem.type,
          }),
        );
        continue;
      }

      const label = getRelationUpdateSubFieldLabel(
        fieldMetadataItem,
        targetFieldMetadataItem,
      );

      spreadsheetImportFields.push(
        createBaseField(fieldMetadataItem, {
          label,
          key: getRelationUpdateSubFieldKey(
            fieldMetadataItem,
            targetFieldMetadataItem,
          ),
          fieldValidationDefinitions: getSpreadSheetFieldValidationDefinitions(
            targetFieldMetadataItem.type,
            label,
          ),
          isNestedField: true,
          isCompositeSubField: false,
          isRelationUpdateField: true,
          targetFieldMetadataItem,
        }),
      );
    }

    // The export also writes one-to-many lists and non-importable sub-fields such as latitude
    const readOnlyFields: SpreadsheetImportField[] = [];

    for (const targetFieldMetadataItem of targetObjectMetadataItem.fields) {
      if (
        targetFieldMetadataItem.isActive &&
        targetFieldMetadataItem.type === FieldMetadataType.RELATION &&
        targetFieldMetadataItem.relation?.type === RelationType.ONE_TO_MANY
      ) {
        readOnlyFields.push(
          createReadOnlyField(fieldMetadataItem, {
            label: getRelationUpdateSubFieldLabel(
              fieldMetadataItem,
              targetFieldMetadataItem,
            ),
            key: `__readOnly:${fieldMetadataItem.name}.${targetFieldMetadataItem.name}`,
          }),
        );
      }
    }

    for (const targetFieldMetadataItem of availableTargetFieldMetadataItems) {
      if (!isCompositeFieldType(targetFieldMetadataItem.type)) {
        continue;
      }

      for (const subField of SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[
        targetFieldMetadataItem.type
      ].subFields) {
        if (!subField.isImportable) {
          readOnlyFields.push(
            createReadOnlyCompositeSubField({
              fieldMetadataItem,
              targetFieldMetadataItem,
              targetFieldType: targetFieldMetadataItem.type,
              subFieldName: subField.subFieldName,
              subFieldLabel: subField.subFieldLabel,
            }),
          );
        }
      }
    }

    const existingLabels = new Set(
      [...relationConnectFields, ...spreadsheetImportFields].map(({ label }) =>
        label.toLowerCase(),
      ),
    );

    return [
      ...spreadsheetImportFields,
      ...readOnlyFields.filter(
        ({ label }) => !existingLabels.has(label.toLowerCase()),
      ),
    ];
  };

  const handleSelectField = (
    fieldMetadataItem: FieldMetadataItem,
    isMulti = false,
    subFieldOverrides?: Record<string, any>,
  ) =>
    createBaseField(fieldMetadataItem, {
      fieldType: {
        type: isMulti ? 'multiSelect' : 'select',
        options:
          fieldMetadataItem.options?.map((option) => ({
            label: option.label,
            value: option.value,
            color: option.color,
          })) || [],
        ...(isDefined(subFieldOverrides) ? subFieldOverrides : {}),
      },
      fieldValidationDefinitions: getSpreadSheetFieldValidationDefinitions(
        fieldMetadataItem.type,
        `${fieldMetadataItem.label} (ID)`,
      ),
    });

  const handleRelationField = (fieldMetadataItem: FieldMetadataItem) => {
    const spreadsheetImportFields: SpreadsheetImportField[] = [];

    const isManyToOneRelation =
      fieldMetadataItem.relation?.type === RelationType.MANY_TO_ONE;

    const targetObjectMetadataItem = objectMetadataItems?.find(
      (objectMetadataItem) =>
        objectMetadataItem.id ===
        fieldMetadataItem.relation?.targetObjectMetadata.id,
    );

    if (isManyToOneRelation && isDefined(targetObjectMetadataItem)) {
      // OMNIA-CUSTOM: matches the export's "<Relation>" column, so a re-import can look the record up by name
      spreadsheetImportFields.push(
        createBaseField(fieldMetadataItem, {
          label: fieldMetadataItem.label,
          key: `__relationLabel:${fieldMetadataItem.name}`,
          isNestedField: false,
          isCompositeSubField: false,
          fieldValidationDefinitions: [],
        }),
      );

      const uniqueConstraintFields = getUniqueConstraintsFields<
        FieldMetadataItem,
        EnrichedObjectMetadataItem
      >(targetObjectMetadataItem);

      //todo - update logic when composite unique indexes will be supported
      for (const uniqueConstraintField of uniqueConstraintFields.flat()) {
        if (isCompositeFieldType(uniqueConstraintField.type)) {
          spreadsheetImportFields.push(
            ...handleCompositeFieldFromRelationConnectField({
              fieldMetadataItem,
              uniqueConstraintField,
              uniqueConstraintType: uniqueConstraintField.type,
            }),
          );
        } else {
          spreadsheetImportFields.push(
            ...buildSpreadsheetImportField(uniqueConstraintField, {
              Icon: getIcon(fieldMetadataItem.icon),
              isNestedField: true,
              isCompositeSubField: false,
              isRelationConnectField: true,
              fieldMetadataItemId: fieldMetadataItem.id,
              fieldMetadataType: FieldMetadataType.RELATION,
              uniqueFieldMetadataItem: uniqueConstraintField,
              label: getRelationConnectSubFieldLabel(
                fieldMetadataItem,
                uniqueConstraintField,
              ),
              // OMNIA-CUSTOM: upstream exports this id as "<Relation> Id"; matching it reconnects by id (OMN-465)
              ...(uniqueConstraintField.name === 'id'
                ? {
                    alternateMatches: [
                      `${fieldMetadataItem.label} ${doNotTranslate('Id')}`,
                    ],
                  }
                : {}),
              key: getRelationConnectSubFieldKey(
                fieldMetadataItem,
                uniqueConstraintField,
              ),
            }),
          );
        }
      }

      // OMNIA-CUSTOM: see handleRelationUpdateFields
      spreadsheetImportFields.push(
        ...handleRelationUpdateFields({
          fieldMetadataItem,
          targetObjectMetadataItem,
          uniqueConstraintFields: uniqueConstraintFields.flat(),
          relationConnectFields: spreadsheetImportFields,
        }),
      );
    }

    return spreadsheetImportFields;
  };

  return { buildSpreadsheetImportFields };
};
