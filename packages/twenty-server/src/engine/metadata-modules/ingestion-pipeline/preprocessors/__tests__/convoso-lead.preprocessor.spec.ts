import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { type IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { ConvosoLeadPreprocessor } from 'src/engine/metadata-modules/ingestion-pipeline/preprocessors/convoso-lead.preprocessor';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const workspaceId = 'workspace-1';

const pipeline = {
  id: 'pipeline-1',
  name: 'Convoso Lead Sync',
  workspaceId,
} as IngestionPipelineEntity;

describe('ConvosoLeadPreprocessor', () => {
  let preprocessor: ConvosoLeadPreprocessor;
  let mockLeadSourceRepo: { findOne: jest.Mock; save: jest.Mock };
  let mockWorkspaceOrmManager: {
    getRepositoryWithoutPermissionChecks: jest.Mock;
  };
  let mockFetch: jest.Mock;

  const originalFetch = global.fetch;
  const originalConvosoToken = process.env.CONVOSO_API_TOKEN;

  const mockConvosoLists = (lists: { id: number; name: string }[]) =>
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true, data: lists }),
    });

  beforeEach(async () => {
    process.env.CONVOSO_API_TOKEN = 'test-convoso-token';
    mockFetch = jest.fn();
    global.fetch = mockFetch as typeof fetch;

    mockLeadSourceRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };

    mockWorkspaceOrmManager = {
      getRepositoryWithoutPermissionChecks: jest
        .fn()
        .mockReturnValue(mockLeadSourceRepo),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConvosoLeadPreprocessor,
        { provide: WorkspaceOrmManager, useValue: mockWorkspaceOrmManager },
      ],
    }).compile();

    preprocessor = module.get<ConvosoLeadPreprocessor>(ConvosoLeadPreprocessor);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;

    if (originalConvosoToken === undefined) {
      delete process.env.CONVOSO_API_TOKEN;
    } else {
      process.env.CONVOSO_API_TOKEN = originalConvosoToken;
    }
  });

  it('returns the payload untouched when it has no list_id', async () => {
    const payload = { first_name: 'Jane' };

    const result = await preprocessor.preProcess(
      payload,
      pipeline,
      workspaceId,
    );

    expect(result).toBe(payload);
    expect(
      mockWorkspaceOrmManager.getRepositoryWithoutPermissionChecks,
    ).not.toHaveBeenCalled();
  });

  it('links the Lead Source matched by its Convoso list id', async () => {
    mockLeadSourceRepo.findOne.mockResolvedValueOnce({ id: 'lead-source-1' });

    const result = await preprocessor.preProcess(
      { list_id: 4242 },
      pipeline,
      workspaceId,
    );

    expect(
      mockWorkspaceOrmManager.getRepositoryWithoutPermissionChecks,
    ).toHaveBeenCalledWith('leadSource');
    expect(mockLeadSourceRepo.findOne).toHaveBeenCalledWith({
      where: { convosoListId: '4242' },
    });
    expect(result?._leadSourceId).toBe('lead-source-1');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('links the id of a Lead Source it creates from the saved rows', async () => {
    mockConvosoLists([{ id: 4242, name: 'Facebook ACA' }]);
    mockLeadSourceRepo.save.mockResolvedValue([{ id: 'lead-source-new' }]);

    const result = await preprocessor.preProcess(
      { list_id: '4242' },
      pipeline,
      workspaceId,
    );

    expect(mockLeadSourceRepo.save).toHaveBeenCalledWith({
      name: 'Facebook ACA',
      convosoListId: '4242',
    });
    expect(result?._leadSourceId).toBe('lead-source-new');
  });

  it('leaves the lead unlinked instead of linking undefined when the save returns no row', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockConvosoLists([{ id: 4242, name: 'Facebook ACA' }]);
    mockLeadSourceRepo.save.mockResolvedValue([]);

    const result = await preprocessor.preProcess(
      { list_id: '4242' },
      pipeline,
      workspaceId,
    );

    expect(result).toHaveProperty('_leadSourceId', null);
  });
});
