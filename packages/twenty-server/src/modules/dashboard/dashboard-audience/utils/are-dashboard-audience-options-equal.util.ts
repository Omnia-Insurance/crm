import { type FieldMetadataComplexOption } from 'twenty-shared/types';

const sortByPosition = (options: FieldMetadataComplexOption[]) =>
  [...options].sort((left, right) => left.position - right.position);

export const areDashboardAudienceOptionsEqual = (
  currentOptions: FieldMetadataComplexOption[],
  desiredOptions: FieldMetadataComplexOption[],
): boolean => {
  if (currentOptions.length !== desiredOptions.length) {
    return false;
  }

  const sortedDesiredOptions = sortByPosition(desiredOptions);

  return sortByPosition(currentOptions).every((currentOption, index) => {
    const desiredOption = sortedDesiredOptions[index];

    return (
      currentOption.value === desiredOption.value &&
      currentOption.label === desiredOption.label &&
      currentOption.position === desiredOption.position &&
      currentOption.color === desiredOption.color
    );
  });
};
