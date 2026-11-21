import { Injectable, Logger } from '@nestjs/common';

import { isNumber } from '@sniptt/guards';
import { type CookieOptions, type Response } from 'express';
import ms from 'ms';
import { deriveTrustedParentDomain, isDefined } from 'twenty-shared/utils';

import { type AuthToken } from 'src/engine/core-modules/auth/dto/auth-token.dto';
import { type AccessTokenJwtPayload } from 'src/engine/core-modules/auth/types/access-token-jwt-payload.type';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { DomainServerConfigService } from 'src/engine/core-modules/domain/domain-server-config/services/domain-server-config.service';
import { JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';
import { decodeJwtPayload } from 'src/engine/core-modules/jwt/utils/decode-jwt-payload.util';
import { resolveSessionCookieAccess } from 'src/engine/core-modules/user-session/utils/resolve-session-cookie-access.util';
import { OMNIA_SIBLING_SESSION_COOKIE_NAME } from 'src/modules/omnia-sibling-session/constants/omnia-sibling-session-cookie-name.constant';
import { OMNIA_SIBLING_SESSION_TOKEN_LIFETIME } from 'src/modules/omnia-sibling-session/constants/omnia-sibling-session-token-lifetime.constant';

type SignedAccessTokenJwtPayload = AccessTokenJwtPayload & {
  iat?: number;
  exp?: number;
};

// The dashboard verifies the token against a workspace; a workspace-agnostic token names none.
const decodeWorkspaceAccessToken = (
  token: string,
): SignedAccessTokenJwtPayload | undefined => {
  const payload = decodeJwtPayload<SignedAccessTokenJwtPayload>(token);

  return payload?.type === JwtTokenTypeEnum.ACCESS ? payload : undefined;
};

const buildCookieOptions = (domain: string): CookieOptions => ({
  domain,
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
});

// Write-only mirror for the omniaagent.com dashboard (contract C13): CRM auth never reads this cookie.
@Injectable()
export class OmniaSiblingSessionService {
  private readonly logger = new Logger(OmniaSiblingSessionService.name);

  constructor(
    private readonly domainServerConfigService: DomainServerConfigService,
    private readonly jwtWrapperService: JwtWrapperService,
  ) {}

  // Returns true only once the cookie is written, so a caller never reports a cookie that was skipped.
  issue(response: Response, accessToken: Pick<AuthToken, 'token'>): boolean {
    const payload = decodeWorkspaceAccessToken(accessToken.token);

    if (!isDefined(payload)) {
      return false;
    }

    if (
      !isNumber(payload.exp) ||
      payload.exp * 1000 - Date.now() > ms(OMNIA_SIBLING_SESSION_TOKEN_LIFETIME)
    ) {
      this.logger.warn(
        'Refused an Omnia sibling session token that outlives the sibling lifetime',
      );

      return false;
    }

    const expiresAt = new Date(payload.exp * 1000);

    // Access token only: a refresh token here would outlive the CRM session it came from.
    const cookieValue = JSON.stringify({
      accessOrWorkspaceAgnosticToken: { token: accessToken.token, expiresAt },
    });

    return this.writeCookie(response, (cookieOptions) =>
      response.cookie(OMNIA_SIBLING_SESSION_COOKIE_NAME, cookieValue, {
        ...cookieOptions,
        expires: expiresAt,
      }),
    );
  }

  // A token minted with ACCESS_TOKEN_EXPIRES_IN (7d in the chart) would be refused, so the claims are re-signed.
  async reissue(
    response: Response,
    accessToken: Pick<AuthToken, 'token'>,
  ): Promise<boolean> {
    const payload = decodeWorkspaceAccessToken(accessToken.token);

    if (!isDefined(payload)) {
      return false;
    }

    const { iat: _issuedAt, exp: _expiresAt, ...claims } = payload;

    try {
      const siblingToken = await this.jwtWrapperService.signAsyncOrThrow(
        claims,
        { expiresIn: OMNIA_SIBLING_SESSION_TOKEN_LIFETIME },
      );

      return this.issue(response, { token: siblingToken });
    } catch {
      this.logger.warn('Could not sign the Omnia sibling session token');

      return false;
    }
  }

  clear(response: Response): void {
    this.writeCookie(response, (cookieOptions) =>
      response.clearCookie(OMNIA_SIBLING_SESSION_COOKIE_NAME, cookieOptions),
    );
  }

  // Best effort: the dashboard cookie must never fail the CRM sign-in or sign-out it rides on.
  private writeCookie(
    response: Response,
    write: (cookieOptions: CookieOptions) => void,
  ): boolean {
    try {
      const cookieDomain = this.resolveCookieDomain(response);

      if (!isDefined(cookieDomain)) {
        return false;
      }

      write(buildCookieOptions(cookieDomain));

      return true;
    } catch {
      // The error itself is not logged: cookie serializer errors can echo the value.
      this.logger.warn('Could not write the Omnia sibling session cookie');

      return false;
    }
  }

  // Same opt-in as the session cookie, so a channel that gets no session gets no sibling cookie.
  private resolveCookieDomain(response: Response): string | undefined {
    if (
      !isDefined(response.req) ||
      resolveSessionCookieAccess(response.req) === 'denied'
    ) {
      return undefined;
    }

    // The parent domain external redirects already trust; none on localhost, IPs and apex hosts.
    const parentDomain = deriveTrustedParentDomain(
      this.domainServerConfigService.getFrontUrl().href,
    );

    return isDefined(parentDomain) ? `.${parentDomain}` : undefined;
  }
}
