// A MULTI_SELECT option value must be an UPPER_SNAKE_CASE GraphQL enum name, which a role uuid is not
export const encodeDashboardAudienceRoleToken = (roleId: string): string =>
  `ROLE_${roleId.replace(/-/g, '').toUpperCase()}`;
