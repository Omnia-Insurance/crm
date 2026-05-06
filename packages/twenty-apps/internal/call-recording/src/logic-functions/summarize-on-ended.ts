import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-sdk/clients';

import { summarizeTranscript } from 'src/utils/summarize-transcript';

interface CallRecordingRecord {
  id: string;
  status?: string;
}

const handler = async (
  params: DatabaseEventPayload<
    ObjectRecordUpdateEvent<CallRecordingRecord>
  >,
) => {
  const after = params.properties.after;

  if (after.status !== 'ENDED') {
    return;
  }

  const client = new CoreApiClient();

  const { callRecording } = await client.query({
    callRecording: {
      __args: { filter: { id: { eq: after.id } } },
      id: true,
      status: true,
      transcript: { markdown: true } as any,
      summary: { markdown: true } as any,
    },
  } as any);

  if (!callRecording) {
    console.warn(
      `[summarize-on-ended] CallRecording ${after.id} not found, skipping`,
    );

    return;
  }

  if (callRecording.status !== 'ENDED') {
    return;
  }

  const transcriptMarkdown = (callRecording as any).transcript?.markdown;
  const existingSummary = (callRecording as any).summary?.markdown;

  if (!transcriptMarkdown) {
    console.log(
      `[summarize-on-ended] CallRecording ${after.id} has no transcript, skipping`,
    );

    return;
  }

  if (existingSummary && !existingSummary.startsWith('*Generating')) {
    return;
  }

  const updateSummary = async (markdown: string) => {
    await client.mutation({
      updateCallRecording: {
        __args: {
          id: callRecording.id,
          data: { summary: { blocknote: null, markdown } } as any,
        },
        id: true,
      },
    });
  };

  await updateSummary('*Generating summary...*');

  try {
    const summaryMarkdown = await summarizeTranscript(transcriptMarkdown);

    if (summaryMarkdown) {
      await updateSummary(summaryMarkdown);
      console.log(
        `[summarize-on-ended] Summary written for ${callRecording.id} (${summaryMarkdown.length} chars)`,
      );
    } else {
      await updateSummary('*Failed to generate summary: NO_RESPONSE*');
    }
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'UNKNOWN_ERROR';

    console.error(`[summarize-on-ended] AI summarization failed:`, error);
    await updateSummary(`*Failed to generate summary: ${errorCode}*`);
  }
};

export default defineLogicFunction({
  universalIdentifier: 'd9f3a8b2-4e1c-4b6f-8a5d-2c7e9f1b3a64',
  name: 'summarize-on-ended',
  description:
    'Generates an AI summary when a callRecording transitions to ENDED',
  timeoutSeconds: 300,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'callRecording.updated',
  },
});
