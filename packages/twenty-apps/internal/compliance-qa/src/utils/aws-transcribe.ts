import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  GetTranscriptionJobCommand,
  type GetTranscriptionJobCommandOutput,
  type LanguageCode,
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
  mediaSampleRateHertz?: number;
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
  mediaFormat?: MediaFormat;
  mediaFileUri?: string;
  transcriptFileUri?: string;
};

export type TranscriptionArtifactFile = {
  content: Buffer;
  contentType: string;
};

export class RecordingNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingNotReadyError';
  }
}

export const isRecordingNotReadyError = (
  error: unknown,
): error is RecordingNotReadyError => error instanceof RecordingNotReadyError;

export type AmazonTranscriptItem = {
  start_time?: string;
  end_time?: string;
  alternatives?: { content?: string; confidence?: string }[];
  type?: string;
  language_code?: string;
};

export type AmazonTranscriptLanguageCode = {
  language_code?: string;
  duration_in_seconds?: number;
};

export type AmazonTranscriptResult = {
  results?: {
    language_code?: string;
    language_codes?: AmazonTranscriptLanguageCode[];
    transcripts?: { transcript?: string }[];
    items?: AmazonTranscriptItem[];
  };
};

export type TranscriptSegment = {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  languageCode?: string;
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

export const TRANSCRIPTION_PIPELINE_VERSION = 'lid-v1';

const TRANSCRIBE_LANGUAGE_OPTIONS: LanguageCode[] = ['en-US', 'es-US'];

export const buildTranscriptionJobName = (callId: string): string =>
  `compliance-qa-${sanitizeJobPart(callId)}-${TRANSCRIPTION_PIPELINE_VERSION}`;

export const buildSampleRateFallbackTranscriptionJobName = (
  callId: string,
  attempt: number,
): string =>
  attempt === 1
    ? `${buildTranscriptionJobName(callId)}-sr`
    : `${buildTranscriptionJobName(callId)}-sr${attempt}`;

const buildSampleRateFallbackOutputKey = (
  callId: string,
  attempt: number,
): string =>
  attempt === 1
    ? `${getOutputPrefix()}/${sanitizeJobPart(
        callId,
      )}-${TRANSCRIPTION_PIPELINE_VERSION}-sr.json`
    : `${getOutputPrefix()}/${sanitizeJobPart(
        callId,
      )}-${TRANSCRIPTION_PIPELINE_VERSION}-sr${attempt}.json`;

const buildTranscribeOutputKey = (callId: string): string =>
  `${getOutputPrefix()}/${sanitizeJobPart(
    callId,
  )}-${TRANSCRIPTION_PIPELINE_VERSION}.json`;

const getLanguageIdentificationSettings = () => ({
  IdentifyMultipleLanguages: true,
  LanguageOptions: TRANSCRIBE_LANGUAGE_OPTIONS,
});

const getMediaFormat = (value: string | undefined): MediaFormat | undefined => {
  switch (value) {
    case 'mp3':
    case 'mp4':
    case 'wav':
    case 'flac':
    case 'ogg':
    case 'amr':
    case 'webm':
      return value;
    default:
      return undefined;
  }
};

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

const getMp3SampleRatesForVersion = (
  versionId: number,
): [number, number, number] | undefined => {
  switch (versionId) {
    case 0:
      return [11025, 12000, 8000];
    case 2:
      return [22050, 24000, 16000];
    case 3:
      return [44100, 48000, 32000];
    default:
      return undefined;
  }
};

const getMp3SampleRateHertz = (
  content: Uint8Array,
): number | undefined => {
  for (let index = 0; index < content.length - 3; index += 1) {
    const firstByte = content[index];
    const secondByte = content[index + 1];
    const thirdByte = content[index + 2];

    if (
      firstByte === undefined ||
      secondByte === undefined ||
      thirdByte === undefined
    ) {
      continue;
    }

    const hasFrameSync =
      firstByte === 0xff && (secondByte & 0xe0) === 0xe0;

    if (!hasFrameSync) {
      continue;
    }

    const versionId = (secondByte >> 3) & 0x03;
    const layerId = (secondByte >> 1) & 0x03;
    const sampleRateIndex = (thirdByte >> 2) & 0x03;
    const sampleRates = getMp3SampleRatesForVersion(versionId);

    if (
      layerId === 0 ||
      sampleRateIndex === 3 ||
      sampleRates === undefined
    ) {
      continue;
    }

    return sampleRates[sampleRateIndex];
  }

  return undefined;
};

const inferMediaSampleRateHertz = ({
  mediaFormat,
  inputFileContent,
}: {
  mediaFormat: MediaFormat;
  inputFileContent: Uint8Array;
}): number | undefined =>
  mediaFormat === 'mp3' ? getMp3SampleRateHertz(inputFileContent) : undefined;

const getUtf8Snippet = (content: Uint8Array): string => {
  const maxSnippetLength = Math.min(content.length, 500);

  return Buffer.from(content.slice(0, maxSnippetLength))
    .toString('utf-8')
    .trim();
};

const getRemoteRecordingErrorMessage = (
  content: Uint8Array,
): string | undefined => {
  const snippet = getUtf8Snippet(content);

  if (snippet.length === 0) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(snippet);

    if (!isRecord(parsed)) {
      return snippet;
    }

    const text = parsed.text;
    const message = parsed.message;
    const code = parsed.code;

    if (typeof text === 'string' && text.length > 0) {
      return text;
    }

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    if (typeof code === 'string' || typeof code === 'number') {
      return `remote recording error code ${code}`;
    }

    return snippet;
  } catch {
    return snippet;
  }
};

const isSupportedRecordingContentType = (contentType: string): boolean => {
  const normalizedContentType = contentType.toLowerCase();

  return (
    normalizedContentType.startsWith('audio/') ||
    normalizedContentType.startsWith('video/') ||
    normalizedContentType.includes('application/octet-stream')
  );
};

const assertRecordingLooksLikeMedia = ({
  recordingUrl,
  contentType,
  inputFileContent,
}: {
  recordingUrl: string;
  contentType: string;
  inputFileContent: Uint8Array;
}): void => {
  if (isSupportedRecordingContentType(contentType)) {
    return;
  }

  const remoteError = getRemoteRecordingErrorMessage(inputFileContent);
  const detail =
    remoteError !== undefined && remoteError.length > 0
      ? `: ${remoteError}`
      : '';

  throw new RecordingNotReadyError(
    `Recording URL returned ${contentType} instead of audio for ${recordingUrl}${detail}`,
  );
};

const isRetryableRecordingHttpStatus = (status: number): boolean =>
  status === 404 ||
  status === 409 ||
  status === 425 ||
  status === 429 ||
  status >= 500;

const buildRecordingDownloadErrorMessage = ({
  recordingUrl,
  status,
  responseText,
}: {
  recordingUrl: string;
  status: number;
  responseText: string;
}): string => {
  const detail =
    responseText.trim().length > 0 ? `: ${responseText.trim()}` : '';

  return `Recording URL returned HTTP ${status} for ${recordingUrl}${detail}`;
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

  const response = await fetch(recordingUrl);

  if (!response.ok) {
    const errorMessage = buildRecordingDownloadErrorMessage({
      recordingUrl,
      status: response.status,
      responseText: await response.text(),
    });

    if (isRetryableRecordingHttpStatus(response.status)) {
      throw new RecordingNotReadyError(errorMessage);
    }

    throw new Error(errorMessage);
  }

  const contentType =
    response.headers.get('content-type') ?? 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();
  const inputFileContent = Buffer.from(arrayBuffer);

  assertRecordingLooksLikeMedia({
    recordingUrl,
    contentType,
    inputFileContent,
  });

  const mediaFormat = inferMediaFormat(recordingUrl, contentType);
  const safeCallId = sanitizeJobPart(callId);
  const inputKey = `${inputPrefix}/${safeCallId}.${mediaFormat}`;
  const outputKey = buildTranscribeOutputKey(callId);
  const mediaSampleRateHertz = inferMediaSampleRateHertz({
    mediaFormat,
    inputFileContent,
  });

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
    mediaSampleRateHertz,
    inputFileName: `amazon-transcribe-input-${safeCallId}.${mediaFormat}`,
    inputFileContent,
    inputContentType: contentType,
  };
};

export const getTranscribeOutputLocation = (
  callId: string,
): Omit<CachedTranscribeOutput, 'raw'> => {
  const bucket = getBucket();
  const outputKey = buildTranscribeOutputKey(callId);

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
        ...getLanguageIdentificationSettings(),
        MediaFormat: recording.mediaFormat,
        MediaSampleRateHertz: recording.mediaSampleRateHertz,
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

export const startSampleRateFallbackTranscriptionJob = async ({
  callId,
  attempt,
  mediaFileUri,
  mediaFormat,
  mediaSampleRateHertz,
}: {
  callId: string;
  attempt: number;
  mediaFileUri: string;
  mediaFormat: MediaFormat;
  mediaSampleRateHertz: number;
}): Promise<{ jobName: string; transcriptFileUri: string }> => {
  const transcribeClient = new TranscribeClient(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );
  const bucket = getBucket();
  const jobName = buildSampleRateFallbackTranscriptionJobName(
    callId,
    attempt,
  );
  const outputKey = buildSampleRateFallbackOutputKey(callId, attempt);

  try {
    await transcribeClient.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        ...getLanguageIdentificationSettings(),
        MediaFormat: mediaFormat,
        MediaSampleRateHertz: mediaSampleRateHertz,
        Media: {
          MediaFileUri: mediaFileUri,
        },
        OutputBucketName: bucket,
        OutputKey: outputKey,
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
    jobName,
    transcriptFileUri: `s3://${bucket}/${outputKey}`,
  };
};

const isTranscribeJobNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'NotFoundException' ||
    error.message.includes('The requested job couldn') ||
    error.message.includes('not be found'));

export const findTranscriptionJobSnapshot = async (
  jobName: string,
): Promise<TranscriptionJobSnapshot | null> => {
  const transcribeClient = new TranscribeClient(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );

  let response: GetTranscriptionJobCommandOutput;

  try {
    response = await transcribeClient.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
    );
  } catch (error) {
    if (isTranscribeJobNotFoundError(error)) {
      return null;
    }

    throw error;
  }

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
    mediaFormat: getMediaFormat(job?.MediaFormat),
    mediaFileUri: job?.Media?.MediaFileUri,
    transcriptFileUri: job?.Transcript?.TranscriptFileUri,
  };
};

export const getTranscriptionJobSnapshot = async (
  jobName: string,
): Promise<TranscriptionJobSnapshot> => {
  const snapshot = await findTranscriptionJobSnapshot(jobName);

  if (snapshot === null) {
    throw new Error(`Amazon Transcribe job not found: ${jobName}`);
  }

  return snapshot;
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

const getS3ObjectPrefix = async ({
  bucket,
  key,
}: S3Location): Promise<Buffer> => {
  const s3Client = new S3Client(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: 'bytes=0-65535',
    }),
  );

  return streamToBuffer(response.Body);
};

export const readMediaSampleRateHertzFromUri = async ({
  mediaFileUri,
  mediaFormat,
}: {
  mediaFileUri: string;
  mediaFormat: MediaFormat;
}): Promise<number | undefined> => {
  if (mediaFormat !== 'mp3') {
    return undefined;
  }

  const s3Location = parseS3Uri(mediaFileUri);

  if (s3Location === null) {
    return undefined;
  }

  return getMp3SampleRateHertz(await getS3ObjectPrefix(s3Location));
};

export const isInvalidInputMediaFailure = (
  failureReason: string | undefined,
): boolean =>
  failureReason !== undefined &&
  failureReason.includes("input media file isn't valid");

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
    error.message.includes('Not Found') ||
    (error.name === 'AccessDenied' &&
      error.message.includes('s3:ListBucket')));

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

export const formatTranscriptMarkdown = (
  segments: TranscriptSegment[],
): string =>
  segments
    .map(
      (segment) =>
        `**${segment.speaker}** [${formatTimestamp(segment.startTime)}]: ${
          segment.text
        }`,
    )
    .join('\n\n');

const normalizeLanguageCode = (languageCode: string): string | null => {
  const normalizedParts = languageCode
    .trim()
    .replace(/_/g, '-')
    .split('-')
    .filter(Boolean);

  const language = normalizedParts[0];

  if (language === undefined || !/^[a-z]{2,3}$/i.test(language)) {
    return null;
  }

  const region = normalizedParts[1];

  return region === undefined
    ? language.toLowerCase()
    : `${language.toLowerCase()}-${region.toUpperCase()}`;
};

export const getTranscriptLanguageCodes = (
  raw: AmazonTranscriptResult,
): string[] => {
  const languageCodes = new Set<string>();
  const addLanguageCode = (languageCode: string | undefined): void => {
    if (languageCode === undefined) {
      return;
    }

    const normalizedLanguageCode = normalizeLanguageCode(languageCode);

    if (normalizedLanguageCode !== null) {
      languageCodes.add(normalizedLanguageCode);
    }
  };

  addLanguageCode(raw.results?.language_code);

  for (const languageCode of raw.results?.language_codes ?? []) {
    addLanguageCode(languageCode.language_code);
  }

  for (const item of raw.results?.items ?? []) {
    addLanguageCode(item.language_code);
  }

  return [...languageCodes];
};

export const isSpanishLanguageCode = (languageCode: string): boolean =>
  normalizeLanguageCode(languageCode)?.startsWith('es') === true;

export const shouldTranslateTranscriptToEnglish = (
  raw: AmazonTranscriptResult,
): boolean => getTranscriptLanguageCodes(raw).some(isSpanishLanguageCode);

const getDominantLanguageCode = (
  languageCodes: string[],
): string | undefined => {
  const counts = new Map<string, number>();

  for (const languageCode of languageCodes) {
    const normalizedLanguageCode = normalizeLanguageCode(languageCode);

    if (normalizedLanguageCode === null) {
      continue;
    }

    counts.set(
      normalizedLanguageCode,
      (counts.get(normalizedLanguageCode) ?? 0) + 1,
    );
  }

  let dominantLanguageCode: string | undefined;
  let dominantCount = 0;

  for (const [languageCode, count] of counts) {
    if (count > dominantCount) {
      dominantLanguageCode = languageCode;
      dominantCount = count;
    }
  }

  return dominantLanguageCode;
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
  let currentLanguageCodes: string[] = [];
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
    if (item.language_code !== undefined) {
      currentLanguageCodes.push(item.language_code);
    }
    segmentEnd = Number.isFinite(endTime) ? endTime : segmentEnd;

    if (currentWords.length >= 45) {
      segments.push({
        speaker: 'Speaker',
        text: currentWords.join(' '),
        startTime: segmentStart,
        endTime: segmentEnd,
        languageCode: getDominantLanguageCode(currentLanguageCodes),
      });
      currentWords = [];
      currentLanguageCodes = [];
    }
  }

  if (currentWords.length > 0) {
    segments.push({
      speaker: 'Speaker',
      text: currentWords.join(' '),
      startTime: segmentStart,
      endTime: segmentEnd,
      languageCode: getDominantLanguageCode(currentLanguageCodes),
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
            languageCode: getTranscriptLanguageCodes(raw)[0],
          },
        ];

  const markdown = formatTranscriptMarkdown(fallbackSegments);

  return {
    segments: fallbackSegments,
    fullTranscript: transcriptText,
    markdown,
    durationSeconds: segmentEnd,
    raw,
  };
};
