// Wrapper for Twenty's AI text generation endpoint.

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

// Extract JSON from AI response that may contain markdown code fences
export const parseAiJson = <T>(text: string): T => {
  // Strip markdown code fences if present
  let cleaned = text.trim();

  if (cleaned.startsWith('```')) {
    // Remove opening fence (with optional language tag)
    cleaned = cleaned.replace(/^```[a-z]*\n?/, '');
    // Remove closing fence
    cleaned = cleaned.replace(/\n?```\s*$/, '');
  }

  return JSON.parse(cleaned) as T;
};
