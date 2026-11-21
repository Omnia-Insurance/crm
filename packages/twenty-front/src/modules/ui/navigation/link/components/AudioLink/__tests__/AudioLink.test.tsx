import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AudioLink } from '@/ui/navigation/link/components/AudioLink/AudioLink';

const RECORDING_URL = 'https://acme.com/recordings/call.mp3';

const UNSAFE_SOURCES = [
  '',
  '   ',
  // oxlint-disable-next-line no-script-url -- the unsafe scheme under test
  'javascript:alert(1)',
  '//evil.com/call.mp3',
];

describe('AudioLink', () => {
  it('renders a player that loads the recording only when played', () => {
    render(<AudioLink src={RECORDING_URL} />);

    const player = screen.getByLabelText('Call recording');

    expect(player).toHaveAttribute('src', RECORDING_URL);
    expect(player).toHaveAttribute('preload', 'none');
    expect(player).toHaveAttribute('controls');
  });

  it('switches to the new recording when the source changes', () => {
    const { rerender } = render(<AudioLink src={RECORDING_URL} />);

    rerender(<AudioLink src="https://acme.com/recordings/other-call.mp3" />);

    expect(screen.getByLabelText('Call recording')).toHaveAttribute(
      'src',
      'https://acme.com/recordings/other-call.mp3',
    );
  });

  it.each(UNSAFE_SOURCES)(
    'renders nothing for the unsafe source %p',
    (unsafeSource) => {
      const { container } = render(<AudioLink src={unsafeSource} />);

      expect(container).toBeEmptyDOMElement();
    },
  );

  it('keeps clicks on the player from opening the parent cell', async () => {
    const user = userEvent.setup();
    const handleParentClick = jest.fn();

    render(
      <div onClick={handleParentClick}>
        <AudioLink src={RECORDING_URL} />
      </div>,
    );

    await user.click(screen.getByLabelText('Call recording'));

    expect(handleParentClick).not.toHaveBeenCalled();
  });
});
