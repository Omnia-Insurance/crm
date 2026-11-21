import { settingsDataModelFieldSettingsFormSchema } from '@/settings/data-model/fields/forms/validation-schemas/settingsDataModelFieldSettingsFormSchema';
import { settingsFieldFormSchema } from '@/settings/data-model/fields/forms/validation-schemas/settingsFieldFormSchema';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const RECORDING_FIELD_FORM_VALUES = {
  icon: 'IconLink',
  label: 'Recording',
  description: null,
  type: FieldMetadataType.LINKS,
  isUnique: false,
  settings: { displayAs: 'audio', maxNumberOfValues: 2 },
};

describe('settingsDataModelFieldSettingsFormSchema', () => {
  it('keeps displayAs on a LINKS field, so a Settings save keeps the audio player', () => {
    expect(
      settingsDataModelFieldSettingsFormSchema.parse({
        type: FieldMetadataType.LINKS,
        isUnique: false,
        settings: { displayAs: 'audio', maxNumberOfValues: 2 },
      }),
    ).toEqual({
      type: FieldMetadataType.LINKS,
      isUnique: false,
      settings: { displayAs: 'audio', maxNumberOfValues: 2 },
    });
  });

  it('rejects a displayAs value the front cannot render', () => {
    expect(
      settingsDataModelFieldSettingsFormSchema.safeParse({
        type: FieldMetadataType.LINKS,
        isUnique: false,
        settings: { displayAs: 'video', maxNumberOfValues: 2 },
      }).success,
    ).toBe(false);
  });
});

const APPLICATION_ID_FIELD_FORM_VALUES = {
  icon: 'IconId',
  label: 'Application ID',
  description: null,
  type: FieldMetadataType.TEXT,
  isUnique: false,
  settings: { displayedMaxRows: 1 },
};

describe('settingsFieldFormSchema', () => {
  it.each([
    { type: 'always' },
    { type: 'fieldEmpty', fieldId: 'policy-number-field-id' },
  ])('submits the Required rule %o with the field', (requiredCondition) => {
    const parsedFormValues = settingsFieldFormSchema().parse({
      ...APPLICATION_ID_FIELD_FORM_VALUES,
      requiredCondition,
    });

    expect(parsedFormValues).toEqual(
      expect.objectContaining({ requiredCondition }),
    );
  });

  it('submits displayAs with the rest of the LINKS settings', () => {
    const parsedFormValues = settingsFieldFormSchema().parse(
      RECORDING_FIELD_FORM_VALUES,
    );

    expect(parsedFormValues).toEqual(
      expect.objectContaining({
        settings: { displayAs: 'audio', maxNumberOfValues: 2 },
      }),
    );
  });
});
