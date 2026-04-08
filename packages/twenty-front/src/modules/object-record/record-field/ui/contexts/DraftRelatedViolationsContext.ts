import { createContext } from 'react';

import { type RelatedRecordViolation } from '@/object-record/record-field/ui/utils/getRelatedRecordViolations';

export const DraftRelatedViolationsContext = createContext<
  RelatedRecordViolation[]
>([]);
