import shippedCatalog from 'src/engine/metadata-modules/ai/ai-models/ai-providers.json';

import { type CanonicalCatalog } from '../types/canonical-catalog.type';
import { splitOmniaHandMaintainedProviders } from '../utils/split-omnia-hand-maintained-providers.util';

describe('splitOmniaHandMaintainedProviders', () => {
  it('keeps the Bedrock route out of the projected providers', () => {
    const { handMaintainedProviders, projectedProviders } =
      splitOmniaHandMaintainedProviders(shippedCatalog as CanonicalCatalog);

    expect(Object.keys(handMaintainedProviders)).toEqual(['bedrock']);
    expect(handMaintainedProviders.bedrock.npm).toBe('@ai-sdk/amazon-bedrock');
    expect(projectedProviders.bedrock).toBeUndefined();
    expect(Object.keys(projectedProviders).length).toBeGreaterThan(0);
  });
});
