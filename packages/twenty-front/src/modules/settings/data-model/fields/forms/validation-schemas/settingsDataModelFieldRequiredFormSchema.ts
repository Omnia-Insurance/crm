import { type RequiredCondition } from 'twenty-shared/types';
import { z } from 'zod';

const requiredConditionSchema: z.ZodType<RequiredCondition> = z.union([
  z.object({ type: z.literal('always') }),
  z.object({
    type: z.enum(['fieldEmpty', 'fieldNotEmpty']),
    fieldId: z.string().min(1),
  }),
]);

export const settingsDataModelFieldRequiredFormSchema = z.object({
  requiredCondition: requiredConditionSchema.nullable().default(null),
});

export type SettingsDataModelFieldRequiredFormValues = z.infer<
  typeof settingsDataModelFieldRequiredFormSchema
>;
