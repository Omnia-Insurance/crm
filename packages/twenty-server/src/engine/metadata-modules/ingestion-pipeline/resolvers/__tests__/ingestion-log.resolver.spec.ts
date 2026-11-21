import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { IngestionLogResolver } from 'src/engine/metadata-modules/ingestion-pipeline/resolvers/ingestion-log.resolver';
import { type IngestionLogService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-log.service';

const WORKSPACE = { id: 'workspace-id' } as WorkspaceEntity;

describe('IngestionLogResolver', () => {
  const findByPipelineId = jest.fn().mockResolvedValue([]);
  const resolver = new IngestionLogResolver({
    findByPipelineId,
  } as unknown as IngestionLogService);

  beforeEach(() => {
    findByPipelineId.mockClear();
  });

  it.each([
    [undefined, 50],
    [20, 20],
    [100_000, 100],
    [0, 1],
    [-5, 1],
  ])(
    'reads at most 100 logs (requested %p, read %p)',
    async (requestedLimit, readLimit) => {
      await resolver.ingestionLogs('pipeline-id', WORKSPACE, requestedLimit);

      expect(findByPipelineId).toHaveBeenCalledWith(
        'pipeline-id',
        'workspace-id',
        readLimit,
      );
    },
  );
});
