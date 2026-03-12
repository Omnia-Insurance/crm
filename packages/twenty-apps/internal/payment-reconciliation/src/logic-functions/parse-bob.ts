import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk';
import { CoreApiClient } from 'twenty-sdk/generated';

import { parseXlsxSheet } from 'src/utils/xlsx-parser';
import { parseAmbetterBob } from 'src/utils/parse-ambetter-bob';
import { PARSE_BOB_LOGIC_FUNCTION_ID } from 'src/constants/universal-identifiers';

type SourceFileRecord = {
  id: string;
  name?: string;
  parseStatus?: string;
  sheetName?: string;
  uploadedFile?: {
    path?: string;
    url?: string;
  }[];
  carrierConfigId?: string;
};

type CarrierConfigNode = {
  id: string;
  parserId: string | null;
  bobColumnMapping: Record<string, string[]> | null;
};

const handler = async (
  params: DatabaseEventPayload<ObjectRecordCreateEvent<SourceFileRecord>>,
) => {
  const sourceFile = params.properties.after;

  // Idempotency guard
  if (sourceFile.parseStatus !== 'PENDING') {
    console.log(
      `[parse-bob] SourceFile ${sourceFile.id} status is "${sourceFile.parseStatus}", skipping`,
    );

    return;
  }

  const client = new CoreApiClient();

  // Update status to PARSING
  await client.mutation({
    updatePayReconSourceFile: {
      __args: {
        id: sourceFile.id,
        data: { parseStatus: 'PARSING' },
      },
      id: true,
    },
  });

  try {
    // Fetch carrier config
    if (!sourceFile.carrierConfigId) {
      throw new Error('No carrier config linked to this source file');
    }

    const { payReconCarrierConfig: carrierConfig } = (await client.query({
      payReconCarrierConfig: {
        __args: { id: sourceFile.carrierConfigId },
        id: true,
        parserId: true,
        bobColumnMapping: true,
      },
    })) as unknown as { payReconCarrierConfig: CarrierConfigNode };

    if (!carrierConfig) {
      throw new Error(
        `Carrier config ${sourceFile.carrierConfigId} not found`,
      );
    }

    if (!carrierConfig.bobColumnMapping) {
      throw new Error('Carrier config has no bobColumnMapping');
    }

    // Download the file
    const fileEntry = sourceFile.uploadedFile?.[0];

    if (!fileEntry?.url && !fileEntry?.path) {
      throw new Error('No uploaded file URL found on SourceFile record');
    }

    const fileUrl = fileEntry.url ?? fileEntry.path!;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      throw new Error(
        `Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`,
      );
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse XLSX
    const rows = parseXlsxSheet(buffer, sourceFile.sheetName);

    // Route to the correct parser
    const parserId = carrierConfig.parserId ?? 'ambetter-bob-v1';
    let normalizedRows;
    let parseErrors;

    if (parserId === 'ambetter-bob-v1') {
      const result = parseAmbetterBob(
        rows,
        carrierConfig.bobColumnMapping as Record<string, string[]>,
      );

      normalizedRows = result.normalized;
      parseErrors = result.errors;
    } else {
      throw new Error(`Unknown parser ID: "${parserId}"`);
    }

    if (parseErrors.length > 0) {
      console.log(
        `[parse-bob] ${parseErrors.length} row-level errors during parsing`,
        parseErrors.slice(0, 5),
      );
    }

    // Create NormalizedBookRow records
    for (const row of normalizedRows) {
      await client.mutation({
        createPayReconNormalizedBookRow: {
          __args: {
            data: {
              name: row.name,
              rowNumber: row.rowNumber,
              carrierPolicyNumber: row.carrierPolicyNumber,
              subscriberNumber: row.subscriberNumber,
              memberFirstName: row.memberFirstName,
              memberLastName: row.memberLastName,
              memberDob: row.memberDob,
              brokerName: row.brokerName,
              brokerEffectiveDate: row.brokerEffectiveDate,
              policyEffectiveDate: row.policyEffectiveDate,
              trueEffectiveDate: row.trueEffectiveDate,
              paidThroughDate: row.paidThroughDate,
              termDate: row.termDate,
              eligibleForCommission: row.eligibleForCommission,
              numberOfMembers: row.numberOfMembers,
              planName: row.planName,
              monthlyPremium: row.monthlyPremium,
              memberResponsibility: row.memberResponsibility,
              memberPhone: row.memberPhone,
              memberEmail: row.memberEmail,
              exchangeSubscriberId: row.exchangeSubscriberId,
              brokerNpn: row.brokerNpn,
              payableAgent: row.payableAgent,
              onOffExchange: row.onOffExchange,
              county: row.county,
              state: row.state,
              rawPayload: row.rawPayload,
              sourceFileId: sourceFile.id,
            },
          },
          id: true,
        },
      });
    }

    // Update source file with success
    await client.mutation({
      updatePayReconSourceFile: {
        __args: {
          id: sourceFile.id,
          data: {
            parseStatus: 'COMPLETED',
            totalRows: normalizedRows.length,
            parsedAt: new Date().toISOString(),
          },
        },
        id: true,
      },
    });

    console.log(
      `[parse-bob] Successfully parsed ${normalizedRows.length} rows from SourceFile ${sourceFile.id}`,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    console.error(`[parse-bob] Failed for SourceFile ${sourceFile.id}:`, errorMessage);

    await client.mutation({
      updatePayReconSourceFile: {
        __args: {
          id: sourceFile.id,
          data: {
            parseStatus: 'FAILED',
            parseError: errorMessage.slice(0, 500),
          },
        },
        id: true,
      },
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: PARSE_BOB_LOGIC_FUNCTION_ID,
  name: 'parse-bob',
  description:
    'Parses an uploaded carrier BOB file into NormalizedBookRow records',
  timeoutSeconds: 120,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'payReconSourceFile.created',
  },
});
