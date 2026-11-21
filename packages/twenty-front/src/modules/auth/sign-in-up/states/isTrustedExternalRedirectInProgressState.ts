import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const isTrustedExternalRedirectInProgressState =
  createAtomState<boolean>({
    key: 'isTrustedExternalRedirectInProgressState',
    defaultValue: false,
  });
