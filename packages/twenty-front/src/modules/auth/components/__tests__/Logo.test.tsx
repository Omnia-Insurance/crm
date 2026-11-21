import { render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { Logo } from '@/auth/components/Logo';

const WORKSPACE_LOGO_URL = 'https://acme.com/logo.png';
const TWENTY_ICON_PATH =
  '/images/icons/android/android-launchericon-192-192.png';

const renderLogo = ({
  primaryLogo,
  secondaryLogo,
  placeholder,
}: ComponentProps<typeof Logo>) =>
  render(
    <MemoryRouter>
      <Logo
        primaryLogo={primaryLogo}
        secondaryLogo={secondaryLogo}
        placeholder={placeholder}
      />
    </MemoryRouter>,
  );

describe('Logo', () => {
  it('shows the workspace logo as the main logo, without the Twenty icon, its overlay or link', () => {
    const { container } = renderLogo({
      secondaryLogo: WORKSPACE_LOGO_URL,
      placeholder: 'Acme',
    });

    expect(container.innerHTML).toContain(WORKSPACE_LOGO_URL);
    expect(container.innerHTML).not.toContain(TWENTY_ICON_PATH);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the Twenty icon and the placeholder overlay without a workspace logo', () => {
    const { container } = renderLogo({
      secondaryLogo: null,
      placeholder: 'Acme',
    });

    expect(container.innerHTML).toContain(TWENTY_ICON_PATH);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('keeps an explicit primary logo with the workspace logo overlay', () => {
    const { container } = renderLogo({
      primaryLogo: 'https://acme.com/app.png',
      secondaryLogo: WORKSPACE_LOGO_URL,
      placeholder: 'Acme',
    });

    expect(container.innerHTML).toContain('https://acme.com/app.png');
    expect(screen.getByRole('img')).toHaveAttribute('src', WORKSPACE_LOGO_URL);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
