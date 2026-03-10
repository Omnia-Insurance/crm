import { SeedConvosoCallPipelineCommand } from 'src/database/commands/custom/seed-convoso-call-pipeline.command';

describe('SeedConvosoCallPipelineCommand', () => {
  it('maps callDate from the preprocessor-normalized _callDate field', () => {
    const command = new SeedConvosoCallPipelineCommand(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

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
});
