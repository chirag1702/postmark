import type PgBoss from "pg-boss";
import {
  SYNC_BACKFILL_QUEUE,
  SYNC_POLL_QUEUE,
  SYNC_POLL_DISPATCH_QUEUE,
  MAIL_WRITEBACK_QUEUE,
} from "./queue-names";
import { handleBackfillJob } from "./backfill-job";
import { handlePollJob } from "./poll-job";
import { handlePollDispatchJob } from "./poll-dispatch-job";
import { handleMailWritebackJob } from "./writeback-job";

/** Registers Module 6's job queues/handlers and the recurring poll-dispatch schedule. Called
 * once from scripts/worker.ts on startup; `createQueue`/`schedule` are safe to call on every
 * process start (idempotent create/upsert). */
export async function registerSyncJobs(boss: PgBoss): Promise<void> {
  // policy: "singleton" enforces at most one active job per singletonKey (mailboxId) -- without
  // it, singletonKey has no exclusivity effect on the default "standard" queue policy.
  await boss.createQueue(SYNC_BACKFILL_QUEUE, {
    name: SYNC_BACKFILL_QUEUE,
    policy: "singleton",
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInHours: 1,
  });
  await boss.createQueue(SYNC_POLL_QUEUE, {
    name: SYNC_POLL_QUEUE,
    policy: "singleton",
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
    expireInMinutes: 4,
  });
  await boss.createQueue(SYNC_POLL_DISPATCH_QUEUE, {
    name: SYNC_POLL_DISPATCH_QUEUE,
    retryLimit: 1,
    expireInMinutes: 2,
  });

  await boss.work(SYNC_BACKFILL_QUEUE, handleBackfillJob);
  await boss.work(SYNC_POLL_QUEUE, handlePollJob);
  await boss.work(SYNC_POLL_DISPATCH_QUEUE, handlePollDispatchJob);

  await boss.schedule(SYNC_POLL_DISPATCH_QUEUE, "*/5 * * * *", {}, { tz: "UTC" });
}

/** Registers Module 7's write-back queue/handler. Called once from scripts/worker.ts on
 * startup, alongside `registerSyncJobs`. */
export async function registerWritebackJobs(boss: PgBoss): Promise<void> {
  await boss.createQueue(MAIL_WRITEBACK_QUEUE, {
    name: MAIL_WRITEBACK_QUEUE,
    retryLimit: 5,
    retryDelay: 15,
    retryBackoff: true,
    expireInMinutes: 5,
  });

  await boss.work(MAIL_WRITEBACK_QUEUE, handleMailWritebackJob);
}
