import { isAppEffectRedirectEnabledState } from '@/auth/states/isAppEffectRedirectEnabledState';
import { useAuth } from '@/auth/hooks/useAuth';
import { useRedirectToTrustedExternalReturnUrl } from '@/auth/sign-in-up/hooks/useRedirectToTrustedExternalReturnUrl';
import { getTrustedExternalReturnUrl } from '@/auth/sign-in-up/utils/getTrustedExternalReturnUrl';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useLingui } from '@lingui/react/macro';
import { AppPath } from 'twenty-shared/types';
import { useToast } from 'twenty-ui/components/feedback';
import { useNavigateApp } from '~/hooks/useNavigateApp';

export const useVerifyLogin = () => {
  const { enqueueToast } = useToast();
  const navigate = useNavigateApp();
  const setIsAppEffectRedirectEnabled = useSetAtomState(
    isAppEffectRedirectEnabledState,
  );
  const { getAuthTokensFromLoginToken } = useAuth();
  const { t } = useLingui();
  // OMNIA-CUSTOM: /verify can carry a trusted sibling URL (omniaagent.com dashboard)
  // through SSO; it is read before the token swap, which may navigate away
  const { redirectToTrustedExternalReturnUrl } =
    useRedirectToTrustedExternalReturnUrl();

  const verifyLoginToken = async (loginToken: string) => {
    const trustedExternalReturnUrl = getTrustedExternalReturnUrl();
    // Keeps PageChangeEffect from consuming returnToPath mid token swap
    setIsAppEffectRedirectEnabled(false);
    try {
      await getAuthTokensFromLoginToken(loginToken);
      await redirectToTrustedExternalReturnUrl(trustedExternalReturnUrl);
    } catch (error) {
      enqueueToast(
        CombinedGraphQLErrors.is(error)
          ? getToastOptionsFromError({ error })
          : { status: 'error', children: t`Authentication failed` },
      );
      navigate(AppPath.SignInUp);
    } finally {
      setIsAppEffectRedirectEnabled(true);
    }
  };

  return { verifyLoginToken };
};
