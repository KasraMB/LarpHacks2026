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


`createPostgresRepository(url, { system: true })` is the worker/maintenance scope.
The omitted scope preserves that behavior for existing scripts. Browser requests
must use `repository.forUser(session.user.id)`, which captures an immutable user
ID and shares the original pool. Closing a scoped view does not close that pool.
Private entities and cursors are isolated through the owning identity. Each auth
user has one identity; pre-auth singleton data keeps a NULL owner and is never
adopted on login.

Skills default to private. Owners and signed-in readers of public skills can use
skill research; only the owner can edit or delete a skill. Public skills can be
linked to another user's private contacts without exposing those contacts.
Making a skill private is blocked while another identity uses it, and deletion
is blocked while any contact uses it. Conflict errors contain no contact data.
Worker queue leasing and acknowledgement are available only to the system scope.
