import { isNonEmptyString } from '@sniptt/guards';
import { getUrlSafely, isDefined } from 'twenty-shared/utils';

import { INGESTION_PIPELINE_AUTH_ENV_VARS } from 'src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-auth-env-vars.constant';

export const isAllowedIngestionPipelineAuthEnvVar = ({
  envVarName,
  sourceUrl,
}: {
  envVarName: string;
  sourceUrl: string | null;
}): boolean => {
  const authEnvVar = INGESTION_PIPELINE_AUTH_ENV_VARS.find(
    (allowedAuthEnvVar) => allowedAuthEnvVar.envVarName === envVarName,
  );

  if (!isDefined(authEnvVar) || !isNonEmptyString(sourceUrl)) {
    return false;
  }

  const url = getUrlSafely(sourceUrl);

  return (
    isDefined(url) &&
    url.protocol === 'https:' &&
    authEnvVar.hostnames.includes(url.hostname)
  );
};
