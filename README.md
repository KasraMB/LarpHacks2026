# Alias - LarpHacks2026

Backend for [alias.md](alias.md), with shared API contracts and UI placeholders for Carson to connect. Identity, people, claims, research, contradiction checks, persisted decks, and durable background jobs are implemented. See [interfaces](docs/INTERFACES.md) and [build checklist](BUILD_CHECKLIST.md).

## Local setup

Use Node.js 22.12+ and npm (validated on Node 24.18.0). On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm ci
```

Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `FEATHERLESS_API_KEY`, and an available instruct model's exact ID in `FEATHERLESS_MODEL`. Next.js and the supplied scripts load `.env.local`; scripts also load `.env` without overwriting existing environment variables. Keep secrets out of Git.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Run the worker in a second terminal:

```sh
npm run worker
```

Open http://localhost:3000. Pages remain UI placeholders; use the typed client or POST JSON to `/api/v1/<operationName>` to exercise the backend. Reads also use POST. For example, `getIdentity` takes `{}`, and `listPeople` takes `{ "limit": 25 }`. Research/deck triggers return status immediately; the worker must run to complete them. `npm run worker:once` claims and processes at most one eligible job.

The seed requires an empty database, runs transactionally, and can safely be repeated for that demo. It creates fictional Alex/Dana/NBA data, seven dated fixture facts, a contradiction, and the completed `deck_seed_dana` with all four card types. Seed facts use example.com and are explicitly fictional. Retrieve the cached deck with `getDeck` and `{ "id": "deck_seed_dana" }`; this needs Postgres but no external research or AI. Static `src/fixtures/mock-api.ts` remains an explicit read-only UI option.

## Render

The [Blueprint](render.yaml) defines the web service, Postgres, a worker, and daily research at 06:00 UTC. Import it from GitHub, then configure:

- Web: `FEATHERLESS_API_KEY`, `FEATHERLESS_MODEL`, and a random `CRON_SECRET`.
- Cron: `APP_URL` set to the deployed web origin, such as `https://your-service.onrender.com`.

The Blueprint shares database/provider settings with the worker and the cron secret with the cron service. Migrations run before web deployment and worker startup under a database advisory lock. Build installs include development dependencies because TypeScript migration/worker scripts use tsx. Run `npm run db:seed` once from the deployed environment if you want demo data in an empty database.

Cron sends an authenticated POST to `/api/cron/research`; it queues runs, and the worker performs discovery and AI processing. Missing cron configuration returns 503; missing/incorrect authorization returns 401 before database access. For a manual cron invocation, configure `APP_URL` and `CRON_SECRET`, then run `npm run cron:research`.

Deployment, live Postgres integration, and live Featherless output have not been verified here because credentials are supplied through Render. Select a model supporting instruct/chat JSON responses; mocks validate the adapter contract but cannot establish a particular model's quality. No account authentication is included in the agreed single-identity scope.

## Behavior and layout

Services preserve claims when AI checks fail, record conversations and cutoff changes atomically, and use only each person's selected topics for decks. Research retains source metadata, tolerates individual source failures, bounds requests, and deduplicates stored facts. Decks persist immutable input snapshots, model/prompt versions, evidence, and cache fingerprints. Durable Postgres jobs have leases, three attempts, and retry backoff.

```text
src/contracts/       Shared Zod DTOs and operation registry
src/components/      Controlled UI placeholders and prop contracts (Carson)
src/app/             UI pages (Carson), API handlers
src/server/          Use cases, runtime, workers, cron, queue, adapters
src/server/db/       Drizzle schema, SQL migrations, Postgres repository
src/server/ai/       Lazy Featherless provider, structured output validation
src/server/research/ Discovery, article reading, bounded public-network fetches
scripts/             Migrate, seed, worker, cron entry points
tests/               Contract, provider, service, queue, and repository checks
```

For SQL migration workflow, see [database notes](src/server/db/README.md). The SQL migration runner is authoritative; do not apply a fresh Drizzle-generated initial migration over an existing database.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

Tests use mocked network and AI transports. PostgreSQL integration tests run only when `DATABASE_URL_TEST` names a disposable test database; they create and remove isolated test schemas. Never use the production database for that setting. The suite covers transactions, deduplication, queue retries, and seed persistence when enabled.

Optional research settings: `RESEARCH_MAX_BYTES` (1,000,000), `RESEARCH_TIMEOUT_MS` (8,000), and `JINA_READER_ENABLED=false` to disable the fallback. Each research job considers at most six unique articles across discovered sources with an overall processing deadline. Long article text is capped before AI extraction; oversized deck/history inputs fail explicitly.

The current Drizzle Kit development-tool tree has four moderate advisories through its legacy esbuild loader. The web app does not expose that development server.
