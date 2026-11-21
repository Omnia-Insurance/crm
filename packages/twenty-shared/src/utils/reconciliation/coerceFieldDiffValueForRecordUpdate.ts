import { FieldMetadataType } from '@/types/FieldMetadataType';
import { isDefined } from '@/utils/validation/isDefined';

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
  (isDefined(fieldType) && NUMERIC_FIELD_TYPES.has(fieldType)) ||
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
