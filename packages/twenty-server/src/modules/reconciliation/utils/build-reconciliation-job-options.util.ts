import { type QueueJobOptions } from 'src/engine/core-modules/message-queue/drivers/interfaces/job-options.interface';

export type ReconciliationJobPhase = 'parse' | 'match';

// keepLastIfActive: a stuck-run restart while the superseded job is still
// active must still run, or the restarted run waits for another threshold
export const buildReconciliationJobOptions = ({
  workspaceId,
  reconciliationId,
  phase,
}: {
  workspaceId: string;
  reconciliationId: string;
  phase: ReconciliationJobPhase;
}): QueueJobOptions => ({
  isWorkspaceJob: true,
  workspaceId,
  deduplication: {
    id: `reconciliation-${phase}-${reconciliationId}`,
    keepLastIfActive: true,
  },
});
