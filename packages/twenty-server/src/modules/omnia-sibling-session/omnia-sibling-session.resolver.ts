import { UseFilters, UseGuards } from '@nestjs/common';
import { Context, Mutation } from '@nestjs/graphql';

import { type Request } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { AccessTokenService } from 'src/engine/core-modules/auth/token/services/access-token.service';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type RawAuthContext } from 'src/engine/core-modules/auth/types/raw-auth-context.type';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { AuthAuthenticatedAt } from 'src/engine/decorators/auth/auth-authenticated-at.decorator';
import { AuthImpersonationContext } from 'src/engine/decorators/auth/auth-impersonation-context.decorator';
import { AuthProvider } from 'src/engine/decorators/auth/auth-provider.decorator';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AccessPolicyGuard } from 'src/engine/guards/access-policy.guard';
import { isImpersonating } from 'src/engine/guards/utils/is-impersonating.util';
import { buildUserSessionRequiredError } from 'src/engine/guards/utils/is-user-session-principal.util';
import { OmniaSiblingSessionService } from 'src/modules/omnia-sibling-session/omnia-sibling-session.service';

@MetadataResolver()
@UseFilters(AuthGraphqlApiExceptionFilter)
export class OmniaSiblingSessionResolver {
  constructor(
    private readonly accessTokenService: AccessTokenService,
    private readonly omniaSiblingSessionService: OmniaSiblingSessionService,
  ) {}

  @UseGuards(
    AccessPolicyGuard({
      authPrincipals: {
        userSession: {
          standard: true,
          impersonated: true,
          playground: false,
          workspaceAgnostic: false,
        },
        apiKey: false,
        oauthClient: false,
        application: false,
      },
      requiredPermissionFlags: [],
    }),
  )
  @Mutation(() => Boolean)
  async refreshOmniaSiblingSession(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthProvider() authProvider: AuthProviderEnum,
    @AuthImpersonationContext()
    impersonationContext: RawAuthContext['impersonationContext'],
    @AuthAuthenticatedAt() authenticatedAt: Date | undefined,
    @Context() context: { req: Request },
  ): Promise<boolean> {
    // Only cookie sessions carry authenticatedAt, so a bearer access token (the cookie's own) cannot renew itself.
    if (!isDefined(authenticatedAt)) {
      throw buildUserSessionRequiredError();
    }

    const response = context.req.res;

    if (!isDefined(response)) {
      return false;
    }

    const accessToken = await this.accessTokenService.generateAccessToken({
      userId: user.id,
      workspaceId: workspace.id,
      authProvider,
      isImpersonating: isImpersonating(impersonationContext),
      impersonatorUserWorkspaceId:
        impersonationContext?.impersonatorUserWorkspaceId,
      impersonatedUserWorkspaceId:
        impersonationContext?.impersonatedUserWorkspaceId,
    });

    return this.omniaSiblingSessionService.reissue(response, accessToken);
  }
}
