import { isNonEmptyString } from '@sniptt/guards';
import { QUERY_MAX_RECORDS_FROM_RELATION } from 'twenty-shared/constants';
import { type ObjectRecord } from 'twenty-shared/types';
import {
  isDefined,
  isPlainObject,
  normalizeUsState,
} from 'twenty-shared/utils';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  type RecordExportRelationSubFieldCell,
  type RecordExportRelationSubFieldPlan,
} from 'src/engine/core-modules/record-export/types/record-export-relation-sub-field-plan.type';
import {
  formatOneToManyItem,
  formatOneToManyList,
} from 'src/engine/core-modules/record-export/utils/format-one-to-many-export-list.util';
import { getRecordExportLabel } from 'src/engine/core-modules/record-export/utils/get-record-export-label.util';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

type RecordExportListCell = Extract<
  RecordExportRelationSubFieldCell,
  { kind: 'list' }
>;

const getRelatedRecord = (
  record: Record<string, unknown>,
  recordPath: string[],
): Record<string, unknown> | undefined =>
  recordPath.reduce<Record<string, unknown> | undefined>(
    (currentRecord, fieldName) => {
      const nextRecord = currentRecord?.[fieldName];

      return isPlainObject(nextRecord) ? nextRecord : undefined;
    },
    record,
  );

const getChildRecords = (
  record: Record<string, unknown>,
  { relationFieldName, fieldName }: RecordExportListCell,
): Record<string, unknown>[] => {
  const childRecords = getRelatedRecord(record, [relationFieldName])?.[
    fieldName
  ];

  return Array.isArray(childRecords) ? childRecords.filter(isPlainObject) : [];
};

const getCreatedAtTime = ({ createdAt }: Record<string, unknown>): number => {
  const time =
    createdAt instanceof Date
      ? createdAt.getTime()
      : isNonEmptyString(createdAt)
        ? Date.parse(createdAt)
        : Number.NaN;

  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

// The nested relation loader keeps up to QUERY_MAX_RECORDS_FROM_RELATION children per parent in no set order
const sortNewestFirst = (
  childRecords: Record<string, unknown>[],
): Record<string, unknown>[] =>
  [...childRecords].sort((firstChild, secondChild) => {
    const firstTime = getCreatedAtTime(firstChild);
    const secondTime = getCreatedAtTime(secondChild);

    if (firstTime === secondTime) {
      return String(secondChild.id ?? '').localeCompare(
        String(firstChild.id ?? ''),
      );
    }

    return secondTime > firstTime ? 1 : -1;
  });

const normalizeAddressState = (address: unknown): unknown =>
  isPlainObject(address)
    ? { ...address, addressState: normalizeUsState(address.addressState) }
    : address;

// One grouped count per list and page, only for parents the loader may have capped
const countChildrenOfCappedParents = async ({
  records,
  listCells,
  workspaceOrmManager,
  authContext,
}: {
  records: ObjectRecord[];
  listCells: RecordExportListCell[];
  workspaceOrmManager: WorkspaceOrmManager;
  authContext: WorkspaceAuthContext;
}): Promise<Map<string, Map<string, number>>> => {
  const cappedParentIdsByCellKey = new Map<string, string[]>();

  for (const listCell of listCells) {
    const cappedParentIds = new Set<string>();

    for (const record of records) {
      const parentId = getRelatedRecord(record, [
        listCell.relationFieldName,
      ])?.id;

      if (
        isNonEmptyString(parentId) &&
        getChildRecords(record, listCell).length >=
          QUERY_MAX_RECORDS_FROM_RELATION
      ) {
        cappedParentIds.add(parentId);
      }
    }

    if (cappedParentIds.size > 0) {
      cappedParentIdsByCellKey.set(listCell.key, [...cappedParentIds]);
    }
  }

  const childCountByParentIdByCellKey = new Map<string, Map<string, number>>();

  if (cappedParentIdsByCellKey.size === 0) {
    return childCountByParentIdByCellKey;
  }

  await workspaceOrmManager.executeInWorkspaceContext(async () => {
    for (const listCell of listCells) {
      const parentIds = cappedParentIdsByCellKey.get(listCell.key);

      if (!isDefined(parentIds)) {
        continue;
      }

      const repository = workspaceOrmManager.getRepository(
        listCell.childObjectNameSingular,
        { useReplica: true },
      );

      if (await repository.isReadDisabled()) {
        continue;
      }

      const parentIdColumn = `"${listCell.childObjectNameSingular}"."${listCell.childJoinColumnName}"`;
      const rows = await repository
        .createQueryBuilder(listCell.childObjectNameSingular)
        .select(parentIdColumn, 'parentId')
        .addSelect('COUNT(*)', 'childCount')
        .where(`${parentIdColumn} IN (:...parentIds)`, { parentIds })
        .groupBy(parentIdColumn)
        .getRawMany<{ parentId: string; childCount: string }>();

      childCountByParentIdByCellKey.set(
        listCell.key,
        new Map(
          rows.map(({ parentId, childCount }) => [
            parentId,
            Number(childCount),
          ]),
        ),
      );
    }
  }, authContext);

  return childCountByParentIdByCellKey;
};

const getCellValue = ({
  record,
  cell,
  childCountByParentIdByCellKey,
}: {
  record: ObjectRecord;
  cell: RecordExportRelationSubFieldCell;
  childCountByParentIdByCellKey: Map<string, Map<string, number>>;
}): unknown => {
  switch (cell.kind) {
    case 'joinColumn':
      return record[cell.joinColumnName];
    case 'value': {
      const value = getRelatedRecord(record, [cell.relationFieldName])?.[
        cell.fieldName
      ];

      return cell.isAddress ? normalizeAddressState(value) : value;
    }
    case 'label': {
      const relatedRecord = getRelatedRecord(record, cell.recordPath);

      return isDefined(relatedRecord) && isDefined(cell.labelFieldName)
        ? getRecordExportLabel(relatedRecord[cell.labelFieldName])
        : '';
    }
    case 'list': {
      const parentId = getRelatedRecord(record, [cell.relationFieldName])?.id;
      const labels = sortNewestFirst(getChildRecords(record, cell)).map(
        (item) =>
          formatOneToManyItem({ item, labelFieldName: cell.labelFieldName }),
      );

      return formatOneToManyList(
        labels,
        isNonEmptyString(parentId)
          ? childCountByParentIdByCellKey.get(cell.key)?.get(parentId)
          : undefined,
      );
    }
  }
};

// Writes each synthetic column of the plan onto the page's records, which the unchanged formatter then reads
export const flattenRelationSubFieldExportValues = async ({
  records,
  plan,
  workspaceOrmManager,
  authContext,
}: {
  records: ObjectRecord[];
  plan: RecordExportRelationSubFieldPlan;
  workspaceOrmManager: WorkspaceOrmManager;
  authContext: WorkspaceAuthContext;
}): Promise<void> => {
  const childCountByParentIdByCellKey = await countChildrenOfCappedParents({
    records,
    listCells: plan.cells.filter(
      (cell): cell is RecordExportListCell => cell.kind === 'list',
    ),
    workspaceOrmManager,
    authContext,
  });

  for (const record of records) {
    for (const addressFieldName of plan.addressFieldNames) {
      record[addressFieldName] = normalizeAddressState(
        record[addressFieldName],
      );
    }

    for (const cell of plan.cells) {
      record[cell.key] = getCellValue({
        record,
        cell,
        childCountByParentIdByCellKey,
      });
    }
  }
};
