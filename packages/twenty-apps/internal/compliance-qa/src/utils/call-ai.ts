// Calls Twenty's built-in AI text generation endpoint.
// Requires an AI provider key (e.g. ANTHROPIC_API_KEY) configured on the server.

type AiResponse = {
  text?: string;
  usage?: { inputTokens: number; outputTokens: number };
};

export const callAi = async (
  systemPrompt: string,
  userPrompt: string,
): Promise<string> => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token =
    process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;

  if (!apiBaseUrl || !token) {
    throw new Error(
      'Missing TWENTY_API_URL or TWENTY_APP_ACCESS_TOKEN/TWENTY_API_KEY',
    );
  }

  const url = `${apiBaseUrl}/rest/ai/generate-text`;

  console.log('[callAi] Calling', url, 'prompt length:', userPrompt.length);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(`AI request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as AiResponse;

  console.log(
    '[callAi] Response:',
    JSON.stringify({
      textLength: data.text?.length ?? 0,
      inputTokens: data.usage?.inputTokens,
      outputTokens: data.usage?.outputTokens,
    }),
  );

  if (!data.text) {
    throw new Error('AI returned empty response');
  }

  return data.text;
};

// Extract JSON from AI response that may contain markdown code fences or trailing text
export const parseAiJson = <T>(text: string): T => {
  let cleaned = text.trim();

  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, '');
    cleaned = cleaned.replace(/\n?```\s*$/, '');
  }

  // Try parsing as-is first
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Find the outermost JSON object or array
    const startIdx = cleaned.search(/[{[]/);

    if (startIdx === -1) {
      throw new Error('No JSON found in AI response');
    }

    const opener = cleaned[startIdx];
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIdx; i < cleaned.length; i++) {
      const ch = cleaned[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === opener) depth++;
      if (ch === closer) depth--;

      if (depth === 0) {
        return JSON.parse(cleaned.slice(startIdx, i + 1)) as T;
      }
    }

    throw new Error('Malformed JSON in AI response');
  }
};
