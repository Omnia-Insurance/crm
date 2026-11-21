import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';
import { getIngestionErrorLogLabel } from 'src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-error-log-label.util';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { isDuplicateEntryError } from 'src/engine/twenty-orm/utils/is-duplicate-entry-error.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { lookupCarrierProductCommission } from 'src/modules/policy/utils/lookup-carrier-product-commission.util';

type HealthSherpaWebhookPayload = Record<string, unknown> & {
  application_id?: string;
  policy_id?: string;
  member_phone?: string;
  member_first_name?: string;
  member_last_name?: string;
  member_email?: string;
  member_dob?: string;
  policy_aor_npn?: string;
  carrier_name?: string;
  plan_name?: string;
};

@Injectable()
export class HealthSherpaPolicyPreprocessor {
  private readonly logger = new Logger(HealthSherpaPolicyPreprocessor.name);

  // Repositories skip permission checks: ingestion is system work, and the
  // jobs run preprocessors in a system auth context
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async preProcess(
    payload: HealthSherpaWebhookPayload,
    _pipeline: IngestionPipelineEntity,
    _workspaceId: string,
  ): Promise<Record<string, unknown>> {
    // No application id in logs: it becomes the Policy's policy number
    this.logger.log('Preprocessing Health Sherpa webhook');

    // 1. Normalize phone number
    const normalizedPhone = this.normalizePhone(payload.member_phone);

    // 2. Find or create Person/Lead
    const person = await this.findOrCreatePerson(payload, normalizedPhone);

    if (!person) {
      this.logger.error(
        'Failed to find or create Person for a Health Sherpa application',
      );
      throw new Error('Failed to find or create Person for policy');
    }

    // 3. Compute display name: "<Carrier> - <ProductType>"
    const displayName = await this.computePolicyDisplayName(payload);

    // 4. Look up LTV from CarrierProduct commission
    const ltvCommission = await this.lookupLtv(payload);

    // 5. Inject computed fields into payload
    return {
      ...payload,
      _personId: person.id, // For leadId mapping
      _source: 'healthsherpa', // For externalSource mapping
      _now: new Date().toISOString(), // For lastExternalSync mapping
      _usd: 'USD', // For premium.currencyCode mapping
      _displayName: displayName, // For name mapping (Carrier - ProductType)
      _policyNumber: payload.application_id || '', // For policyNumber mapping
      _ltvAmountMicros: ltvCommission?.amountMicros ?? null,
      _ltvCurrencyCode: ltvCommission?.currencyCode ?? null,
      member_phone: normalizedPhone, // Replace with normalized version
    };
  }

  private async lookupLtv(
    payload: HealthSherpaWebhookPayload,
  ): Promise<{ amountMicros: number; currencyCode: string } | null> {
    const carrierName = payload.carrier_name?.toString().trim();
    const planName = payload.plan_name?.toString().trim();

    if (!carrierName || !planName) {
      return null;
    }

    try {
      const carrierRepo =
        this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
          'carrier',
        );

      const carrier = await carrierRepo.findOne({
        where: { name: carrierName },
      });

      if (!isDefined(carrier)) {
        return null;
      }

      const productRepo =
        this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
          'product',
        );

      const product = await productRepo.findOne({
        where: { name: planName },
      });

      if (!isDefined(product)) {
        return null;
      }

      return await lookupCarrierProductCommission(
        carrier.id,
        product.id,
        this.workspaceOrmManager,
      );
    } catch (error) {
      this.logger.warn(`Failed to lookup LTV: ${error}`);

      return null;
    }
  }

  private async computePolicyDisplayName(
    payload: HealthSherpaWebhookPayload,
  ): Promise<string> {
    const carrierName = payload.carrier_name?.toString().trim() || '';
    let productTypeName = '';

    // Look up ProductType through Product -> ProductType chain
    if (payload.plan_name) {
      try {
        const productRepo =
          this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
            'product',
          );

        const product = await productRepo.findOne({
          where: { name: payload.plan_name },
        });

        if (isDefined(product)) {
          const productTypeId = product.productTypeId as string | undefined;

          if (productTypeId) {
            const productTypeRepo =
              this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
                'productType',
              );

            const productType = await productTypeRepo.findOne({
              where: { id: productTypeId },
            });

            if (isDefined(productType)) {
              productTypeName = (productType.name as string) || '';
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to resolve product type: ${error}`);
      }
    }

    const carrier = carrierName || 'Unknown';
    const productType = productTypeName || 'Unknown';

    // Don't return "Unknown - Unknown" — fall back to plan_name or application_id
    if (!carrierName && !productTypeName) {
      return payload.plan_name || payload.application_id || 'Unknown - Unknown';
    }

    return `${carrier} - ${productType}`;
  }

  private async findOrCreatePerson(
    payload: HealthSherpaWebhookPayload,
    normalizedPhone: string | null,
  ): Promise<{ id: string } | null> {
    const personRepo =
      this.workspaceOrmManager.getRepositoryWithoutPermissionChecks('person');

    // Strategy 1: Find by phone number (most reliable)
    if (normalizedPhone) {
      const personByPhone = await personRepo.findOne({
        where: {
          phones: {
            primaryPhoneNumber: normalizedPhone,
          },
        },
      });

      if (isDefined(personByPhone)) {
        this.logger.log(`Matched Person ${personByPhone.id} by phone`);

        return personByPhone;
      }
    }

    // Strategy 2: Find by Agent NPN + Member Name
    if (payload.policy_aor_npn) {
      const personByAgentAndName = await this.findPersonByAgentAndName(
        payload.policy_aor_npn,
        payload.member_first_name,
        payload.member_last_name,
      );

      if (personByAgentAndName) {
        this.logger.log(
          `Matched Person ${personByAgentAndName.id} by agent NPN + name`,
        );

        return personByAgentAndName;
      }
    }

    // Strategy 3: Find by email (if present and not junk)
    const email = payload.member_email?.toString().trim().toLowerCase();

    if (email && !this.isJunkEmail(email)) {
      const personByEmail = await personRepo.findOne({
        where: {
          emails: {
            primaryEmail: email,
          },
        },
      });

      if (isDefined(personByEmail)) {
        this.logger.log(`Matched Person ${personByEmail.id} by email`);

        return personByEmail;
      }
    }

    // Strategy 4: Auto-create Person
    this.logger.log('No match found, auto-creating Person');

    return await this.createPersonFromWebhook(payload, normalizedPhone);
  }

  private async findPersonByAgentAndName(
    agentNpn: string,
    firstName: string | undefined,
    lastName: string | undefined,
  ): Promise<{ id: string } | null> {
    if (!firstName || !lastName) {
      return null;
    }

    // First, find agent by NPN
    const agentRepo =
      this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
        'agentProfile',
      );

    const agent = await agentRepo.findOne({
      where: {
        npn: agentNpn,
      },
    });

    if (!isDefined(agent)) {
      this.logger.warn(`Agent not found for NPN ${agentNpn}`);

      return null;
    }

    // Then find person assigned to this agent with matching name
    const personRepo =
      this.workspaceOrmManager.getRepositoryWithoutPermissionChecks('person');

    const normalizedFirstName = firstName.trim().toLowerCase();
    const normalizedLastName = lastName.trim().toLowerCase();

    // Note: This is a simplified query. You may need to adjust based on your actual schema
    const people = await personRepo.find({
      where: {
        assignedAgentId: agent.id,
      },
    });

    // Filter by name (case-insensitive)
    const matchedPerson = people.find((person) => {
      const name = person.name as Record<string, string> | undefined;

      if (!name) {
        return false;
      }

      const personFirstName = name.firstName?.trim().toLowerCase();
      const personLastName = name.lastName?.trim().toLowerCase();

      return (
        personFirstName === normalizedFirstName &&
        personLastName === normalizedLastName
      );
    });

    return matchedPerson ?? null;
  }

  private async createPersonFromWebhook(
    payload: HealthSherpaWebhookPayload,
    normalizedPhone: string | null,
  ): Promise<{ id: string } | null> {
    const personRepo =
      this.workspaceOrmManager.getRepositoryWithoutPermissionChecks('person');

    const firstName = payload.member_first_name?.toString().trim() || '';
    const lastName = payload.member_last_name?.toString().trim() || '';
    const email = payload.member_email?.toString().trim().toLowerCase();

    const personData: Record<string, unknown> = {
      name: {
        firstName: firstName || 'Unknown',
        lastName: lastName || 'Unknown',
      },
      leadStatus: 'CONTACTED', // They've already enrolled, so contacted
    };

    // Add phone if present
    if (normalizedPhone) {
      personData.phones = {
        primaryPhoneNumber: normalizedPhone,
        primaryPhoneCallingCode: '+1',
      };
    }

    // Add email if present and not junk
    if (email && !this.isJunkEmail(email)) {
      personData.emails = {
        primaryEmail: email,
      };
    }

    // Find and assign agent if NPN present
    if (payload.policy_aor_npn) {
      const agentRepo =
        this.workspaceOrmManager.getRepositoryWithoutPermissionChecks(
          'agentProfile',
        );

      const agent = await agentRepo.findOne({
        where: {
          npn: payload.policy_aor_npn.toString(),
        },
      });

      if (isDefined(agent)) {
        personData.assignedAgentId = agent.id;
      }
    }

    try {
      const createdPerson = await this.savePerson(personRepo, personData);

      this.logger.log(`Auto-created Person ${createdPerson.id}`);

      return createdPerson;
    } catch (error) {
      // Handle duplicate email error - retry without email
      if (isDuplicateEntryError(error)) {
        this.logger.warn(
          'Duplicate entry creating Person, retrying without email',
        );

        delete personData.emails;

        try {
          const createdPerson = await this.savePerson(personRepo, personData);

          this.logger.log(
            `Auto-created Person ${createdPerson.id} (without email)`,
          );

          return createdPerson;
        } catch (retryError) {
          this.logger.error(
            `Failed to create Person on retry: ${getIngestionErrorLogLabel(retryError)}`,
          );

          return null;
        }
      }

      this.logger.error(
        `Failed to create Person: ${getIngestionErrorLogLabel(error)}`,
      );

      return null;
    }
  }

  private async savePerson(
    personRepo: WorkspaceRepository,
    personData: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const [createdPerson] = await personRepo.save(personData);

    // Without an id the policy would silently lose its lead link
    if (!isDefined(createdPerson)) {
      throw new Error('Person save returned no record');
    }

    return createdPerson;
  }

  private normalizePhone(phone: string | undefined): string | null {
    if (!phone) {
      return null;
    }

    // Remove all non-digit characters
    const digits = phone.toString().replace(/\D/g, '');

    // Handle 11-digit numbers starting with 1 (US country code)
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1); // Remove leading 1
    }

    // Return 10-digit number or null if invalid
    return digits.length === 10 ? digits : null;
  }

  private isJunkEmail(email: string): boolean {
    const junkEmails = [
      'none@none.com',
      'test@test.com',
      'n/a@n/a.com',
      'na@na.com',
      'noemail@noemail.com',
      'no@email.com',
      'none@gmail.com',
      'none@email.com',
      'fake@fakemail.com',
      'noreply@noreply.com',
    ];

    return junkEmails.includes(email.toLowerCase());
  }
}
