import { type LoggerService } from '@nestjs/common';

import { isNumber, isUndefined } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

type SlowPathContextValue = boolean | number | string | null | undefined;

type SlowPathContext = Record<string, SlowPathContextValue>;

type SlowPathDurations = Record<string, number>;

type SlowPathLogger = Pick<LoggerService, 'warn'>;

type CreateSlowPathObserverOptions = {
  logger: SlowPathLogger;
  message: string;
  thresholdMs: number;
};

type WarnIfSlowDurationOptions = CreateSlowPathObserverOptions & {
  context?: SlowPathContext;
  durationMs: number;
};

const formatContextValue = (value: SlowPathContextValue) => {
  if (!isDefined(value)) {
    return '-';
  }

  if (isNumber(value)) {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }

  return String(value);
};

const formatContext = (context: SlowPathContext) =>
  Object.entries(context)
    .filter(([, value]) => !isUndefined(value))
    .map(([key, value]) => `${key}=${formatContextValue(value)}`)
    .join(' ');

export const warnIfSlowDuration = ({
  logger,
  message,
  thresholdMs,
  durationMs,
  context = {},
}: WarnIfSlowDurationOptions) => {
  if (durationMs < thresholdMs) {
    return false;
  }

  logger.warn(
    `${message}: ${formatContext({
      ...context,
      durationMs,
    })}`,
  );

  return true;
};

export const createSlowPathObserver = ({
  logger,
  message,
  thresholdMs,
}: CreateSlowPathObserverOptions) => {
  const startedAt = performance.now();
  const durations: SlowPathDurations = {};

  const observeAsync = async <TResult>(
    durationKey: string,
    fn: () => Promise<TResult>,
  ): Promise<TResult> => {
    const durationStartedAt = performance.now();

    try {
      return await fn();
    } finally {
      durations[durationKey] = performance.now() - durationStartedAt;
    }
  };

  const observeSync = <TResult>(
    durationKey: string,
    fn: () => TResult,
  ): TResult => {
    const durationStartedAt = performance.now();

    try {
      return fn();
    } finally {
      durations[durationKey] = performance.now() - durationStartedAt;
    }
  };

  const warnIfSlow = (context: SlowPathContext = {}) => {
    const totalMs = performance.now() - startedAt;

    if (totalMs < thresholdMs) {
      return false;
    }

    logger.warn(
      `${message}: ${formatContext({
        ...context,
        totalMs,
        ...durations,
      })}`,
    );

    return true;
  };

  return {
    getDurationMs: (durationKey: string) => durations[durationKey],
    getTotalDurationMs: () => performance.now() - startedAt,
    observeAsync,
    observeSync,
    warnIfSlow,
  };
};
