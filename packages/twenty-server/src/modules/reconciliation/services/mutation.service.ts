import { Injectable, Logger } from '@nestjs/common';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

@Injectable()
export class ReconciliationMutationService {
  private readonly logger = new Logger(ReconciliationMutationService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async updateReconciliation(
    workspaceId: string,
    reconciliationId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reconciliation',
          { shouldBypassPermissionChecks: true },
        );

        await repo.update({ id: reconciliationId }, data);
      },
      authContext,
    );
  }

  async updatePolicy(
    workspaceId: string,
    policyId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'policy',
          { shouldBypassPermissionChecks: true },
        );

        await repo.update({ id: policyId }, data);
      },
      authContext,
    );
  }

  async updateCommissionStatement(
    workspaceId: string,
    statementId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'commissionStatement',
          { shouldBypassPermissionChecks: true },
        );

        await repo.update({ id: statementId }, data);
      },
      authContext,
    );
  }

  async updateLead(
    workspaceId: string,
    leadId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'person',
          { shouldBypassPermissionChecks: true },
        );

        await repo.update({ id: leadId }, data);

        this.logger.log(`Updated lead ${leadId}`);
      },
      authContext,
    );
  }
}
