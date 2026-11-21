export const appendDashboardAudienceToken = ({
  audience,
  audienceToken,
}: {
  audience: unknown;
  audienceToken: string;
}): unknown[] => {
  const currentAudience: unknown[] = Array.isArray(audience) ? audience : [];

  return currentAudience.includes(audienceToken)
    ? currentAudience
    : [...currentAudience, audienceToken];
};
