import { type TagColor } from 'twenty-shared/types';

import { DASHBOARD_AUDIENCE_OPTION_COLORS } from 'src/modules/dashboard/dashboard-audience/constants/dashboard-audience-option-colors.constant';

export const getDashboardAudienceOptionColor = (roleId: string): TagColor => {
  let colorIndex = 0;

  for (const character of roleId) {
    colorIndex =
      (colorIndex + character.charCodeAt(0)) %
      DASHBOARD_AUDIENCE_OPTION_COLORS.length;
  }

  return DASHBOARD_AUDIENCE_OPTION_COLORS[colorIndex];
};
