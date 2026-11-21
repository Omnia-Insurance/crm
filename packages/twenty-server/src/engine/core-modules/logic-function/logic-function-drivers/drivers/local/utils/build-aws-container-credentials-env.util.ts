import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

// Keyed by registration id: only the registration owner can ship code under it,
// while a universalIdentifier is author-chosen. The --permission sandbox cannot
// read the projected token file, so its value is read per run (kubelet rotates it).
export const buildAwsContainerCredentialsEnv = async ({
  hostEnv,
  functionEnv,
  applicationRegistrationId,
  allowedApplicationRegistrationIds,
  readTokenFile,
}: {
  hostEnv: NodeJS.ProcessEnv;
  functionEnv: Record<string, string>;
  applicationRegistrationId: string | null;
  allowedApplicationRegistrationIds: string[];
  readTokenFile: (path: string) => Promise<string>;
}): Promise<Record<string, string>> => {
  // Without it the AWS SDK credential chain falls back to the node role through IMDS.
  const imdsDisabledEnv = { AWS_EC2_METADATA_DISABLED: 'true' };

  const credentialsFullUri = hostEnv.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  const authorizationTokenFile = hostEnv.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE;

  if (
    !isDefined(applicationRegistrationId) ||
    !allowedApplicationRegistrationIds.includes(applicationRegistrationId) ||
    !isNonEmptyString(credentialsFullUri) ||
    !isNonEmptyString(authorizationTokenFile)
  ) {
    return imdsDisabledEnv;
  }

  let authorizationToken: string;

  try {
    authorizationToken = (await readTokenFile(authorizationTokenFile)).trim();
  } catch {
    return imdsDisabledEnv;
  }

  if (!isNonEmptyString(authorizationToken)) {
    return imdsDisabledEnv;
  }

  const hostRegion = [hostEnv.AWS_REGION, hostEnv.AWS_DEFAULT_REGION].find(
    isNonEmptyString,
  );
  const isRegionSetByFunction = [
    functionEnv.AWS_REGION,
    functionEnv.AWS_DEFAULT_REGION,
  ].some(isNonEmptyString);

  return {
    ...imdsDisabledEnv,
    AWS_CONTAINER_CREDENTIALS_FULL_URI: credentialsFullUri,
    AWS_CONTAINER_AUTHORIZATION_TOKEN: authorizationToken,
    ...(isDefined(hostRegion) && !isRegionSetByFunction
      ? { AWS_REGION: hostRegion, AWS_DEFAULT_REGION: hostRegion }
      : {}),
  };
};
