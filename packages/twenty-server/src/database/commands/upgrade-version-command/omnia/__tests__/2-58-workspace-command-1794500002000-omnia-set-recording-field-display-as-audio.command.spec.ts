import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { OmniaSetRecordingFieldDisplayAsAudioCommand } from 'src/database/commands/upgrade-version-command/omnia/2-58-workspace-command-1794500002000-omnia-set-recording-field-display-as-audio.command';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const RECORDING_FIELD_ID = '20202020-0000-0000-0000-0000000000a1';

const isUpdate = (sql: unknown) =>
  typeof sql === 'string' && sql.trimStart().startsWith('UPDATE');

const setup = async ({
  recordingFieldIds,
}: {
  recordingFieldIds: string[];
}) => {
  const query = jest.fn(async (...args: unknown[]) => {
    if (isUpdate(args[0])) {
      return [[], recordingFieldIds.length];
    }

    return recordingFieldIds.map((id) => ({ id }));
  });
  const invalidateAndRecompute = jest.fn();

  const module = await Test.createTestingModule({
    providers: [
      OmniaSetRecordingFieldDisplayAsAudioCommand,
      { provide: WorkspaceIteratorService, useValue: {} },
      { provide: WorkspaceCacheService, useValue: { invalidateAndRecompute } },
      { provide: getDataSourceToken(), useValue: { query } },
    ],
  }).compile();

  const command = module.get(OmniaSetRecordingFieldDisplayAsAudioCommand);

  const run = (dryRun = false) =>
    command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun },
      index: 0,
      total: 1,
    });

  return { run, query, invalidateAndRecompute };
};

describe('OmniaSetRecordingFieldDisplayAsAudioCommand', () => {
  it('merges displayAs audio into the recording field settings and recomputes the field caches', async () => {
    const { run, query, invalidateAndRecompute } = await setup({
      recordingFieldIds: [RECORDING_FIELD_ID],
    });

    await run();

    const updateCall = query.mock.calls.find((call) => isUpdate(call[0]));

    expect(updateCall?.[0]).toContain(
      `COALESCE("settings", '{}'::jsonb) || '{"displayAs": "audio"}'::jsonb`,
    );
    expect(updateCall?.[1]).toEqual([WORKSPACE_ID, [RECORDING_FIELD_ID]]);
    expect(invalidateAndRecompute).toHaveBeenCalledWith(WORKSPACE_ID, [
      'flatFieldMetadataMaps',
      'flatFieldMetadataMapsOrm',
    ]);
  });

  it('writes nothing on a dry run', async () => {
    const { run, query, invalidateAndRecompute } = await setup({
      recordingFieldIds: [RECORDING_FIELD_ID],
    });

    await run(true);

    expect(query.mock.calls.some((call) => isUpdate(call[0]))).toBe(false);
    expect(invalidateAndRecompute).not.toHaveBeenCalled();
  });

  it('is a no-op once the recording field already renders as audio', async () => {
    const { run, query, invalidateAndRecompute } = await setup({
      recordingFieldIds: [],
    });

    await run();

    expect(query).toHaveBeenCalledTimes(1);
    expect(invalidateAndRecompute).not.toHaveBeenCalled();
  });
});
