// Same "<Relation> / <Sub-field>" wording as the export headers, for the header, the field lists and the picker
export const getRelationSubFieldColumnLabel = ({
  relationFieldLabel,
  subFieldLabel,
}: {
  relationFieldLabel: string;
  subFieldLabel: string;
}): string => `${relationFieldLabel} / ${subFieldLabel}`;
