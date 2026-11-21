import { buildReconciliationJobOptions } from 'src/modules/reconciliation/utils/build-reconciliation-job-options.util';

describe('buildReconciliationJobOptions', () => {
  it('scopes the job to the workspace and deduplicates per phase and run', () => {
    expect(
      buildReconciliationJobOptions({
        workspaceId: 'workspace-id',
        reconciliationId: 'reconciliation-id',
        phase: 'parse',
      }),
    ).toEqual({
      isWorkspaceJob: true,
      workspaceId: 'workspace-id',
      deduplication: {
        id: 'reconciliation-parse-reconciliation-id',
        keepLastIfActive: true,
      },
    });
  });

  it('gives parse and match jobs of the same run distinct deduplication ids', () => {
    const parseOptions = buildReconciliationJobOptions({
      workspaceId: 'workspace-id',
      reconciliationId: 'reconciliation-id',
      phase: 'parse',
    });
    const matchOptions = buildReconciliationJobOptions({
      workspaceId: 'workspace-id',
      reconciliationId: 'reconciliation-id',
      phase: 'match',
    });

    expect(matchOptions.deduplication?.id).toBe(
      'reconciliation-match-reconciliation-id',
    );
    expect(matchOptions.deduplication?.id).not.toBe(
      parseOptions.deduplication?.id,
    );
  });
});
