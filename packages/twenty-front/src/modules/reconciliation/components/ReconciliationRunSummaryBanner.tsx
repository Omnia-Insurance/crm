import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { LightIconButton } from 'twenty-ui/components/input';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
} from 'twenty-ui/icon';
import { Tag, type TagColor } from 'twenty-ui/primitives/data-display';
import { themeCssVariables } from 'twenty-ui/theme';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import {
  getRunSummary,
  type RunStatusKind,
} from '@/reconciliation/utils/getRunSummary';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';

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

// Operator signal that used to live only in worker logs (OMN-11). It reads the
// record the review page loaded, so a PARSING/MATCHING status reflects load time.
export const ReconciliationRunSummaryBanner = ({
  reconciliationId,
}: ReconciliationRunSummaryBannerProps) => {
  const { t } = useLingui();

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

  if (!isDefined(summary)) {
    return null;
  }

  const { configFingerprint } = summary;

  const toggleDetailsLabel = isExpanded
    ? t`Hide run details`
    : t`Show run details`;

  return (
    <StyledBanner>
      <StyledSummaryRow>
        <Tag color={STATUS_TAG_COLOR[summary.statusKind]} truncate={false}>
          {summary.statusLabel}
        </Tag>
        {isDefined(summary.summaryText) && (
          <StyledSummaryText title={summary.summaryText}>
            {summary.summaryText}
          </StyledSummaryText>
        )}
        {isDefined(summary.warningSummaryText) && (
          <Tag
            color="orange"
            startIcon={<IconAlertTriangle />}
            truncate={false}
          >
            {summary.warningSummaryText}
          </Tag>
        )}
        <StyledSpacer />
        {summary.hasDetails && (
          <LightIconButton
            size="sm"
            aria-label={toggleDetailsLabel}
            tooltip={toggleDetailsLabel}
            onClick={() => setIsExpanded((previous) => !previous)}
          >
            {isExpanded ? <IconChevronUp /> : <IconChevronDown />}
          </LightIconButton>
        )}
      </StyledSummaryRow>
      {/* A failed run's error is never hidden behind the collapse */}
      {summary.statusKind === 'failed' && (
        <StyledErrorMessage>
          {summary.errorMessage ??
            t`Run failed — no error message recorded; check worker logs.`}
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
                  truncate={false}
                >
                  {chip.text}
                </Tag>
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
          {isDefined(configFingerprint) && (
            <StyledFingerprintChip title={t`Config fingerprint for this run`}>
              {t`config ${configFingerprint}`}
            </StyledFingerprintChip>
          )}
        </StyledDetailSection>
      )}
    </StyledBanner>
  );
};
