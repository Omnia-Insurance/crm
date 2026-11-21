import { v5 as uuidv5 } from 'uuid';

import { DASHBOARD_AUDIENCE_PREDICATE_ID_NAMESPACE } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-predicate-id-namespace.constant';

// The first id is the one written before rules existed; the second takes over when the
// scoped-permission translation left the first as a soft-deleted row, which an insert cannot reuse
export const getDashboardAudiencePredicateIds = ({
  roleId,
  dashboardObjectMetadataId,
}: {
  roleId: string;
  dashboardObjectMetadataId: string;
}): [string, string] => [
  uuidv5(
    `${roleId}:${dashboardObjectMetadataId}:READ`,
    DASHBOARD_AUDIENCE_PREDICATE_ID_NAMESPACE,
  ),
  uuidv5(
    `${roleId}:${dashboardObjectMetadataId}:AUDIENCE`,
    DASHBOARD_AUDIENCE_PREDICATE_ID_NAMESPACE,
  ),
];
