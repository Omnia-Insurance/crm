// OMNIA-CUSTOM: carrierConfig rename guard (OMN-11; multi-carrier readiness
// audit 2026-06-11 §"Renaming a carrierConfig silently orphans learned rules
// and match overrides").
//
// carrierConfig.name is the join key for everything the pipeline learns:
//   - reconciliationDecisionRule rows store carrierName AND embed it inside
//     their sha256 signatureHash (decision-rule.service.ts), so a rename
//     makes every learned rule silently stop matching — they cannot even be
//     re-keyed, only re-learned;
//   - reviewItem rows store carrierName, and approved items double as match
//     overrides scoped by it (ReviewItemService.fetchOverrides).
//
// This pre-query hook BLOCKS a name change while any such record references
// the old name, with an actionable error; renames of unreferenced configs
// (and edits to any other field) pass through untouched. Narrow by design:
// the `name` field only, updateOne only (the record-page cell edit path —
// there is no carrierConfig updateMany surface in the product today).

import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

@Injectable()
@WorkspaceQueryHook(`carrierConfig.updateOne`)
export class CarrierConfigUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs,
  ): Promise<UpdateOneResolverArgs> {
    const workspace = authContext.workspace;

    if (!isDefined(workspace)) {
      return payload;
    }

    // Narrow guard: only a write to the `name` field is inspected. Every
    // other carrierConfig edit (the whole on-the-fly tuning loop) must stay
    // friction-free.
    const newName = payload.data?.name as string | null | undefined;

    if (newName === undefined) {
      return payload;
    }

    const existing = await this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager
          .getRepository('carrierConfig')
          .findOne({ where: { id: payload.id } }),
      authContext,
    );

    const oldName: unknown = existing?.name;

    // Not a rename: record missing or hidden from the caller (the runner
    // answers), no stored name to orphan, or the name is unchanged.
    if (!isNonEmptyString(oldName) || oldName === newName) {
      return payload;
    }

    // Integrity check over admin-only bookkeeping: only counts reach the caller
    const [decisionRuleCount, reviewItemCount] =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          Promise.all([
            this.workspaceOrmManager
              .getRepositoryWithoutPermissionChecks(
                'reconciliationDecisionRule',
              )
              .count({ where: { carrierName: oldName } }),
            this.workspaceOrmManager
              .getRepositoryWithoutPermissionChecks('reviewItem')
              .count({ where: { carrierName: oldName } }),
          ]),
        buildSystemAuthContext(workspace.id),
      );

    if (decisionRuleCount === 0 && reviewItemCount === 0) {
      return payload;
    }

    throw new ForbiddenError(
      `Blocked carrierConfig rename "${oldName}" → "${newName}": ` +
        `${decisionRuleCount} learned decision rule(s) and ${reviewItemCount} ` +
        `review item(s)/override(s) join on carrierName "${oldName}" and would be ` +
        `silently orphaned (decision-rule signature hashes embed the name, so rules ` +
        `cannot be re-keyed — only re-learned).`,
      {
        userFriendlyMessage: msg`Cannot rename this carrier config: ${decisionRuleCount} learned rule(s) and ${reviewItemCount} review item(s) reference the name "${oldName}" and would stop matching. Create a new carrier config instead, or remove the referencing records first.`,
      },
    );
  }
}
