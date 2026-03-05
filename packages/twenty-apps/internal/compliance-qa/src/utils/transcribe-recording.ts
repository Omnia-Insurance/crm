// Deepgram batch transcription for Convoso call recordings.
// Uses Nova-3 with speaker diarization for agent/consumer separation.

type DeepgramWord = {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  punctuated_word: string;
};

type DeepgramUtterance = {
  start: number;
  end: number;
  confidence: number;
  channel: number;
  transcript: string;
  words: DeepgramWord[];
  speaker: number;
  id: string;
};

type DeepgramResponse = {
  results?: {
    utterances?: DeepgramUtterance[];
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        words?: DeepgramWord[];
      }>;
    }>;
  };
};

export type TranscriptSegment = {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
};

export type TranscriptionResult = {
  segments: TranscriptSegment[];
  fullTranscript: string;
  markdown: string;
  durationSeconds: number;
};

const formatTimestamp = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const transcribeRecording = async (
  recordingUrl: string,
): Promise<TranscriptionResult> => {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY environment variable is not set');
  }

  console.log(
    '[transcribeRecording] Starting transcription for:',
    recordingUrl,
  );

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?' +
      new URLSearchParams({
        model: 'nova-3',
        diarize: 'true',
        smart_format: 'true',
        punctuate: 'true',
        utterances: 'true',
      }).toString(),
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: recordingUrl }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Deepgram transcription failed (${response.status}): ${errorBody}`,
    );
  }

  const data = (await response.json()) as DeepgramResponse;

  // Build segments from utterances (preferred — has speaker diarization)
  const utterances = data.results?.utterances;

  if (!utterances?.length) {
    // Fallback to channel-based transcript
    const channelTranscript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

    return {
      segments: [
        { speaker: 'Unknown', text: channelTranscript, startTime: 0, endTime: 0 },
      ],
      fullTranscript: channelTranscript,
      markdown: channelTranscript,
      durationSeconds: 0,
    };
  }

  // Map speaker IDs to labels (Speaker 0 is typically the first speaker)
  const speakerLabels: Record<number, string> = {};
  let speakerCount = 0;

  const segments: TranscriptSegment[] = utterances.map((utterance) => {
    if (!(utterance.speaker in speakerLabels)) {
      speakerLabels[utterance.speaker] =
        speakerCount === 0 ? 'Agent' : `Consumer${speakerCount > 1 ? ` ${speakerCount}` : ''}`;
      speakerCount++;
    }

    return {
      speaker: speakerLabels[utterance.speaker],
      text: utterance.transcript,
      startTime: utterance.start,
      endTime: utterance.end,
    };
  });

  const lastUtterance = utterances[utterances.length - 1];
  const durationSeconds = lastUtterance ? lastUtterance.end : 0;

  // Build markdown transcript with timestamps
  const markdown = segments
    .map(
      (seg) =>
        `**${seg.speaker}** [${formatTimestamp(seg.startTime)}]: ${seg.text}`,
    )
    .join('\n\n');

  const fullTranscript = segments
    .map((seg) => `${seg.speaker}: ${seg.text}`)
    .join('\n');

  console.log(
    '[transcribeRecording] Completed:',
    JSON.stringify({
      segments: segments.length,
      durationSeconds: Math.round(durationSeconds),
      speakerCount,
    }),
  );

  return { segments, fullTranscript, markdown, durationSeconds };
};
