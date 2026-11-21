import { useMemberSidebarObjectMetadataItems } from '@/navigation-menu-item/display/hooks/useMemberSidebarObjectMetadataItems';
import { NavigationDrawerItemForObjectMetadataItem } from '@/navigation-menu-item/display/object/components/NavigationDrawerItemForObjectMetadataItem';
import { NavigationMenuItemSection } from '@/navigation-menu-item/display/sections/components/NavigationMenuItemSection';
import { useNavigationSection } from '@/ui/navigation/navigation-drawer/hooks/useNavigationSection';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isNonEmptyArray } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

// Same spacing as the read-only workspace tree in WorkspaceSectionContainer.
const StyledContentGapOffset = styled.div`
  margin-top: calc(-1 * ${themeCssVariables.betweenSiblingsGap});
`;

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.betweenSiblingsGap};
  padding-top: ${themeCssVariables.betweenSiblingsGap};
`;

export const OmniaMemberWorkspaceNavigationMenuItems = () => {
  const { t } = useLingui();
  const { isLoaded, objectMetadataItems } =
    useMemberSidebarObjectMetadataItems();
  const { isNavigationSectionOpen, toggleNavigationSection } =
    useNavigationSection(doNotTranslate('Workspace'));

  if (!isLoaded || !isNonEmptyArray(objectMetadataItems)) {
    return null;
  }

  return (
    <NavigationMenuItemSection
      title={t`Workspace`}
      isOpen={isNavigationSectionOpen}
      onToggle={toggleNavigationSection}
      contentWrapper={(children) => (
        <StyledContentGapOffset>{children}</StyledContentGapOffset>
      )}
    >
      <StyledList>
        {objectMetadataItems.map((objectMetadataItem) => (
          <NavigationDrawerItemForObjectMetadataItem
            key={objectMetadataItem.id}
            objectMetadataItem={objectMetadataItem}
          />
        ))}
      </StyledList>
    </NavigationMenuItemSection>
  );
};
