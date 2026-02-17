export type PhoneNormalizeTransform = {
  type: 'phoneNormalize';
};

export type MapTransform = {
  type: 'map';
  values: Record<string, string>;
};

export type UppercaseTransform = {
  type: 'uppercase';
};

export type LowercaseTransform = {
  type: 'lowercase';
};

export type TrimTransform = {
  type: 'trim';
};

export type DateFormatTransform = {
  type: 'dateFormat';
  sourceFormat: string;
};

export type NumberScaleTransform = {
  type: 'numberScale';
  multiplier: number;
};

export type SanitizeNullTransform = {
  type: 'sanitizeNull';
};

export type FieldTransform =
  | PhoneNormalizeTransform
  | MapTransform
  | UppercaseTransform
  | LowercaseTransform
  | TrimTransform
  | DateFormatTransform
  | NumberScaleTransform
  | SanitizeNullTransform;
