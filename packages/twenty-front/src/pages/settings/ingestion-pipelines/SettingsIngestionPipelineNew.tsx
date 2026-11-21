import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { IngestionPipelineForm } from '@/settings/ingestion-pipeline/components/IngestionPipelineForm.component';
import { useIngestionPipeline } from '@/settings/ingestion-pipeline/hooks/useIngestionPipeline';
import { type IngestionPipelineFormValues } from '@/settings/ingestion-pipeline/types/IngestionPipelineFormValues';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

export const SettingsIngestionPipelineNew = () => {
  const { t } = useLingui();
  const navigate = useNavigateSettings();
  const { enqueueToast } = useToast();
  const { createPipeline } = useIngestionPipeline();

  const handleSubmit = async (values: IngestionPipelineFormValues) => {
    try {
      const createdPipeline = await createPipeline({
        ...values,
        isEnabled: false,
      });

      if (!isDefined(createdPipeline)) {
        navigate(SettingsPath.IngestionPipelines);

        return;
      }

      enqueueToast({
        status: 'success',
        children: t`Pipeline created`,
      });

      navigate(SettingsPath.IngestionPipelineDetail, {
        pipelineId: createdPipeline.id,
      });
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  return (
    <SettingsPageLayout
      title={t`New pipeline`}
      links={[
        {
          children: t`Workspace`,
          href: getSettingsPath(SettingsPath.General),
        },
        {
          children: t`Ingestion pipelines`,
          href: getSettingsPath(SettingsPath.IngestionPipelines),
        },
        { children: t`New` },
      ]}
    >
      <SettingsPageContainer>
        <IngestionPipelineForm onSubmit={handleSubmit} />
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
