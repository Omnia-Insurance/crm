import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ObjectMetadataEntity, FieldMetadataEntity]),
  ],
  providers: [AgentProfileResolverService],
  exports: [AgentProfileResolverService],
})
export class AgentProfileModule {}
