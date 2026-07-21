import PgBoss from "pg-boss";

// Cached on `globalThis` (not a module-level variable) so `next dev`'s hot-reload doesn't spawn
// a second pg-boss instance -- module state resets on HMR, globalThis does not.
declare global {
  var __pgBoss: Promise<PgBoss> | undefined;
}

function createBoss(): Promise<PgBoss> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set -- required for pg-boss");
  }

  const boss = new PgBoss(connectionString);
  boss.on("error", (err) => console.error("pg-boss error", err));

  return boss.start();
}

/** Returns the shared pg-boss instance, starting it (and its Postgres schema) on first call. */
export function getBoss(): Promise<PgBoss> {
  if (!globalThis.__pgBoss) {
    globalThis.__pgBoss = createBoss();
  }
  return globalThis.__pgBoss;
}
