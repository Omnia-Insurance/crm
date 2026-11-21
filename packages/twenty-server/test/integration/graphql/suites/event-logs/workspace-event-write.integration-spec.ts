import process from 'process';

import {
  type ClickHouseClient,
  ClickHouseLogLevel,
  createClient,
} from '@clickhouse/client';
import request from 'supertest';

import { CUSTOM_DOMAIN_ACTIVATED_EVENT } from 'src/engine/core-modules/event-logs/emit/events/workspace-event/custom-domain/custom-domain-activated';
import { type GenericTrackEvent } from 'src/engine/core-modules/event-logs/emit/events/workspace-event/track';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

describe('ClickHouse Event Registration (integration)', () => {
  let clickHouseClient: ClickHouseClient;

  beforeAll(async () => {
    jest.useRealTimers();

    clickHouseClient = createClient({
      url: process.env.CLICKHOUSE_URL,
      log: { level: ClickHouseLogLevel.OFF },
    });

    await clickHouseClient.query({
      query: 'TRUNCATE TABLE workspaceEvent',
      format: 'JSONEachRow',
    });
  });

  afterAll(async () => {
    if (clickHouseClient) {
      await clickHouseClient.close();
    }
  });

  it('should register events in ClickHouse when sending an event', async () => {
    const mutation = `
      mutation TrackAnalytics($type: AnalyticsType!, $event: String, $name: String, $properties: JSON) {
        trackAnalytics(type: $type, event: $event, name: $name, properties: $properties) {
          success
        }
      }
    `;

    const variables = {
      type: 'TRACK',
      event: CUSTOM_DOMAIN_ACTIVATED_EVENT,
      properties: {},
    };

    const response = await request(`http://localhost:${APP_PORT}`)
      .post('/metadata')
      .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
      .send({
        query: mutation,
        variables,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.trackAnalytics.success).toBe(true);

    const queryResult = await clickHouseClient.query({
      query: `
        SELECT *
        FROM workspaceEvent
        WHERE event = '${CUSTOM_DOMAIN_ACTIVATED_EVENT}' AND timestamp >= now() - INTERVAL 1 SECOND

      `,
      format: 'JSONEachRow',
    });

    const rows = await queryResult.json<GenericTrackEvent>();

    expect(rows.length).toEqual(1);
    expect(rows[0].properties).toEqual(variables.properties);
    expect(rows[0].event).toEqual(variables.event);
    expect(rows[0].workspaceId).toEqual(SEED_APPLE_WORKSPACE_ID);
    expect(rows[0].timestamp).toHaveLength(23);
  });

  // OMNIA-CUSTOM: anonymous calls are dropped so nobody can flood the event-log store
  it('should not register events from unauthenticated requests', async () => {
    const response = await request(`http://localhost:${APP_PORT}`)
      .post('/metadata')
      .send({
        query: `
          mutation TrackAnalytics($type: AnalyticsType!, $event: String, $properties: JSON) {
            trackAnalytics(type: $type, event: $event, properties: $properties) {
              success
            }
          }
        `,
        variables: {
          type: 'TRACK',
          event: CUSTOM_DOMAIN_ACTIVATED_EVENT,
          properties: {},
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.trackAnalytics.success).toBe(false);

    const queryResult = await clickHouseClient.query({
      query: `
        SELECT count() AS count
        FROM workspaceEvent
        WHERE event = '${CUSTOM_DOMAIN_ACTIVATED_EVENT}' AND workspaceId = ''
      `,
      format: 'JSONEachRow',
    });

    const [{ count }] = await queryResult.json<{ count: string }>();

    expect(Number(count)).toEqual(0);
  });
});
