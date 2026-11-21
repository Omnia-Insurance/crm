import { OMNIA_HAND_MAINTAINED_PROVIDER_NAMES } from '../constants/omnia-hand-maintained-provider-names.constant';
import { type CanonicalCatalog } from '../types/canonical-catalog.type';

const isHandMaintainedProviderName = (providerName: string) =>
  (OMNIA_HAND_MAINTAINED_PROVIDER_NAMES as readonly string[]).includes(
    providerName,
  );

export const splitOmniaHandMaintainedProviders = (
  catalog: CanonicalCatalog,
): {
  handMaintainedProviders: CanonicalCatalog;
  projectedProviders: CanonicalCatalog;
} => {
  const entries = Object.entries(catalog);

  return {
    handMaintainedProviders: Object.fromEntries(
      entries.filter(([providerName]) =>
        isHandMaintainedProviderName(providerName),
      ),
    ),
    projectedProviders: Object.fromEntries(
      entries.filter(
        ([providerName]) => !isHandMaintainedProviderName(providerName),
      ),
    ),
  };
};
