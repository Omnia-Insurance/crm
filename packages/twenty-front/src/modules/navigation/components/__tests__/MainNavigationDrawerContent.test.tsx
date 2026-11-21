import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { MainNavigationDrawerContent } from '@/navigation/components/MainNavigationDrawerContent';
import { useActiveNavigationDrawerMode } from '@/navigation/hooks/useActiveNavigationDrawerMode';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { NAVIGATION_DRAWER_TABS } from '@/ui/navigation/states/navigationDrawerTabs';

const mockOpenRecordsSearchPage = jest.fn();

jest.mock('@/navigation/hooks/useActiveNavigationDrawerMode');
jest.mock('@/settings/roles/hooks/useHasPermissionFlag');

jest.mock('@/side-panel/hooks/useOpenRecordsSearchPageInSidePanel', () => ({
  useOpenRecordsSearchPageInSidePanel: () => ({
    openRecordsSearchPage: mockOpenRecordsSearchPage,
  }),
}));

jest.mock(
  '@/navigation/components/MainNavigationDrawerNavigationContent',
  () => ({
    MainNavigationDrawerNavigationContent: () => <div>Workspace items</div>,
  }),
);

jest.mock('@/ai/components/NavigationDrawerAiChatContent', () => ({
  NavigationDrawerAiChatContent: () => <div>AI chat history</div>,
}));

jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerScrollableContent',
  () => ({
    NavigationDrawerScrollableContent: ({
      children,
    }: {
      children: ReactNode;
    }) => <>{children}</>,
  }),
);

const renderContent = () =>
  render(
    <MemoryRouter>
      <MainNavigationDrawerContent />
    </MemoryRouter>,
  );

describe('MainNavigationDrawerContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useHasPermissionFlag).mockReturnValue(true);
    jest
      .mocked(useActiveNavigationDrawerMode)
      .mockReturnValue(NAVIGATION_DRAWER_TABS.NAVIGATION_MENU);
  });

  it('shows a labeled Search row in Home mode that opens records search', async () => {
    const user = userEvent.setup();

    renderContent();

    await user.click(screen.getByRole('button', { name: /Search/ }));

    expect(mockOpenRecordsSearchPage).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Workspace items')).toBeVisible();
  });

  it('hides the Search row while the AI chat history is shown', () => {
    jest
      .mocked(useActiveNavigationDrawerMode)
      .mockReturnValue(NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY);

    renderContent();

    expect(
      screen.queryByRole('button', { name: /Search/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('AI chat history')).toBeVisible();
  });

  it('keeps the Search row for roles without the AI permission', () => {
    jest.mocked(useHasPermissionFlag).mockReturnValue(false);
    jest
      .mocked(useActiveNavigationDrawerMode)
      .mockReturnValue(NAVIGATION_DRAWER_TABS.AI_CHAT_HISTORY);

    renderContent();

    expect(screen.getByRole('button', { name: /Search/ })).toBeVisible();
    expect(screen.queryByText('AI chat history')).not.toBeInTheDocument();
  });
});
