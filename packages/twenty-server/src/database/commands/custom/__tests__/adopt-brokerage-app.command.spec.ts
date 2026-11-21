import { AdoptBrokerageAppCommand } from 'src/database/commands/custom/adopt-brokerage-app.command';
import {
  BROKERAGE_ADOPTION_FIELDS,
  BROKERAGE_ADOPTION_OBJECTS,
  BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
} from 'src/database/commands/custom/constants/brokerage-app-adoption.constants';

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

const POLICY_OBJECT_MATCHED_BY_NAME = {
  id: 'policy-object-id',
  nameSingular: 'policy',
  universalIdentifier: '11111111-1111-4111-8111-111111111111',
  applicationId: 'workspace-custom-application-id',
};

const REPOSITORY_WRITE_METHOD_NAMES = [
  'insert',
  'update',
  'upsert',
  'delete',
  'softDelete',
] as const;

type RepositoryMock = Record<string, jest.Mock>;

const createRepositoryMock = (overrides: RepositoryMock = {}) => ({
  find: jest.fn().mockResolvedValue([]),
  ...Object.fromEntries(
    REPOSITORY_WRITE_METHOD_NAMES.map((methodName) => [methodName, jest.fn()]),
  ),
  ...overrides,
});

const expectNoWrites = (repository: RepositoryMock) => {
  for (const methodName of REPOSITORY_WRITE_METHOD_NAMES) {
    expect(repository[methodName]).not.toHaveBeenCalled();
  }
};

const createCommand = ({
  applicationService = {
    findOneApplication: jest
      .fn()
      .mockResolvedValue({ id: BROKERAGE_APPLICATION_ID }),
  },
  fieldMetadataRepository = createRepositoryMock(),
  navigationMenuItemRepository = createRepositoryMock(),
  objectMetadataRepository = createRepositoryMock(),
}: {
  applicationService?: RepositoryMock;
  fieldMetadataRepository?: RepositoryMock;
  navigationMenuItemRepository?: RepositoryMock;
  objectMetadataRepository?: RepositoryMock;
} = {}) => {
  const command = new AdoptBrokerageAppCommand(
    {} as never,
    objectMetadataRepository as never,
    fieldMetadataRepository as never,
    navigationMenuItemRepository as never,
    applicationService as never,
  );

  const logger = {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  };

  command['logger'] = logger as never;

  return { command, logger };
};

describe('AdoptBrokerageAppCommand', () => {
  it('plans object ownership and universal identifier updates when existing metadata matches by name', async () => {
    const objectMetadataRepository = createRepositoryMock({
      find: jest.fn().mockResolvedValue([POLICY_OBJECT_MATCHED_BY_NAME]),
    });
    const { command } = createCommand({ objectMetadataRepository });

    const plan = await command['buildAdoptionPlan']({
      brokerageApplicationId: BROKERAGE_APPLICATION_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(objectMetadataRepository.find).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ where: expect.any(Array) }),
    );
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
    const { command } = createCommand({
      objectMetadataRepository: createRepositoryMock({
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
      }),
      fieldMetadataRepository: createRepositoryMock({
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
      }),
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

  it('prints the dry-run plan before the Brokerage app is installed without writing anything', async () => {
    const applicationService = {
      findOneApplication: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };
    const objectMetadataRepository = createRepositoryMock({
      find: jest.fn().mockResolvedValue([POLICY_OBJECT_MATCHED_BY_NAME]),
    });
    const fieldMetadataRepository = createRepositoryMock();
    const navigationMenuItemRepository = createRepositoryMock();

    const { command, logger } = createCommand({
      applicationService,
      objectMetadataRepository,
      fieldMetadataRepository,
      navigationMenuItemRepository,
    });

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun: true },
      index: 0,
      total: 1,
    });

    expect(applicationService.findOneApplication).toHaveBeenCalledWith({
      universalIdentifier: BROKERAGE_APP_UNIVERSAL_IDENTIFIER,
      workspaceId: WORKSPACE_ID,
    });
    expect(logger.log).toHaveBeenCalledWith(
      `[DRY RUN] Brokerage adoption plan for workspace ${WORKSPACE_ID}: 1 objects, 0 fields, 0 navigation items`,
    );
    expect(applicationService.create).not.toHaveBeenCalled();
    expectNoWrites(objectMetadataRepository);
    expectNoWrites(fieldMetadataRepository);
    expectNoWrites(navigationMenuItemRepository);
  });

  it.each([
    { label: 'without --dry-run', options: {} },
    { label: 'with dryRun false', options: { dryRun: false } },
  ])(
    'refuses to adopt $label before reading or writing anything',
    async ({ options }) => {
      const applicationService = {
        findOneApplication: jest
          .fn()
          .mockResolvedValue({ id: BROKERAGE_APPLICATION_ID }),
        create: jest.fn(),
      };
      const objectMetadataRepository = createRepositoryMock({
        find: jest.fn().mockResolvedValue([POLICY_OBJECT_MATCHED_BY_NAME]),
      });
      const fieldMetadataRepository = createRepositoryMock();
      const navigationMenuItemRepository = createRepositoryMock();

      const { command } = createCommand({
        applicationService,
        objectMetadataRepository,
        fieldMetadataRepository,
        navigationMenuItemRepository,
      });

      await expect(
        command.runOnWorkspace({
          workspaceId: WORKSPACE_ID,
          options,
          index: 0,
          total: 1,
        }),
      ).rejects.toThrow(
        'workspace:adopt-brokerage-app is disabled on Twenty v2.58 until the Brokerage rewrite lands',
      );

      for (const dependency of [
        applicationService,
        objectMetadataRepository,
        fieldMetadataRepository,
        navigationMenuItemRepository,
      ]) {
        for (const method of Object.values(dependency)) {
          expect(method).not.toHaveBeenCalled();
        }
      }
    },
  );
});
