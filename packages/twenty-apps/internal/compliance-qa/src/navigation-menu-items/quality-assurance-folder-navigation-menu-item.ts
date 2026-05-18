import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

export const QUALITY_ASSURANCE_FOLDER_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER =
  '67ab4678-b1a2-4491-9346-52f7425db6f4';

export default defineNavigationMenuItem({
  universalIdentifier:
    QUALITY_ASSURANCE_FOLDER_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'Quality Assurance',
  icon: 'IconClipboardCheck',
  position: 1,
  type: NavigationMenuItemType.FOLDER,
});
