import { Logger, Scope } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import { ReconciliationStateMachineService } from 'src/modules/reconciliation/services/state-machine.service';
import {
  CommissionService,
  lookupRate,
  computeDeltaStatus,
  type CommissionConfig,
  type CommissionStatementStats,
} from 'src/modules/reconciliation/services/commission.service';
import { resolveFieldMapping } from 'src/modules/reconciliation/parsers/transforms';
import { buildMatchIndexes } from 'src/modules/reconciliation/engines/matching';
import type {
  ColumnMapping,
  ReconciliationJobData,
} from 'src/modules/reconciliation/types/reconciliation';

@Processor({
  queueName: MessageQueue.reconciliationQueue,
  scope: Scope.REQUEST,
})
export class CommissionMatchJob {
  private readonly logger = new Logger(CommissionMatchJob.name);

  constructor(
    private readonly dataService: ReconciliationDataService,
    private readonly attachmentService: ReconciliationAttachmentService,
    private readonly stateMachine: ReconciliationStateMachineService,
    private readonly commissionService: CommissionService,
  ) {}

  @Process('commission-match')
  async handle({
    workspaceId,
    reconciliationId: statementId,
  }: ReconciliationJobData): Promise<void> {
    this.logger.log(`Starting commission match for statement ${statementId}`);

    try {
      // --- Setup ---
      const statement = await this.dataService.getCommissionStatement(
        workspaceId,
        statementId,
      );

      if (!statement.carrierConfigId) {
        throw new Error('No carrier config linked to this commission statement');
      }

      const carrierConfig = await this.dataService.getCarrierConfig(
        workspaceId,
        statement.carrierConfigId,
      );

      const columnMapping = statement.columnMapping as ColumnMapping;
      const commissionConfig =
        carrierConfig.commissionConfig as CommissionConfig | null;

      if (!commissionConfig) {
        throw new Error(
          'CarrierConfig has no commissionConfig. Set up commission rates before processing statements.',
        );
      }

      // Read parsed data
      const parsedRows = await this.attachmentService.readCommissionParsedData(
        workspaceId,
        statementId,
      );

      // Fetch CRM policies for matching
      const policies = await this.dataService.fetchPoliciesForMatching(
        workspaceId,
        carrierConfig.carrierId,
      );

      const matchIndexes = buildMatchIndexes(policies);

      // Find the policy number column from the column mapping
      const policyNumberHeader = Object.entries(columnMapping).find(
        ([, e]) => e.crmField === 'policyNumber',
      )?.[0];

      // Find the amount column (look for currency-type fields)
      const amountHeader = Object.entries(columnMapping).find(
        ([, e]) =>
          e.fieldType === 'CURRENCY' ||
          e.crmField?.includes('commission') ||
          e.crmField?.includes('amount'),
      )?.[0];

      this.logger.log(
        `Matching: ${parsedRows.length} statement lines against ${policies.length} CRM policies`,
      );

      // --- Match each line to a CRM policy ---
      let matched = 0;
      let unmatched = 0;
      let totalExpected = 0;
      let totalReceived = 0;
      const lineItems: Record<string, unknown>[] = [];
      const paidPolicyIds = new Set<string>();

      // Delete existing line items (idempotent on re-run)
      const existingCount =
        await this.commissionService.deleteLineItemsByStatement(
          workspaceId,
          statementId,
        );

      if (existingCount > 0) {
        this.logger.warn(
          `Deleted ${existingCount} existing line items (re-run)`,
        );
      }

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i] as Record<string, unknown>;

        const policyNumber = policyNumberHeader
          ? (row[policyNumberHeader] as string | null)
          : null;

        const amountPaidRaw = amountHeader
          ? (row[amountHeader] as number | null)
          : null;
        const amountPaid = amountPaidRaw ?? 0;

        // Build member name from available columns
        const firstNameHeader = Object.entries(columnMapping).find(
          ([, e]) =>
            e.crmField?.endsWith('.firstName') ||
            e.crmField?.endsWith('FirstName'),
        )?.[0];
        const lastNameHeader = Object.entries(columnMapping).find(
          ([, e]) =>
            e.crmField?.endsWith('.lastName') ||
            e.crmField?.endsWith('LastName'),
        )?.[0];
        const memberName = [
          firstNameHeader ? (row[firstNameHeader] as string) : '',
          lastNameHeader ? (row[lastNameHeader] as string) : '',
        ]
          .filter(Boolean)
          .join(' ');

        // Try to match by policy number (primary matching strategy for commissions)
        let matchedPolicyId: string | null = null;
        let matchMethod = 'UNMATCHED';
        let confidence = 0;

        if (policyNumber) {
          const candidates =
            matchIndexes.policyByNumber.get(policyNumber) ?? [];

          if (candidates.length === 1) {
            matchedPolicyId = candidates[0].id;
            matchMethod = 'EXACT';
            confidence = 100;
          } else if (candidates.length > 1) {
            // Multiple policies with same number — take the most recent
            const sorted = [...candidates].sort((a, b) =>
              (b.effectiveDate ?? '').localeCompare(a.effectiveDate ?? ''),
            );

            matchedPolicyId = sorted[0].id;
            matchMethod = 'FUZZY';
            confidence = 80;
          }
        }

        // Calculate expected commission
        let expectedAmount = 0;
        let deltaStatus: string = 'UNMATCHED';

        if (matchedPolicyId) {
          const policy = matchIndexes.policyById.get(matchedPolicyId);

          if (policy) {
            const state = policy.leadState;
            const rate = lookupRate(commissionConfig, state);
            const memberCount = policy.applicantCount ?? 1;

            expectedAmount = memberCount * rate;
            const delta = expectedAmount - amountPaid;

            deltaStatus = computeDeltaStatus(expectedAmount, amountPaid);
            totalExpected += expectedAmount;
            totalReceived += amountPaid;

            paidPolicyIds.add(matchedPolicyId);

            lineItems.push({
              name: `${policyNumber ?? 'unknown'} — ${memberName || `row ${i + 1}`}`,
              commissionStatementId: statementId,
              policyId: matchedPolicyId,
              policyNumber,
              memberName: memberName || null,
              amountPaid: { amountMicros: Math.round(amountPaid * 1_000_000), currencyCode: 'USD' },
              periodCovered: statement.statementPeriod ?? null,
              matchMethod,
              confidence,
              expectedAmount: { amountMicros: Math.round(expectedAmount * 1_000_000), currencyCode: 'USD' },
              delta: { amountMicros: Math.round(delta * 1_000_000), currencyCode: 'USD' },
              deltaStatus,
              rowSnapshot: row,
            });

            matched++;
          }
        } else {
          lineItems.push({
            name: `${policyNumber ?? 'unknown'} — ${memberName || `row ${i + 1}`}`,
            commissionStatementId: statementId,
            policyId: null,
            policyNumber,
            memberName: memberName || null,
            amountPaid: { amountMicros: Math.round(amountPaid * 1_000_000), currencyCode: 'USD' },
            periodCovered: statement.statementPeriod ?? null,
            matchMethod: 'UNMATCHED',
            confidence: 0,
            expectedAmount: null,
            delta: null,
            deltaStatus: 'UNMATCHED',
            rowSnapshot: row,
          });

          unmatched++;
        }
      }

      // --- Store line items ---
      await this.commissionService.batchCreateLineItems(
        workspaceId,
        lineItems,
      );

      // --- Check unmonitored policies ---
      await this.commissionService.checkUnmonitoredPolicies(
        workspaceId,
        carrierConfig.carrierId,
        paidPolicyIds,
      );

      // --- Update statement stats + transition to REVIEW ---
      const stats: CommissionStatementStats = {
        totalLines: parsedRows.length,
        matched,
        unmatched,
        totalExpected: Math.round(totalExpected * 100) / 100,
        totalReceived: Math.round(totalReceived * 100) / 100,
        delta: Math.round((totalExpected - totalReceived) * 100) / 100,
      };

      await this.stateMachine.transitionCommissionStatement(
        workspaceId,
        statementId,
        'MATCHING',
        'REVIEW',
        { stats },
      );

      const collectionRate =
        totalExpected > 0
          ? Math.round((totalReceived / totalExpected) * 10000) / 100
          : 0;

      this.logger.log(
        `Commission match complete for ${statementId}: ${matched} matched, ${unmatched} unmatched, ` +
          `$${stats.totalExpected} expected, $${stats.totalReceived} received (${collectionRate}% collection rate), ` +
          `$${stats.delta} outstanding`,
      );
    } catch (error) {
      await this.stateMachine.setCommissionStatementFailed(
        workspaceId,
        statementId,
        'MATCH',
        error,
      );

      throw error;
    }
  }
}
