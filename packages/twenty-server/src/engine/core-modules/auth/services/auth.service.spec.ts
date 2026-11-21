import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';

import { AppTokenEntity } from 'src/engine/core-modules/app-token/app-token.entity';
import { ApplicationRegistrationService } from 'src/engine/core-modules/application/application-registration/application-registration.service';
import { AuthSsoService } from 'src/engine/core-modules/auth/services/auth-sso.service';
import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import { CreateSsoConnectedAccountService } from 'src/engine/core-modules/auth/services/create-sso-connected-account.service';
import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { type GoogleRequest } from 'src/engine/core-modules/auth/strategies/google.auth.strategy';
import { AccessTokenService } from 'src/engine/core-modules/auth/token/services/access-token.service';
import { LoginTokenService } from 'src/engine/core-modules/auth/token/services/login-token.service';
import { RefreshTokenService } from 'src/engine/core-modules/auth/token/services/refresh-token.service';
import { SsoExchangeTokenService } from 'src/engine/core-modules/auth/token/services/sso-exchange-token.service';
import { DomainServerConfigService } from 'src/engine/core-modules/domain/domain-server-config/services/domain-server-config.service';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { EmailService } from 'src/engine/core-modules/email/email.service';
import { EventLogEmitterService } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.service';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { GuardRedirectService } from 'src/engine/core-modules/guard-redirect/services/guard-redirect.service';
import { I18nService } from 'src/engine/core-modules/i18n/i18n.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserSessionService } from 'src/engine/core-modules/user-session/services/user-session.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceInvitationService } from 'src/engine/core-modules/workspace-invitation/services/workspace-invitation.service';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { SettingPermissionsService } from 'src/engine/permissions/setting-permissions.service';

const FRONT_URL = 'https://crm.omniaagent.com';
const EMAIL = 'agent@example.com';
const USER_ID = 'user-id';

const workspace = {
  id: 'workspace-id',
  subdomain: 'crm',
  customDomain: null,
  isCustomDomainEnabled: false,
} as WorkspaceEntity;

const buildUrl = ({
  pathname,
  searchParams,
  hash,
}: {
  pathname?: string;
  searchParams?: Record<string, string | number>;
  hash?: string;
}) => {
  const url = new URL(pathname ?? '/', FRONT_URL);

  Object.entries(searchParams ?? {}).forEach(([key, value]) =>
    url.searchParams.set(key, String(value)),
  );

  if (isDefined(hash)) {
    url.hash = hash;
  }

  return url;
};

const buildSocialSsoUser = (
  overrides: Partial<GoogleRequest['user']> = {},
): GoogleRequest['user'] => ({
  email: EMAIL,
  picture: null,
  action: 'list-available-workspaces',
  ...overrides,
});

describe('AuthService', () => {
  let authService: AuthService;
  let userService: jest.Mocked<
    Pick<UserService, 'findUserByEmailWithWorkspaces' | 'markEmailAsVerified'>
  >;

  beforeEach(async () => {
    userService = {
      findUserByEmailWithWorkspaces: jest.fn(),
      markEmailAsVerified: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DomainServerConfigService,
          useValue: {
            getFrontUrl: () => new URL(FRONT_URL),
            buildBaseUrl: buildUrl,
          },
        },
        {
          provide: WorkspaceDomainsService,
          useValue: { buildWorkspaceURL: buildUrl },
        },
        {
          provide: SsoExchangeTokenService,
          useValue: {
            generateSsoExchangeToken: jest
              .fn()
              .mockResolvedValue({ token: 'sso-exchange-token' }),
          },
        },
        {
          provide: LoginTokenService,
          useValue: {
            generateLoginToken: jest
              .fn()
              .mockResolvedValue({ token: 'login-token' }),
          },
        },
        { provide: UserService, useValue: userService },
        ...[
          AccessTokenService,
          RefreshTokenService,
          GuardRedirectService,
          UserWorkspaceService,
          WorkspaceInvitationService,
          AuthSsoService,
          SignInUpService,
          SettingPermissionsService,
          TwentyConfigService,
          EmailService,
          I18nService,
          EventLogEmitterService,
          ApplicationRegistrationService,
          FeatureFlagService,
          CreateSsoConnectedAccountService,
          UserSessionService,
        ].map((provide) => ({ provide, useValue: {} })),
        ...[WorkspaceEntity, UserEntity, AppTokenEntity].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: {},
        })),
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('computeRedirectURI', () => {
    const getForwardedReturnToPath = (returnToPath: string) =>
      new URL(
        authService.computeRedirectURI({
          loginToken: 'login-token',
          workspace,
          returnToPath,
        }),
      ).searchParams.get('returnToPath');

    it.each([
      '/objects/policies',
      '/objects/policies?viewId=1#top',
      'https://crm.omniaagent.com/settings/profile',
      'https://omniaagent.com/retention',
      'https://dashboard.omniaagent.com/home',
    ])('forwards %s', (returnToPath) => {
      expect(getForwardedReturnToPath(returnToPath)).toBe(returnToPath);
    });

    it.each([
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      'http://omniaagent.com/retention',
      'https://evil.com',
      'https://omniaagent.com.evil.com',
      'javascript:alert(1)',
      'objects/policies',
    ])('drops %s', (returnToPath) => {
      expect(getForwardedReturnToPath(returnToPath)).toBeNull();
    });
  });

  describe('signInUpWithSocialSso', () => {
    it('forwards only a safe returnToPath to the workspace-agnostic sign-in page', async () => {
      userService.findUserByEmailWithWorkspaces.mockResolvedValue({
        id: USER_ID,
        email: EMAIL,
      } as UserEntity);

      const trustedRedirectUrl = new URL(
        await authService.signInUpWithSocialSso(
          buildSocialSsoUser({
            returnToPath: 'https://omniaagent.com/retention',
          }),
          AuthProviderEnum.Google,
        ),
      );
      const untrustedRedirectUrl = new URL(
        await authService.signInUpWithSocialSso(
          buildSocialSsoUser({ returnToPath: '//evil.com' }),
          AuthProviderEnum.Google,
        ),
      );

      expect(trustedRedirectUrl.searchParams.get('returnToPath')).toBe(
        'https://omniaagent.com/retention',
      );
      expect(untrustedRedirectUrl.searchParams.get('returnToPath')).toBeNull();
      expect(untrustedRedirectUrl.hash).toBe(
        '#ssoExchangeToken=sso-exchange-token',
      );
    });

    describe('workspace sign-in', () => {
      const signInToWorkspace = async (
        user: UserEntity,
        returnToPath?: string,
      ) => {
        userService.findUserByEmailWithWorkspaces.mockResolvedValue(user);
        jest
          .spyOn(authService, 'findWorkspaceForSignInUp')
          .mockResolvedValue(workspace);
        jest
          .spyOn(authService, 'findInvitationForSignInUp')
          .mockResolvedValue(undefined);
        jest
          .spyOn(authService, 'checkAccessForSignIn')
          .mockResolvedValue(undefined);
        jest.spyOn(authService, 'signInUp').mockResolvedValue({
          user,
          workspace,
        } as Awaited<ReturnType<AuthService['signInUp']>>);
        jest
          .spyOn(authService, 'createSsoConnectedAccountIfFeatureFlagIsOn')
          .mockResolvedValue(undefined);

        return new URL(
          await authService.signInUpWithSocialSso(
            buildSocialSsoUser({ workspaceId: workspace.id, returnToPath }),
            AuthProviderEnum.Google,
          ),
        );
      };

      it('forwards only a safe returnToPath to /verify', async () => {
        const verifiedUser = {
          id: USER_ID,
          email: EMAIL,
          isEmailVerified: true,
        } as UserEntity;

        const trustedRedirectUrl = await signInToWorkspace(
          verifiedUser,
          'https://omniaagent.com/retention',
        );
        const untrustedRedirectUrl = await signInToWorkspace(
          verifiedUser,
          'https://evil.com',
        );

        expect(trustedRedirectUrl.searchParams.get('returnToPath')).toBe(
          'https://omniaagent.com/retention',
        );
        expect(untrustedRedirectUrl.pathname).toBe('/verify');
        expect(
          untrustedRedirectUrl.searchParams.get('returnToPath'),
        ).toBeNull();
      });

      it('marks an existing password-less unverified user as verified', async () => {
        const redirectUrl = await signInToWorkspace({
          id: USER_ID,
          email: EMAIL,
          isEmailVerified: false,
        } as UserEntity);

        expect(userService.markEmailAsVerified).toHaveBeenCalledWith(USER_ID);
        expect(redirectUrl.pathname).toBe('/verify');
        expect(redirectUrl.searchParams.get('loginToken')).toBe('login-token');
      });

      it.each([
        ['an already verified user', { isEmailVerified: true }],
        [
          'an unverified user who has a password',
          { isEmailVerified: false, passwordHash: 'password-hash' },
        ],
      ])('does not mark %s as verified', async (_, userOverrides) => {
        const redirectUrl = await signInToWorkspace({
          id: USER_ID,
          email: EMAIL,
          ...userOverrides,
        } as UserEntity);

        expect(userService.markEmailAsVerified).not.toHaveBeenCalled();
        expect(redirectUrl.searchParams.get('loginToken')).toBe('login-token');
      });
    });
  });
});
