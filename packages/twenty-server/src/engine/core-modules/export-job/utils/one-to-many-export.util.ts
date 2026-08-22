import { QUERY_MAX_RECORDS_FROM_RELATION } from 'twenty-shared/constants';

/**
 * Maximum number of child records rendered per parent for a ONE_TO_MANY
 * relation sub-field in a CSV export. Mirrors the server-side cap the table
 * view already applies to nested relations (QUERY_MAX_RECORDS_FROM_RELATION)
 * so the export never shows more than the UI does — and, more importantly,
 * never tries to materialise an unbounded sibling list per row.
 *
 * Context: 2026-08-22 a "Product / Policies" column on a 13,917-row policy
 * export fanned out to ~43M sibling labels and OOM-killed the worker.
 */
export const ONE_TO_MANY_EXPORT_CHILD_CAP = QUERY_MAX_RECORDS_FROM_RELATION;

/** Suffix of the key that carries the uncapped child count next to the
 *  capped child array on a parent record (e.g. `policies__exportTotal`). */
export const ONE_TO_MANY_TOTAL_KEY_SUFFIX = '__exportTotal';

export type ChildIdRow = { id: string; parentId: string | null };

/**
 * Group child ids by parent id, preserving input order and keeping at most
 * `cap` ids per parent. Also returns the uncapped count per parent so the
 * caller can render "+N more".
 */
export function capChildIdsByParent(
  rows: ChildIdRow[],
  cap: number,
): {
  cappedIdsByParent: Map<string, string[]>;
  totalByParent: Map<string, number>;
} {
  const cappedIdsByParent = new Map<string, string[]>();
  const totalByParent = new Map<string, number>();

  for (const row of rows) {
    if (!row.parentId || !row.id) continue;

    const total = (totalByParent.get(row.parentId) ?? 0) + 1;

    totalByParent.set(row.parentId, total);

    if (total <= cap) {
      const ids = cappedIdsByParent.get(row.parentId) ?? [];

      ids.push(row.id);
      cappedIdsByParent.set(row.parentId, ids);
    }
  }

  return { cappedIdsByParent, totalByParent };
}

/**
 * Render a ONE_TO_MANY child list for a CSV cell: labels joined with " | ",
 * followed by " | +N more" when the list was capped.
 */
export function formatOneToManyList(
  labels: string[],
  total: number | undefined,
): string {
  const shown = labels.filter(Boolean);
  const hidden = (total ?? shown.length) - labels.length;

  if (hidden > 0) {
    return [...shown, `+${hidden} more`].join(' | ');
  }

  return shown.join(' | ');
}
