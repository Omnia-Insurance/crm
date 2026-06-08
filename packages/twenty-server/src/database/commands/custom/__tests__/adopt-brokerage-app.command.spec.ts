import { AdoptBrokerageAppCommand } from 'src/database/commands/custom/adopt-brokerage-app.command';
import {
  BROKERAGE_ADOPTION_FIELDS,
  BROKERAGE_ADOPTION_OBJECTS,
  BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
} from 'src/database/commands/custom/constants/brokerage-app-adoption.constants';
import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';

const WORKSPACE_ID = 'workspace-id';
const BROKERAGE_APPLICATION_ID = 'brokerage-application-id';

const policyAdoptionObject = BROKERAGE_ADOPTION_OBJECTS.find(
  (object) => object.nameSingular === 'policy',
);
const carrierAdoptionObject = BROKERAGE_ADOPTION_OBJECTS.find(
  (object) => object.nameSingular === 'carrier',
);
const carrierProductAdoptionObject = BROKERAGE_ADOPTION_OBJECTS.find(
  (object) => object.nameSingular === 'carrierProduct',
);
const carrierProductsAdoptionField = BROKERAGE_ADOPTION_FIELDS.find(
  (field) =>
    field.objectUniversalIdentifier ===
      carrierAdoptionObject?.universalIdentifier &&
    field.name === 'carrierProducts',
);
const carrierProductProductAdoptionField = BROKERAGE_ADOPTION_FIELDS.find(
  (field) =>
    field.objectUniversalIdentifier ===
      carrierProductAdoptionObject?.universalIdentifier &&
    field.name === 'product',
);

if (
  policyAdoptionObject === undefined ||
  carrierAdoptionObject === undefined ||
  carrierProductAdoptionObject === undefined ||
  carrierProductsAdoptionField === undefined ||
  carrierProductProductAdoptionField === undefined
) {
  throw new Error('Brokerage adoption fixture is missing');
}

const createCommand = ({
  applicationService = {},
  fieldMetadataRepository = {},
  navigationMenuItemRepository = {},
  objectMetadataRepository = {},
  workspaceCacheService = {},
}: {
  applicationService?: Record<string, unknown>;
  fieldMetadataRepository?: Record<string, unknown>;
  navigationMenuItemRepository?: Record<string, unknown>;
  objectMetadataRepository?: Record<string, unknown>;
  workspaceCacheService?: Record<string, unknown>;
} = {}) => {
  const command = new AdoptBrokerageAppCommand(
    {} as never,
    {
      find: jest.fn().mockResolvedValue([]),
      ...objectMetadataRepository,
    } as never,
    {
      find: jest.fn().mockResolvedValue([]),
      ...fieldMetadataRepository,
    } as never,
    {
      find: jest.fn().mockResolvedValue([]),
      ...navigationMenuItemRepository,
    } as never,
    {
      findByUniversalIdentifier: jest.fn().mockResolvedValue({
        id: BROKERAGE_APPLICATION_ID,
      }),
      create: jest.fn(),
      ...applicationService,
    } as never,
    {
      invalidateAndRecompute: jest.fn(),
      ...workspaceCacheService,
    } as never,
  );

  command['logger'] = {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  } as never;

  return command;
};

describe('AdoptBrokerageAppCommand', () => {
  it('plans object ownership and universal identifier updates when existing metadata matches by name', async () => {
    const command = createCommand({
      objectMetadataRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'policy-object-id',
            nameSingular: 'policy',
            universalIdentifier: '11111111-1111-4111-8111-111111111111',
            applicationId: 'workspace-custom-application-id',
          },
        ]),
      },
    });

    const plan = await command['buildAdoptionPlan']({
      brokerageApplicationId: BROKERAGE_APPLICATION_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(plan.objectUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'policy-object-id',
          label: 'policy',
          currentUniversalIdentifier: '11111111-1111-4111-8111-111111111111',
          nextUniversalIdentifier: policyAdoptionObject.universalIdentifier,
          currentApplicationId: 'workspace-custom-application-id',
          nextApplicationId: BROKERAGE_APPLICATION_ID,
        }),
      ]),
    );
  });

  it('plans Carrier Product junction metadata needed by relation picker filtering', async () => {
    const command = createCommand({
      objectMetadataRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'carrier-object-id',
            nameSingular: 'carrier',
            universalIdentifier: carrierAdoptionObject.universalIdentifier,
            applicationId: BROKERAGE_APPLICATION_ID,
          },
          {
            id: 'carrier-product-object-id',
            nameSingular: 'carrierProduct',
            universalIdentifier:
              carrierProductAdoptionObject.universalIdentifier,
            applicationId: BROKERAGE_APPLICATION_ID,
          },
        ]),
      },
      fieldMetadataRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'carrier-products-field-id',
            objectMetadataId: 'carrier-object-id',
            name: 'carrierProducts',
            universalIdentifier:
              carrierProductsAdoptionField.universalIdentifier,
            applicationId: BROKERAGE_APPLICATION_ID,
            description: carrierProductsAdoptionField.description,
            isLabelSyncedWithName:
              carrierProductsAdoptionField.isLabelSyncedWithName,
            isUnique: carrierProductsAdoptionField.isUnique,
            settings: {
              relationType: 'ONE_TO_MANY',
            },
          },
          {
            id: 'carrier-product-product-field-id',
            objectMetadataId: 'carrier-product-object-id',
            name: 'product',
            universalIdentifier:
              carrierProductProductAdoptionField.universalIdentifier,
            applicationId: BROKERAGE_APPLICATION_ID,
            description: carrierProductProductAdoptionField.description,
            isLabelSyncedWithName:
              carrierProductProductAdoptionField.isLabelSyncedWithName,
            isUnique: carrierProductProductAdoptionField.isUnique,
            settings: {
              relationType: 'MANY_TO_ONE',
              joinColumnName: 'productId',
            },
          },
        ]),
      },
    });

    const plan = await command['buildAdoptionPlan']({
      brokerageApplicationId: BROKERAGE_APPLICATION_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(plan.fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'carrier-products-field-id',
          label: 'carrier.carrierProducts',
          nextSettings: {
            relationType: 'ONE_TO_MANY',
            junctionTargetFieldId: 'carrier-product-product-field-id',
          },
        }),
      ]),
    );
  });

  it('allows dry-run planning before the Brokerage app shell exists', async () => {
    const applicationService = {
      findByUniversalIdentifier: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };
    const workspaceCacheService = {
      invalidateAndRecompute: jest.fn(),
    };
    const objectMetadataRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const command = createCommand({
      applicationService,
      objectMetadataRepository,
      workspaceCacheService,
    });

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun: true },
      index: 0,
      total: 1,
    });

    expect(applicationService.create).not.toHaveBeenCalled();
    expect(workspaceCacheService.invalidateAndRecompute).not.toHaveBeenCalled();
  });

  it('bootstraps an empty Brokerage app shell before applying metadata adoption', async () => {
    const update = jest.fn();
    const query = jest.fn().mockResolvedValue([]);
    const manager = {
      getRepository: jest.fn().mockReturnValue({ update }),
      query,
    };
    const objectMetadataRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'policy-object-id',
          nameSingular: 'policy',
          universalIdentifier: '11111111-1111-4111-8111-111111111111',
          applicationId: 'workspace-custom-application-id',
        },
      ]),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const applicationService = {
      findByUniversalIdentifier: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: BROKERAGE_APPLICATION_ID }),
    };
    const workspaceCacheService = {
      invalidateAndRecompute: jest.fn(),
    };

    const command = createCommand({
      applicationService,
      objectMetadataRepository,
      workspaceCacheService,
    });

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: {},
      index: 0,
      total: 1,
    });

    expect(applicationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        universalIdentifier: BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
        name: 'Brokerage',
        sourcePath: BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
        sourceType: ApplicationRegistrationSourceType.LOCAL,
        workspaceId: WORKSPACE_ID,
      }),
    );
    expect(update).toHaveBeenCalledWith(
      { id: 'policy-object-id' },
      expect.objectContaining({
        applicationId: BROKERAGE_APPLICATION_ID,
        universalIdentifier: policyAdoptionObject.universalIdentifier,
      }),
    );
    expect(workspaceCacheService.invalidateAndRecompute).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.arrayContaining([
        'flatApplicationMaps',
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
        'flatRoleMaps',
        'rolesPermissions',
      ]),
    );
  });

  it('copies Omnia Member role permissions onto Brokerage Agent during adoption', async () => {
    const update = jest.fn();
    const query = jest.fn(async (queryText: string) => {
      if (queryText.includes("member_role.label = 'Member'")) {
        return [
          {
            agent_role_id: 'agent-role-id',
            member_role_id: 'member-role-id',
          },
        ];
      }

      if (queryText.includes('AS object_permissions')) {
        return [
          {
            object_permissions: '15',
            field_permissions: '21',
            permission_flags: '2',
            rls_predicates: '2',
            rls_groups: '2',
          },
        ];
      }

      return [];
    });
    const manager = {
      getRepository: jest.fn().mockReturnValue({ update }),
      query,
    };
    const objectMetadataRepository = {
      find: jest.fn().mockResolvedValue([]),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    const workspaceCacheService = {
      invalidateAndRecompute: jest.fn(),
    };
    const command = createCommand({
      objectMetadataRepository,
      workspaceCacheService,
    });

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: {},
      index: 0,
      total: 1,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("member_role.label = 'Member'"),
      expect.arrayContaining([WORKSPACE_ID]),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE core.role agent_role'),
      ['agent-role-id', 'member-role-id'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO core."objectPermission"'),
      ['agent-role-id', 'member-role-id'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO core."fieldPermission"'),
      ['agent-role-id', 'member-role-id'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('manifest_object_permissions'),
      expect.arrayContaining(['agent-role-id']),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('manifest_field_permissions'),
      expect.arrayContaining(['agent-role-id']),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO core."rowLevelPermissionPredicate"'),
      ['agent-role-id', 'member-role-id'],
    );
  });
});
