import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString, isNumber } from '@sniptt/guards';
import { useState } from 'react';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined, isPlainObject } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { Section } from 'twenty-ui/components/layout';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useIngestionPipelineTest } from '@/settings/ingestion-pipeline/hooks/useIngestionPipelineTest';
import { TextArea } from '@/ui/input/components/TextArea';
import { type TestIngestionPipelineMutation } from '~/generated-metadata/graphql';

type IngestionTestSectionProps = {
  pipelineId: string;
};

type TestIngestionPipelineResult =
  TestIngestionPipelineMutation['testIngestionPipeline'];

const SAMPLE_RECORDS_PLACEHOLDER = doNotTranslate(
  '[{"first_name": "John", "last_name": "Doe", "email": "john@example.com"}]',
);

const StyledButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledParseError = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
  margin-top: ${themeCssVariables.spacing[1]};
`;

const StyledResultContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[3]};
`;

const StyledResultSummary = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledPreviewBlock = styled.pre`
  background: ${themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[3]};
  white-space: pre-wrap;
  word-break: break-word;
`;

const StyledErrorItem = styled.div`
  background: ${themeCssVariables.background.danger};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]};
`;

const parseSampleRecords = (
  sampleJson: string,
): Record<string, unknown>[] | null => {
  try {
    const parsedValue: unknown = JSON.parse(sampleJson);
    const sampleRecords: unknown[] = Array.isArray(parsedValue)
      ? parsedValue
      : [parsedValue];

    return sampleRecords.every(isPlainObject) ? sampleRecords : null;
  } catch {
    return null;
  }
};

export const IngestionTestSection = ({
  pipelineId,
}: IngestionTestSectionProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const { testPipeline, isTestRunning } = useIngestionPipelineTest();

  const [sampleJson, setSampleJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [testResult, setTestResult] =
    useState<TestIngestionPipelineResult | null>(null);

  const handleRunTest = async () => {
    setParseError(null);
    setTestResult(null);

    const sampleRecords = parseSampleRecords(sampleJson);

    if (!isDefined(sampleRecords)) {
      setParseError(
        t`Invalid JSON. Please enter a valid JSON array or object.`,
      );

      return;
    }

    try {
      setTestResult(await testPipeline(pipelineId, sampleRecords));
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  const validRecords = testResult?.validRecords ?? 0;
  const invalidRecords = testResult?.invalidRecords ?? 0;
  const totalRecords = testResult?.totalRecords ?? 0;

  return (
    <Section.Root>
      <Section.Header
        title={t`Test pipeline`}
        description={t`Paste sample JSON data to preview how records will be transformed`}
      />
      <TextArea
        textAreaId="ingestion-pipeline-test-sample-json"
        placeholder={SAMPLE_RECORDS_PLACEHOLDER}
        minRows={5}
        maxRows={15}
        value={sampleJson}
        onChange={setSampleJson}
      />
      {isNonEmptyString(parseError) && (
        <StyledParseError>{parseError}</StyledParseError>
      )}
      <StyledButtonRow>
        <Button
          size="sm"
          variant="outline"
          loading={isTestRunning}
          disabled={!isNonEmptyString(sampleJson.trim())}
          onClick={handleRunTest}
        >{t`Run test`}</Button>
      </StyledButtonRow>
      {isDefined(testResult) && (
        <StyledResultContainer>
          <StyledResultSummary>
            {t`${validRecords} valid, ${invalidRecords} invalid out of ${totalRecords} records`}
          </StyledResultSummary>
          {testResult.previewRecords?.map((previewRecord, index) => (
            <StyledPreviewBlock key={index}>
              {JSON.stringify(previewRecord, null, 2)}
            </StyledPreviewBlock>
          ))}
          {testResult.errors?.map((testError, index) => {
            const recordIndex = isNumber(testError?.recordIndex)
              ? testError.recordIndex
              : index;
            const errorMessage = isNonEmptyString(testError?.message)
              ? testError.message
              : t`Unknown error`;

            return (
              <StyledErrorItem key={index}>
                {t`Record ${recordIndex}: ${errorMessage}`}
              </StyledErrorItem>
            );
          })}
        </StyledResultContainer>
      )}
    </Section.Root>
  );
};
