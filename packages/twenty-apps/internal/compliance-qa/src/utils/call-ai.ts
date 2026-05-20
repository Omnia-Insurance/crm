import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

import { getAwsClientConfig } from 'src/utils/aws-config';

const DEFAULT_BEDROCK_MODEL_ID =
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getBedrockModelId = (): string => {
  const modelId = process.env.COMPLIANCE_QA_BEDROCK_MODEL_ID?.trim();

  return modelId !== undefined && modelId.length > 0
    ? modelId
    : DEFAULT_BEDROCK_MODEL_ID;
};

const extractTextContent = (content: ContentBlock[] | undefined): string =>
  content
    ?.map((contentBlock) => contentBlock.text)
    .filter((text): text is string => text !== undefined)
    .join('\n')
    .trim() ?? '';

export const callAi = async (
  systemPrompt: string,
  userPrompt: string,
): Promise<string> => {
  const modelId = getBedrockModelId();
  const bedrockClient = new BedrockRuntimeClient(
    getAwsClientConfig({ serviceName: 'Compliance QA scoring' }),
  );

  console.log(
    '[callAi] Calling Bedrock model',
    modelId,
    'prompt length:',
    userPrompt.length,
  );

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId,
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: 'user',
          content: [{ text: userPrompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: 8192,
        temperature: 0,
      },
    }),
  );

  const text = extractTextContent(response.output?.message?.content);

  console.log(
    '[callAi] Bedrock response:',
    JSON.stringify({
      textLength: text.length,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
      stopReason: response.stopReason,
    }),
  );

  if (text.length === 0) {
    throw new Error('AI returned empty response');
  }

  return text;
};

const stripCodeFence = (text: string): string => {
  if (!text.startsWith('```')) {
    return text;
  }

  return text.replace(/^```[a-z]*\n?/, '').replace(/\n?```\s*$/, '');
};

const findJsonEndIndex = ({
  text,
  startIndex,
  opener,
}: {
  text: string;
  startIndex: number;
  opener: '{' | '[';
}): number | null => {
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index++) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (character === opener) depth++;
    if (character === closer) depth--;

    if (depth === 0) {
      return index + 1;
    }
  }

  return null;
};

const parseJson = (text: string): unknown => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const escapedJson = escapeControlCharactersInJsonStrings(text);

    if (escapedJson === text) {
      throw error;
    }

    parsed = JSON.parse(escapedJson);
  }

  if (!isRecord(parsed) && !Array.isArray(parsed)) {
    throw new Error('AI JSON response must be an object or array');
  }

  return parsed;
};

const escapeJsonControlCharacter = (character: string): string => {
  switch (character) {
    case '\b':
      return '\\b';
    case '\f':
      return '\\f';
    case '\n':
      return '\\n';
    case '\r':
      return '\\r';
    case '\t':
      return '\\t';
    default:
      return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  }
};

const escapeControlCharactersInJsonStrings = (text: string): string => {
  let result = '';
  let inString = false;
  let escaped = false;

  for (const character of text) {
    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }

    if (inString && character === '\\') {
      result += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      result += character;
      inString = !inString;
      continue;
    }

    if (inString && character.charCodeAt(0) < 0x20) {
      result += escapeJsonControlCharacter(character);
      continue;
    }

    result += character;
  }

  return result;
};

// Extract JSON from AI response that may contain markdown code fences or trailing text.
export const parseAiJson = (text: string): unknown => {
  const cleaned = stripCodeFence(text.trim());

  try {
    return parseJson(cleaned);
  } catch {
    const startIndex = cleaned.search(/[{[]/);

    if (startIndex === -1) {
      throw new Error('No JSON found in AI response');
    }

    const opener = cleaned[startIndex];

    if (opener !== '{' && opener !== '[') {
      throw new Error('No JSON found in AI response');
    }

    const endIndex = findJsonEndIndex({
      text: cleaned,
      startIndex,
      opener,
    });

    if (endIndex === null) {
      throw new Error('Malformed JSON in AI response');
    }

    return parseJson(cleaned.slice(startIndex, endIndex));
  }
};
