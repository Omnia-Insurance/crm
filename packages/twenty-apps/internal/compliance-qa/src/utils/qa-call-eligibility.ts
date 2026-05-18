import { type SourceCall } from 'src/utils/records';

export type QaCallEligibilityResult =
  | {
      eligible: true;
    }
  | {
      eligible: false;
      reason: string;
    };

type QaCallEligibilityOptions = {
  minimumDurationSeconds?: number;
};

const DEFAULT_MINIMUM_DURATION_SECONDS = 300;

const getNonEmptyEnvValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();

  return value !== undefined && value.length > 0 ? value : undefined;
};

const parseIntegerEnvValue = ({
  name,
  fallback,
}: {
  name: string;
  fallback: number;
}): number => {
  const value = getNonEmptyEnvValue(name);

  if (value === undefined) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsedValue)) {
    throw new Error(`${name} must be a safe integer`);
  }

  return parsedValue;
};

const validateMinimumDurationSeconds = (value: number): number => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error('minDurationSeconds must be a non-negative integer');
  }

  return value;
};

const getMinimumDurationSeconds = (
  options?: QaCallEligibilityOptions,
): number =>
  options?.minimumDurationSeconds !== undefined
    ? validateMinimumDurationSeconds(options.minimumDurationSeconds)
    : parseIntegerEnvValue({
        name: 'COMPLIANCE_QA_MIN_DURATION_SECONDS',
        fallback: DEFAULT_MINIMUM_DURATION_SECONDS,
      });

const getDelimitedEnvValues = (name: string): Set<string> | null => {
  const value = getNonEmptyEnvValue(name);

  if (value === undefined) {
    return null;
  }

  const values = value
    .split(',')
    .map((rawValue) => rawValue.trim())
    .filter((rawValue) => rawValue.length > 0);

  return values.length > 0 ? new Set(values) : null;
};

const getEnabledAfterTimestamp = (): number | null => {
  const value = getNonEmptyEnvValue('COMPLIANCE_QA_ENABLED_AFTER');

  if (value === undefined) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error('COMPLIANCE_QA_ENABLED_AFTER must be a valid date string');
  }

  return timestamp;
};

const getStringEligibilityFailure = ({
  envName,
  fieldName,
  value,
}: {
  envName: string;
  fieldName: string;
  value?: string | null;
}): string | null => {
  const allowedValues = getDelimitedEnvValues(envName);

  if (allowedValues === null) {
    return null;
  }

  const trimmedValue = value?.trim();

  if (trimmedValue === undefined || trimmedValue.length === 0) {
    return `${fieldName} is missing`;
  }

  if (!allowedValues.has(trimmedValue)) {
    return `${fieldName} "${trimmedValue}" is not enabled for Compliance QA`;
  }

  return null;
};

const isString = (value: string | null): value is string => value !== null;

export const isCallEligibleForComplianceQa = (
  call: SourceCall,
  options?: QaCallEligibilityOptions,
): QaCallEligibilityResult => {
  const minimumDurationSeconds = getMinimumDurationSeconds(options);
  const duration = call.duration;

  if (duration === undefined || duration === null) {
    return {
      eligible: false,
      reason: 'Call duration is missing',
    };
  }

  if (!Number.isFinite(duration) || duration < minimumDurationSeconds) {
    return {
      eligible: false,
      reason: `Call duration ${duration} is below ${minimumDurationSeconds} seconds`,
    };
  }

  const enabledAfterTimestamp = getEnabledAfterTimestamp();

  if (enabledAfterTimestamp !== null) {
    if (call.callDate === undefined || call.callDate === null) {
      return {
        eligible: false,
        reason: 'Call date is missing',
      };
    }

    const callDateTimestamp = Date.parse(call.callDate);

    if (!Number.isFinite(callDateTimestamp)) {
      return {
        eligible: false,
        reason: `Call date "${call.callDate}" is invalid`,
      };
    }

    if (callDateTimestamp < enabledAfterTimestamp) {
      return {
        eligible: false,
        reason: `Call date "${call.callDate}" is before Compliance QA enablement`,
      };
    }
  }

  const stringEligibilityFailures = [
    getStringEligibilityFailure({
      envName: 'COMPLIANCE_QA_ALLOWED_DIRECTIONS',
      fieldName: 'Call direction',
      value: call.direction,
    }),
    getStringEligibilityFailure({
      envName: 'COMPLIANCE_QA_ALLOWED_STATUSES',
      fieldName: 'Call status',
      value: call.status,
    }),
    getStringEligibilityFailure({
      envName: 'COMPLIANCE_QA_ALLOWED_STATUS_NAMES',
      fieldName: 'Call status name',
      value: call.statusName,
    }),
    getStringEligibilityFailure({
      envName: 'COMPLIANCE_QA_ALLOWED_QUEUE_NAMES',
      fieldName: 'Call queue name',
      value: call.queueName,
    }),
    getStringEligibilityFailure({
      envName: 'COMPLIANCE_QA_ALLOWED_LEAD_SOURCE_IDS',
      fieldName: 'Call lead source',
      value: call.leadSourceId,
    }),
  ].filter(isString);

  if (stringEligibilityFailures.length > 0) {
    return {
      eligible: false,
      reason: stringEligibilityFailures[0],
    };
  }

  return {
    eligible: true,
  };
};
