import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { H2Title } from 'twenty-ui/typography';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useIngestionPipelineTest } from '@/settings/ingestion-pipeline/hooks/useIngestionPipelineTest';

type IngestionTestSectionProps = {
  pipelineId: string;
};

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.sm};
  min-height: 120px;
  padding: ${themeCssVariables.spacing[3]};
  resize: vertical;
  width: 100%;

  &:focus {
    border-color: ${themeCssVariables.color.blue};
    outline: none;
  }

  &::placeholder {
    color: ${themeCssVariables.font.color.light};
  }
`;

const StyledButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: ${themeCssVariables.spacing[2]};
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
  font-size: ${themeCssVariables.font.size.sm};
  margin: ${themeCssVariables.spacing[1]} 0;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[3]};
  white-space: pre-wrap;
  word-break: break-word;
`;

const StyledErrorItem = styled.div`
  background: ${themeCssVariables.background.danger};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.color.red};
  font-size: ${themeCssVariables.font.size.sm};
  margin-top: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledResultContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[3]};
`;

const StyledParseError = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: ${themeCssVariables.font.size.sm};
  margin-top: ${themeCssVariables.spacing[1]};
`;

type TestResult = {
  success: boolean;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  previewRecords: Record<string, unknown>[] | null;
  errors: Record<string, unknown>[] | null;
};

export const IngestionTestSection = ({
  pipelineId,
}: IngestionTestSectionProps) => {
  const { t } = useLingui();
  const { testPipeline, isTestRunning } = useIngestionPipelineTest();

  const [sampleJson, setSampleJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const handleRunTest = async () => {
    setParseError(null);
    setTestResult(null);

    let parsed: Record<string, unknown>[];

    try {
      const value = JSON.parse(sampleJson);

      parsed = Array.isArray(value) ? value : [value];
    } catch {
      setParseError(
        t`Invalid JSON. Please enter a valid JSON array or object.`,
      );

      return;
    }

    const result = await testPipeline(pipelineId, parsed);

    setTestResult(result);
  };

  return (
    <Section>
      <H2Title
        title={t`Test Pipeline`}
        description={t`Paste sample JSON data to preview how records will be transformed`}
      />
      <StyledTextarea
        placeholder={t`[{"first_name": "John", "last_name": "Doe", "email": "john@example.com"}]`}
        value={sampleJson}
        onChange={(e) => setSampleJson(e.target.value)}
      />
      {parseError && <StyledParseError>{parseError}</StyledParseError>}
      <StyledButtonRow>
        <Button
          title={isTestRunning ? t`Running...` : t`Run Test`}
          variant="secondary"
          size="small"
          onClick={handleRunTest}
          disabled={!sampleJson.trim() || isTestRunning}
        />
      </StyledButtonRow>
      {testResult && (
        <StyledResultContainer>
          <StyledResultSummary>
            {t`${testResult.validRecords} valid, ${testResult.invalidRecords} invalid out of ${testResult.totalRecords} records`}
          </StyledResultSummary>
          {testResult.previewRecords?.map((record, index) => (
            <StyledPreviewBlock key={index}>
              {JSON.stringify(record, null, 2)}
            </StyledPreviewBlock>
          ))}
          {testResult.errors?.map((error, index) => (
            <StyledErrorItem key={index}>
              {t`Record ${(error.recordIndex as number) ?? index}`}:{' '}
              {(error.message as string) ?? t`Unknown error`}
            </StyledErrorItem>
          ))}
        </StyledResultContainer>
      )}
    </Section>
  );
};
