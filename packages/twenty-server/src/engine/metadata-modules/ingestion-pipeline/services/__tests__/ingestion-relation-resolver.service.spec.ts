import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { IngestionRelationResolverService } from 'src/engine/metadata-modules/ingestion-pipeline/services/ingestion-relation-resolver.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

const buildLeadSourceRef = ({
  matchValue,
  autoCreate,
}: {
  matchValue: string;
  autoCreate: boolean;
}) => ({
  __relation: true,
  targetObjectName: 'leadSource',
  matchFieldName: 'name',
  matchValue,
  autoCreate,
});

describe('IngestionRelationResolverService', () => {
  let service: IngestionRelationResolverService;
  let mockRepository: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let mockOrmManager: {
    getRepositoryWithoutPermissionChecks: jest.Mock;
  };

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockOrmManager = {
      getRepositoryWithoutPermissionChecks: jest
        .fn()
        .mockReturnValue(mockRepository),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionRelationResolverService,
        {
          provide: WorkspaceOrmManager,
          useValue: mockOrmManager,
        },
      ],
    }).compile();

    service = module.get<IngestionRelationResolverService>(
      IngestionRelationResolverService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

      const result = await service.resolveRelations(
        record,
        service.createCache(),
      );

      expect(result).toEqual(record);
      expect(
        mockOrmManager.getRepositoryWithoutPermissionChecks,
      ).not.toHaveBeenCalled();
    });

    it('should resolve a relation ref to an existing record ID', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'lead-source-fb',
        name: 'Facebook',
      });

      const result = await service.resolveRelations(
        {
          name: { firstName: 'John' },
          leadSourceId: buildLeadSourceRef({
            matchValue: 'Facebook',
            autoCreate: false,
          }),
        },
        service.createCache(),
      );

      expect(result.leadSourceId).toBe('lead-source-fb');
      expect(
        mockOrmManager.getRepositoryWithoutPermissionChecks,
      ).toHaveBeenCalledWith('leadSource');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { name: 'Facebook' },
      });
    });

    it('should link the id of an auto-created record from the saved rows', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue([
        { id: 'new-lead-source', name: 'TikTok' },
      ]);

      const cache = service.createCache();
      const result = await service.resolveRelations(
        {
          leadSourceId: buildLeadSourceRef({
            matchValue: 'TikTok',
            autoCreate: true,
          }),
        },
        cache,
      );

      expect(result.leadSourceId).toBe('new-lead-source');
      expect(mockRepository.save).toHaveBeenCalledWith({ name: 'TikTok' });
      expect(cache.get('leadSource:name:TikTok')).toBe('new-lead-source');
    });

    it('should drop the relation instead of linking undefined when the save returns no row', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue([]);

      const cache = service.createCache();
      const result = await service.resolveRelations(
        {
          name: { firstName: 'John' },
          leadSourceId: buildLeadSourceRef({
            matchValue: 'TikTok',
            autoCreate: true,
          }),
        },
        cache,
      );

      expect(result).not.toHaveProperty('leadSourceId');
      expect(result.name).toEqual({ firstName: 'John' });
      expect(cache.size).toBe(0);
    });

    it('should delete field when relation not found and autoCreate is false', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.resolveRelations(
        {
          name: { firstName: 'John' },
          leadSourceId: buildLeadSourceRef({
            matchValue: 'Unknown',
            autoCreate: false,
          }),
        },
        service.createCache(),
      );

      expect(result.leadSourceId).toBeUndefined();
      expect(result.name).toEqual({ firstName: 'John' });
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should use cache for repeated lookups', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'cached-id',
        name: 'Facebook',
      });

      const cache = service.createCache();

      await service.resolveRelations(
        {
          leadSourceId: buildLeadSourceRef({
            matchValue: 'Facebook',
            autoCreate: false,
          }),
        },
        cache,
      );

      await service.resolveRelations(
        {
          leadSourceId: buildLeadSourceRef({
            matchValue: 'Facebook',
            autoCreate: false,
          }),
        },
        cache,
      );

      expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
      expect(cache.size).toBe(1);
    });

    it('should handle errors gracefully without logging the match value', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      mockOrmManager.getRepositoryWithoutPermissionChecks.mockImplementation(
        () => {
          throw new Error('Object not found');
        },
      );

      const result = await service.resolveRelations(
        {
          name: { firstName: 'John' },
          phoneOwnerId: {
            __relation: true,
            targetObjectName: 'person',
            matchFieldName: 'phone',
            matchValue: '5551234567',
            autoCreate: false,
          },
        },
        service.createCache(),
      );

      expect(result.phoneOwnerId).toBeUndefined();
      expect(result.name).toEqual({ firstName: 'John' });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).not.toContain('5551234567');
    });
  });
});
