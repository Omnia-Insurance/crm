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

export const graphqlQuery = async <T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  const { apiBaseUrl, workspaceToken } = getApiConfig();

  const response = await fetch(`${apiBaseUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${workspaceToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
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
};
