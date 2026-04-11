import { useCallback } from 'react';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useBuildRecordInputFromRLSPredicates } from '@/object-record/hooks/useBuildRecordInputFromRLSPredicates';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { buildDraftFieldDefaults } from '@/object-record/utils/buildDraftFieldDefaults';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

type BuildDraftSeedsOptions = {
  includeRestrictedFields?: boolean;
};

type DraftSeedsResult = {
  /**
   * Merged seed values (metadata defaults + system fields + direct Agent
   * prefill + RLS-resolved values). Callers layer their own overrides
   * on top (filters, relation back-links, label payload, caller input).
   */
  seedValues: Record<string, unknown>;
  /**
   * Names of fields whose values were set by an RLS predicate. Callers
   * use these as `hiddenFieldNames` so users can't hand-edit fields the
   * policy is enforcing.
   */
  rlsFieldNames: string[];
};

/**
 * Shared hook that produces the default seed values for a fresh draft
 * record of `objectMetadataItem`.
 *
 * Used by every draft-creation path (index page, relation section,
 * command menu, etc.) so every entry point prefills the same fields.
 *
 * Sources are merged in this order (later overrides earlier):
 *   1. `buildDraftFieldDefaults` — metadata defaults (SELECT/TEXT/BOOLEAN/
 *      NUMBER) + system fields (createdBy, updatedBy, createdAt,
 *      updatedAt, submittedDate).
 *   2. Direct agent profile lookup — `{agent}Id` / `{agent}` prefilled
 *      from the current workspace member's agent profile. Fallback for
 *      the case where no workspace-member-scoped RLS predicate covers
 *      the agent field (e.g., admin role, restricted field skipping).
 *   3. RLS-predicate-resolved values — dynamic values derived from
 *      workspace-member-scoped RLS predicates (e.g., "Agent is Me",
 *      "Assigned To is Me"). Overrides the direct lookup so the RLS
 *      policy is authoritative when one is configured.
 *
 * Omnia customization: the direct agent profile lookup is Omnia-specific
 * and is tracked in CUSTOMIZATIONS.md / check-customizations.sh.
 */
export const useDraftRecordDefaults = ({
  objectMetadataItem,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
}) => {
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  // Direct agent profile lookup (fallback when no "Agent is Me" RLS
  // predicate resolves the field).
  const agentRelationField = objectMetadataItem.fields.find(
    (f) =>
      f.type === FieldMetadataType.RELATION &&
      f.relation?.targetObjectMetadata.nameSingular === 'agentProfile',
  );
  const shouldSkipAgentLookup =
    !isDefined(agentRelationField) || !isDefined(currentWorkspaceMember?.id);
  const { records: agentProfiles } = useFindManyRecords({
    // Use the target object as a safe fallback when agentProfile doesn't
    // exist in metadata — the query is skipped anyway via `skip`.
    objectNameSingular: isDefined(agentRelationField)
      ? 'agentProfile'
      : objectMetadataItem.nameSingular,
    filter: isDefined(currentWorkspaceMember?.id)
      ? { workspaceMemberId: { eq: currentWorkspaceMember.id } }
      : undefined,
    skip: shouldSkipAgentLookup,
    limit: 1,
  });

  // RLS predicate resolver (primary mechanism for "X is Me" defaults).
  const { buildRecordInputFromRLSPredicates } =
    useBuildRecordInputFromRLSPredicates({ objectMetadataItem });

  const buildDraftSeeds = useCallback(
    (options: BuildDraftSeedsOptions = {}): DraftSeedsResult => {
      // Metadata defaults + system fields.
      const fieldDefaults = buildDraftFieldDefaults({
        objectMetadataItem,
        currentMember: currentWorkspaceMember,
      });

      // Direct agent prefill (fallback — will be overridden by RLS below
      // if a predicate resolves the same field).
      if (isDefined(agentRelationField) && agentProfiles.length > 0) {
        fieldDefaults[`${agentRelationField.name}Id`] = agentProfiles[0].id;
        fieldDefaults[agentRelationField.name] = agentProfiles[0];
      }

      // RLS-predicate-resolved values. Restricted fields are included so
      // the merged seed still has the correct value even when the user
      // can't edit the field directly (the server-side post-query hook
      // handles persistence with bypassed permissions).
      const recordInputFromRLSPredicates = buildRecordInputFromRLSPredicates({
        includeRestrictedFields: options.includeRestrictedFields ?? true,
      });

      // Skip undefined/null so we don't blow away a direct-lookup value
      // with an unresolved RLS predicate.
      const definedRLSValues: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(recordInputFromRLSPredicates)) {
        if (isDefined(value)) {
          definedRLSValues[key] = value;
        }
      }

      return {
        seedValues: {
          ...fieldDefaults,
          ...definedRLSValues,
        },
        rlsFieldNames: Object.keys(recordInputFromRLSPredicates),
      };
    },
    [
      objectMetadataItem,
      currentWorkspaceMember,
      agentRelationField,
      agentProfiles,
      buildRecordInputFromRLSPredicates,
    ],
  );

  return { buildDraftSeeds };
};
