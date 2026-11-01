import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function migrate(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(281924612)`;
      await tx`CREATE TABLE IF NOT EXISTS alias_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
      const directory = join(process.cwd(), "src/server/db/migrations");
      for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
        if ((await tx`SELECT name FROM alias_migrations WHERE name = ${name}`).length) continue;
        await tx.unsafe(await readFile(join(directory, name), "utf8"));
        await tx`INSERT INTO alias_migrations(name) VALUES (${name})`;
      }
    });
  } finally { await sql.end(); }
}
