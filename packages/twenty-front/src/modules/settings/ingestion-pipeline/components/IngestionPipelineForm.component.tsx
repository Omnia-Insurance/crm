import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined } from 'twenty-shared/utils';
import { Section } from 'twenty-ui/components/layout';
import { IconClock, IconCopy, IconWebhook } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { SettingsRadioCardContainer } from '@/settings/components/SettingsRadioCardContainer';
import { type IngestionPipelineFormValues } from '@/settings/ingestion-pipeline/types/IngestionPipelineFormValues';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { type IngestionPipelineFragmentFragment } from '~/generated-metadata/graphql';
import { useCopyToClipboard } from '~/hooks/useCopyToClipboard';

type IngestionPipelineFormProps = {
  pipeline?: IngestionPipelineFragmentFragment | null;
  webhookUrl?: string | null;
  onSubmit: (values: IngestionPipelineFormValues) => Promise<void>;
};

const StyledForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledWebhookFields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCopyRow = styled.div`
  align-items: flex-end;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCopyInputContainer = styled.div`
  flex: 1;
`;

const StyledButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const toNullableTrimmedString = (value: string) => {
  const trimmedValue = value.trim();

  return isNonEmptyString(trimmedValue) ? trimmedValue : null;
};

export const IngestionPipelineForm = ({
  pipeline,
  webhookUrl,
  onSubmit,
}: IngestionPipelineFormProps) => {
  const { t } = useLingui();
  const { copyToClipboard } = useCopyToClipboard();
  const isEditing = isDefined(pipeline);

  const [name, setName] = useState(pipeline?.name ?? '');
  const [description, setDescription] = useState(pipeline?.description ?? '');
  const [mode, setMode] = useState<IngestionPipelineFormValues['mode']>(
    pipeline?.mode === 'pull' ? 'pull' : 'push',
  );
  const [targetObjectNameSingular, setTargetObjectNameSingular] = useState(
    pipeline?.targetObjectNameSingular ?? '',
  );
  const [sourceUrl, setSourceUrl] = useState(pipeline?.sourceUrl ?? '');
  const [schedule, setSchedule] = useState(pipeline?.schedule ?? '');
  const [dedupFieldNames, setDedupFieldNames] = useState(
    pipeline?.dedupFieldNames?.join(', ') ?? '',
  );
  const [isSaving, setIsSaving] = useState(false);

  const webhookSecret = pipeline?.webhookSecret;
  const canSubmit =
    isNonEmptyString(name.trim()) &&
    isNonEmptyString(targetObjectNameSingular.trim());

  const handleSubmit = async () => {
    const parsedDedupFieldNames = dedupFieldNames
      .split(',')
      .map((fieldName) => fieldName.trim())
      .filter(isNonEmptyString);

    setIsSaving(true);

    try {
      await onSubmit({
        name: name.trim(),
        description: toNullableTrimmedString(description),
        mode,
        targetObjectNameSingular: targetObjectNameSingular.trim(),
        sourceUrl: toNullableTrimmedString(sourceUrl),
        schedule: toNullableTrimmedString(schedule),
        dedupFieldNames:
          parsedDedupFieldNames.length > 0 ? parsedDedupFieldNames : null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledForm>
      <SettingsTextInput
        instanceId="ingestion-pipeline-name"
        label={t`Name`}
        placeholder={t`Convoso leads sync`}
        value={name}
        onChange={setName}
        fullWidth
      />
      <SettingsTextInput
        instanceId="ingestion-pipeline-description"
        label={t`Description`}
        placeholder={t`Write a description`}
        value={description}
        onChange={setDescription}
        fullWidth
      />
      {!isEditing && (
        <Section.Root>
          <Section.Header
            title={t`Mode`}
            description={t`How data will enter the pipeline`}
          />
          <SettingsRadioCardContainer
            value={mode}
            options={[
              {
                value: 'push',
                title: t`Push`,
                description: t`External systems POST data to a webhook URL`,
                Icon: IconWebhook,
              },
              {
                value: 'pull',
                title: t`Pull`,
                description: t`Fetch data from an external API on a schedule`,
                Icon: IconClock,
              },
            ]}
            onChange={(value) => setMode(value === 'pull' ? 'pull' : 'push')}
          />
        </Section.Root>
      )}
      <SettingsTextInput
        instanceId="ingestion-pipeline-target-object"
        label={t`Target object`}
        placeholder={doNotTranslate('person')}
        value={targetObjectNameSingular}
        onChange={setTargetObjectNameSingular}
        disabled={isEditing}
        fullWidth
      />
      {isNonEmptyString(webhookUrl) && (
        <Section.Root>
          <Section.Header
            level={3}
            title={t`Webhook URL`}
            description={t`POST data to this URL with the webhook secret in the x-webhook-secret header`}
          />
          <StyledWebhookFields>
            <StyledCopyRow>
              <StyledCopyInputContainer>
                <SettingsTextInput
                  instanceId="ingestion-pipeline-webhook-url"
                  aria-label={t`Webhook URL`}
                  value={webhookUrl}
                  readOnly
                  fullWidth
                />
              </StyledCopyInputContainer>
              <Button
                startIcon={<IconCopy />}
                onClick={() =>
                  copyToClipboard(
                    webhookUrl,
                    t`Webhook URL copied to clipboard`,
                  )
                }
              >{t`Copy`}</Button>
            </StyledCopyRow>
            {isNonEmptyString(webhookSecret) && (
              <StyledCopyRow>
                <StyledCopyInputContainer>
                  <SettingsTextInput
                    instanceId="ingestion-pipeline-webhook-secret"
                    label={t`Webhook secret`}
                    type="password"
                    value={webhookSecret}
                    readOnly
                    ignorePasswordManagers
                    fullWidth
                  />
                </StyledCopyInputContainer>
                <Button
                  startIcon={<IconCopy />}
                  onClick={() =>
                    copyToClipboard(
                      webhookSecret,
                      t`Webhook secret copied to clipboard`,
                    )
                  }
                >{t`Copy`}</Button>
              </StyledCopyRow>
            )}
          </StyledWebhookFields>
        </Section.Root>
      )}
      {mode === 'pull' && (
        <>
          <SettingsTextInput
            instanceId="ingestion-pipeline-source-url"
            label={t`Source URL`}
            placeholder={doNotTranslate('https://api.example.com/data')}
            value={sourceUrl}
            onChange={setSourceUrl}
            fullWidth
          />
          <SettingsTextInput
            instanceId="ingestion-pipeline-schedule"
            label={t`Schedule (cron)`}
            placeholder={doNotTranslate('*/5 * * * *')}
            value={schedule}
            onChange={setSchedule}
            fullWidth
          />
        </>
      )}
      <SettingsTextInput
        instanceId="ingestion-pipeline-dedup-field-names"
        label={t`Deduplication fields`}
        hint={t`Comma-separated fields that identify an existing record`}
        placeholder={doNotTranslate('phones.primaryPhoneNumber')}
        value={dedupFieldNames}
        onChange={setDedupFieldNames}
        fullWidth
      />
      <StyledButtonRow>
        <Button
          variant="solid"
          color="accent"
          loading={isSaving}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isEditing ? t`Save changes` : t`Create pipeline`}
        </Button>
      </StyledButtonRow>
    </StyledForm>
  );
};
