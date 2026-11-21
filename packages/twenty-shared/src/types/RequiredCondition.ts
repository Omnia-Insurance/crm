// Soft, UI-only rule: the server stores it but never enforces it on writes.
export type RequiredCondition =
  | { type: 'always' }
  | { type: 'fieldEmpty' | 'fieldNotEmpty'; fieldId: string };
