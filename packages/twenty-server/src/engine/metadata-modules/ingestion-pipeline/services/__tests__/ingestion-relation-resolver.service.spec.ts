import { Test, type TestingModule } from '@nestjs/testing';

import { IngestionRelationResolverService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

const workspaceId = 'workspace-1';

describe('IngestionRelationResolverService', () => {
  let service: IngestionRelationResolverService;
  let mockRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let mockOrmManager: jest.Mocked<GlobalWorkspaceOrmManager>;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionRelationResolverService,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            getRepository: jest.fn().mockResolvedValue(mockRepository),
          },
        },
      ],
    }).compile();

    service = module.get<IngestionRelationResolverService>(
      IngestionRelationResolverService,
    );
    mockOrmManager = module.get(GlobalWorkspaceOrmManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCache', () => {
    it('should return an empty Map', () => {
      const cache = service.createCache();

      expect(cache).toBeInstanceOf(Map);
      expect(cache.size).toBe(0);
    });
  });

  describe('resolveRelations', () => {
    it('should pass through non-relation fields unchanged', async () => {
      const record = {
        name: { firstName: 'John' },
        age: 30,
        email: 'john@example.com',
      };

      const cache = service.createCache();
      const result = await service.resolveRelations(record, workspaceId, cache);

      expect(result).toEqual(record);
      expect(mockOrmManager.getRepository).not.toHaveBeenCalled();
    });

    it('should resolve a relation ref to an existing record ID', async () => {
      const record = {
        name: { firstName: 'John' },
        leadSourceId: {
          __relation: true,
          targetObjectName: 'leadSource',
          matchFieldName: 'name',
          matchValue: 'Facebook',
          autoCreate: false,
        },
      };

      mockRepository.findOne.mockResolvedValue({
        id: 'lead-source-fb',
        name: 'Facebook',
      });

      const cache = service.createCache();
      const result = await service.resolveRelations(record, workspaceId, cache);

      expect(result.leadSourceId).toBe('lead-source-fb');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { name: 'Facebook' },
      });
    });

    it('should auto-create related record when not found and autoCreate is true', async () => {
      const record = {
        leadSourceId: {
          __relation: true,
          targetObjectName: 'leadSource',
          matchFieldName: 'name',
          matchValue: 'TikTok',
          autoCreate: true,
        },
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue({
        id: 'new-lead-source',
        name: 'TikTok',
      });

      const cache = service.createCache();
      const result = await service.resolveRelations(record, workspaceId, cache);

      expect(result.leadSourceId).toBe('new-lead-source');
      expect(mockRepository.save).toHaveBeenCalledWith({ name: 'TikTok' });
    });

    it('should delete field when relation not found and autoCreate is false', async () => {
      const record = {
        name: { firstName: 'John' },
        leadSourceId: {
          __relation: true,
          targetObjectName: 'leadSource',
          matchFieldName: 'name',
          matchValue: 'Unknown',
          autoCreate: false,
        },
      };

      mockRepository.findOne.mockResolvedValue(null);

      const cache = service.createCache();
      const result = await service.resolveRelations(record, workspaceId, cache);

      expect(result.leadSourceId).toBeUndefined();
      expect(result.name).toEqual({ firstName: 'John' });
    });

    it('should use cache for repeated lookups', async () => {
      const makeRef = (value: string) => ({
        __relation: true,
        targetObjectName: 'leadSource',
        matchFieldName: 'name',
        matchValue: value,
        autoCreate: false,
      });

      mockRepository.findOne.mockResolvedValue({
        id: 'cached-id',
        name: 'Facebook',
      });

      const cache = service.createCache();

      // First call — hits database
      await service.resolveRelations(
        { leadSourceId: makeRef('Facebook') },
        workspaceId,
        cache,
      );

      // Second call — should use cache
      await service.resolveRelations(
        { leadSourceId: makeRef('Facebook') },
        workspaceId,
        cache,
      );

      // Only one DB call should have been made
      expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
      expect(cache.size).toBe(1);
    });

    it('should handle errors gracefully and remove the field', async () => {
      const record = {
        name: { firstName: 'John' },
        leadSourceId: {
          __relation: true,
          targetObjectName: 'leadSource',
          matchFieldName: 'name',
          matchValue: 'Facebook',
          autoCreate: false,
        },
      };

      mockOrmManager.getRepository.mockRejectedValue(
        new Error('Object not found'),
      );

      const cache = service.createCache();
      const result = await service.resolveRelations(record, workspaceId, cache);

      expect(result.leadSourceId).toBeUndefined();
      expect(result.name).toEqual({ firstName: 'John' });
    });
  });
});
