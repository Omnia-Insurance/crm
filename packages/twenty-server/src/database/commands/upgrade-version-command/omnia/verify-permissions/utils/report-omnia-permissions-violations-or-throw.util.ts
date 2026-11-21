import { type CommandLogger } from 'src/database/commands/logger';
import { type OmniaPermissionsViolation } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/types/omnia-permissions-violation.type';

// Messages carry metadata ids, object names and counts only, never record values
export const reportOmniaPermissionsViolationsOrThrow = ({
  logger,
  workspaceId,
  violations,
  isDryRun,
}: {
  logger: Pick<CommandLogger, 'log' | 'warn' | 'error'>;
  workspaceId: string;
  violations: OmniaPermissionsViolation[];
  isDryRun: boolean;
}): void => {
  if (violations.length === 0) {
    logger.log(`Workspace ${workspaceId}: Omnia permissions verified`);

    return;
  }

  for (const { check, message, ids } of violations) {
    logger.error(
      `Workspace ${workspaceId}: [${check}] ${message}${ids.length > 0 ? ` (ids: ${ids.join(', ')})` : ''}`,
    );
  }

  const summary = `Workspace ${workspaceId}: ${violations.length} Omnia permission violation(s) in ${[...new Set(violations.map(({ check }) => check))].join(', ')}`;

  // Earlier commands write nothing in a dry run, so the violations describe the pre-upgrade state
  if (isDryRun) {
    logger.warn(`[DRY RUN] ${summary}; a real run would fail here`);

    return;
  }

  throw new Error(`${summary}. Fix them and run the command again.`);
};
