import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { IngestionPipelineForm } from '@/settings/ingestion-pipeline/components/IngestionPipelineForm.component';
import { useIngestionPipeline } from '@/settings/ingestion-pipeline/hooks/useIngestionPipeline';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';

export const SettingsIngestionPipelineNew = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { createPipeline } = useIngestionPipeline();

  const handleSubmit = async (values: {
    name: string;
    mode: 'push' | 'pull';
    targetObjectNameSingular: string;
    description?: string;
    sourceUrl?: string;
    schedule?: string;
    dedupFieldNames?: string[];
  }) => {
    const pipeline = await createPipeline({
      name: values.name,
      mode: values.mode,
      targetObjectNameSingular: values.targetObjectNameSingular,
      description: values.description ?? null,
      sourceUrl: values.sourceUrl ?? null,
      sourceHttpMethod: null,
      sourceAuthConfig: null,
      sourceRequestConfig: null,
      responseRecordsPath: null,
      schedule: values.schedule ?? null,
      dedupFieldNames: values.dedupFieldNames ?? null,
      paginationConfig: null,
      isEnabled: false,
    });

    navigate(
      getSettingsPath(SettingsPath.IngestionPipelineDetail, {
        pipelineId: pipeline.id,
      }),
    );
  };

  return (
    <SettingsPageLayout
      title={t`New Pipeline`}
      links={[
        { children: <Trans>Settings</Trans>, href: '/settings' },
        {
          children: <Trans>Ingestion Pipelines</Trans>,
          href: getSettingsPath(SettingsPath.IngestionPipelines),
        },
        { children: <Trans>New</Trans> },
      ]}
    >
      <SettingsPageContainer>
        <IngestionPipelineForm onSubmit={handleSubmit} />
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
