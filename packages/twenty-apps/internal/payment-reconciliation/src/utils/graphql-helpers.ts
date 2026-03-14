const getApiConfig = () => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const appToken = process.env.TWENTY_APP_ACCESS_TOKEN;
  const workspaceToken = process.env.TWENTY_API_KEY;

  if (!apiBaseUrl || (!appToken && !workspaceToken)) {
    throw new Error('Missing TWENTY_API_URL or token');
  }

  return {
    apiBaseUrl,
    appToken: appToken ?? workspaceToken!,
    workspaceToken: workspaceToken ?? appToken!,
  };
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30000;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503]);

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getRetryDelay = (attempt: number): number => {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;

  return exponentialDelay + jitter;
};

export const graphqlQuery = async <T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  const { apiBaseUrl, workspaceToken } = getApiConfig();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`${apiBaseUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workspaceToken}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (
          RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt < MAX_RETRIES
        ) {
          const delay = getRetryDelay(attempt);

          console.warn(
            `[graphql-helpers] Request failed with ${response.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );

          await sleep(delay);
          continue;
        }

        const errorBody = await response.text();

        throw new Error(
          `GraphQL request failed (${response.status}): ${errorBody}`,
        );
      }

      const json = await response.json();
      const gqlResponse = json as { errors?: { message: string }[] };

      if (gqlResponse.errors?.length) {
        throw new Error(
          `GraphQL errors: ${gqlResponse.errors.map((e) => e.message).join('; ')}`,
        );
      }

      return json as T;
    } catch (error) {
      clearTimeout(timeout);

      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === 'AbortError');

      if (isNetworkError && attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt);
        const msg =
          error instanceof Error ? error.message : String(error);

        console.warn(
          `[graphql-helpers] Network error: ${msg}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );

        lastError = error instanceof Error ? error : new Error(String(error));
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error('GraphQL request failed after retries');
};
