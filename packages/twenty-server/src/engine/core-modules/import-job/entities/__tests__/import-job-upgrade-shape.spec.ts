import { OMNIA_ADD_USER_WORKSPACE_ID_TO_IMPORT_JOB_UPGRADE_COMMAND_NAME } from 'src/database/commands/upgrade-version-command/omnia/omnia-add-user-workspace-id-to-import-job-upgrade-command-name.constant';
import { ImportJobEntity } from 'src/engine/core-modules/import-job/entities/import-job.entity';
import { resolveEntityShapeAtUpgradeCursor } from 'src/engine/core-modules/upgrade/utils/resolve-entity-shape-at-upgrade-cursor.util';

const CURRENT_COLUMNS = ['userWorkspaceId', 'workspaceMemberId'].map(
  (propertyName) => ({ propertyName, databaseName: propertyName }),
);

const resolveAt = (appliedSteps: string[]) =>
  resolveEntityShapeAtUpgradeCursor({
    entityClass: ImportJobEntity,
    currentTableName: 'importJob',
    currentColumns: CURRENT_COLUMNS,
    isStepApplied: (stepName) => appliedSteps.includes(stepName),
  });

describe('ImportJobEntity upgrade shape', () => {
  it('hides userWorkspaceId until its instance command has run', () => {
    expect(resolveAt([]).isAvailable).toBe(true);
    expect(resolveAt([]).hiddenPropertyNames).toEqual(
      new Set(['userWorkspaceId']),
    );
    expect(
      resolveAt([
        OMNIA_ADD_USER_WORKSPACE_ID_TO_IMPORT_JOB_UPGRADE_COMMAND_NAME,
      ]).hiddenPropertyNames.size,
    ).toBe(0);
  });
});
