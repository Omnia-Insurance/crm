import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import express, { type Response } from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { SESSION_COOKIE_OPT_IN_HEADER_NAME } from 'twenty-shared/constants';

import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { DomainServerConfigService } from 'src/engine/core-modules/domain/domain-server-config/services/domain-server-config.service';
import { JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';
import { decodeJwtPayload } from 'src/engine/core-modules/jwt/utils/decode-jwt-payload.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { OmniaSiblingSessionService } from 'src/modules/omnia-sibling-session/omnia-sibling-session.service';

const OPTED_IN_HEADERS = { [SESSION_COOKIE_OPT_IN_HEADER_NAME]: '1' };

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const SHORT_LIVED_EXPIRES_AT_SECONDS = nowInSeconds() + 20 * 60;
const SHORT_LIVED_EXPIRES_AT = new Date(SHORT_LIVED_EXPIRES_AT_SECONDS * 1000);

const ACCESS_CLAIMS = {
  sub: 'user-id',
  userId: 'user-id',
  type: JwtTokenTypeEnum.ACCESS,
  workspaceId: 'workspace-id',
  userWorkspaceId: 'user-workspace-id',
};

const buildUnsignedJwt = (payload: Record<string, unknown>): string =>
  [{ alg: 'HS256', typ: 'JWT' }, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .concat('signature')
    .join('.');

const ACCESS_TOKEN = {
  token: buildUnsignedJwt({
    ...ACCESS_CLAIMS,
    exp: SHORT_LIVED_EXPIRES_AT_SECONDS,
  }),
};

// ACCESS_TOKEN_EXPIRES_IN in the Helm chart.
const SEVEN_DAY_ACCESS_TOKEN = {
  token: buildUnsignedJwt({
    ...ACCESS_CLAIMS,
    iat: nowInSeconds(),
    exp: nowInSeconds() + 7 * 24 * 60 * 60,
  }),
};

const WORKSPACE_AGNOSTIC_TOKEN = {
  token: buildUnsignedJwt({
    type: JwtTokenTypeEnum.WORKSPACE_AGNOSTIC,
    exp: SHORT_LIVED_EXPIRES_AT_SECONDS,
  }),
};

const parseSetCookieHeader = (setCookieHeader: string) => {
  const [nameAndValue, ...attributes] = setCookieHeader.split('; ');
  const separatorIndex = nameAndValue.indexOf('=');

  return {
    name: nameAndValue.slice(0, separatorIndex),
    value: nameAndValue.slice(separatorIndex + 1),
    attributes: [...attributes].sort(),
  };
};

const parseCookieToken = (setCookieHeader: string): string =>
  JSON.parse(decodeURIComponent(parseSetCookieHeader(setCookieHeader).value))
    .accessOrWorkspaceAgnosticToken.token;

describe('OmniaSiblingSessionService', () => {
  let service: OmniaSiblingSessionService;
  let configVariables: Record<string, string | undefined>;
  let signAsyncOrThrow: jest.Mock;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    configVariables = {
      FRONTEND_URL: 'https://crm.omniaagent.com',
      SERVER_URL: 'https://crm.omniaagent.com',
    };

    signAsyncOrThrow = jest.fn(
      async (payload: object, options: { expiresIn: string }) =>
        jwt.sign(payload, 'test-secret', {
          expiresIn: options.expiresIn as jwt.SignOptions['expiresIn'],
        }),
    );

    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [
        OmniaSiblingSessionService,
        DomainServerConfigService,
        {
          provide: TwentyConfigService,
          useValue: { get: (key: string) => configVariables[key] },
        },
        { provide: JwtWrapperService, useValue: { signAsyncOrThrow } },
      ],
    }).compile();

    service = module.get(OmniaSiblingSessionService);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // Goes through a real Express response, so the header is exactly what the browser receives.
  const collectSetCookieHeaders = async (
    writeCookies: (response: Response) => unknown,
    headers: Record<string, string> = OPTED_IN_HEADERS,
  ): Promise<string[]> => {
    const app = express();

    app.get('/', (_request, response, next) => {
      Promise.resolve()
        .then(() => writeCookies(response))
        .then(() => response.end(), next);
    });

    // A throwing call answers 500, so a 200 also proves the call never threw.
    const response = await request(app).get('/').set(headers).expect(200);
    const setCookieHeaders = response.headers['set-cookie'] as unknown as
      | string[]
      | undefined;

    return setCookieHeaders ?? [];
  };

  describe('issue', () => {
    it('should set an httpOnly, Secure, SameSite=Lax parent-domain cookie that expires with the token', async () => {
      let isIssued = false;

      const setCookieHeaders = await collectSetCookieHeaders((response) => {
        isIssued = service.issue(response, ACCESS_TOKEN);
      });

      expect(isIssued).toBe(true);
      expect(setCookieHeaders).toHaveLength(1);

      const { name, attributes } = parseSetCookieHeader(setCookieHeaders[0]);

      expect(name).toBe('tokenPair');
      expect(attributes).toEqual(
        [
          'Domain=.omniaagent.com',
          'Path=/',
          `Expires=${SHORT_LIVED_EXPIRES_AT.toUTCString()}`,
          'HttpOnly',
          'Secure',
          'SameSite=Lax',
        ].sort(),
      );
    });

    it('should carry the access token in the shape the dashboard parses, without a refresh token', async () => {
      const [setCookieHeader] = await collectSetCookieHeaders((response) =>
        service.issue(response, ACCESS_TOKEN),
      );

      const { value } = parseSetCookieHeader(setCookieHeader);

      expect(JSON.parse(decodeURIComponent(value))).toEqual({
        accessOrWorkspaceAgnosticToken: {
          token: ACCESS_TOKEN.token,
          expiresAt: SHORT_LIVED_EXPIRES_AT.toISOString(),
        },
      });
    });

    it('should refuse a token that outlives the sibling lifetime, with a fixed warning', async () => {
      let isIssued = true;

      const setCookieHeaders = await collectSetCookieHeaders((response) => {
        isIssued = service.issue(response, SEVEN_DAY_ACCESS_TOKEN);
      });

      expect(isIssued).toBe(false);
      expect(setCookieHeaders).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(
        SEVEN_DAY_ACCESS_TOKEN.token,
      );
    });

    it('should refuse a token without an expiry', async () => {
      const setCookieHeaders = await collectSetCookieHeaders((response) =>
        service.issue(response, { token: buildUnsignedJwt(ACCESS_CLAIMS) }),
      );

      expect(setCookieHeaders).toEqual([]);
    });

    it('should skip workspace-agnostic tokens', async () => {
      let isIssued = true;

      const setCookieHeaders = await collectSetCookieHeaders((response) => {
        isIssued = service.issue(response, WORKSPACE_AGNOSTIC_TOKEN);
      });

      expect(isIssued).toBe(false);
      expect(setCookieHeaders).toEqual([]);
    });

    it('should skip a token it cannot decode', async () => {
      const setCookieHeaders = await collectSetCookieHeaders((response) =>
        service.issue(response, { token: 'not-a-jwt' }),
      );

      expect(setCookieHeaders).toEqual([]);
    });

    it.each([
      ['https://crm.omniaagent.com', 'Domain=.omniaagent.com'],
      ['https://crm.staging.omniaagent.com', 'Domain=.staging.omniaagent.com'],
    ])(
      'should share a front served from %s with its siblings',
      async (frontendUrl, expectedDomainAttribute) => {
        configVariables.FRONTEND_URL = frontendUrl;

        const [setCookieHeader] = await collectSetCookieHeaders((response) =>
          service.issue(response, ACCESS_TOKEN),
        );

        expect(parseSetCookieHeader(setCookieHeader).attributes).toContain(
          expectedDomainAttribute,
        );
      },
    );

    it('should derive the domain from SERVER_URL when FRONTEND_URL is unset', async () => {
      configVariables.FRONTEND_URL = undefined;

      const [setCookieHeader] = await collectSetCookieHeaders((response) =>
        service.issue(response, ACCESS_TOKEN),
      );

      expect(parseSetCookieHeader(setCookieHeader).attributes).toContain(
        'Domain=.omniaagent.com',
      );
    });

    // An apex host has no parent to share with short of its public suffix.
    it.each([
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'https://omniaagent.com',
    ])(
      'should not set a cookie when the front is served from %s',
      async (frontendUrl) => {
        configVariables.FRONTEND_URL = frontendUrl;

        let isIssued = true;

        const setCookieHeaders = await collectSetCookieHeaders((response) => {
          isIssued = service.issue(response, ACCESS_TOKEN);
        });

        expect(isIssued).toBe(false);
        expect(setCookieHeaders).toEqual([]);
      },
    );

    it('should not set a cookie on a request that did not opt in to session cookies', async () => {
      let isIssued = true;

      const setCookieHeaders = await collectSetCookieHeaders((response) => {
        isIssued = service.issue(response, ACCESS_TOKEN);
      }, {});

      expect(isIssued).toBe(false);
      expect(setCookieHeaders).toEqual([]);
    });

    it('should swallow a cookie it cannot write, without logging the token', async () => {
      // The cookie serializer rejects underscores in a domain.
      configVariables.FRONTEND_URL = 'https://crm.omnia_agent.com';

      let isIssued = true;

      const setCookieHeaders = await collectSetCookieHeaders((response) => {
        isIssued = service.issue(response, ACCESS_TOKEN);
      });

      expect(isIssued).toBe(false);
      expect(setCookieHeaders).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(
        ACCESS_TOKEN.token,
      );
    });
  });

  describe('reissue', () => {
    it('should re-sign the claims of a 7-day access token with the 30-minute sibling lifetime', async () => {
      let isIssued = false;

      const [setCookieHeader] = await collectSetCookieHeaders(
        async (response) => {
          isIssued = await service.reissue(response, SEVEN_DAY_ACCESS_TOKEN);
        },
      );

      expect(isIssued).toBe(true);
      expect(signAsyncOrThrow).toHaveBeenCalledWith(ACCESS_CLAIMS, {
        expiresIn: '30m',
      });

      const siblingToken = parseCookieToken(setCookieHeader);
      const siblingPayload = decodeJwtPayload<{ exp: number }>(siblingToken);

      expect(siblingToken).not.toBe(SEVEN_DAY_ACCESS_TOKEN.token);
      expect(siblingPayload).toMatchObject(ACCESS_CLAIMS);
      expect(siblingPayload?.exp).toBeLessThanOrEqual(nowInSeconds() + 30 * 60);
    });

    it('should not re-sign a workspace-agnostic token', async () => {
      let isIssued = true;

      const setCookieHeaders = await collectSetCookieHeaders(
        async (response) => {
          isIssued = await service.reissue(response, WORKSPACE_AGNOSTIC_TOKEN);
        },
      );

      expect(isIssued).toBe(false);
      expect(signAsyncOrThrow).not.toHaveBeenCalled();
      expect(setCookieHeaders).toEqual([]);
    });

    it('should report false without throwing when signing fails', async () => {
      signAsyncOrThrow.mockRejectedValueOnce(new Error('No signing key'));

      let isIssued = true;

      const setCookieHeaders = await collectSetCookieHeaders(
        async (response) => {
          isIssued = await service.reissue(response, SEVEN_DAY_ACCESS_TOKEN);
        },
      );

      expect(isIssued).toBe(false);
      expect(setCookieHeaders).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should report false when no cookie can be written', async () => {
      configVariables.FRONTEND_URL = 'http://localhost:3001';

      let isIssued = true;

      await collectSetCookieHeaders(async (response) => {
        isIssued = await service.reissue(response, SEVEN_DAY_ACCESS_TOKEN);
      });

      expect(isIssued).toBe(false);
    });
  });

  describe('clear', () => {
    it('should expire the cookie with the same domain, path and flags', async () => {
      const setCookieHeaders = await collectSetCookieHeaders((response) =>
        service.clear(response),
      );

      expect(setCookieHeaders).toHaveLength(1);

      const { name, value, attributes } = parseSetCookieHeader(
        setCookieHeaders[0],
      );

      expect(name).toBe('tokenPair');
      expect(value).toBe('');
      expect(attributes).toEqual(
        [
          'Domain=.omniaagent.com',
          'Path=/',
          `Expires=${new Date(1).toUTCString()}`,
          'HttpOnly',
          'Secure',
          'SameSite=Lax',
        ].sort(),
      );
    });

    it('should not touch cookies when the front is served from localhost', async () => {
      configVariables.FRONTEND_URL = 'http://localhost:3001';

      const setCookieHeaders = await collectSetCookieHeaders((response) =>
        service.clear(response),
      );

      expect(setCookieHeaders).toEqual([]);
    });
  });
});
