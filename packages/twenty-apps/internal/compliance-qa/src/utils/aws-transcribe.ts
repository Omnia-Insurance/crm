import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  GetTranscriptionJobCommand,
  type MediaFormat,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from '@aws-sdk/client-transcribe';
import { Readable } from 'node:stream';
import { getAwsClientConfig } from 'src/utils/aws-config';

export type CopiedRecording = {
  bucket: string;
  inputKey: string;
  outputKey: string;
  mediaFormat: MediaFormat;
  inputFileName: string;
  inputFileContent: Buffer;
  inputContentType: string;
};

export type StartedTranscriptionJob = CopiedRecording & {
  jobName: string;
};

export type CachedTranscribeOutput = {
  bucket: string;
  outputKey: string;
  transcriptFileUri: string;
  raw: AmazonTranscriptResult;
};

export type TranscriptionJobStatus =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'FAILED'
  | 'COMPLETED';

export type TranscriptionJobSnapshot = {
  status: TranscriptionJobStatus;
  failureReason?: string;
  mediaFileUri?: string;
  transcriptFileUri?: string;
};

export type TranscriptionArtifactFile = {
  content: Buffer;
  contentType: string;
};

export type AmazonTranscriptItem = {
  start_time?: string;
  end_time?: string;
  alternatives?: { content?: string; confidence?: string }[];
  type?: string;
};

export type AmazonTranscriptResult = {
  results?: {
    transcripts?: { transcript?: string }[];
    items?: AmazonTranscriptItem[];
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
  raw: AmazonTranscriptResult;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTranscriptResult = (
  value: unknown,
): value is AmazonTranscriptResult => {
  if (!isRecord(value)) {
    return false;
  }

  const results = value.results;

  if (!isRecord(results)) {
    return false;
  }

  const transcripts = results.transcripts;
  const items = results.items;

  return (
    (transcripts === undefined || Array.isArray(transcripts)) &&
    (items === undefined || Array.isArray(items))
  );
};

const getBucket = (): string => {
  const bucket = process.env.COMPLIANCE_QA_TRANSCRIBE_BUCKET;

  if (bucket === undefined || bucket.length === 0) {
    throw new Error(
      'COMPLIANCE_QA_TRANSCRIBE_BUCKET is required for Compliance QA transcription',
    );
  }

  return bucket;
};

const getInputPrefix = (): string =>
  normalizePrefix(
    process.env.COMPLIANCE_QA_TRANSCRIBE_INPUT_PREFIX,
    'compliance-qa/input',
  );

const getOutputPrefix = (): string =>
  normalizePrefix(
    process.env.COMPLIANCE_QA_TRANSCRIBE_OUTPUT_PREFIX,
    'compliance-qa/output',
  );

const normalizePrefix = (prefix: string | undefined, fallback: string) =>
  (prefix !== undefined && prefix.trim().length > 0
    ? prefix.trim()
    : fallback
  ).replace(/^\/+|\/+$/g, '');

const sanitizeJobPart = (value: string): string =>
  value.replace(/[^0-9A-Za-z._-]/g, '-').slice(0, 120);

export const buildTranscriptionJobName = (callId: string): string =>
  `compliance-qa-${sanitizeJobPart(callId)}`;

const getExtensionFromUrl = (recordingUrl: string): string | null => {
  const pathname = new URL(recordingUrl).pathname;
  const extension = pathname.split('.').pop()?.toLowerCase();

  return extension && extension.length <= 5 ? extension : null;
};

const inferMediaFormat = (
  recordingUrl: string,
  contentType: string | null,
): MediaFormat => {
  const extension = getExtensionFromUrl(recordingUrl);

  if (extension) {
    if (extension === 'mp3') return 'mp3';
    if (extension === 'mp4' || extension === 'm4a') return 'mp4';
    if (extension === 'wav') return 'wav';
    if (extension === 'flac') return 'flac';
    if (extension === 'ogg') return 'ogg';
    if (extension === 'webm') return 'webm';
  }

  if (contentType?.includes('wav')) return 'wav';
  if (contentType?.includes('mp4') || contentType?.includes('m4a'))
    return 'mp4';
  if (contentType?.includes('ogg')) return 'ogg';
  if (contentType?.includes('webm')) return 'webm';
  if (contentType?.includes('flac')) return 'flac';

  return 'mp3';
};

const streamToBuffer = async (body: unknown): Promise<Buffer> => {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
        continue;
      }

      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
        continue;
      }

      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk, 'utf-8'));
        continue;
      }

      throw new Error('Unsupported S3 response chunk type');
    }

    return Buffer.concat(chunks);
  }

  if (
    typeof body === 'object' &&
    body !== null &&
    'transformToByteArray' in body &&
    typeof body.transformToByteArray === 'function'
  ) {
    const transformed = await body.transformToByteArray();

    if (!(transformed instanceof Uint8Array)) {
      throw new Error(
        'S3 response transformToByteArray returned a non-byte array',
      );
    }

    return Buffer.from(transformed);
  }

  throw new Error('Unsupported S3 response body type');
};

const streamToString = async (body: unknown): Promise<string> =>
  (await streamToBuffer(body)).toString('utf-8');

export const copyRecordingToS3 = async ({
  recordingUrl,
  callId,
}: {
  recordingUrl: string;
  callId: string;
}): Promise<CopiedRecording> => {
  const bucket = getBucket();
  const inputPrefix = getInputPrefix();
  const outputPrefix = getOutputPrefix();

  const response = await fetch(recordingUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download recording (${
        response.status
      }): ${await response.text()}`,
    );
  }

  const contentType = response.headers.get('content-type') ?? 'audio/mpeg';
  const arrayBuffer = await response.arrayBuffer();
  const mediaFormat = inferMediaFormat(recordingUrl, contentType);
  const safeCallId = sanitizeJobPart(callId);
  const inputKey = `${inputPrefix}/${safeCallId}.${mediaFormat}`;
  const outputKey = `${outputPrefix}/${safeCallId}.json`;
  const inputFileContent = Buffer.from(arrayBuffer);

  const s3Client = new S3Client(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: inputKey,
      Body: inputFileContent,
      ContentType: contentType,
    }),
  );

  return {
    bucket,
    inputKey,
    outputKey,
    mediaFormat,
    inputFileName: `amazon-transcribe-input-${safeCallId}.${mediaFormat}`,
    inputFileContent,
    inputContentType: contentType,
  };
};

export const getTranscribeOutputLocation = (
  callId: string,
): Omit<CachedTranscribeOutput, 'raw'> => {
  const bucket = getBucket();
  const outputKey = `${getOutputPrefix()}/${sanitizeJobPart(callId)}.json`;

  return {
    bucket,
    outputKey,
    transcriptFileUri: `s3://${bucket}/${outputKey}`,
  };
};

export const startTranscriptionJob = async ({
  callId,
  recording,
}: {
  callId: string;
  recording: CopiedRecording;
}): Promise<StartedTranscriptionJob> => {
  const transcribeClient = new TranscribeClient(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );
  const jobName = buildTranscriptionJobName(callId);

  try {
    await transcribeClient.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: 'en-US',
        MediaFormat: recording.mediaFormat,
        Media: {
          MediaFileUri: `s3://${recording.bucket}/${recording.inputKey}`,
        },
        OutputBucketName: recording.bucket,
        OutputKey: recording.outputKey,
        Settings: {
          ShowSpeakerLabels: true,
          MaxSpeakerLabels: 4,
        },
      }),
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error.name !== 'ConflictException' &&
        !error.message.includes('already exists'))
    ) {
      throw error;
    }
  }

  return {
    ...recording,
    jobName,
  };
};

export const getTranscriptionJobSnapshot = async (
  jobName: string,
): Promise<TranscriptionJobSnapshot> => {
  const transcribeClient = new TranscribeClient(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );

  const response = await transcribeClient.send(
    new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
  );

  const job = response.TranscriptionJob;
  const status = job?.TranscriptionJobStatus;

  if (
    status !== 'QUEUED' &&
    status !== 'IN_PROGRESS' &&
    status !== 'FAILED' &&
    status !== 'COMPLETED'
  ) {
    const statusLabel = typeof status === 'string' ? status : 'missing';

    throw new Error(`Unexpected Transcribe status: ${statusLabel}`);
  }

  return {
    status,
    failureReason: job?.FailureReason,
    mediaFileUri: job?.Media?.MediaFileUri,
    transcriptFileUri: job?.Transcript?.TranscriptFileUri,
  };
};

type S3Location = {
  bucket: string;
  key: string;
};

const parseS3Uri = (uri: string): S3Location | null => {
  if (uri.startsWith('s3://')) {
    const withoutProtocol = uri.slice('s3://'.length);
    const slashIndex = withoutProtocol.indexOf('/');

    if (slashIndex <= 0 || slashIndex === withoutProtocol.length - 1) {
      return null;
    }

    return {
      bucket: withoutProtocol.slice(0, slashIndex),
      key: decodeURIComponent(withoutProtocol.slice(slashIndex + 1)),
    };
  }

  const url = new URL(uri);

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  const hostParts = url.hostname.split('.');
  const s3HostIndex = hostParts.findIndex(
    (part) => part === 's3' || part.startsWith('s3-'),
  );

  if (s3HostIndex > 0) {
    return {
      bucket: hostParts.slice(0, s3HostIndex).join('.'),
      key: decodeURIComponent(url.pathname.replace(/^\/+/, '')),
    };
  }

  if (s3HostIndex === 0) {
    const pathParts = url.pathname.replace(/^\/+/, '').split('/');

    if (pathParts.length < 2) {
      return null;
    }

    return {
      bucket: pathParts[0],
      key: decodeURIComponent(pathParts.slice(1).join('/')),
    };
  }

  return null;
};

const getS3ObjectFile = async ({
  bucket,
  key,
}: S3Location): Promise<TranscriptionArtifactFile> => {
  const s3Client = new S3Client(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  return {
    content: await streamToBuffer(response.Body),
    contentType: response.ContentType ?? 'application/octet-stream',
  };
};

export const readTranscriptionArtifactFileFromUri = async (
  uri: string,
): Promise<TranscriptionArtifactFile> => {
  const s3Location = parseS3Uri(uri);

  if (s3Location !== null) {
    return getS3ObjectFile(s3Location);
  }

  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch transcription artifact (${
        response.status
      }): ${await response.text()}`,
    );
  }

  return {
    content: Buffer.from(await response.arrayBuffer()),
    contentType:
      response.headers.get('content-type') ?? 'application/octet-stream',
  };
};

export const buildTranscriptionArtifactFilename = ({
  uri,
  prefix,
  fallbackExtension,
}: {
  uri: string;
  prefix: string;
  fallbackExtension: string;
}): string => {
  const s3Location = parseS3Uri(uri);
  const pathname =
    s3Location?.key ??
    (() => {
      try {
        return new URL(uri).pathname;
      } catch {
        return uri;
      }
    })();
  const pathParts = pathname.split('/').filter(Boolean);
  const basename = pathParts[pathParts.length - 1];
  const dotIndex = basename?.lastIndexOf('.') ?? -1;
  const extension =
    basename !== undefined && dotIndex >= 0 && dotIndex < basename.length - 1
      ? basename.slice(dotIndex + 1)
      : undefined;

  return `${prefix}.${extension ?? fallbackExtension}`;
};

export const readTranscribeOutput = async ({
  bucket,
  outputKey,
}: {
  bucket: string;
  outputKey: string;
}): Promise<AmazonTranscriptResult> => {
  const s3Client = new S3Client(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: outputKey,
    }),
  );

  const parsed: unknown = JSON.parse(await streamToString(response.Body));

  if (!isTranscriptResult(parsed)) {
    throw new Error('Amazon Transcribe output had an unexpected shape');
  }

  return parsed;
};

const isMissingS3ObjectError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'NoSuchKey' ||
    error.name === 'NotFound' ||
    error.message.includes('NoSuchKey') ||
    error.message.includes('Not Found'));

export const readCachedTranscribeOutputForCall = async (
  callId: string,
): Promise<CachedTranscribeOutput | null> => {
  const location = getTranscribeOutputLocation(callId);

  try {
    const raw = await readTranscribeOutput({
      bucket: location.bucket,
      outputKey: location.outputKey,
    });

    return {
      ...location,
      raw,
    };
  } catch (error) {
    if (isMissingS3ObjectError(error)) {
      return null;
    }

    throw error;
  }
};

export const readTranscribeOutputFromUri = async (
  transcriptFileUri: string,
): Promise<AmazonTranscriptResult> => {
  const s3Location = parseS3Uri(transcriptFileUri);

  if (s3Location !== null) {
    return readTranscribeOutput({
      bucket: s3Location.bucket,
      outputKey: s3Location.key,
    });
  }

  const response = await fetch(transcriptFileUri);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Amazon Transcribe output (${
        response.status
      }): ${await response.text()}`,
    );
  }

  const parsed: unknown = await response.json();

  if (!isTranscriptResult(parsed)) {
    throw new Error('Amazon Transcribe output had an unexpected shape');
  }

  return parsed;
};

const formatTimestamp = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const tokenText = (item: AmazonTranscriptItem): string =>
  item.alternatives?.[0]?.content ?? '';

const parseTranscribeTimestamp = (
  rawTimestamp: string | undefined,
  fallback: number,
): number => {
  if (rawTimestamp === undefined) {
    return fallback;
  }

  const trimmedTimestamp = rawTimestamp.trim();

  if (!/^\d+(?:\.\d+)?$/.test(trimmedTimestamp)) {
    return fallback;
  }

  const parsedTimestamp = Number.parseFloat(trimmedTimestamp);

  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : fallback;
};

export const normalizeAmazonTranscript = (
  raw: AmazonTranscriptResult,
): TranscriptionResult => {
  const transcriptText = raw.results?.transcripts?.[0]?.transcript ?? '';
  const items = raw.results?.items ?? [];
  const segments: TranscriptSegment[] = [];
  let currentWords: string[] = [];
  let segmentStart = 0;
  let segmentEnd = 0;

  for (const item of items) {
    const text = tokenText(item);

    if (text.length === 0) continue;

    if (item.type === 'punctuation') {
      const lastWord = currentWords.pop() ?? '';

      currentWords.push(`${lastWord}${text}`);
      continue;
    }

    const startTime = parseTranscribeTimestamp(item.start_time, segmentEnd);
    const endTime = parseTranscribeTimestamp(item.end_time, startTime);

    if (currentWords.length === 0) {
      segmentStart = Number.isFinite(startTime) ? startTime : 0;
    }

    currentWords.push(text);
    segmentEnd = Number.isFinite(endTime) ? endTime : segmentEnd;

    if (currentWords.length >= 45) {
      segments.push({
        speaker: 'Speaker',
        text: currentWords.join(' '),
        startTime: segmentStart,
        endTime: segmentEnd,
      });
      currentWords = [];
    }
  }

  if (currentWords.length > 0) {
    segments.push({
      speaker: 'Speaker',
      text: currentWords.join(' '),
      startTime: segmentStart,
      endTime: segmentEnd,
    });
  }

  const fallbackSegments =
    segments.length > 0
      ? segments
      : [
          {
            speaker: 'Speaker',
            text: transcriptText,
            startTime: 0,
            endTime: 0,
          },
        ];

  const markdown = fallbackSegments
    .map(
      (segment) =>
        `**${segment.speaker}** [${formatTimestamp(segment.startTime)}]: ${
          segment.text
        }`,
    )
    .join('\n\n');

  return {
    segments: fallbackSegments,
    fullTranscript: transcriptText,
    markdown,
    durationSeconds: segmentEnd,
    raw,
  };
};
