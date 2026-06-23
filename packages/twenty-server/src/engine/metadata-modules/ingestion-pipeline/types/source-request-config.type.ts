export type DateRangeParams = {
  startParam: string;
  endParam: string;
  lookbackMinutes: number;
  timezone: string;
  startTimeOverride?: string;
  endTimeOverride?: string;
  // Snap the computed lookback start down to the start of its calendar day (in
  // `timezone`). Required for pipelines that aggregate per (entity, day) and
  // upsert by that day (e.g. time cards): without it, a rolling intra-day
  // window re-aggregates a shrinking slice of each day as it ages out of the
  // lookback and overwrites the complete record with a partial one. Snapping
  // keeps every still-in-window day fully covered, so each upsert is complete.
  snapStartToDay?: boolean;
};

export type SourceRequestConfig = {
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: Record<string, unknown>;
  dateRangeParams?: DateRangeParams;
};
