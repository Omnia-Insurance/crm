import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { TimeCardPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/time-card.preprocessor';

describe('TimeCardPreprocessor', () => {
  const preprocessor = new TimeCardPreprocessor();
  const workspaceId = 'workspace-123';
  const pipeline = {
    id: 'pipeline-123',
    name: 'Convoso Agent Productivity Sync',
    workspaceId,
  } as IngestionPipelineEntity;

  const event = (
    overrides: Partial<{
      user_id: string;
      user_name: string;
      state: string;
      availability_code: string;
      event_sec: string;
      created_at: string;
    }> = {},
  ) => ({
    user_id: '12345',
    user_name: 'Test Agent',
    state: 'READY',
    availability_code: '0',
    event_sec: '00:10:00',
    created_at: '2026-05-10 09:15:00',
    ...overrides,
  });

  describe('preProcess (per-record)', () => {
    it('returns null — aggregation only happens in batch mode', async () => {
      const result = await preprocessor.preProcess(event(), pipeline, workspaceId);

      expect(result).toBeNull();
    });
  });

  describe('preProcessBatch', () => {
    it('aggregates a single agent-day into one row', async () => {
      const result = await preprocessor.preProcessBatch(
        [
          event({ event_sec: '01:00:00' }),
          event({ event_sec: '00:30:00' }),
        ],
        pipeline,
        workspaceId,
      );

      expect(result).toEqual([
        {
          user_id: '12345',
          date: '2026-05-10',
          name: 'Test Agent - 2026-05-10',
          loginSeconds: 5400,
          pauseSeconds: 0,
          billableHours: 1.5,
        },
      ]);
    });

    it('filters LOGIN, LOGOUT, and empty-state events', async () => {
      const result = await preprocessor.preProcessBatch(
        [
          event({ state: 'LOGIN', event_sec: '08:00:00' }),
          event({ state: 'logout', event_sec: '08:00:00' }),
          event({ state: '', event_sec: '08:00:00' }),
          event({ state: 'READY', event_sec: '01:00:00' }),
        ],
        pipeline,
        workspaceId,
      );

      expect(result).toEqual([
        {
          user_id: '12345',
          date: '2026-05-10',
          name: 'Test Agent - 2026-05-10',
          loginSeconds: 3600,
          pauseSeconds: 0,
          billableHours: 1,
        },
      ]);
    });

    it('treats availability_code 1217 as pauseSeconds (lunch)', async () => {
      const result = await preprocessor.preProcessBatch(
        [
          event({ event_sec: '08:00:00', availability_code: '0' }),
          event({ event_sec: '01:00:00', availability_code: '1217' }),
        ],
        pipeline,
        workspaceId,
      );

      expect(result).toEqual([
        {
          user_id: '12345',
          date: '2026-05-10',
          name: 'Test Agent - 2026-05-10',
          loginSeconds: 32400,
          pauseSeconds: 3600,
          billableHours: 8,
        },
      ]);
    });

    it('parses MM:SS event_sec correctly', async () => {
      const result = await preprocessor.preProcessBatch(
        [event({ event_sec: '30:00' })],
        pipeline,
        workspaceId,
      );

      expect(result[0].loginSeconds).toBe(1800);
      expect(result[0].billableHours).toBe(0.5);
    });

    it('sums across multiple campaigns for the same (agent, day)', async () => {
      const result = await preprocessor.preProcessBatch(
        [
          event({ event_sec: '04:00:00' }),
          event({ event_sec: '04:00:00' }),
        ],
        pipeline,
        workspaceId,
      );

      expect(result).toHaveLength(1);
      expect(result[0].loginSeconds).toBe(28800);
      expect(result[0].billableHours).toBe(8);
    });

    it('emits separate rows for different agents and different days', async () => {
      const result = await preprocessor.preProcessBatch(
        [
          event({ user_id: 'A', created_at: '2026-05-10 09:00:00', event_sec: '01:00:00' }),
          event({ user_id: 'A', created_at: '2026-05-11 09:00:00', event_sec: '02:00:00' }),
          event({ user_id: 'B', created_at: '2026-05-10 09:00:00', event_sec: '03:00:00' }),
        ],
        pipeline,
        workspaceId,
      );

      expect(result).toHaveLength(3);
      const byKey = Object.fromEntries(
        result.map((r) => [`${r.user_id}-${r.date}`, r]),
      );

      expect(byKey['A-2026-05-10'].billableHours).toBe(1);
      expect(byKey['A-2026-05-11'].billableHours).toBe(2);
      expect(byKey['B-2026-05-10'].billableHours).toBe(3);
    });

    it('skips events with missing user_id or created_at', async () => {
      const result = await preprocessor.preProcessBatch(
        [
          event({ user_id: undefined as unknown as string }),
          event({ created_at: undefined as unknown as string }),
          event({ event_sec: '01:00:00' }),
        ],
        pipeline,
        workspaceId,
      );

      expect(result).toHaveLength(1);
      expect(result[0].loginSeconds).toBe(3600);
    });

    it('rounds billableHours to 2 decimals', async () => {
      // 11s = 0.00305...h → rounds to 0
      // 36s = 0.01h
      // 90s = 0.025h → 0.03
      const result = await preprocessor.preProcessBatch(
        [event({ event_sec: '00:01:30' })],
        pipeline,
        workspaceId,
      );

      expect(result[0].billableHours).toBe(0.03);
    });
  });
});
