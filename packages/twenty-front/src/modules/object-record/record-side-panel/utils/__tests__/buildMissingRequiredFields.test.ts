import { buildMissingRequiredFields } from '@/object-record/record-side-panel/utils/buildMissingRequiredFields';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const opportunity = getMockObjectMetadataItemOrThrow('opportunity');
const person = getMockObjectMetadataItemOrThrow('person');

const getField = (
  objectMetadataItem: typeof opportunity,
  fieldName: string,
) => {
  const field = objectMetadataItem.fields.find(
    (candidate) => candidate.name === fieldName,
  );

  if (field === undefined) {
    throw new Error(`Missing mock field ${fieldName}`);
  }

  return field;
};

const amountField = getField(opportunity, 'amount');
const ownerField = getField(opportunity, 'owner');
const personNameField = getField(person, 'name');

const opportunityWithAgentOwner = {
  ...opportunity,
  fields: opportunity.fields.map((field) =>
    field.id === ownerField.id && field.relation
      ? {
          ...field,
          relation: {
            ...field.relation,
            targetObjectMetadata: {
              ...field.relation.targetObjectMetadata,
              nameSingular: 'agentProfile',
            },
          },
        }
      : field,
  ),
};

const getObjectMetadataItem = (nameSingular: string) =>
  [opportunity, person].find((item) => item.nameSingular === nameSingular);

describe('buildMissingRequiredFields', () => {
  it('maps own violations to editable fields by default', () => {
    expect(
      buildMissingRequiredFields({
        violations: {
          draftViolations: [
            { fieldMetadataId: amountField.id, fieldLabel: 'Amount' },
          ],
          relatedViolations: [],
          allViolationsCount: 1,
        },
        objectMetadataItem: opportunity,
        getObjectMetadataItem,
        getRestrictedFields: () => ({}),
      }),
    ).toEqual([
      {
        fieldName: 'amount',
        fieldLabel: 'Amount',
        isReadOnly: false,
        isAgentProfileRelation: false,
      },
    ]);
  });

  it('flags a read-only agent profile relation the user cannot fill', () => {
    expect(
      buildMissingRequiredFields({
        violations: {
          draftViolations: [
            { fieldMetadataId: ownerField.id, fieldLabel: 'Agent' },
          ],
          relatedViolations: [],
          allViolationsCount: 1,
        },
        objectMetadataItem: opportunityWithAgentOwner,
        getObjectMetadataItem,
        getRestrictedFields: (objectMetadataId) =>
          objectMetadataId === opportunity.id
            ? { [ownerField.id]: { canRead: true, canUpdate: false } }
            : {},
      }),
    ).toEqual([
      {
        fieldName: 'owner',
        fieldLabel: 'Agent',
        isReadOnly: true,
        isAgentProfileRelation: true,
      },
    ]);
  });

  it('points related violations at the relation field on the draft', () => {
    expect(
      buildMissingRequiredFields({
        violations: {
          draftViolations: [],
          relatedViolations: [
            {
              relationFieldName: 'pointOfContact',
              relationLabel: 'Lead',
              relatedObjectNameSingular: 'person',
              relatedRecordId: 'draft-lead-id',
              violations: [
                { fieldMetadataId: personNameField.id, fieldLabel: 'Name' },
              ],
            },
          ],
          allViolationsCount: 1,
        },
        objectMetadataItem: opportunity,
        getObjectMetadataItem,
        getRestrictedFields: (objectMetadataId) =>
          objectMetadataId === person.id
            ? { [personNameField.id]: { canRead: true, canUpdate: false } }
            : {},
      }),
    ).toEqual([
      {
        fieldName: 'pointOfContact',
        fieldLabel: 'Name',
        relationLabel: 'Lead',
        isReadOnly: true,
        isAgentProfileRelation: false,
      },
    ]);
  });
});
