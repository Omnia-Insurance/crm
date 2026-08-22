export interface MessageQueueWorkerOptions {
  concurrency?: number;
  // OMNIA: backported from upstream so per-queue BullMQ lock durations can be
  // set (used by exportQueue). Forwarded by bullmq.driver.ts work().
  lockDuration?: number;
}
