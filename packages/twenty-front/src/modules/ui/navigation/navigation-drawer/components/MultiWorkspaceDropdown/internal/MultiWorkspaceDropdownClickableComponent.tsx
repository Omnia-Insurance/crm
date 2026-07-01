import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import {
  StyledContainer,
  StyledIconChevronDown,
  StyledLabel,
  StyledLabelWrapper,
} from '@/ui/navigation/navigation-drawer/components/MultiWorkspaceDropdown/internal/MultiWorkspacesDropdownStyles';
import { NavigationDrawerAnimatedCollapseWrapper } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerAnimatedCollapseWrapper';
import { DEFAULT_WORKSPACE_LOGO } from '@/ui/navigation/navigation-drawer/constants/DefaultWorkspaceLogo';
import { DEFAULT_WORKSPACE_NAME } from '@/ui/navigation/navigation-drawer/constants/DefaultWorkspaceName';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';
import { useContext } from 'react';
import { Avatar } from 'twenty-ui/data-display';
import { ThemeContext } from 'twenty-ui/theme-constants';

type MultiWorkspaceDropdownClickableComponentProps = {
  disabled?: boolean;
};

export const MultiWorkspaceDropdownClickableComponent = ({
  disabled,
}: MultiWorkspaceDropdownClickableComponentProps) => {
  const { theme } = useContext(ThemeContext);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const workspacePublicData = useAtomStateValue(workspacePublicDataState);

  const isNavigationDrawerExpanded = useAtomStateValue(
    isNavigationDrawerExpandedState,
  );

  const workspaceDisplayName =
    currentWorkspace?.displayName ??
    workspacePublicData?.displayName ??
    DEFAULT_WORKSPACE_NAME;

  const workspaceLogo =
    currentWorkspace?.logo ??
    workspacePublicData?.logo ??
    DEFAULT_WORKSPACE_LOGO;

  return (
    <StyledContainer
      data-testid="workspace-dropdown"
      isNavigationDrawerExpanded={isNavigationDrawerExpanded}
      disabled={disabled}
    >
      <Avatar
        placeholder={workspaceDisplayName}
        avatarUrl={getAbsoluteImageUrl(workspaceLogo)}
      />
      <StyledLabelWrapper>
        <NavigationDrawerAnimatedCollapseWrapper>
          <StyledLabel>{workspaceDisplayName}</StyledLabel>
        </NavigationDrawerAnimatedCollapseWrapper>
      </StyledLabelWrapper>
      <NavigationDrawerAnimatedCollapseWrapper>
        <StyledIconChevronDown
          size={theme.icon.size.md}
          stroke={theme.icon.stroke.sm}
        />
      </NavigationDrawerAnimatedCollapseWrapper>
    </StyledContainer>
  );
};
