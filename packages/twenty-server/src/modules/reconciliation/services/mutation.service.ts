import { Injectable, Logger } from '@nestjs/common';

import { In, Not } from 'typeorm';

import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS } from 'src/modules/reconciliation/constants/reconciliation-bookkeeping-repository-options.constant';
import type { ReconciliationStatus } from 'src/modules/reconciliation/types/reconciliation';

@Injectable()
export class ReconciliationMutationService {
  private readonly logger = new Logger(ReconciliationMutationService.name);

  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async updateReconciliation(
    workspaceId: string,
    reconciliationId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      await this.getReconciliationRepository().update(
        { id: reconciliationId },
        data,
      );
    }, authContext);
  }

  /**
   * Compare-and-swap update (audit 2026-06-10 §"State machine is not
   * compare-and-swap"): the UPDATE carries `WHERE id = :id AND status =
   * :expectedStatus`, so a concurrent transition that already moved the
   * record off `expectedStatus` matches zero rows instead of being stomped.
   *
   * @returns true when exactly this status version was updated; false when
   *   the stored status no longer matches (or the record is gone).
   */
  async updateReconciliationIfStatus(
    workspaceId: string,
    reconciliationId: string,
    expectedStatus: ReconciliationStatus,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const result = await this.getReconciliationRepository().update(
        { id: reconciliationId, status: expectedStatus },
        data,
      );

      return (result.affected ?? 0) > 0;
    }, authContext);
  }

  /**
   * Conditional update that skips when the stored status is one of
   * `excludedStatuses` (`WHERE id = :id AND status NOT IN (...)`). Used by
   * setFailed so a stale job retry never stomps a run that a newer job has
   * already advanced to a post-step state.
   *
   * @returns true when a row was updated; false when the stored status was
   *   excluded (or the record is gone).
   */
  async updateReconciliationUnlessStatus(
    workspaceId: string,
    reconciliationId: string,
    excludedStatuses: ReconciliationStatus[],
    data: Record<string, unknown>,
  ): Promise<boolean> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const result = await this.getReconciliationRepository().update(
        { id: reconciliationId, status: Not(In(excludedStatuses)) },
        data,
      );

      return (result.affected ?? 0) > 0;
    }, authContext);
  }

  async updatePolicy(
    workspaceId: string,
    policyId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      await this.getSystemRepository('policy').update({ id: policyId }, data);
    }, authContext);
  }

  async updateLead(
    workspaceId: string,
    leadId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      await this.getSystemRepository('person').update({ id: leadId }, data);

      this.logger.log(`Updated lead ${leadId}`);
    }, authContext);
  }

  private getReconciliationRepository() {
    return this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
      'reconciliation',
      RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS,
    );
  }

  // System writes only: user-initiated CRM writes go through permission-checked
  // repositories under the caller's auth context (ReviewItemService)
  private getSystemRepository(objectName: string) {
    return this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
      objectName,
    );
  }
}
