export type DateRangeParams = {
  startParam: string;
  endParam: string;
  lookbackMinutes: number;
  timezone: string;
  startTimeOverride?: string;
  endTimeOverride?: string;
};

export type SourceRequestConfig = {
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: Record<string, unknown>;
  dateRangeParams?: DateRangeParams;
};
