import { isValidIngestionWebhookSecret } from 'src/engine/metadata-modules/ingestion-pipeline/utils/is-valid-ingestion-webhook-secret.util';

describe('isValidIngestionWebhookSecret', () => {
  const expectedSecret = 'f'.repeat(64);

  it('should accept the exact secret', () => {
    expect(
      isValidIngestionWebhookSecret({
        providedSecret: expectedSecret,
        expectedSecret,
      }),
    ).toBe(true);
  });

  it.each([
    ['a different secret of the same length', 'e'.repeat(64)],
    ['a prefix of the secret', expectedSecret.slice(0, 32)],
    ['a longer value', `${expectedSecret}0`],
    ['an empty string', ''],
    ['a missing header', undefined],
    ['a repeated header', [expectedSecret, expectedSecret]],
  ])('should reject %s', (_description, providedSecret) => {
    expect(
      isValidIngestionWebhookSecret({ providedSecret, expectedSecret }),
    ).toBe(false);
  });

  it('should reject everything when the pipeline has no secret', () => {
    expect(
      isValidIngestionWebhookSecret({
        providedSecret: '',
        expectedSecret: null,
      }),
    ).toBe(false);
    expect(
      isValidIngestionWebhookSecret({
        providedSecret: 'anything',
        expectedSecret: null,
      }),
    ).toBe(false);
  });
});
