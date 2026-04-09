import { NavigationDrawer } from '@/ui/navigation/navigation-drawer/components/NavigationDrawer';

import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { getObjectColorWithFallback } from '@/object-metadata/utils/getObjectColorWithFallback';
import { NavigationDrawerAnimatedCollapseWrapper } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerAnimatedCollapseWrapper';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { NavigationDrawerSection } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerSection';
import { NavigationDrawerSectionTitle } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerSectionTitle';
import { DEFAULT_WORKSPACE_NAME } from '@/ui/navigation/navigation-drawer/constants/DefaultWorkspaceName';
import { useNavigationSection } from '@/ui/navigation/navigation-drawer/hooks/useNavigationSection';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import {
  type IconComponent,
  IconSearch,
  IconSettings,
  IconShield,
  useIcons,
} from 'twenty-ui/display';
import { getOsControlSymbol, useIsMobile } from 'twenty-ui/utilities';

const StyledMainSectionWrapper = styled.div`
  min-height: fit-content;
`;

const WORKSPACE_NAVIGATION_SECTION_ID = 'SignInBackgroundMockWorkspace';

export type SignInAppNavigationDrawerMockProps = {
  className?: string;
};

export const SignInAppNavigationDrawerMock = ({
  className,
}: SignInAppNavigationDrawerMockProps) => {
  const isMobile = useIsMobile();
  const { t } = useLingui();
  const { getIcon } = useIcons();
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const { isNavigationSectionOpen, toggleNavigationSection } =
    useNavigationSection(WORKSPACE_NAVIGATION_SECTION_ID);

  const getWorkspaceNavigationItem = (
    objectNameSingular: string,
    label: string,
    fallbackIcon?: IconComponent,
    active = false,
  ) => {
    const objectMetadataItem = objectMetadataItems.find(
      (metadataItem) => metadataItem.nameSingular === objectNameSingular,
    );

    const Icon = isDefined(objectMetadataItem)
      ? (getIcon(objectMetadataItem.icon) ?? fallbackIcon)
      : fallbackIcon;

    if (!isDefined(Icon)) {
      return null;
    }

    return {
      key: objectNameSingular,
      label: objectMetadataItem?.labelPlural ?? label,
      Icon,
      active,
      iconColor: isDefined(objectMetadataItem)
        ? getObjectColorWithFallback(objectMetadataItem)
        : null,
    };
  };

  const workspaceNavigationItems = [
    getWorkspaceNavigationItem('person', t`Leads`, undefined, true),
    getWorkspaceNavigationItem('policy', t`Policies`, IconShield),
    getWorkspaceNavigationItem('note', t`Notes`),
    getWorkspaceNavigationItem('task', t`Tasks`),
  ].filter(isDefined);

  return (
    <NavigationDrawer className={className} title={DEFAULT_WORKSPACE_NAME}>
      {!isMobile && (
        <StyledMainSectionWrapper>
          <NavigationDrawerSection>
            <NavigationDrawerItem
              label={t`Search`}
              Icon={IconSearch}
              onClick={() => {}}
              modifier={{ keyboard: [getOsControlSymbol(), 'K'] }}
            />
            <NavigationDrawerItem
              label={t`Settings`}
              to={getSettingsPath(SettingsPath.ProfilePage)}
              onClick={() => {}}
              Icon={IconSettings}
            />
          </NavigationDrawerSection>
        </StyledMainSectionWrapper>
      )}
      <NavigationDrawerSection>
        <NavigationDrawerAnimatedCollapseWrapper>
          <NavigationDrawerSectionTitle
            label={t`Workspace`}
            onClick={toggleNavigationSection}
            isOpen={isNavigationSectionOpen}
          />
        </NavigationDrawerAnimatedCollapseWrapper>
        {isNavigationSectionOpen &&
          workspaceNavigationItems.map((workspaceNavigationItem) => (
            <NavigationDrawerItem
              key={workspaceNavigationItem.key}
              label={workspaceNavigationItem.label}
              Icon={workspaceNavigationItem.Icon}
              iconColor={workspaceNavigationItem.iconColor}
              active={workspaceNavigationItem.active}
              onClick={() => {}}
            />
          ))}
      </NavigationDrawerSection>
    </NavigationDrawer>
  );
};
