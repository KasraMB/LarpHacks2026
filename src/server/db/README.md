The SQL files in `migrations/` are authoritative and run through `migrate.ts` using
the `alias_migrations` ledger. Run `npm run db:migrate` from the repository root.
The runner serializes concurrent deployments and applies pending SQL in one
transaction.

`schema.ts` describes the same physical application tables for Drizzle tooling.
This repository does not include a Drizzle-generated baseline or its snapshot
metadata. Consequently, `db:generate` starts from an empty Drizzle history and
will propose the full schema; do not apply that baseline to an existing database.
For later changes, update both `schema.ts` and a new numbered SQL migration.
Do not edit SQL migrations already applied to deployed databases.
