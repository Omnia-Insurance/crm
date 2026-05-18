export type GraphqlTokenType = 'app' | 'workspace';

export type GraphqlResponse<TData> = {
  data?: TData;
  errors?: { message: string }[];
};

type GraphqlFileUpload = {
  variablePath: string;
  filename: string;
  content: Uint8Array;
  contentType: string;
};

type GraphqlApiPath = '/graphql' | '/metadata';

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

export const getApiConfig = () => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const appToken = process.env.TWENTY_APP_ACCESS_TOKEN;
  const workspaceToken = process.env.TWENTY_API_KEY ?? appToken;

  if (apiBaseUrl === undefined || apiBaseUrl.length === 0) {
    throw new Error('TWENTY_API_URL is required');
  }

  if (
    (appToken === undefined || appToken.length === 0) &&
    (workspaceToken === undefined || workspaceToken.length === 0)
  ) {
    throw new Error('TWENTY_APP_ACCESS_TOKEN or TWENTY_API_KEY is required');
  }

  return {
    apiBaseUrl,
    appToken: appToken ?? workspaceToken,
    workspaceToken: workspaceToken ?? appToken,
  };
};

export const graphqlRequest = async <TData>({
  query,
  variables,
  tokenType,
  apiPath = '/graphql',
}: {
  query: string;
  variables?: Record<string, unknown>;
  tokenType: GraphqlTokenType;
  apiPath?: GraphqlApiPath;
}): Promise<TData> => {
  const { apiBaseUrl, appToken, workspaceToken } = getApiConfig();
  const token = tokenType === 'app' ? appToken : workspaceToken;

  if (token === undefined || token.length === 0) {
    throw new Error(`Missing ${tokenType} token`);
  }

  const response = await fetch(`${apiBaseUrl}${apiPath}`, {
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

export const graphqlMultipartRequest = async <TData>({
  query,
  variables,
  tokenType,
  file,
  apiPath,
}: {
  query: string;
  variables: Record<string, unknown>;
  tokenType: GraphqlTokenType;
  file: GraphqlFileUpload;
  apiPath: GraphqlApiPath;
}): Promise<TData> => {
  const { apiBaseUrl, appToken, workspaceToken } = getApiConfig();
  const token = tokenType === 'app' ? appToken : workspaceToken;

  if (token === undefined || token.length === 0) {
    throw new Error(`Missing ${tokenType} token`);
  }

  const body = new FormData();
  const fileContent = new ArrayBuffer(file.content.byteLength);
  const fileContentView = new Uint8Array(fileContent);

  fileContentView.set(file.content);

  body.append('operations', JSON.stringify({ query, variables }));
  body.append('map', JSON.stringify({ '0': [file.variablePath] }));
  body.append(
    '0',
    new Blob([fileContent], { type: file.contentType }),
    file.filename,
  );

  const response = await fetch(`${apiBaseUrl}${apiPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
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
