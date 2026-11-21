import { Logger } from '@nestjs/common';

import * as Sentry from '@sentry/node';
import { type Request } from 'express';

import { METADATA_GRAPHQL_OPERATIONS_TO_CACHE } from 'src/engine/api/graphql/graphql-config/constants/metadata-graphql-operations-to-cache.constant';
import { useCachedMetadata } from 'src/engine/api/graphql/graphql-config/hooks/use-cached-metadata';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  getCurrentScope: jest.fn(),
  setTags: jest.fn(),
  startSpan: jest.fn(),
}));

const FIND_FIELDS_WIDGET_VIEWS_QUERY =
  'query FindFieldsWidgetViews($viewTypes: [ViewType!]) { getViews(viewTypes: $viewTypes) { id name } }';

const RESPONSE_BODY = {
  data: { getViews: [{ id: 'view-id', name: 'Agent pipeline' }] },
};

const NON_USER_PRINCIPALS: [string, Partial<Request>][] = [
  ['an API key', { apiKey: { id: 'api-key-id' } as Request['apiKey'] }],
  [
    'an application',
    { application: { id: 'application-id' } as Request['application'] },
  ],
];

describe('useCachedMetadata (Omnia)', () => {
  const createRequest = (overrides: Partial<Request> = {}): Request =>
    ({
      body: {
        operationName: 'FindFieldsWidgetViews',
        query: FIND_FIELDS_WIDGET_VIEWS_QUERY,
        variables: { viewTypes: ['FIELDS_WIDGET'] },
      },
      locale: 'en',
      userWorkspaceId: 'user-workspace-id',
      workspace: { id: 'workspace-id' },
      ...overrides,
    }) as Request;

  const createPlugin = ({
    cacheGetter = jest.fn().mockResolvedValue(undefined),
    cacheSetter = jest.fn(),
    dependencyHashGetter = jest.fn().mockResolvedValue('dependency-hash'),
  } = {}) =>
    useCachedMetadata({
      cacheGetter,
      cacheSetter,
      operationsToCache: METADATA_GRAPHQL_OPERATIONS_TO_CACHE,
      dependencyHashGetter,
    });

  const runRequest = async ({
    plugin,
    request,
  }: {
    plugin: ReturnType<typeof useCachedMetadata>;
    request: Request;
  }) => {
    const serverContext = { req: request };
    const endResponse = jest.fn();

    await plugin.onRequest?.({ endResponse, serverContext } as never);
    await plugin.onResponse?.({
      response: Response.json(RESPONSE_BODY),
      serverContext,
    } as never);

    return { endResponse };
  };

  beforeEach(() => {
    jest.mocked(Sentry.getCurrentScope).mockReturnValue({
      setTransactionName: jest.fn(),
    } as never);
    jest
      .mocked(Sentry.startSpan)
      .mockImplementation((_options, callback) =>
        callback({ setAttribute: jest.fn() } as never),
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe.each(NON_USER_PRINCIPALS)(
    'for %s',
    (_principal, principalOverrides) => {
      it.each(Object.keys(METADATA_GRAPHQL_OPERATIONS_TO_CACHE))(
        'never reads or writes the %s cache entry',
        async (operationName) => {
          const cacheGetter = jest.fn().mockResolvedValue(RESPONSE_BODY);
          const cacheSetter = jest.fn();
          const dependencyHashGetter = jest
            .fn()
            .mockResolvedValue('dependency-hash');
          const plugin = createPlugin({
            cacheGetter,
            cacheSetter,
            dependencyHashGetter,
          });
          const request = createRequest({
            ...principalOverrides,
            body: { operationName, query: `query ${operationName} { id }` },
          });

          const { endResponse } = await runRequest({ plugin, request });

          expect(dependencyHashGetter).not.toHaveBeenCalled();
          expect(cacheGetter).not.toHaveBeenCalled();
          expect(cacheSetter).not.toHaveBeenCalled();
          expect(endResponse).not.toHaveBeenCalled();
        },
      );
    },
  );

  it('logs one slow cache miss with ids and flags only', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1_500);

    const cacheSetter = jest.fn();

    await runRequest({
      plugin: createPlugin({ cacheSetter }),
      request: createRequest(),
    });

    expect(warn).toHaveBeenCalledTimes(1);

    const [message] = warn.mock.calls[0];

    expect(message).toContain('Slow metadata cache miss');
    expect(message).toContain('operation=FindFieldsWidgetViews');
    expect(message).toContain('workspaceId=workspace-id');
    expect(message).toContain('scope=userWorkspace');
    expect(message).toContain('hadErrors=false');
    expect(message).not.toContain('$viewTypes');
    expect(message).not.toContain('FIELDS_WIDGET');
    expect(message).not.toContain('Agent pipeline');
    expect(cacheSetter).toHaveBeenCalledTimes(1);
  });

  it('does not log a fast cache miss', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10);

    await runRequest({ plugin: createPlugin(), request: createRequest() });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('METADATA_GRAPHQL_OPERATIONS_TO_CACHE (Omnia)', () => {
  const { FindAllViews, FindFieldsWidgetViews, FindAllRecordPageLayouts } =
    METADATA_GRAPHQL_OPERATIONS_TO_CACHE;

  it('caches fields-widget views per user with the FindAllViews dependencies', () => {
    expect(FindFieldsWidgetViews.scope).toBe('userWorkspace');
    expect(FindFieldsWidgetViews.dependencies).toEqual(
      FindAllViews.dependencies,
    );
  });

  it('caches record page layouts per workspace', () => {
    expect(FindAllRecordPageLayouts).toEqual({
      scope: 'workspace',
      dependencies: [
        'flatObjectMetadataMaps',
        'flatPageLayoutMaps',
        'flatPageLayoutTabMaps',
        'flatPageLayoutWidgetMaps',
        'flatApplicationMaps',
      ],
    });
  });

  it('never caches logic functions, which are filtered per calling application', () => {
    expect(METADATA_GRAPHQL_OPERATIONS_TO_CACHE).not.toHaveProperty(
      'FindManyLogicFunctions',
    );
  });
});
