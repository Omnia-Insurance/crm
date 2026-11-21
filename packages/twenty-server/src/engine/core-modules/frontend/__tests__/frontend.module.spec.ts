import { type HttpAdapterHost } from '@nestjs/core';

import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

import { FrontendModule } from 'src/engine/core-modules/frontend/frontend.module';
import { type FrontendService } from 'src/engine/core-modules/frontend/frontend.service';
import { isFrontendDocumentRequest } from 'src/engine/core-modules/frontend/utils/is-frontend-document-request.util';

jest.mock('src/engine/core-modules/client-config/client-config.module', () => ({
  ClientConfigModule: class {},
}));
jest.mock(
  'src/engine/core-modules/domain/workspace-domains/workspace-domains.module',
  () => ({ WorkspaceDomainsModule: class {} }),
);
jest.mock('src/engine/workspace-cache/workspace-cache.module', () => ({
  WorkspaceCacheModule: class {},
}));
jest.mock('src/engine/core-modules/frontend/frontend.service', () => ({
  FrontendService: class {},
}));

const HASHED_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

describe('FrontendModule static files', () => {
  let frontPath: string;
  let app: express.Express;

  beforeAll(() => {
    frontPath = mkdtempSync(join(tmpdir(), 'twenty-front-'));
    mkdirSync(join(frontPath, 'assets'));
    mkdirSync(join(frontPath, 'images'));
    writeFileSync(join(frontPath, 'assets', 'index-a1b2c3.js'), 'export {};');
    writeFileSync(join(frontPath, 'images', 'logo.svg'), '<svg></svg>');
  });

  afterAll(() => {
    rmSync(frontPath, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.useRealTimers();
    app = express();

    // Same gate as FrontendService.serveDocument, without the HTML rendering
    const frontendService = {
      isEnabled: true,
      frontPath,
      serveDocument: (
        documentRequest: Request,
        response: Response,
        next: NextFunction,
      ) =>
        isFrontendDocumentRequest(documentRequest)
          ? response.setHeader('Cache-Control', 'no-store').type('html').end()
          : next(),
    } as unknown as FrontendService;

    new FrontendModule(
      { httpAdapter: { use: app.use.bind(app) } } as unknown as HttpAdapterHost,
      frontendService,
    ).onModuleInit();
  });

  it('caches hashed build assets for a year', async () => {
    await request(app)
      .get('/assets/index-a1b2c3.js')
      .expect(200)
      .expect('Cache-Control', HASHED_ASSET_CACHE_CONTROL);
  });

  it('does not mark unhashed images immutable', async () => {
    const response = await request(app).get('/images/logo.svg').expect(200);

    expect(response.headers['cache-control']).not.toBe(
      HASHED_ASSET_CACHE_CONTROL,
    );
  });

  it.each(['/assets/index-d4e5f6.js', '/images/missing.png'])(
    'answers 404 instead of index.html for a missing %s',
    async (pathname) => {
      await request(app).get(pathname).set('Accept', '*/*').expect(404);
      await request(app)
        .get(pathname)
        .set('Accept', 'text/html')
        .set('Sec-Fetch-Dest', 'document')
        .expect(404);
    },
  );

  it('still serves the app document for client routes', async () => {
    await request(app)
      .get('/objects/policies')
      .set('Accept', 'text/html')
      .expect(200)
      .expect('Content-Type', /html/);
  });
});
