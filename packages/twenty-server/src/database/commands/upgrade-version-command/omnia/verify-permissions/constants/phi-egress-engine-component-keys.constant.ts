import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';

// Commands that move PHI in or out of the CRM; the browser only hides them when their expression checks a role flag
export const PHI_EGRESS_ENGINE_COMPONENT_KEYS: EngineComponentKey[] = [
  EngineComponentKey.EXPORT_RECORDS,
  EngineComponentKey.EXPORT_VIEW,
  EngineComponentKey.EXPORT_FROM_RECORD_INDEX,
  EngineComponentKey.EXPORT_FROM_RECORD_SHOW,
  EngineComponentKey.EXPORT_MULTIPLE_RECORDS,
  EngineComponentKey.IMPORT_RECORDS,
  EngineComponentKey.ASK_AI,
  EngineComponentKey.VIEW_PREVIOUS_AI_CHATS,
  EngineComponentKey.NEW_AI_CHAT,
];
