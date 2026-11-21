import { isMarkdownImageSourceAllowed } from '@/ai/utils/isMarkdownImageSourceAllowed';

jest.mock('~/config', () => ({
  REACT_APP_SERVER_BASE_URL: 'https://api.crm.example.com',
}));

describe('isMarkdownImageSourceAllowed', () => {
  it('allows images served by the app or by the server', () => {
    expect(isMarkdownImageSourceAllowed('/images/logo.png')).toBe(true);
    expect(
      isMarkdownImageSourceAllowed(`${window.location.origin}/logo.png`),
    ).toBe(true);
    expect(
      isMarkdownImageSourceAllowed(
        'https://api.crm.example.com/file/files-field/file-id?token=signed',
      ),
    ).toBe(true);
  });

  it('blocks images on any other host', () => {
    expect(
      isMarkdownImageSourceAllowed('https://attacker.example.net/p.png?q=dob'),
    ).toBe(false);
    expect(isMarkdownImageSourceAllowed('//attacker.example.net/p.png')).toBe(
      false,
    );
    expect(
      isMarkdownImageSourceAllowed('https://crm.example.com.attacker.net/x'),
    ).toBe(false);
  });

  it('blocks missing and non-http sources', () => {
    expect(isMarkdownImageSourceAllowed(undefined)).toBe(false);
    expect(isMarkdownImageSourceAllowed('')).toBe(false);
    expect(isMarkdownImageSourceAllowed('data:image/png;base64,AAAA')).toBe(
      false,
    );
    expect(
      isMarkdownImageSourceAllowed(
        // oxlint-disable-next-line no-script-url -- the unsafe scheme under test
        'javascript://api.crm.example.com/%0aalert(1)',
      ),
    ).toBe(false);
  });
});
