import { Global, Module } from '@nestjs/common';

import { TokenModule } from 'src/engine/core-modules/auth/token/token.module';
import { DomainServerConfigModule } from 'src/engine/core-modules/domain/domain-server-config/domain-server-config.module';
import { JwtModule } from 'src/engine/core-modules/jwt/jwt.module';
import { OmniaSiblingSessionResolver } from 'src/modules/omnia-sibling-session/omnia-sibling-session.resolver';
import { OmniaSiblingSessionService } from 'src/modules/omnia-sibling-session/omnia-sibling-session.service';

// Global so the upstream session services can issue and clear the cookie without importing an Omnia module.
@Global()
@Module({
  imports: [DomainServerConfigModule, JwtModule, TokenModule],
  providers: [OmniaSiblingSessionService, OmniaSiblingSessionResolver],
  exports: [OmniaSiblingSessionService],
})
export class OmniaSiblingSessionModule {}
