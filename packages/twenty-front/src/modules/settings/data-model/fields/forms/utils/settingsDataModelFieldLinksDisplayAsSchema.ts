import { z } from 'zod';

// Omnia: the call-recording LINKS field stores displayAs (upgrade W3). zod drops
// keys a schema does not list, so without this a Settings save erases it.
export const settingsDataModelFieldLinksDisplayAsSchema = z.object({
  settings: z.object({
    displayAs: z.enum(['link', 'audio']).optional(),
  }),
});
