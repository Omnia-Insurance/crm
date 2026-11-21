import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';

// Moves no PHI, so a missing role flag gate is only reported as a warning
export const LAYOUT_ENGINE_COMPONENT_KEYS: EngineComponentKey[] = [
  EngineComponentKey.EDIT_RECORD_PAGE_LAYOUT,
];
