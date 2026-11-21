import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import {
  findTargetWorkspaceMemberRelationField,
  hasRelationToWorkspaceMember,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/hasRelationToWorkspaceMember';
import { FieldMetadataType } from 'twenty-shared/types';
import { RelationType } from '~/generated-metadata/graphql';

const WORKSPACE_MEMBER_OBJECT = {
  id: '20202020-0000-4000-8000-000000000001',
  nameSingular: 'workspaceMember',
};
const AGENT_PROFILE_OBJECT = {
  id: '20202020-0000-4000-8000-000000000002',
  nameSingular: 'agentProfile',
};
const POLICY_OBJECT = {
  id: '20202020-0000-4000-8000-000000000003',
  nameSingular: 'policy',
};

const buildRelationField = ({
  name,
  target,
  relationType = RelationType.MANY_TO_ONE,
  isActive = true,
}: {
  name: string;
  target: { id: string; nameSingular: string };
  relationType?: RelationType;
  isActive?: boolean;
}) =>
  ({
    id: `field-${name}`,
    name,
    label: name,
    type: FieldMetadataType.RELATION,
    isActive,
    relation: {
      type: relationType,
      targetObjectMetadata: target,
    },
  }) as FieldMetadataItem;

const buildObject = (
  object: { id: string; nameSingular: string },
  fields: FieldMetadataItem[],
) => ({ ...object, fields }) as EnrichedObjectMetadataItem;

const agentProfileWorkspaceMemberField = buildRelationField({
  name: 'workspaceMember',
  target: WORKSPACE_MEMBER_OBJECT,
});
const agentProfileManagerField = buildRelationField({
  name: 'manager',
  target: WORKSPACE_MEMBER_OBJECT,
});
const policyAgentField = buildRelationField({
  name: 'agent',
  target: AGENT_PROFILE_OBJECT,
});

const findForAgentProfileFields = (
  agentProfileFields: FieldMetadataItem[],
  relationFieldMetadataItem: FieldMetadataItem = policyAgentField,
) =>
  findTargetWorkspaceMemberRelationField({
    relationFieldMetadataItem,
    objectMetadataItems: [
      buildObject(WORKSPACE_MEMBER_OBJECT, []),
      buildObject(AGENT_PROFILE_OBJECT, agentProfileFields),
      buildObject(POLICY_OBJECT, [policyAgentField]),
    ],
  });

describe('findTargetWorkspaceMemberRelationField', () => {
  it("returns the target's only many-to-one relation to workspaceMember", () => {
    const ownerField = buildRelationField({
      name: 'owner',
      target: WORKSPACE_MEMBER_OBJECT,
    });

    expect(findForAgentProfileFields([ownerField])).toBe(ownerField);
  });

  it('prefers the relation named workspaceMember when the target also has a manager', () => {
    expect(
      findForAgentProfileFields([
        agentProfileManagerField,
        agentProfileWorkspaceMemberField,
      ]),
    ).toBe(agentProfileWorkspaceMemberField);
  });

  it('returns nothing when several relations reach workspaceMember and none is named workspaceMember', () => {
    expect(
      findForAgentProfileFields([
        agentProfileManagerField,
        buildRelationField({ name: 'owner', target: WORKSPACE_MEMBER_OBJECT }),
      ]),
    ).toBeUndefined();
  });

  it('ignores one-to-many relations from the target to workspaceMember', () => {
    expect(
      findForAgentProfileFields([
        buildRelationField({
          name: 'workspaceMembers',
          target: WORKSPACE_MEMBER_OBJECT,
          relationType: RelationType.ONE_TO_MANY,
        }),
      ]),
    ).toBeUndefined();
  });

  it('never falls back to manager when the workspaceMember relation is inactive', () => {
    expect(
      findForAgentProfileFields([
        agentProfileManagerField,
        buildRelationField({
          name: 'workspaceMember',
          target: WORKSPACE_MEMBER_OBJECT,
          isActive: false,
        }),
      ]),
    ).toBeUndefined();
  });

  it('returns nothing when the picked relation is one-to-many', () => {
    expect(
      findForAgentProfileFields(
        [agentProfileWorkspaceMemberField],
        buildRelationField({
          name: 'agentProfiles',
          target: AGENT_PROFILE_OBJECT,
          relationType: RelationType.ONE_TO_MANY,
        }),
      ),
    ).toBeUndefined();
  });

  it('returns nothing for a direct relation to workspaceMember', () => {
    expect(
      findForAgentProfileFields(
        [agentProfileWorkspaceMemberField],
        buildRelationField({
          name: 'assignee',
          target: WORKSPACE_MEMBER_OBJECT,
        }),
      ),
    ).toBeUndefined();
  });

  it('returns nothing when the target object is not among the active objects', () => {
    expect(
      findTargetWorkspaceMemberRelationField({
        relationFieldMetadataItem: policyAgentField,
        objectMetadataItems: [buildObject(POLICY_OBJECT, [policyAgentField])],
      }),
    ).toBeUndefined();
  });
});

describe('hasRelationToWorkspaceMember', () => {
  it('is true for Policy ▸ Agent on a prod-shaped agentProfile', () => {
    expect(
      hasRelationToWorkspaceMember({
        relationFieldMetadataItem: policyAgentField,
        objectMetadataItems: [
          buildObject(AGENT_PROFILE_OBJECT, [
            agentProfileManagerField,
            agentProfileWorkspaceMemberField,
          ]),
        ],
      }),
    ).toBe(true);
  });

  it('is false for a field that is not a relation', () => {
    expect(
      hasRelationToWorkspaceMember({
        relationFieldMetadataItem: {
          id: 'field-name',
          name: 'name',
          label: 'Name',
          type: FieldMetadataType.TEXT,
        } as FieldMetadataItem,
        objectMetadataItems: [
          buildObject(AGENT_PROFILE_OBJECT, [agentProfileWorkspaceMemberField]),
        ],
      }),
    ).toBe(false);
  });
});
