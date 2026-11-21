import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Navigate, useParams } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { Section } from 'twenty-ui/components/layout';
import { IconPlayerPlay, IconTrash } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { Card } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';

import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsOptionCardContentSwitch } from '@/settings/components/SettingsOptions/SettingsOptionCardContentSwitch';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsSkeletonLoader } from '@/settings/components/SettingsSkeletonLoader';
import { IngestionFieldMappingEditor } from '@/settings/ingestion-pipeline/components/IngestionFieldMappingEditor.component';
import { IngestionLogTable } from '@/settings/ingestion-pipeline/components/IngestionLogTable.component';
import { IngestionPipelineForm } from '@/settings/ingestion-pipeline/components/IngestionPipelineForm.component';
import { IngestionTestSection } from '@/settings/ingestion-pipeline/components/IngestionTestSection.component';
import { useIngestionFieldMappings } from '@/settings/ingestion-pipeline/hooks/useIngestionFieldMappings';
import { useIngestionPipeline } from '@/settings/ingestion-pipeline/hooks/useIngestionPipeline';
import { useIngestionPipelineLogs } from '@/settings/ingestion-pipeline/hooks/useIngestionPipelineLogs';
import { type IngestionPipelineFormValues } from '@/settings/ingestion-pipeline/types/IngestionPipelineFormValues';
import { ConfirmationDialog } from '@/ui/layout/dialog/components/ConfirmationDialog';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  type IngestionPipelineFragmentFragment,
  type UpdateIngestionPipelineInputUpdates,
} from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';
import { isDeeplyEqual } from '~/utils/isDeeplyEqual';

const DELETE_INGESTION_PIPELINE_DIALOG_ID = 'delete-ingestion-pipeline-dialog';

const StyledButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: ${themeCssVariables.spacing[3]};
`;

// Only changed fields are sent: the server re-validates the source auth whenever sourceUrl is present
const buildIngestionPipelineUpdate = (
  pipeline: IngestionPipelineFragmentFragment,
  values: IngestionPipelineFormValues,
): UpdateIngestionPipelineInputUpdates => ({
  ...(values.name !== pipeline.name ? { name: values.name } : {}),
  ...(values.description !== pipeline.description
    ? { description: values.description }
    : {}),
  ...(values.sourceUrl !== pipeline.sourceUrl
    ? { sourceUrl: values.sourceUrl }
    : {}),
  ...(values.schedule !== pipeline.schedule
    ? { schedule: values.schedule }
    : {}),
  ...(!isDeeplyEqual(values.dedupFieldNames, pipeline.dedupFieldNames)
    ? { dedupFieldNames: values.dedupFieldNames }
    : {}),
});

export const SettingsIngestionPipelineDetail = () => {
  const { t } = useLingui();
  const navigate = useNavigateSettings();
  const { enqueueToast } = useToast();
  const { openDialog } = useDialog();
  const { pipelineId } = useParams();

  const {
    pipeline,
    loading,
    error,
    updatePipeline,
    deletePipeline,
    triggerPull,
  } = useIngestionPipeline(pipelineId);
  const { mappings, createManyMappings, updateMapping, deleteMapping } =
    useIngestionFieldMappings(pipelineId);
  const { logs, refetch: refetchLogs } = useIngestionPipelineLogs(pipelineId);

  if (loading || isDefined(error)) {
    return (
      <>
        <ToastOnQueryErrorEffect
          error={error}
          message={t`Failed to load ingestion pipeline`}
        />
        <SettingsSkeletonLoader />
      </>
    );
  }

  if (!isDefined(pipeline)) {
    return (
      <Navigate to={getSettingsPath(SettingsPath.IngestionPipelines)} replace />
    );
  }

  const handleUpdate = async (values: IngestionPipelineFormValues) => {
    try {
      await updatePipeline(
        pipeline.id,
        buildIngestionPipelineUpdate(pipeline, values),
      );
      enqueueToast({
        status: 'success',
        children: t`Pipeline updated`,
      });
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  const handleEnabledChange = async (isEnabled: boolean) => {
    try {
      await updatePipeline(pipeline.id, { isEnabled });
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  const handleTriggerPull = async () => {
    try {
      await triggerPull(pipeline.id);
      enqueueToast({
        status: 'success',
        children: t`Pipeline run started`,
      });
      await refetchLogs();
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  const handleDelete = async () => {
    try {
      await deletePipeline(pipeline.id);
      enqueueToast({
        status: 'success',
        children: t`Pipeline deleted`,
      });
      navigate(SettingsPath.IngestionPipelines);
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  const webhookUrl =
    pipeline.mode === 'push'
      ? `${REACT_APP_SERVER_BASE_URL}/ingestion/${pipeline.id}`
      : null;

  return (
    <>
      <SettingsPageLayout
        title={pipeline.name}
        links={[
          {
            children: t`Workspace`,
            href: getSettingsPath(SettingsPath.General),
          },
          {
            children: t`Ingestion pipelines`,
            href: getSettingsPath(SettingsPath.IngestionPipelines),
          },
          { children: pipeline.name },
        ]}
      >
        <SettingsPageContainer>
          <Section.Root>
            <Section.Header
              title={t`Pipeline status`}
              description={t`Control whether this pipeline is active`}
            />
            <Card.Root>
              <SettingsOptionCardContentSwitch
                title={t`Pipeline enabled`}
                description={t`When enabled, this pipeline will accept incoming data and process records`}
                checked={pipeline.isEnabled}
                onChange={handleEnabledChange}
              />
            </Card.Root>
          </Section.Root>

          <Section.Root>
            <Section.Header
              title={t`Configuration`}
              description={t`Pipeline settings and source configuration`}
            />
            <IngestionPipelineForm
              pipeline={pipeline}
              webhookUrl={webhookUrl}
              onSubmit={handleUpdate}
            />
          </Section.Root>

          <Section.Root>
            <Section.Header
              title={t`Field mappings`}
              description={t`Map source fields to CRM fields`}
            />
            <IngestionFieldMappingEditor
              pipelineId={pipeline.id}
              mappings={mappings}
              onSaveMappings={createManyMappings}
              onUpdateMapping={updateMapping}
              onDeleteMapping={deleteMapping}
            />
          </Section.Root>

          <IngestionTestSection pipelineId={pipeline.id} />

          <Section.Root>
            <Section.Header
              title={t`Run history`}
              description={t`Recent pipeline execution logs`}
            />
            <IngestionLogTable logs={logs} />
            {pipeline.mode === 'pull' && (
              <StyledButtonRow>
                <Button
                  startIcon={<IconPlayerPlay />}
                  size="sm"
                  variant="outline"
                  onClick={handleTriggerPull}
                >{t`Run now`}</Button>
              </StyledButtonRow>
            )}
          </Section.Root>

          <Section.Root>
            <Section.Header
              title={t`Danger zone`}
              description={t`Permanently delete this pipeline`}
            />
            <Button
              startIcon={<IconTrash />}
              variant="outline"
              color="danger"
              onClick={() => openDialog(DELETE_INGESTION_PIPELINE_DIALOG_ID)}
            >{t`Delete pipeline`}</Button>
          </Section.Root>
        </SettingsPageContainer>
      </SettingsPageLayout>
      <ConfirmationDialog
        confirmationPlaceholder={t`yes`}
        confirmationValue={t`yes`}
        dialogId={DELETE_INGESTION_PIPELINE_DIALOG_ID}
        title={t`Delete pipeline`}
        subtitle={
          <Trans>
            Please type "yes" to confirm you want to delete this pipeline.
          </Trans>
        }
        onConfirmClick={handleDelete}
        confirmButtonText={t`Delete`}
      />
    </>
  );
};
