import { FieldMetadataType } from '../../types/FieldMetadataType';

type CoerceFieldDiffValueForRecordUpdateOptions = {
  fieldType?: string | null;
  currentValue?: unknown;
};

const NUMERIC_FIELD_TYPES = new Set<string>([
  FieldMetadataType.NUMBER,
  FieldMetadataType.NUMERIC,
  FieldMetadataType.POSITION,
]);

const shouldCoerceToNumber = ({
  fieldType,
  currentValue,
}: CoerceFieldDiffValueForRecordUpdateOptions) =>
  (fieldType !== null &&
    fieldType !== undefined &&
    NUMERIC_FIELD_TYPES.has(fieldType)) ||
  typeof currentValue === 'number';

export const coerceFieldDiffValueForRecordUpdate = (
  rawValue: string | null,
  options: CoerceFieldDiffValueForRecordUpdateOptions = {},
): unknown => {
  if (rawValue === null) {
    return null;
  }

  if (!shouldCoerceToNumber(options)) {
    return rawValue;
  }

  const trimmedValue = rawValue.trim();

  if (trimmedValue === '') {
    return null;
  }

  const numericValue = Number(trimmedValue);

  return Number.isFinite(numericValue) ? numericValue : rawValue;
};
