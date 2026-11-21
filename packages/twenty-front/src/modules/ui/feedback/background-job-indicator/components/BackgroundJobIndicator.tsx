import {
  useBackgroundJob,
  useBackgroundJobs,
} from '@/ui/feedback/background-job-indicator/hooks/useBackgroundJob';
import { type BackgroundJobData } from '@/ui/feedback/background-job-indicator/states/backgroundJobState';
import { styled } from '@linaria/react';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { LightIconButton } from 'twenty-ui/components/input';
import {
  IconAlertTriangle,
  IconSquareRoundedCheck,
  IconX,
} from 'twenty-ui/icon';
import { ProgressBar, ProgressRing } from 'twenty-ui/primitives/feedback';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme';

const StyledStack = styled.div`
  bottom: ${themeCssVariables.spacing[3]};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  position: fixed;
  right: ${themeCssVariables.spacing[3]};
  z-index: 10000;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    bottom: 0;
    left: 0;
    right: 0;
  }
`;

const StyledCard = styled.div`
  backdrop-filter: ${themeCssVariables.blur.medium};
  background-color: ${themeCssVariables.background.transparent.primary};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  box-sizing: border-box;
  overflow: hidden;
  padding: ${themeCssVariables.spacing[2]};
  position: relative;
  width: 296px;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    border-radius: 0;
    width: 100%;
  }
`;

const StyledHeader = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledIcon = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 0;
`;

const StyledMessage = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 0;
  margin-left: auto;
`;

const StyledDetails = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  padding-left: ${themeCssVariables.spacing[6]};
  padding-top: ${themeCssVariables.spacing[1]};
`;

const StyledProgressContainer = styled.div`
  padding-bottom: ${themeCssVariables.spacing[1]};
  padding-left: ${themeCssVariables.spacing[6]};
  padding-top: ${themeCssVariables.spacing[2]};
`;

const AUTO_DISMISS_MS = 5000;

const MAX_VISIBLE_ERROR_MESSAGES = 3;

type BackgroundJobCardProps = {
  job: BackgroundJobData;
};

const BackgroundJobCard = ({ job }: BackgroundJobCardProps) => {
  const { t } = useLingui();
  const { removeJob } = useBackgroundJob();

  const {
    label,
    processedItems,
    totalItems,
    warningCount,
    failureCount,
    errorMessages = [],
  } = job;

  const isRunning =
    job.status === 'uploading' ||
    job.status === 'pending' ||
    job.status === 'processing';
  const isDone = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isCancelled = job.status === 'cancelled';

  useEffect(() => {
    if (!isDone) {
      return;
    }

    const timer = setTimeout(() => removeJob(job.id), AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [isDone, job.id, removeJob]);

  const percent =
    totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;

  const doneMessage =
    warningCount > 0
      ? plural(warningCount, {
          one: `${label} — done with # warning`,
          other: `${label} — done with # warnings`,
        })
      : t`${label} — done`;

  const progressDetails =
    warningCount > 0
      ? plural(warningCount, {
          one: `${processedItems} of ${totalItems} (${percent}%) · # warning`,
          other: `${processedItems} of ${totalItems} (${percent}%) · # warnings`,
        })
      : t`${processedItems} of ${totalItems} (${percent}%)`;

  const hiddenErrorMessageCount =
    errorMessages.length - MAX_VISIBLE_ERROR_MESSAGES;

  return (
    <StyledCard>
      <StyledHeader>
        <StyledIcon>
          {isRunning && <ProgressRing value={null} aria-hidden />}
          {isDone && (
            <IconSquareRoundedCheck
              size={16}
              color={themeCssVariables.color.green}
            />
          )}
          {isFailed && (
            <IconAlertTriangle size={16} color={themeCssVariables.color.red} />
          )}
          {isCancelled && <IconX size={16} />}
        </StyledIcon>

        <StyledMessage>
          {isRunning && label}
          {isDone && doneMessage}
          {isFailed && t`${label} — failed`}
          {isCancelled && t`${label} — cancelled`}
        </StyledMessage>

        <StyledActions>
          {isRunning && isDefined(job.onCancel) && (
            <LightIconButton
              aria-label={t`Cancel`}
              emphasis="subtle"
              onClick={job.onCancel}
            >
              <IconX />
            </LightIconButton>
          )}
          {!isRunning && (
            <LightIconButton
              aria-label={t`Dismiss`}
              emphasis="subtle"
              onClick={() => removeJob(job.id)}
            >
              <IconX />
            </LightIconButton>
          )}
        </StyledActions>
      </StyledHeader>

      {isRunning && (
        <>
          <StyledProgressContainer>
            <ProgressBar
              value={percent}
              aria-label={label}
              barColor={themeCssVariables.color.blue}
              backgroundColor={themeCssVariables.background.quaternary}
              withBorderRadius
            />
          </StyledProgressContainer>
          <StyledDetails>{progressDetails}</StyledDetails>
        </>
      )}

      {!isRunning && failureCount > 0 && (
        <StyledDetails>
          {plural(failureCount, {
            one: '# failure',
            other: '# failures',
          })}
        </StyledDetails>
      )}

      {!isRunning && errorMessages.length > 0 && (
        <StyledDetails>
          {errorMessages
            .slice(0, MAX_VISIBLE_ERROR_MESSAGES)
            .map((errorMessage, index) => (
              <div key={index}>{errorMessage}</div>
            ))}
          {hiddenErrorMessageCount > 0 &&
            t`...and ${hiddenErrorMessageCount} more`}
        </StyledDetails>
      )}
    </StyledCard>
  );
};

export const BackgroundJobIndicator = () => {
  const jobs = useBackgroundJobs();

  if (jobs.length === 0) {
    return null;
  }

  return (
    <StyledStack>
      {jobs.map((job) => (
        <BackgroundJobCard key={job.id} job={job} />
      ))}
    </StyledStack>
  );
};
