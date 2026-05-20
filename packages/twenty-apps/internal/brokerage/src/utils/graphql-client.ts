export type GraphqlResponse<TData> = {
  data?: TData;
  errors?: { message: string }[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isGraphqlError = (value: unknown): value is { message: string } =>
  isRecord(value) && typeof value.message === 'string';

const isGraphqlResponse = <TData>(
  value: unknown,
): value is GraphqlResponse<TData> =>
  isRecord(value) &&
  (value.errors === undefined ||
    (Array.isArray(value.errors) && value.errors.every(isGraphqlError)));

const getApiConfig = () => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const appToken = process.env.TWENTY_APP_ACCESS_TOKEN;
  const workspaceToken = process.env.TWENTY_API_KEY;

  if (apiBaseUrl === undefined || apiBaseUrl.length === 0) {
    throw new Error('TWENTY_API_URL is required');
  }

  const hasAppToken = appToken !== undefined && appToken.length > 0;
  const hasWorkspaceToken =
    workspaceToken !== undefined && workspaceToken.length > 0;

  if (!hasAppToken && !hasWorkspaceToken) {
    throw new Error('TWENTY_APP_ACCESS_TOKEN or TWENTY_API_KEY is required');
  }

  return {
    apiBaseUrl,
    token: hasAppToken ? appToken : workspaceToken,
  };
};

export const graphqlRequest = async <TData>({
  query,
  variables,
}: {
  query: string;
  variables?: Record<string, unknown>;
}): Promise<TData> => {
  const { apiBaseUrl, token } = getApiConfig();

  if (token === undefined || token.length === 0) {
    throw new Error('Missing GraphQL token');
  }

  const response = await fetch(`${apiBaseUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(
      `GraphQL request failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload: unknown = await response.json();

  if (!isGraphqlResponse<TData>(payload)) {
    throw new Error('GraphQL response had an unexpected shape');
  }

  if (payload.errors?.length) {
    throw new Error(
      `GraphQL errors: ${payload.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }

  if (payload.data === undefined) {
    throw new Error('GraphQL response did not include data');
  }

  return payload.data;
};
