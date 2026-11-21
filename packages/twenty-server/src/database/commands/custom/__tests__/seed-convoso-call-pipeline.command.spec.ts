import { isDefined } from 'twenty-shared/utils';

import { SeedConvosoCallPipelineCommand } from 'src/database/commands/custom/seed-convoso-call-pipeline.command';

const WORKSPACE_ID = 'workspace-id';
const PIPELINE_ID = 'pipeline-id';

const createCommand = ({
  existingPipeline = null,
}: {
  existingPipeline?: { id: string } | null;
} = {}) => {
  const pipelineRepository = {
    findOne: jest.fn(async () => existingPipeline),
    delete: jest.fn(async () => undefined),
    insertAndReturnOne: jest.fn(async () => ({ id: PIPELINE_ID })),
  };
  const fieldMappingRepository = {
    save: jest.fn(async (mappings: unknown) => mappings),
  };
  const command = new SeedConvosoCallPipelineCommand(
    {} as never,
    pipelineRepository as never,
    fieldMappingRepository as never,
  );
  const logSpy = jest
    .spyOn(command['logger'], 'log')
    .mockImplementation(() => undefined);

  return { command, pipelineRepository, fieldMappingRepository, logSpy };
};

const runOnWorkspace = (
  command: SeedConvosoCallPipelineCommand,
  options: Record<string, unknown> = {},
) =>
  command.runOnWorkspace({
    workspaceId: WORKSPACE_ID,
    options,
    index: 0,
    total: 1,
  });

describe('SeedConvosoCallPipelineCommand', () => {
  const originalWebhookSecret = process.env.CONVOSO_WEBHOOK_SECRET;

  afterEach(() => {
    if (isDefined(originalWebhookSecret)) {
      process.env.CONVOSO_WEBHOOK_SECRET = originalWebhookSecret;
    } else {
      delete process.env.CONVOSO_WEBHOOK_SECRET;
    }
  });

  it('maps callDate from the preprocessor-normalized _callDate field', () => {
    const { command } = createCommand();

    const mappings = command['buildFieldMappings']('pipeline-123');
    const callDateMapping = mappings.find(
      (mapping) => mapping.targetFieldName === 'callDate',
    );

    expect(callDateMapping).toMatchObject({
      sourceFieldPath: '_callDate',
      targetFieldName: 'callDate',
      position: 2,
    });
    expect(callDateMapping?.transform).toBeUndefined();
  });

  it('writes nothing on a dry run, even with --force over an existing pipeline', async () => {
    const { command, pipelineRepository, fieldMappingRepository } =
      createCommand({ existingPipeline: { id: 'existing-pipeline-id' } });

    await runOnWorkspace(command, { dryRun: true, force: true });

    expect(pipelineRepository.delete).not.toHaveBeenCalled();
    expect(pipelineRepository.insertAndReturnOne).not.toHaveBeenCalled();
    expect(fieldMappingRepository.save).not.toHaveBeenCalled();
  });

  it('creates the pipeline scoped to the workspace with its field mappings', async () => {
    const { command, pipelineRepository, fieldMappingRepository } =
      createCommand();

    await runOnWorkspace(command);

    expect(pipelineRepository.insertAndReturnOne).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({
        name: 'Convoso Call Sync',
        targetObjectNameSingular: 'call',
      }),
    );
    expect(fieldMappingRepository.save).toHaveBeenCalledWith(
      command['buildFieldMappings'](PIPELINE_ID),
    );
  });

  it('never logs the webhook secret', async () => {
    process.env.CONVOSO_WEBHOOK_SECRET = 'webhook-secret-under-test';

    const { command, logSpy } = createCommand();

    await runOnWorkspace(command);

    expect(logSpy).toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(
      'webhook-secret-under-test',
    );
  });
});
