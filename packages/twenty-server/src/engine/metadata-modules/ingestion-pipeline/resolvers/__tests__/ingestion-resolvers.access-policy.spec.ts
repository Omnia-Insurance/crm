import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RESOLVER_TYPE_METADATA } from '@nestjs/graphql/dist/graphql.constants.js';

import { isDefined } from 'twenty-shared/utils';

import { ACCESS_POLICY_GUARD_CONFIG_KEY } from 'src/engine/guards/constants/access-policy-guard-config-key.constant';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { type AccessPolicy } from 'src/engine/guards/types/access-policy.type';
import { INGESTION_LOG_READ_ACCESS_POLICY } from 'src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-log-read-access-policy.constant';
import { INGESTION_PIPELINE_READ_ACCESS_POLICY } from 'src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-read-access-policy.constant';
import { INGESTION_PIPELINE_WRITE_ACCESS_POLICY } from 'src/engine/metadata-modules/ingestion-pipeline/constants/ingestion-pipeline-write-access-policy.constant';
import { IngestionPipelineWebhookController } from 'src/engine/metadata-modules/ingestion-pipeline/controllers/ingestion-pipeline-webhook.controller';
import { IngestionFieldMappingResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-field-mapping.resolver';
import { IngestionLogResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-log.resolver';
import { IngestionPipelineResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-pipeline.resolver';

type ResolverClass =
  | typeof IngestionPipelineResolver
  | typeof IngestionFieldMappingResolver
  | typeof IngestionLogResolver;

const EXPECTED_ACCESS_POLICY_BY_OPERATION: [
  ResolverClass,
  string,
  AccessPolicy,
][] = [
  [
    IngestionPipelineResolver,
    'ingestionPipelines',
    INGESTION_PIPELINE_READ_ACCESS_POLICY,
  ],
  [
    IngestionPipelineResolver,
    'ingestionPipeline',
    INGESTION_PIPELINE_READ_ACCESS_POLICY,
  ],
  [
    IngestionPipelineResolver,
    'createIngestionPipeline',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [
    IngestionPipelineResolver,
    'updateIngestionPipeline',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [
    IngestionPipelineResolver,
    'deleteIngestionPipeline',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [
    IngestionPipelineResolver,
    'triggerIngestionPull',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [
    IngestionPipelineResolver,
    'testIngestionPipeline',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [
    IngestionFieldMappingResolver,
    'ingestionFieldMappings',
    INGESTION_PIPELINE_READ_ACCESS_POLICY,
  ],
  [
    IngestionFieldMappingResolver,
    'createIngestionFieldMapping',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [
    IngestionFieldMappingResolver,
    'createIngestionFieldMappings',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [
    IngestionFieldMappingResolver,
    'updateIngestionFieldMapping',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [
    IngestionFieldMappingResolver,
    'deleteIngestionFieldMapping',
    INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
  ],
  [IngestionLogResolver, 'ingestionLogs', INGESTION_LOG_READ_ACCESS_POLICY],
];

const getHandler = (
  endpointClass: { prototype: object },
  operationName: string,
): object | undefined =>
  Object.getOwnPropertyDescriptor(endpointClass.prototype, operationName)
    ?.value;

const getAccessPolicies = (handler: object): AccessPolicy[] =>
  ((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as object[])
    .map(
      (guard) =>
        Reflect.getMetadata(ACCESS_POLICY_GUARD_CONFIG_KEY, guard) as
          | AccessPolicy
          | undefined,
    )
    .filter(isDefined);

describe('ingestion pipeline endpoint guards', () => {
  it.each(EXPECTED_ACCESS_POLICY_BY_OPERATION)(
    '%p.%s requires the expected access policy',
    (resolverClass, operationName, expectedAccessPolicy) => {
      const handler = getHandler(resolverClass, operationName);

      expect(handler).toBeDefined();
      expect(getAccessPolicies(handler as object)).toEqual([
        expectedAccessPolicy,
      ]);
    },
  );

  it('requires API_KEYS_AND_WEBHOOKS on every operation', () => {
    for (const accessPolicy of [
      INGESTION_PIPELINE_READ_ACCESS_POLICY,
      INGESTION_PIPELINE_WRITE_ACCESS_POLICY,
      INGESTION_LOG_READ_ACCESS_POLICY,
    ]) {
      expect(accessPolicy.requiredPermissionFlags).toEqual([
        'API_KEYS_AND_WEBHOOKS',
      ]);
    }
  });

  it.each([
    IngestionPipelineResolver,
    IngestionFieldMappingResolver,
    IngestionLogResolver,
  ])('leaves no %p operation outside the list above', (resolverClass) => {
    const operationNames = Object.getOwnPropertyNames(
      resolverClass.prototype,
    ).filter((propertyName) => {
      const handler = getHandler(resolverClass, propertyName);

      return (
        isDefined(handler) &&
        ['Query', 'Mutation'].includes(
          Reflect.getMetadata(RESOLVER_TYPE_METADATA, handler),
        )
      );
    });

    expect(operationNames.sort()).toEqual(
      EXPECTED_ACCESS_POLICY_BY_OPERATION.filter(
        ([expectedResolverClass]) => expectedResolverClass === resolverClass,
      )
        .map(([, operationName]) => operationName)
        .sort(),
    );
  });

  it('lets only user sessions read the logs, which hold the pushed records', () => {
    expect(INGESTION_LOG_READ_ACCESS_POLICY.authPrincipals).toEqual(
      expect.objectContaining({
        apiKey: false,
        oauthClient: false,
        application: false,
      }),
    );
    expect(INGESTION_LOG_READ_ACCESS_POLICY.authPrincipals.userSession).toEqual(
      INGESTION_PIPELINE_READ_ACCESS_POLICY.authPrincipals.userSession,
    );
  });

  it('keeps the push webhook public, authenticated by its secret', () => {
    const handler = getHandler(
      IngestionPipelineWebhookController,
      'handlePush',
    );

    expect(Reflect.getMetadata(GUARDS_METADATA, handler as object)).toEqual([
      PublicEndpointGuard,
      NoPermissionGuard,
    ]);
  });
});
