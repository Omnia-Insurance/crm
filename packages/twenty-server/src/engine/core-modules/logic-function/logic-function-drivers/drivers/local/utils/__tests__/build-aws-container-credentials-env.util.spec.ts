import { buildAwsContainerCredentialsEnv } from 'src/engine/core-modules/logic-function/logic-function-drivers/drivers/local/utils/build-aws-container-credentials-env.util';

const ALLOWED_REGISTRATION_ID = '3f1c2b7e-8a4d-4c6e-9b1f-2d7a5e8c0b13';
const TOKEN_FILE_PATH =
  '/var/run/secrets/pods.eks.amazonaws.com/serviceaccount/eks-pod-identity-token';

const POD_IDENTITY_HOST_ENV = {
  AWS_CONTAINER_CREDENTIALS_FULL_URI: 'http://169.254.170.23/v1/credentials',
  AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: TOKEN_FILE_PATH,
  AWS_REGION: 'us-east-1',
  AWS_DEFAULT_REGION: 'us-east-1',
  PG_DATABASE_URL: 'postgres://user:password@db:5432/default',
  APP_SECRET: 'app-secret',
  CONVOSO_API_TOKEN: 'convoso-token',
};

const IMDS_DISABLED_ENV = { AWS_EC2_METADATA_DISABLED: 'true' };

const readPodIdentityToken = jest.fn<Promise<string>, [string]>(
  async () => 'pod-identity-token\n',
);

const build = (
  overrides: Partial<Parameters<typeof buildAwsContainerCredentialsEnv>[0]>,
) =>
  buildAwsContainerCredentialsEnv({
    hostEnv: POD_IDENTITY_HOST_ENV,
    functionEnv: {},
    applicationRegistrationId: ALLOWED_REGISTRATION_ID,
    allowedApplicationRegistrationIds: [ALLOWED_REGISTRATION_ID],
    readTokenFile: readPodIdentityToken,
    ...overrides,
  });

describe('buildAwsContainerCredentialsEnv', () => {
  beforeEach(() => {
    readPodIdentityToken.mockClear();
  });

  it('passes the container credentials and region to an allowlisted registration', async () => {
    expect(await build({})).toEqual({
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_CONTAINER_CREDENTIALS_FULL_URI:
        'http://169.254.170.23/v1/credentials',
      AWS_CONTAINER_AUTHORIZATION_TOKEN: 'pod-identity-token',
      AWS_REGION: 'us-east-1',
      AWS_DEFAULT_REGION: 'us-east-1',
    });
    expect(readPodIdentityToken).toHaveBeenCalledWith(TOKEN_FILE_PATH);
  });

  it('reads the token again on every run because the projected file rotates', async () => {
    readPodIdentityToken
      .mockResolvedValueOnce('first-token')
      .mockResolvedValueOnce('rotated-token');

    expect((await build({})).AWS_CONTAINER_AUTHORIZATION_TOKEN).toBe(
      'first-token',
    );
    expect((await build({})).AWS_CONTAINER_AUTHORIZATION_TOKEN).toBe(
      'rotated-token',
    );
  });

  it('only disables IMDS for a registration outside the allowlist', async () => {
    expect(
      await build({
        applicationRegistrationId: '9d2e4f6a-1b3c-4d5e-8f7a-6b5c4d3e2f10',
      }),
    ).toEqual(IMDS_DISABLED_ENV);
    expect(readPodIdentityToken).not.toHaveBeenCalled();
  });

  it('only disables IMDS for an application without a registration', async () => {
    expect(await build({ applicationRegistrationId: null })).toEqual(
      IMDS_DISABLED_ENV,
    );
    expect(readPodIdentityToken).not.toHaveBeenCalled();
  });

  it('grants nothing while the allowlist is empty', async () => {
    expect(await build({ allowedApplicationRegistrationIds: [] })).toEqual(
      IMDS_DISABLED_ENV,
    );
  });

  it('keeps the region the function sets', async () => {
    const awsEnv = await build({
      functionEnv: { AWS_REGION: 'us-west-2' },
    });

    expect(awsEnv).not.toHaveProperty('AWS_REGION');
    expect(awsEnv).not.toHaveProperty('AWS_DEFAULT_REGION');
  });

  it('fills the region when the function variable is declared but empty', async () => {
    expect(
      await build({ functionEnv: { AWS_REGION: '', AWS_DEFAULT_REGION: '' } }),
    ).toMatchObject({
      AWS_REGION: 'us-east-1',
      AWS_DEFAULT_REGION: 'us-east-1',
    });
  });

  it.each([
    'AWS_CONTAINER_CREDENTIALS_FULL_URI',
    'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  ] as const)(
    'only disables IMDS when the pod has no %s',
    async (missingVariableName) => {
      const { [missingVariableName]: _missing, ...hostEnv } =
        POD_IDENTITY_HOST_ENV;

      expect(await build({ hostEnv })).toEqual(IMDS_DISABLED_ENV);
      expect(readPodIdentityToken).not.toHaveBeenCalled();
    },
  );

  it('only disables IMDS when the token file cannot be read', async () => {
    readPodIdentityToken.mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES',
      }),
    );

    expect(await build({})).toEqual(IMDS_DISABLED_ENV);
  });

  it('only disables IMDS when the token reader throws synchronously', async () => {
    expect(
      await build({
        readTokenFile: () => {
          throw new Error('reader failed');
        },
      }),
    ).toEqual(IMDS_DISABLED_ENV);
  });

  it('only disables IMDS when the token file is empty', async () => {
    readPodIdentityToken.mockResolvedValueOnce(' \n');

    expect(await build({})).toEqual(IMDS_DISABLED_ENV);
  });

  it('never re-enables IMDS from a function variable', async () => {
    expect(
      await build({
        applicationRegistrationId: null,
        functionEnv: { AWS_EC2_METADATA_DISABLED: 'false' },
      }),
    ).toEqual(IMDS_DISABLED_ENV);
  });

  it('never copies other host variables or the token file path', async () => {
    const awsEnv = await build({});

    for (const name of [
      'PG_DATABASE_URL',
      'APP_SECRET',
      'CONVOSO_API_TOKEN',
      'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
    ]) {
      expect(awsEnv).not.toHaveProperty(name);
    }
    expect(Object.values(awsEnv)).not.toContain(TOKEN_FILE_PATH);
  });
});
