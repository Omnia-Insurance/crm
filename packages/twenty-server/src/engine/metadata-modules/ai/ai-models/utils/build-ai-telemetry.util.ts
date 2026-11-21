import { isNonEmptyString } from '@sniptt/guards';
import { type TelemetryOptions } from 'ai';

import { AI_TELEMETRY_CONFIG } from 'src/engine/metadata-modules/ai/ai-models/constants/ai-telemetry.constant';

type BuildAiTelemetryArgs = {
  functionId: string;
  isContentRecordingAllowed: boolean;
  workspaceId?: string;
  userWorkspaceId?: string | null;
  agentId?: string | null;
  threadId?: string;
  turnId?: string;
  streamId?: string;
};

type AiTelemetryCallOptions = {
  telemetry: TelemetryOptions<Record<string, string>>;
  runtimeContext: Record<string, string>;
};

// telemetry integrations only receive per-call attributes opted in from runtime context
export const buildAiTelemetry = ({
  functionId,
  // OMNIA-CUSTOM: ignored, the HIPAA ceiling below never records content
  isContentRecordingAllowed: _isContentRecordingAllowed,
  ...identifiers
}: BuildAiTelemetryArgs): AiTelemetryCallOptions => {
  const runtimeContext = Object.fromEntries(
    Object.entries(identifiers).filter(([, value]) => isNonEmptyString(value)),
  ) as Record<string, string>;

  return {
    telemetry: {
      ...AI_TELEMETRY_CONFIG,
      // OMNIA-CUSTOM: never record PHI prompt/response content (HIPAA),
      // whatever the workspace AI data policy allows
      recordInputs: false,
      recordOutputs: false,
      functionId,
      includeRuntimeContext: Object.fromEntries(
        Object.keys(runtimeContext).map((key) => [key, true]),
      ),
    },
    runtimeContext,
  };
};
