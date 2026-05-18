export type AwsClientConfig = {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

const getNonEmptyEnvValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();

  return value !== undefined && value.length > 0 ? value : undefined;
};

export const getAwsClientConfig = ({
  serviceName,
}: {
  serviceName: string;
}): AwsClientConfig => {
  const region = getNonEmptyEnvValue('AWS_REGION');

  if (region === undefined) {
    throw new Error(`AWS_REGION is required for ${serviceName}`);
  }

  const accessKeyId = getNonEmptyEnvValue('AWS_ACCESS_KEY_ID');
  const secretAccessKey = getNonEmptyEnvValue('AWS_SECRET_ACCESS_KEY');
  const sessionToken = getNonEmptyEnvValue('AWS_SESSION_TOKEN');

  if (accessKeyId !== undefined && secretAccessKey !== undefined) {
    return {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken !== undefined ? { sessionToken } : {}),
      },
    };
  }

  return { region };
};
