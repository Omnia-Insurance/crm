export type FieldDiffOverlay = {
  oldValue: string | null;
  newValue: string | null;
  label: string;
  // Composite sub-field diffs carry the full path, e.g. emails.primaryEmail
  crmFieldPath?: string;
  note?: string | null;
};
