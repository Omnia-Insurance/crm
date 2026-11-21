import { isAllowedIngestionPipelineAuthEnvVar } from 'src/engine/metadata-modules/ingestion-pipeline/utils/is-allowed-ingestion-pipeline-auth-env-var.util';

describe('isAllowedIngestionPipelineAuthEnvVar', () => {
  it('should allow the Convoso token for the Convoso API', () => {
    expect(
      isAllowedIngestionPipelineAuthEnvVar({
        envVarName: 'CONVOSO_API_TOKEN',
        sourceUrl: 'https://api.convoso.com/v1/log/retrieve',
      }),
    ).toBe(true);
  });

  it.each([
    ['APP_SECRET', 'https://api.convoso.com/v1/log/retrieve'],
    ['PG_DATABASE_URL', 'https://api.convoso.com/v1/log/retrieve'],
    ['constructor', 'https://api.convoso.com/v1/log/retrieve'],
    ['__proto__', 'https://api.convoso.com/v1/log/retrieve'],
  ])('should reject the server env var %s', (envVarName, sourceUrl) => {
    expect(
      isAllowedIngestionPipelineAuthEnvVar({ envVarName, sourceUrl }),
    ).toBe(false);
  });

  it.each([
    ['another host', 'https://collector.example.com/v1/log/retrieve'],
    ['a look-alike subdomain', 'https://api.convoso.com.example.com/v1'],
    [
      'credentials in front of another host',
      'https://api.convoso.com@example.com/v1',
    ],
    ['plain http', 'http://api.convoso.com/v1/log/retrieve'],
    ['an unparseable URL', 'not a url'],
    ['an empty URL', ''],
    ['no URL', null],
  ])('should reject the Convoso token for %s', (_description, sourceUrl) => {
    expect(
      isAllowedIngestionPipelineAuthEnvVar({
        envVarName: 'CONVOSO_API_TOKEN',
        sourceUrl,
      }),
    ).toBe(false);
  });
});
