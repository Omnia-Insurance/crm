import styled from '@emotion/styled';
import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { H2Title, IconPlus } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';

import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { useIngestionPipelines } from '@/settings/ingestion-pipeline/hooks/useIngestionPipelines';
import { SubMenuTopBarContainer } from '@/ui/layout/page/components/SubMenuTopBarContainer';

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
  font-size: ${({ theme }) => theme.font.size.md};
  cursor: pointer;
`;

const StyledModeTag = styled.span<{ mode: string }>`
  background: ${({ theme, mode }) =>
    mode === 'push'
      ? theme.color.blue10
      : theme.color.green10};
  color: ${({ theme, mode }) =>
    mode === 'push'
      ? theme.color.blue
      : theme.color.green};
  padding: ${({ theme }) => `${theme.spacing(0.5)} ${theme.spacing(1)}`};
  border-radius: ${({ theme }) => theme.border.radius.sm};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  text-transform: uppercase;
`;

const StyledStatusDot = styled.span<{ isEnabled: boolean }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme, isEnabled }) =>
    isEnabled ? theme.color.green : theme.font.color.light};
  margin-right: ${({ theme }) => theme.spacing(1)};
`;

export const SettingsIngestionPipelines = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { pipelines, loading } = useIngestionPipelines();

  return (
    <SubMenuTopBarContainer
      title={t`Ingestion Pipelines`}
      actionButton={
        <Button
          Icon={IconPlus}
          title={t`New pipeline`}
          size="small"
          variant="secondary"
          onClick={() =>
            navigate(getSettingsPath(SettingsPath.NewIngestionPipeline))
          }
        />
      }
      links={[
        { children: <Trans>Settings</Trans>, href: '/settings' },
        { children: <Trans>Ingestion Pipelines</Trans> },
      ]}
    >
      <SettingsPageContainer>
        <Section>
          <H2Title
            title={t`Pipelines`}
            description={t`Configure data ingestion pipelines to sync external data into your CRM`}
          />
          {loading ? (
            <div>
              <Trans>Loading...</Trans>
            </div>
          ) : pipelines.length === 0 ? (
            <div>
              <Trans>
                No pipelines configured yet. Create one to start ingesting
                data.
              </Trans>
            </div>
          ) : (
            <StyledTable>
              <thead>
                <tr>
                  <StyledTh>
                    <Trans>Name</Trans>
                  </StyledTh>
                  <StyledTh>
                    <Trans>Mode</Trans>
                  </StyledTh>
                  <StyledTh>
                    <Trans>Target Object</Trans>
                  </StyledTh>
                  <StyledTh>
                    <Trans>Status</Trans>
                  </StyledTh>
                </tr>
              </thead>
              <tbody>
                {pipelines.map((pipeline) => (
                  <tr
                    key={pipeline.id}
                    onClick={() =>
                      navigate(
                        getSettingsPath(
                          SettingsPath.IngestionPipelineDetail,
                          { pipelineId: pipeline.id },
                        ),
                      )
                    }
                  >
                    <StyledTd>{pipeline.name}</StyledTd>
                    <StyledTd>
                      <StyledModeTag mode={pipeline.mode}>
                        {pipeline.mode}
                      </StyledModeTag>
                    </StyledTd>
                    <StyledTd>{pipeline.targetObjectNameSingular}</StyledTd>
                    <StyledTd>
                      <StyledStatusDot isEnabled={pipeline.isEnabled} />
                      {pipeline.isEnabled ? t`Active` : t`Inactive`}
                    </StyledTd>
                  </tr>
                ))}
              </tbody>
            </StyledTable>
          )}
        </Section>
      </SettingsPageContainer>
    </SubMenuTopBarContainer>
  );
};
