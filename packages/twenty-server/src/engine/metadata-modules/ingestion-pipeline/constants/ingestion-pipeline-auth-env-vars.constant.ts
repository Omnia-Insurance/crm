// The server env vars a pull pipeline may send as query_param auth, and the only hosts each may
// reach: envVar and sourceUrl come from API input, so any other pair would leak a server secret
export const INGESTION_PIPELINE_AUTH_ENV_VARS: {
  envVarName: string;
  hostnames: string[];
}[] = [{ envVarName: 'CONVOSO_API_TOKEN', hostnames: ['api.convoso.com'] }];
