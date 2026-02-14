import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getLabelIdentifierFieldMetadataItem } from '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem';
import { getLabelIdentifierFieldValue } from '@/object-metadata/utils/getLabelIdentifierFieldValue';
import { type FieldCurrencyValue } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isDefined } from 'twenty-shared/utils';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { convertCurrencyMicrosToCurrencyAmount } from '~/utils/convertCurrencyToCurrencyMicros';

export const useExportProcessRecordsForCSV = (objectNameSingular: string) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const { objectMetadataItems } = useObjectMetadataItems();

  const processRecordsForCSVExport = (records: ObjectRecord[]) => {
    return records.map((record) =>
      objectMetadataItem.fields.reduce(
        (processedRecord, field) => {
          if (!isDefined(record[field.name])) {
            return processedRecord;
          }

          switch (field.type) {
            case FieldMetadataType.CURRENCY:
              return {
                ...processedRecord,
                [field.name]: {
                  amountMicros: convertCurrencyMicrosToCurrencyAmount(
                    record[field.name].amountMicros,
                  ),
                  currencyCode: record[field.name].currencyCode,
                } satisfies FieldCurrencyValue,
              };
            case FieldMetadataType.RELATION: {
              const targetObjectNameSingular =
                field.relation?.targetObjectMetadata?.nameSingular;

              if (!isDefined(targetObjectNameSingular)) {
                return processedRecord;
              }

              const targetObjectMetadataItem = objectMetadataItems.find(
                (item) => item.nameSingular === targetObjectNameSingular,
              );

              if (!isDefined(targetObjectMetadataItem)) {
                return processedRecord;
              }

              const labelIdentifierField = getLabelIdentifierFieldMetadataItem(
                targetObjectMetadataItem,
              );

              const displayValue = getLabelIdentifierFieldValue(
                record[field.name],
                labelIdentifierField,
              );

              return {
                ...processedRecord,
                [field.name]: displayValue,
              };
            }
            case FieldMetadataType.MULTI_SELECT:
            case FieldMetadataType.ARRAY:
            case FieldMetadataType.RAW_JSON:
            case FieldMetadataType.FILES:
              return {
                ...processedRecord,
                [field.name]: JSON.stringify(record[field.name]),
              };
            default:
              return processedRecord;
          }
        },
        { ...record },
      ),
    );
  };

  return { processRecordsForCSVExport };
};
