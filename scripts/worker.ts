import { getBoss } from "../src/lib/queue/boss";
import { registerSyncJobs, registerWritebackJobs } from "../src/lib/sync/register-jobs";

/**
 * Standalone pg-boss worker process, run separately from `next dev`/`next start` via
 * `npm run worker`.
 */
async function main() {
  const boss = await getBoss();
  await registerSyncJobs(boss);
  await registerWritebackJobs(boss);
  console.log(
    "pg-boss worker started; sync.backfill/sync.poll/sync.poll-dispatch/mail.writeback registered"
  );

  const shutdown = async () => {
    console.log("pg-boss worker shutting down...");
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("pg-boss worker failed to start", err);
  process.exit(1);
});
