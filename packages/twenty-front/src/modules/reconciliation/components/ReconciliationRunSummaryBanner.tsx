import { styled } from '@linaria/react';
import { type ComponentProps, useMemo, useState } from 'react';
import { Tag } from 'twenty-ui/components';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
} from 'twenty-ui/display';
import { LightIconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { isDefined } from 'twenty-shared/utils';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import {
  getRunSummary,
  type RunStatusKind,
} from '@/reconciliation/utils/getRunSummary';

/**
 * Run-summary banner for the reconciliation review page (Linear OMN-11).
 *
 * Surfaces the per-run operator signal that previously lived only in worker
 * logs / raw record JSON (audit 2026-06-11, operability lens): status,
 * FAILED errorMessage (the actionable [STEP] config errors), the stats
 * counters, and — once persistence lands — stats.warnings and the per-run
 * configFingerprint.
 *
 * Reads the reconciliation record already fetched into
 * recordStoreFamilyState by RecordShowEffect (depth-1 fields include status,
 * errorMessage, and stats), so no extra query is needed. The store is filled
 * once on mount — a PARSING/MATCHING state shown here reflects load time,
 * and reloading refreshes it.
 *
 * One summary line is always visible; the per-counter chips, warning list,
 * and config fingerprint live in a collapsed-by-default detail section.
 * A FAILED run's errorMessage is always visible (never behind the collapse).
 */

type TagColor = ComponentProps<typeof Tag>['color'];

const STATUS_TAG_COLOR: Record<RunStatusKind, TagColor> = {
  failed: 'red',
  inProgress: 'blue',
  review: 'gray',
  completed: 'green',
  unknown: 'gray',
};

const StyledBanner = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledSummaryRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledSummaryText = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledSpacer = styled.div`
  flex: 1;
`;

const StyledErrorMessage = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: ${themeCssVariables.font.size.sm};
  white-space: pre-wrap;
  word-break: break-word;
`;

const StyledDetailSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledChipRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledWarningList = styled.ul`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  margin: 0;
  padding-left: ${themeCssVariables.spacing[4]};
`;

const StyledWarningListItem = styled.li`
  word-break: break-word;
`;

const StyledFingerprintChip = styled.code`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.light};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  padding: 0 ${themeCssVariables.spacing[1]};
  width: fit-content;
`;

type ReconciliationRunSummaryBannerProps = {
  reconciliationId: string;
};

export const ReconciliationRunSummaryBanner = ({
  reconciliationId,
}: ReconciliationRunSummaryBannerProps) => {
  const recordStore = useAtomFamilyStateValue(
    recordStoreFamilyState,
    reconciliationId,
  );

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = useMemo(
    () =>
      isDefined(recordStore)
        ? getRunSummary({
            status: recordStore.status,
            errorMessage: recordStore.errorMessage,
            stats: recordStore.stats,
          })
        : null,
    [recordStore],
  );

  // Record not yet in the store (RecordShowEffect still fetching) — the
  // banner appears once the show-page query lands.
  if (!isDefined(summary)) {
    return null;
  }

  return (
    <StyledBanner>
      <StyledSummaryRow>
        <Tag
          color={STATUS_TAG_COLOR[summary.statusKind]}
          text={summary.statusLabel}
          preventShrink
        />
        {isDefined(summary.summaryText) && (
          <StyledSummaryText title={summary.summaryText}>
            {summary.summaryText}
          </StyledSummaryText>
        )}
        {isDefined(summary.warningSummaryText) && (
          <Tag
            color="orange"
            Icon={IconAlertTriangle}
            text={summary.warningSummaryText}
            preventShrink
          />
        )}
        <StyledSpacer />
        {summary.hasDetails && (
          <LightIconButton
            aria-label={isExpanded ? 'Hide run details' : 'Show run details'}
            title={isExpanded ? 'Hide run details' : 'Show run details'}
            Icon={isExpanded ? IconChevronUp : IconChevronDown}
            size="small"
            onClick={() => setIsExpanded((previous) => !previous)}
          />
        )}
      </StyledSummaryRow>
      {summary.statusKind === 'failed' && (
        <StyledErrorMessage>
          {summary.errorMessage ??
            'Run failed — no error message recorded; check worker logs.'}
        </StyledErrorMessage>
      )}
      {isExpanded && summary.hasDetails && (
        <StyledDetailSection>
          {summary.statChips.length > 0 && (
            <StyledChipRow>
              {summary.statChips.map((chip) => (
                <Tag
                  key={chip.key}
                  color={chip.isWarning ? 'orange' : 'gray'}
                  text={chip.text}
                  preventShrink
                />
              ))}
            </StyledChipRow>
          )}
          {summary.warnings.length > 0 && (
            <StyledWarningList>
              {summary.warnings.map((warning, index) => (
                <StyledWarningListItem key={`${index}-${warning}`}>
                  {warning}
                </StyledWarningListItem>
              ))}
            </StyledWarningList>
          )}
          {isDefined(summary.configFingerprint) && (
            <StyledFingerprintChip title="Config fingerprint for this run">
              {`config ${summary.configFingerprint}`}
            </StyledFingerprintChip>
          )}
        </StyledDetailSection>
      )}
    </StyledBanner>
  );
};
