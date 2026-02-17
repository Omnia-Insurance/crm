import styled from '@emotion/styled';
import { Trans, useLingui } from '@lingui/react/macro';

import { type IngestionLog } from '@/settings/ingestion-pipeline/types/ingestion-pipeline.types';

type IngestionLogTableProps = {
  logs: IngestionLog[];
};

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const StyledTh = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing(2)};
  border-bottom: 1px solid ${({ theme }) => theme.border.color.light};
  color: ${({ theme }) => theme.font.color.tertiary};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  font-size: ${({ theme }) => theme.font.size.sm};
`;

const StyledTd = styled.td`
  padding: ${({ theme }) => theme.spacing(2)};
  border-bottom: 1px solid ${({ theme }) => theme.border.color.light};
  font-size: ${({ theme }) => theme.font.size.sm};
`;

const StyledStatusBadge = styled.span<{ status: string }>`
  padding: ${({ theme }) => `${theme.spacing(0.5)} ${theme.spacing(1)}`};
  border-radius: ${({ theme }) => theme.border.radius.sm};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  background: ${({ theme, status }) => {
    switch (status) {
      case 'completed':
        return theme.color.green10;
      case 'failed':
        return theme.color.red10;
      case 'partial':
        return theme.color.orange10;
      case 'running':
        return theme.color.blue10;
      default:
        return theme.background.tertiary;
    }
  }};
  color: ${({ theme, status }) => {
    switch (status) {
      case 'completed':
        return theme.color.green;
      case 'failed':
        return theme.color.red;
      case 'partial':
        return theme.color.orange;
      case 'running':
        return theme.color.blue;
      default:
        return theme.font.color.tertiary;
    }
  }};
`;

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;

  return `${(ms / 1000).toFixed(1)}s`;
};

const formatDate = (date: string | null): string => {
  if (!date) return '-';

  return new Date(date).toLocaleString();
};

export const IngestionLogTable = ({ logs }: IngestionLogTableProps) => {
  const { t } = useLingui();

  if (logs.length === 0) {
    return (
      <div>
        <Trans>No runs yet.</Trans>
      </div>
    );
  }

  return (
    <StyledTable>
      <thead>
        <tr>
          <StyledTh>
            <Trans>Status</Trans>
          </StyledTh>
          <StyledTh>
            <Trans>Trigger</Trans>
          </StyledTh>
          <StyledTh>
            <Trans>Records</Trans>
          </StyledTh>
          <StyledTh>
            <Trans>Created</Trans>
          </StyledTh>
          <StyledTh>
            <Trans>Updated</Trans>
          </StyledTh>
          <StyledTh>
            <Trans>Failed</Trans>
          </StyledTh>
          <StyledTh>
            <Trans>Duration</Trans>
          </StyledTh>
          <StyledTh>
            <Trans>Started</Trans>
          </StyledTh>
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => (
          <tr key={log.id}>
            <StyledTd>
              <StyledStatusBadge status={log.status}>
                {log.status}
              </StyledStatusBadge>
            </StyledTd>
            <StyledTd>{log.triggerType}</StyledTd>
            <StyledTd>{log.totalRecordsReceived}</StyledTd>
            <StyledTd>{log.recordsCreated}</StyledTd>
            <StyledTd>{log.recordsUpdated}</StyledTd>
            <StyledTd>{log.recordsFailed}</StyledTd>
            <StyledTd>{formatDuration(log.durationMs)}</StyledTd>
            <StyledTd>{formatDate(log.startedAt)}</StyledTd>
          </tr>
        ))}
      </tbody>
    </StyledTable>
  );
};
