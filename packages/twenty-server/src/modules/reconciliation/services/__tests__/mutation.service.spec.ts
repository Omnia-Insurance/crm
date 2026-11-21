import { In, Not } from 'typeorm';

import { ReconciliationMutationService } from 'src/modules/reconciliation/services/mutation.service';

const WORKSPACE_ID = 'workspace-id';
const RECONCILIATION_ID = 'reconciliation-id';

const createService = (affected: number) => {
  const repository = {
    update: jest.fn().mockResolvedValue({ affected, raw: [] }),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(),
    getRepositoryWithoutPermissionChecks: jest.fn(() => repository),
  };
  const service = new ReconciliationMutationService(
    workspaceOrmManager as never,
  );

  return { service, repository, workspaceOrmManager };
};

describe('ReconciliationMutationService', () => {
  describe('updateReconciliationIfStatus', () => {
    it('updates only while the stored status still matches and reports the win', async () => {
      const { service, repository, workspaceOrmManager } = createService(1);

      await expect(
        service.updateReconciliationIfStatus(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'PARSING',
          { status: 'PARSED' },
        ),
      ).resolves.toBe(true);

      expect(repository.update).toHaveBeenCalledWith(
        { id: RECONCILIATION_ID, status: 'PARSING' },
        { status: 'PARSED' },
      );
      // Bookkeeping writes emit no events, so no timeline activity copies them for every role
      expect(
        workspaceOrmManager.getRepositoryWithoutPermissionChecks,
      ).toHaveBeenCalledWith('reconciliation', {
        shouldSkipEventEmission: true,
      });
      expect(workspaceOrmManager.getRepository).not.toHaveBeenCalled();
      expect(
        workspaceOrmManager.executeInWorkspaceContext,
      ).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          type: 'system',
          workspace: { id: WORKSPACE_ID },
        }),
      );
    });

    it('reports a lost race when the compare-and-swap matches no row', async () => {
      const { service } = createService(0);

      await expect(
        service.updateReconciliationIfStatus(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          'PARSING',
          { status: 'PARSED' },
        ),
      ).resolves.toBe(false);
    });
  });

  describe('updateReconciliationUnlessStatus', () => {
    it('excludes the given statuses in the update criteria', async () => {
      const { service, repository } = createService(1);

      await expect(
        service.updateReconciliationUnlessStatus(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          ['REVIEW', 'COMPLETED'],
          { status: 'FAILED' },
        ),
      ).resolves.toBe(true);

      expect(repository.update).toHaveBeenCalledWith(
        { id: RECONCILIATION_ID, status: Not(In(['REVIEW', 'COMPLETED'])) },
        { status: 'FAILED' },
      );
    });

    it('reports false when the stored status is excluded', async () => {
      const { service } = createService(0);

      await expect(
        service.updateReconciliationUnlessStatus(
          WORKSPACE_ID,
          RECONCILIATION_ID,
          ['REVIEW', 'COMPLETED'],
          { status: 'FAILED' },
        ),
      ).resolves.toBe(false);
    });
  });

  it('writes reconciliation bookkeeping by id', async () => {
    const { service, repository } = createService(1);

    await service.updateReconciliation(WORKSPACE_ID, RECONCILIATION_ID, {
      sourceAttachmentId: 'attachment-id',
    });

    expect(repository.update).toHaveBeenCalledWith(
      { id: RECONCILIATION_ID },
      { sourceAttachmentId: 'attachment-id' },
    );
  });
});
