import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { Status, Tag } from 'twenty-ui/primitives/data-display';
import { Collapsible } from 'twenty-ui/primitives/layout';
import { type ThemeColor, themeCssVariables } from 'twenty-ui/theme';

import { Table } from '@/ui/layout/table/components/Table';
import { TableBody } from '@/ui/layout/table/components/TableBody';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { type IngestionLogFragmentFragment } from '~/generated-metadata/graphql';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';
import { formatDuration } from '~/utils/format/formatDuration';

type IngestionLogTableProps = {
  logs: IngestionLogFragmentFragment[];
};

const INGESTION_LOG_TABLE_GRID_TEMPLATE_COLUMNS =
  '104px 72px repeat(4, 1fr) 80px 1.5fr';

const StyledDetailsContainer = styled.div`
  background-color: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledDetailsTitle = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin-bottom: ${themeCssVariables.spacing[2]};
`;

const StyledPreformattedText = styled.pre`
  background-color: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
  max-height: 300px;
  overflow: auto;
  padding: ${themeCssVariables.spacing[2]};
  white-space: pre-wrap;
  word-break: break-word;
`;

const StyledEmptyDetails = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

export const IngestionLogTable = ({ logs }: IngestionLogTableProps) => {
  const { t } = useLingui();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const logStatusDisplays: Record<
    string,
    { label: string; color: ThemeColor }
  > = {
    pending: { label: t`Pending`, color: 'gray' },
    running: { label: t`Running`, color: 'blue' },
    completed: { label: t`Completed`, color: 'green' },
    partial: { label: t`Partial`, color: 'orange' },
    failed: { label: t`Failed`, color: 'red' },
  };

  const triggerTypeLabels: Record<string, string> = {
    push: t`Push`,
    pull: t`Pull`,
    test: t`Test`,
  };

  const handleRowClick = (logId: string) => {
    setExpandedLogId(expandedLogId === logId ? null : logId);
  };

  return (
    <Table>
      <TableRow gridTemplateColumns={INGESTION_LOG_TABLE_GRID_TEMPLATE_COLUMNS}>
        <TableHeader>{t`Status`}</TableHeader>
        <TableHeader>{t`Trigger`}</TableHeader>
        <TableHeader align="right">{t`Records`}</TableHeader>
        <TableHeader align="right">{t`Created`}</TableHeader>
        <TableHeader align="right">{t`Updated`}</TableHeader>
        <TableHeader align="right">{t`Failed`}</TableHeader>
        <TableHeader align="right">{t`Duration`}</TableHeader>
        <TableHeader align="right">{t`Started`}</TableHeader>
      </TableRow>
      <TableBody>
        {logs.length === 0 ? (
          <TableCell color={themeCssVariables.font.color.tertiary}>
            {t`No runs yet`}
          </TableCell>
        ) : (
          logs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const statusDisplay = logStatusDisplays[log.status] ?? {
              label: log.status,
              color: 'gray',
            };

            return (
              <div key={log.id}>
                <TableRow
                  gridTemplateColumns={
                    INGESTION_LOG_TABLE_GRID_TEMPLATE_COLUMNS
                  }
                  onClick={() => handleRowClick(log.id)}
                  isExpanded={isExpanded}
                  cursor="pointer"
                >
                  <TableCell>
                    <Status color={statusDisplay.color} weight="medium">
                      {statusDisplay.label}
                    </Status>
                  </TableCell>
                  <TableCell>
                    <Tag color="gray">
                      {triggerTypeLabels[log.triggerType] ?? log.triggerType}
                    </Tag>
                  </TableCell>
                  <TableCell align="right">
                    {log.totalRecordsReceived}
                  </TableCell>
                  <TableCell align="right">{log.recordsCreated}</TableCell>
                  <TableCell align="right">{log.recordsUpdated}</TableCell>
                  <TableCell align="right">{log.recordsFailed}</TableCell>
                  <TableCell align="right">
                    {isDefined(log.durationMs)
                      ? formatDuration(log.durationMs)
                      : ''}
                  </TableCell>
                  <TableCell align="right">
                    {isDefined(log.startedAt)
                      ? beautifyPastDateRelativeToNow(log.startedAt)
                      : ''}
                  </TableCell>
                </TableRow>
                <Collapsible.Root open={isExpanded}>
                  <Collapsible.Panel dimension="height">
                    <StyledDetailsContainer>
                      <div>
                        <StyledDetailsTitle>{t`Incoming payload`}</StyledDetailsTitle>
                        {isDefined(log.incomingPayload) ? (
                          <StyledPreformattedText>
                            {JSON.stringify(log.incomingPayload, null, 2)}
                          </StyledPreformattedText>
                        ) : (
                          <StyledEmptyDetails>
                            {t`No payload data available`}
                          </StyledEmptyDetails>
                        )}
                      </div>
                      {isNonEmptyArray(log.errors) && (
                        <div>
                          <StyledDetailsTitle>{t`Errors`}</StyledDetailsTitle>
                          <StyledPreformattedText>
                            {JSON.stringify(log.errors, null, 2)}
                          </StyledPreformattedText>
                        </div>
                      )}
                    </StyledDetailsContainer>
                  </Collapsible.Panel>
                </Collapsible.Root>
              </div>
            );
          })
        )}
      </TableBody>
    </Table>
  );
};
