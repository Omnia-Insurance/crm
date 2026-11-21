import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isNull, isUndefined } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

export const applyAgentProfileJoinColumnDefaults = ({
  draftRecord,
  agentProfileJoinColumnNames,
  agentProfileId,
  shouldKeepNullValues,
}: {
  draftRecord: Partial<ObjectRecord>;
  agentProfileJoinColumnNames: string[];
  agentProfileId: string | null;
  // A null the user typed is a clear, while a null in the request is a gap to fill
  shouldKeepNullValues: boolean;
}): Partial<ObjectRecord> => {
  if (!isDefined(agentProfileId)) {
    return draftRecord;
  }

  const joinColumnNamesToFill = agentProfileJoinColumnNames.filter(
    (joinColumnName) =>
      isUndefined(draftRecord[joinColumnName]) ||
      (isNull(draftRecord[joinColumnName]) && !shouldKeepNullValues),
  );

  if (joinColumnNamesToFill.length === 0) {
    return draftRecord;
  }

  return {
    ...draftRecord,
    ...Object.fromEntries(
      joinColumnNamesToFill.map((joinColumnName) => [
        joinColumnName,
        agentProfileId,
      ]),
    ),
  };
};
