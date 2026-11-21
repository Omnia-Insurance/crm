import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AppTokenEntity } from 'src/engine/core-modules/app-token/app-token.entity';
import { EnterprisePlanService } from 'src/engine/core-modules/enterprise/services/enterprise-plan.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

describe('EnterprisePlanService self-hosted unlock', () => {
  let enterprisePlanService: EnterprisePlanService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    fetchSpy = jest.spyOn(global, 'fetch');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnterprisePlanService,
        { provide: TwentyConfigService, useValue: { get: () => undefined } },
        {
          provide: getRepositoryToken(AppTokenEntity),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        ...[UserWorkspaceEntity, UserEntity, WorkspaceEntity].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: {},
        })),
      ],
    }).compile();

    enterprisePlanService = module.get(EnterprisePlanService);

    await enterprisePlanService.onModuleInit();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('unlocks every enterprise gate without an ENTERPRISE_KEY or validity token', async () => {
    expect(enterprisePlanService.isValid()).toBe(true);
    expect(enterprisePlanService.hasValidEnterpriseValidityToken()).toBe(true);
    await expect(enterprisePlanService.isValidWithFreshToken()).resolves.toBe(
      true,
    );
  });

  it('keeps the signed key absent so nothing calls the enterprise API', async () => {
    expect(enterprisePlanService.hasValidSignedEnterpriseKey()).toBe(false);
    await expect(enterprisePlanService.refreshValidityToken()).resolves.toBe(
      false,
    );
    await expect(enterprisePlanService.reportSeats(10)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
