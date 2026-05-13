import { Injectable, Logger } from '@nestjs/common';

import { IngestionPipelineEntity } from 'src/engine/metadata-modules/ingestion-pipeline/entities/ingestion-pipeline.entity';

type ProductivityEvent = Record<string, unknown> & {
  user_id?: string;
  state?: string;
  availability_code?: string;
  event_sec?: string;
  created_at?: string;
};

type DailyAggregate = {
  user_id: string;
  date: string;
  totalSeconds: number;
  lunchSeconds: number;
};

const LUNCH_AVAILABILITY_CODE = '1217';

// Convoso reports `event_sec` as HH:MM:SS or MM:SS — convert to total seconds.
const parseEventSeconds = (eventSec: string | undefined): number => {
  if (!eventSec) {
    return 0;
  }

  const parts = eventSec.split(':').map(Number);

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return 0;
};

// `created_at` arrives as 'YYYY-MM-DD HH:MM:SS' in Convoso account TZ — the
// date prefix is the working day we aggregate by.
const extractDate = (createdAt: string | undefined): string | null => {
  if (!createdAt) {
    return null;
  }

  const [date] = createdAt.split(' ');

  return date || null;
};

@Injectable()
export class TimeCardPreprocessor {
  private readonly logger = new Logger(TimeCardPreprocessor.name);

  // Per-record preprocessing isn't meaningful here — Time Cards are a many-
  // to-many roll-up of productivity events into one row per (agent, day).
  // The framework invokes preProcessBatch instead; this stub satisfies the
  // interface contract.
  async preProcess(
    _payload: Record<string, unknown>,
    _pipeline: IngestionPipelineEntity,
    _workspaceId: string,
  ): Promise<Record<string, unknown> | null> {
    return null;
  }

  async preProcessBatch(
    payloads: Record<string, unknown>[],
    _pipeline: IngestionPipelineEntity,
    _workspaceId: string,
  ): Promise<Record<string, unknown>[]> {
    const aggregates = new Map<string, DailyAggregate>();

    let skippedSystemEvents = 0;
    let skippedMissingFields = 0;

    for (const payload of payloads as ProductivityEvent[]) {
      const state = payload.state?.trim();
      const stateLower = state?.toLowerCase();

      // LOGIN/LOGOUT/empty state are system markers, not work time.
      if (!state || stateLower === 'login' || stateLower === 'logout') {
        skippedSystemEvents++;
        continue;
      }

      const userId = payload.user_id;
      const date = extractDate(payload.created_at);

      if (!userId || !date) {
        skippedMissingFields++;
        continue;
      }

      const key = `${userId}-${date}`;
      const eventSeconds = parseEventSeconds(payload.event_sec);

      const existing = aggregates.get(key);

      if (existing) {
        existing.totalSeconds += eventSeconds;
        if (payload.availability_code === LUNCH_AVAILABILITY_CODE) {
          existing.lunchSeconds += eventSeconds;
        }
      } else {
        aggregates.set(key, {
          user_id: userId,
          date,
          totalSeconds: eventSeconds,
          lunchSeconds:
            payload.availability_code === LUNCH_AVAILABILITY_CODE
              ? eventSeconds
              : 0,
        });
      }
    }

    this.logger.log(
      `Aggregated ${payloads.length} events into ${aggregates.size} (agent, day) rows (skipped ${skippedSystemEvents} system, ${skippedMissingFields} missing fields)`,
    );

    return Array.from(aggregates.values()).map((agg) => ({
      user_id: agg.user_id,
      date: agg.date,
      loginSeconds: agg.totalSeconds,
      pauseSeconds: agg.lunchSeconds,
      billableHours:
        Math.round(((agg.totalSeconds - agg.lunchSeconds) / 3600) * 100) / 100,
    }));
  }
}
