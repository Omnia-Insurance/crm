import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { Section } from 'twenty-ui/components/layout';
import { IconChevronRight, IconPlus } from 'twenty-ui/icon';
import { Status, Tag } from 'twenty-ui/primitives/data-display';
import { OverflowingTextWithTooltip } from 'twenty-ui/primitives/typography';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';

import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsSkeletonLoader } from '@/settings/components/SettingsSkeletonLoader';
import { useIngestionPipelines } from '@/settings/ingestion-pipeline/hooks/useIngestionPipelines';
import { NavigationButton } from '@/ui/input/components/NavigationButton';
import { Table } from '@/ui/layout/table/components/Table';
import { TableBody } from '@/ui/layout/table/components/TableBody';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableFooter } from '@/ui/layout/table/components/TableFooter';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';

const INGESTION_PIPELINE_TABLE_GRID_TEMPLATE_COLUMNS = '2fr 1fr 1fr 1fr 28px';

const StyledIconChevronRightContainer = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
`;

export const SettingsIngestionPipelines = () => {
  const { t } = useLingui();
  const theme = useTheme();
  const { pipelines, loading, error } = useIngestionPipelines();

  if (loading) {
    return <SettingsSkeletonLoader />;
  }

  return (
    <SettingsPageLayout
      title={t`Ingestion pipelines`}
      links={[
        {
          children: t`Workspace`,
          href: getSettingsPath(SettingsPath.General),
        },
        { children: t`Ingestion pipelines` },
      ]}
    >
      <ToastOnQueryErrorEffect
        error={error}
        message={t`Failed to load ingestion pipelines`}
      />
      <SettingsPageContainer>
        <Section.Root>
          <Section.Header
            title={t`Pipelines`}
            description={t`Configure data ingestion pipelines to sync external data into your CRM`}
          />
          <Table>
            <TableRow
              gridTemplateColumns={
                INGESTION_PIPELINE_TABLE_GRID_TEMPLATE_COLUMNS
              }
            >
              <TableHeader>{t`Name`}</TableHeader>
              <TableHeader>{t`Mode`}</TableHeader>
              <TableHeader>{t`Target object`}</TableHeader>
              <TableHeader>{t`Status`}</TableHeader>
              <TableHeader />
            </TableRow>
            <TableBody>
              {pipelines.length === 0 ? (
                <TableCell color={themeCssVariables.font.color.tertiary}>
                  {t`No pipelines configured yet. Create one to start ingesting data.`}
                </TableCell>
              ) : (
                pipelines.map((pipeline) => (
                  <TableRow
                    key={pipeline.id}
                    gridTemplateColumns={
                      INGESTION_PIPELINE_TABLE_GRID_TEMPLATE_COLUMNS
                    }
                    to={getSettingsPath(SettingsPath.IngestionPipelineDetail, {
                      pipelineId: pipeline.id,
                    })}
                  >
                    <TableCell
                      color={themeCssVariables.font.color.primary}
                      overflow="hidden"
                    >
                      <OverflowingTextWithTooltip text={pipeline.name} />
                    </TableCell>
                    <TableCell>
                      <Tag color="gray">
                        {pipeline.mode === 'pull' ? t`Pull` : t`Push`}
                      </Tag>
                    </TableCell>
                    <TableCell overflow="hidden">
                      <OverflowingTextWithTooltip
                        text={pipeline.targetObjectNameSingular}
                      />
                    </TableCell>
                    <TableCell>
                      <Status
                        color={pipeline.isEnabled ? 'green' : 'gray'}
                        weight="medium"
                      >
                        {pipeline.isEnabled ? t`Active` : t`Inactive`}
                      </Status>
                    </TableCell>
                    <TableCell
                      align="center"
                      padding={`0 ${themeCssVariables.spacing[1]} 0 0`}
                    >
                      <StyledIconChevronRightContainer>
                        <IconChevronRight
                          size={theme.icon.size.md}
                          stroke={theme.icon.stroke.sm}
                        />
                      </StyledIconChevronRightContainer>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TableFooter>
            <NavigationButton
              startIcon={<IconPlus />}
              size="sm"
              variant="outline"
              to={getSettingsPath(SettingsPath.NewIngestionPipeline)}
            >{t`Create pipeline`}</NavigationButton>
          </TableFooter>
        </Section.Root>
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
