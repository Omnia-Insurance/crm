import { type MessageQueueWorkerOptions } from 'src/engine/core-modules/message-queue/interfaces/message-queue-worker-options.interface';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

export const QUEUE_WORKER_OPTIONS: Partial<
  Record<MessageQueue, MessageQueueWorkerOptions>
> = {
  [MessageQueue.aiStreamQueue]: { concurrency: 20 },
  // OMNIA: CSV exports have long synchronous stretches (relation flattening,
  // json2csv). With the default 30s lock a healthy job can miss lock renewal,
  // be marked stalled and re-delivered — which the export processor now
  // treats as a crash and fails. Five minutes keeps healthy jobs locked.
  [MessageQueue.exportQueue]: { lockDuration: 5 * 60 * 1000 },
};
