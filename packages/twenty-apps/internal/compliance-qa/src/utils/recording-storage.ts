import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { getAwsClientConfig } from 'src/utils/aws-config';
import {
  isDeepgramTranscriptResult,
  type DeepgramTranscriptResult,
} from 'src/utils/deepgram';

export type CopiedRecording = {
  bucket: string;
  inputKey: string;
  outputKey: string;
};

export type StoredRecording = {
  bucket: string;
  inputKey: string;
  content: Buffer;
  contentType: string;
};

export type CachedTranscript = {
  bucket: string;
  outputKey: string;
  transcriptFileUri: string;
  raw: DeepgramTranscriptResult;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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

const sanitizeKeyPart = (value: string): string =>
  value.replace(/[^0-9A-Za-z._-]/g, '-').slice(0, 120);

// Versions the deterministic S3 output key. The dg-v1 line is Deepgram JSON;
// older lid-v1/unversioned keys hold Amazon Transcribe JSON and must never be
// read back through the Deepgram parser.
export const TRANSCRIPTION_PIPELINE_VERSION = 'dg-v1';

export const buildTranscriptOutputKey = (callId: string): string =>
  `${getOutputPrefix()}/${sanitizeKeyPart(
    callId,
  )}-${TRANSCRIPTION_PIPELINE_VERSION}.json`;

const getExtensionFromUrl = (recordingUrl: string): string | null => {
  const pathname = new URL(recordingUrl).pathname;
  const extension = pathname.split('.').pop()?.toLowerCase();

  return extension && extension.length <= 5 ? extension : null;
};

const inferRecordingExtension = (
  recordingUrl: string,
  contentType: string | null,
): string => {
  const extension = getExtensionFromUrl(recordingUrl);

  if (
    extension !== null &&
    ['mp3', 'mp4', 'm4a', 'wav', 'flac', 'ogg', 'webm'].includes(extension)
  ) {
    return extension;
  }

  if (contentType?.includes('wav')) return 'wav';
  if (contentType?.includes('mp4') || contentType?.includes('m4a'))
    return 'mp4';
  if (contentType?.includes('ogg')) return 'ogg';
  if (contentType?.includes('webm')) return 'webm';
  if (contentType?.includes('flac')) return 'flac';

  return 'mp3';
};

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

const getS3Client = (): S3Client =>
  new S3Client(
    getAwsClientConfig({ serviceName: 'Compliance QA transcription' }),
  );

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

  const extension = inferRecordingExtension(recordingUrl, contentType);
  const safeCallId = sanitizeKeyPart(callId);
  const inputKey = `${inputPrefix}/${safeCallId}.${extension}`;
  const outputKey = buildTranscriptOutputKey(callId);

  await getS3Client().send(
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
  };
};

export const findStoredRecordingForCall = async (
  callId: string,
): Promise<StoredRecording | null> => {
  const bucket = getBucket();
  const inputPrefix = getInputPrefix();
  const s3Client = getS3Client();

  const listResponse = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${inputPrefix}/${sanitizeKeyPart(callId)}.`,
      MaxKeys: 1,
    }),
  );

  const inputKey = listResponse.Contents?.[0]?.Key;

  if (inputKey === undefined) {
    return null;
  }

  const objectResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: inputKey,
    }),
  );

  return {
    bucket,
    inputKey,
    content: await streamToBuffer(objectResponse.Body),
    contentType: objectResponse.ContentType ?? 'application/octet-stream',
  };
};

export const getTranscriptOutputLocation = (
  callId: string,
): Omit<CachedTranscript, 'raw'> => {
  const bucket = getBucket();
  const outputKey = buildTranscriptOutputKey(callId);

  return {
    bucket,
    outputKey,
    transcriptFileUri: `s3://${bucket}/${outputKey}`,
  };
};

const isMissingS3ObjectError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'NoSuchKey' ||
    error.name === 'NotFound' ||
    error.message.includes('NoSuchKey') ||
    error.message.includes('Not Found') ||
    (error.name === 'AccessDenied' &&
      error.message.includes('s3:ListBucket')));

export const readCachedTranscriptForCall = async (
  callId: string,
): Promise<CachedTranscript | null> => {
  const location = getTranscriptOutputLocation(callId);

  let response;

  try {
    response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: location.bucket,
        Key: location.outputKey,
      }),
    );
  } catch (error) {
    if (isMissingS3ObjectError(error)) {
      return null;
    }

    throw error;
  }

  const parsed: unknown = JSON.parse(await streamToString(response.Body));

  if (!isDeepgramTranscriptResult(parsed)) {
    throw new Error('Cached transcript output had an unexpected shape');
  }

  return {
    ...location,
    raw: parsed,
  };
};

export const writeTranscriptForCall = async ({
  callId,
  raw,
}: {
  callId: string;
  raw: DeepgramTranscriptResult;
}): Promise<CachedTranscript> => {
  const location = getTranscriptOutputLocation(callId);

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: location.bucket,
      Key: location.outputKey,
      Body: Buffer.from(JSON.stringify(raw), 'utf-8'),
      ContentType: 'application/json',
    }),
  );

  return {
    ...location,
    raw,
  };
};

// Transcription is billed per request with no provider-side dedup, so
// overlapping polls (parallel workflow chains for the same call, or a batch
// sweep racing a live workflow) must not transcribe the same call twice. The
// claim is an S3 conditional put; release overwrites rather than deletes
// because the runtime IAM policy grants only Get/Put under these prefixes.
const TRANSCRIPTION_CLAIM_STALE_MS = 10 * 60 * 1000;

const buildTranscriptionClaimKey = (callId: string): string =>
  `${getOutputPrefix()}/${sanitizeKeyPart(
    callId,
  )}-${TRANSCRIPTION_PIPELINE_VERSION}.inflight.json`;

const isPreconditionFailedError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'PreconditionFailed' ||
    error.message.includes('PreconditionFailed') ||
    error.message.includes('412'));

export const claimTranscriptionForCall = async (
  callId: string,
): Promise<'claimed' | 'busy'> => {
  const bucket = getBucket();
  const claimKey = buildTranscriptionClaimKey(callId);
  const s3Client = getS3Client();
  const putClaim = (ifNoneMatch: boolean) =>
    s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: claimKey,
        Body: Buffer.from(
          JSON.stringify({ startedAt: new Date().toISOString() }),
          'utf-8',
        ),
        ContentType: 'application/json',
        ...(ifNoneMatch ? { IfNoneMatch: '*' } : {}),
      }),
    );

  try {
    await putClaim(true);

    return 'claimed';
  } catch (error) {
    if (!isPreconditionFailedError(error)) {
      throw error;
    }
  }

  let existingClaim: unknown = null;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: claimKey }),
    );

    existingClaim = JSON.parse(await streamToString(response.Body));
  } catch (error) {
    if (!isMissingS3ObjectError(error)) {
      throw error;
    }
  }

  if (isRecord(existingClaim) && existingClaim.releasedAt === undefined) {
    const startedAtMs = Date.parse(
      typeof existingClaim.startedAt === 'string'
        ? existingClaim.startedAt
        : '',
    );

    if (
      Number.isFinite(startedAtMs) &&
      Date.now() - startedAtMs < TRANSCRIPTION_CLAIM_STALE_MS
    ) {
      return 'busy';
    }
  }

  // Released, stale (crashed run), or unreadable — take the claim over.
  await putClaim(false);

  return 'claimed';
};

export const releaseTranscriptionClaimForCall = async (
  callId: string,
): Promise<void> => {
  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: buildTranscriptionClaimKey(callId),
        Body: Buffer.from(
          JSON.stringify({ releasedAt: new Date().toISOString() }),
          'utf-8',
        ),
        ContentType: 'application/json',
      }),
    );
  } catch (error) {
    // Best-effort: an unreleased claim expires after the stale window.
    console.warn(
      '[compliance-qa] Could not release transcription claim:',
      error instanceof Error ? error.message : String(error),
    );
  }
};
