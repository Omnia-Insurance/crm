import { useAuth } from '@/auth/hooks/useAuth';
import { useSignInWithGoogle } from '@/auth/sign-in-up/hooks/useSignInWithGoogle';
import { BILLING_CHECKOUT_SESSION_DEFAULT_VALUE } from '@/settings/billing/constants/BillingCheckoutSessionDefaultValue';
import { renderHook } from '@testing-library/react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

jest.mock('react-router-dom', () => ({
  useParams: jest.fn(),
  useSearchParams: jest.fn(),
  Link: jest.fn(),
}));

jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

describe('useSignInWithGoogle', () => {
  const Wrapper = getJestMetadataAndApolloMocksWrapper({
    apolloMocks: [],
  });

  it('should call signInWithGoogle with correct params', () => {
    const signInWithGoogleMock = jest.fn();
    const mockUseParams = { workspaceInviteHash: 'testHash' };

    const mockSearchParams = new URLSearchParams(
      'inviteToken=testToken&billingCheckoutSessionState={"plan":"Pro","interval":"Month","requirePaymentMethod":true}',
    );

    (useParams as jest.Mock).mockReturnValue(mockUseParams);
    (useSearchParams as jest.Mock).mockReturnValue([mockSearchParams]);
    (useAuth as jest.Mock).mockReturnValue({
      signInWithGoogle: signInWithGoogleMock,
    });

    const { result } = renderHook(() => useSignInWithGoogle(), {
      wrapper: Wrapper,
    });
    result.current.signInWithGoogle({
      action: 'join-workspace',
    });

    expect(signInWithGoogleMock).toHaveBeenCalledWith({
      action: 'join-workspace',
      workspaceInviteHash: 'testHash',
      workspacePersonalInviteToken: 'testToken',
      billingCheckoutSession: BILLING_CHECKOUT_SESSION_DEFAULT_VALUE,
    });
  });

  it('should call signInWithGoogle with undefined invite token if not present', () => {
    const signInWithGoogleMock = jest.fn();
    const mockUseParams = { workspaceInviteHash: 'testHash' };
    const mockSearchParams = new URLSearchParams();

    (useParams as jest.Mock).mockReturnValue(mockUseParams);
    (useSearchParams as jest.Mock).mockReturnValue([mockSearchParams]);
    (useAuth as jest.Mock).mockReturnValue({
      signInWithGoogle: signInWithGoogleMock,
    });

    const { result } = renderHook(() => useSignInWithGoogle(), {
      wrapper: Wrapper,
    });
    result.current.signInWithGoogle({
      action: 'join-workspace',
    });

    expect(signInWithGoogleMock).toHaveBeenCalledWith({
      action: 'join-workspace',
      workspaceInviteHash: 'testHash',
      workspacePersonalInviteToken: undefined,
      billingCheckoutSession: BILLING_CHECKOUT_SESSION_DEFAULT_VALUE,
    });
  });

  // OMNIA-CUSTOM: trusted sibling URL (omniaagent.com dashboard)
  it('should forward a trusted sibling URL from the query as returnToPath', () => {
    const signInWithGoogleMock = jest.fn();

    window.history.replaceState(
      {},
      '',
      `/welcome?postSignInRedirect=${encodeURIComponent('https://localhost/retention')}`,
    );
    (useParams as jest.Mock).mockReturnValue({});
    (useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams()]);
    (useAuth as jest.Mock).mockReturnValue({
      signInWithGoogle: signInWithGoogleMock,
    });

    const { result } = renderHook(() => useSignInWithGoogle(), {
      wrapper: Wrapper,
    });
    result.current.signInWithGoogle({
      action: 'join-workspace',
    });

    expect(signInWithGoogleMock).toHaveBeenCalledWith(
      expect.objectContaining({ returnToPath: 'https://localhost/retention' }),
    );

    window.history.replaceState({}, '', '/');
  });
});
