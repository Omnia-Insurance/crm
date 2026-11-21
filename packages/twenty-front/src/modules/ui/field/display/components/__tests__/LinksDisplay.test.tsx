import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';

import { LinksDisplay } from '@/ui/field/display/components/LinksDisplay';

const RECORDING_LINKS = {
  primaryLinkUrl: 'https://recordings.example.com/call-1.mp3',
  primaryLinkLabel: '',
  secondaryLinks: [
    { url: 'https://recordings.example.com/call-2.mp3', label: '' },
  ],
};

const renderLinks = (displayAs?: 'link' | 'audio') =>
  render(
    <I18nProvider i18n={i18n}>
      <LinksDisplay value={RECORDING_LINKS} displayAs={displayAs} />
    </I18nProvider>,
  );

// OMNIA-CUSTOM: call recordings are LINKS fields displayed as inline players
describe('LinksDisplay', () => {
  it('renders an inline player per link when displayed as audio', () => {
    renderLinks('audio');

    expect(
      screen
        .getAllByLabelText('Call recording')
        .map((player) => player.getAttribute('src')),
    ).toEqual([
      'https://recordings.example.com/call-1.mp3',
      'https://recordings.example.com/call-2.mp3',
    ]);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders links by default', () => {
    renderLinks();

    expect(screen.queryByLabelText('Call recording')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
