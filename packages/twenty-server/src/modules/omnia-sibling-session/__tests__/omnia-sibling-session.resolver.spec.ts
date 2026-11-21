import { Test } from '@nestjs/testing';

import { type Request, type Response } from 'express';

import { type AuthToken } from 'src/engine/core-modules/auth/dto/auth-token.dto';
import { AccessTokenService } from 'src/engine/core-modules/auth/token/services/access-token.service';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { AccessPolicyService } from 'src/engine/guards/access-policy/access-policy.service';
import { OmniaSiblingSessionResolver } from 'src/modules/omnia-sibling-session/omnia-sibling-session.resolver';
import { OmniaSiblingSessionService } from 'src/modules/omnia-sibling-session/omnia-sibling-session.service';

const USER = { id: 'user-id' } as AuthContextUser;
const WORKSPACE = { id: 'workspace-id' } as FlatWorkspace;
const AUTHENTICATED_AT = new Date('2026-11-20T09:00:00.000Z');

const FRESH_ACCESS_TOKEN: AuthToken = {
  token: 'fresh-access-token',
  expiresAt: new Date('2026-11-20T09:30:00.000Z'),
};

describe('OmniaSiblingSessionResolver', () => {
  let resolver: OmniaSiblingSessionResolver;
  let generateAccessToken: jest.Mock;
  let reissue: jest.Mock;

  const response = {} as Response;
  const context = { req: { res: response } as unknown as Request };

  beforeEach(async () => {
    generateAccessToken = jest.fn().mockResolvedValue(FRESH_ACCESS_TOKEN);
    reissue = jest.fn().mockResolvedValue(true);

    const module = await Test.createTestingModule({
      providers: [
        OmniaSiblingSessionResolver,
        { provide: AccessTokenService, useValue: { generateAccessToken } },
        { provide: OmniaSiblingSessionService, useValue: { reissue } },
        { provide: AccessPolicyService, useValue: {} },
      ],
    }).compile();

    resolver = module.get(OmniaSiblingSessionResolver);
  });

  it('should mint a fresh access token for the current session and set the sibling cookie', async () => {
    const result = await resolver.refreshOmniaSiblingSession(
      USER,
      WORKSPACE,
      AuthProviderEnum.Google,
      undefined,
      AUTHENTICATED_AT,
      context,
    );

    expect(result).toBe(true);
    expect(generateAccessToken).toHaveBeenCalledWith({
      userId: 'user-id',
      workspaceId: 'workspace-id',
      authProvider: AuthProviderEnum.Google,
      isImpersonating: false,
      impersonatorUserWorkspaceId: undefined,
      impersonatedUserWorkspaceId: undefined,
    });
    expect(reissue).toHaveBeenCalledWith(response, FRESH_ACCESS_TOKEN);
  });

  it('should report false when no cookie was written', async () => {
    reissue.mockResolvedValueOnce(false);

    const result = await resolver.refreshOmniaSiblingSession(
      USER,
      WORKSPACE,
      AuthProviderEnum.Google,
      undefined,
      AUTHENTICATED_AT,
      context,
    );

    expect(result).toBe(false);
  });

  it('should keep the impersonation claims of an impersonated session', async () => {
    await resolver.refreshOmniaSiblingSession(
      USER,
      WORKSPACE,
      AuthProviderEnum.Impersonation,
      {
        impersonatorUserWorkspaceId: 'impersonator-user-workspace-id',
        impersonatedUserWorkspaceId: 'impersonated-user-workspace-id',
      },
      AUTHENTICATED_AT,
      context,
    );

    expect(generateAccessToken).toHaveBeenCalledWith({
      userId: 'user-id',
      workspaceId: 'workspace-id',
      authProvider: AuthProviderEnum.Impersonation,
      isImpersonating: true,
      impersonatorUserWorkspaceId: 'impersonator-user-workspace-id',
      impersonatedUserWorkspaceId: 'impersonated-user-workspace-id',
    });
  });

  it('should refuse a bearer access token, which carries no session', async () => {
    await expect(
      resolver.refreshOmniaSiblingSession(
        USER,
        WORKSPACE,
        AuthProviderEnum.Google,
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow('This endpoint requires a user session');

    expect(generateAccessToken).not.toHaveBeenCalled();
    expect(reissue).not.toHaveBeenCalled();
  });

  it('should not mint a token when there is no response to set it on', async () => {
    const result = await resolver.refreshOmniaSiblingSession(
      USER,
      WORKSPACE,
      AuthProviderEnum.Google,
      undefined,
      AUTHENTICATED_AT,
      { req: {} as Request },
    );

    expect(result).toBe(false);
    expect(generateAccessToken).not.toHaveBeenCalled();
    expect(reissue).not.toHaveBeenCalled();
  });
});
