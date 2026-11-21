import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { join } from 'path';
import { isDefined } from 'twenty-shared/utils';

import { ClientConfigModule } from 'src/engine/core-modules/client-config/client-config.module';
import { WorkspaceDomainsModule } from 'src/engine/core-modules/domain/workspace-domains/workspace-domains.module';
import { DOCUMENT_CONTENT_SECURITY_POLICY_DIRECTIVES } from 'src/engine/core-modules/frontend/constants/document-content-security-policy-directives.constant';
import { FrontendService } from 'src/engine/core-modules/frontend/frontend.service';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';

@Module({
  imports: [ClientConfigModule, WorkspaceDomainsModule, WorkspaceCacheModule],
  providers: [
    FrontendService,
    { provide: 'FRONTEND_PATH', useValue: join(__dirname, '../../../front') },
  ],
})
export class FrontendModule implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly frontendService: FrontendService,
  ) {}

  onModuleInit() {
    const adapter = this.httpAdapterHost.httpAdapter;

    if (!this.frontendService.isEnabled || !isDefined(adapter)) {
      return;
    }

    const serveStatic = express.static(this.frontendService.frontPath, {
      index: false,
      redirect: false,
      setHeaders: (response, filePath) => {
        if (filePath.toLowerCase().endsWith('.html')) {
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('CDN-Cache-Control', 'no-store');
          response.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
          response.setHeader(
            'Content-Security-Policy',
            `frame-ancestors 'none'; ${DOCUMENT_CONTENT_SECURITY_POLICY_DIRECTIVES}`,
          );
          response.setHeader('X-Frame-Options', 'DENY');
        } else if (response.req.path.startsWith('/assets/')) {
          // OMNIA-CUSTOM: Vite names /assets/ files by content hash, so browsers
          // and Cloudflare can keep them for a year.
          response.setHeader(
            'Cache-Control',
            'public, max-age=31536000, immutable',
          );
        }
      },
    });

    adapter.use((request: Request, response: Response, next: NextFunction) => {
      if (request.path === '/index.html') {
        next();

        return;
      }

      serveStatic(request, response, next);
    });
    // OMNIA-CUSTOM: a missing /assets/ or /images/ file must 404, never fall back
    // to index.html (clients that send no Sec-Fetch-Dest would get the app shell).
    adapter.use((request: Request, response: Response, next: NextFunction) =>
      ['/assets/', '/images/'].some((directory) =>
        request.path.startsWith(directory),
      )
        ? next()
        : this.frontendService.serveDocument(request, response, next),
    );
  }
}
