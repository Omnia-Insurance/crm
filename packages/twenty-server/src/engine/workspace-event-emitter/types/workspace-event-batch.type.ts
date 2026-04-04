import type { FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type EventOrigin } from 'src/engine/twenty-orm/types/event-emission-policy.type';

export type WorkspaceEventBatch<WorkspaceEvent> = {
  name: string;
  workspaceId: string;
  objectMetadata: FlatObjectMetadata;
  events: WorkspaceEvent[];
  origin?: EventOrigin;
};
