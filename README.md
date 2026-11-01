# Alias - LarpHacks2026

App for [alias.md](alias.md), with frontend screens connected to the shared backend API. Identity, people, claims, research, contradiction checks, persisted decks, and durable background jobs are implemented. See [interfaces](docs/INTERFACES.md) and [build checklist](BUILD_CHECKLIST.md).

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

Open http://localhost:3000. The screens use the real HTTP API by default: set up an identity, create interests and people, assign a person's interests, then record claims/conversations, run research, and build a deck for prep or live mode. For frontend-only development, explicitly set `NEXT_PUBLIC_ALIAS_API=memory` (writable fictional data that resets on refresh) or `mock` (static read-only fixtures) before starting/building. Leave this variable unset on Render to use Postgres and real jobs; API errors never switch to demo data.

The typed client sends POST JSON to `/api/v1/<operationName>`, including reads. For example, `getIdentity` takes `{}`, and `listPeople` takes `{ "limit": 25 }`. Research/deck triggers return status immediately; the worker must run to complete them. The UI polls while jobs are queued or running, including automatic retry delays, and displays final failures. `npm run worker:once` claims and processes at most one eligible job.

The seed requires an empty database, runs transactionally, and can safely be repeated for that demo. It creates fictional Alex/Dana/NBA data, seven dated fixture facts, a contradiction, and the completed `deck_seed_dana` with all four card types. Seed facts use example.com and are explicitly fictional. Retrieve the cached deck with `getDeck` and `{ "id": "deck_seed_dana" }`; this needs Postgres but no external research or AI. Static `src/fixtures/mock-api.ts` remains an explicit read-only UI option.

## Render

The [Blueprint](render.yaml) defines one Free web service and one Free Postgres database. The web service runs Next.js and the queue worker together. Import it from GitHub, then configure:

- Web: `FEATHERLESS_API_KEY`, `FEATHERLESS_MODEL`, and a random `CRON_SECRET`.

For manual setup choose Web Service, Node, branch `main`, no root directory, build `npm ci --include=dev && npm run build`, start `npm run start:render`, and Free compute. Create Free Postgres in the same region and set the web service's `DATABASE_URL` to its Internal Database URL. Set `NODE_VERSION=24.18.0`. Keep Render's `PORT` setting.

Startup applies migrations under a database advisory lock before launching HTTP and the worker. Both processes share the web service's environment; if either exits the service stops so Render can restart it. Build installs include development dependencies because the scripts use tsx. Free services sleep after 15 minutes without incoming traffic, so queued jobs pause while asleep and resume after wake-up (an interrupted job may wait for its lease to expire). Free Postgres expires after 30 days. There is no paid worker or automatic daily cron in this configuration. Run research manually for the event; daily scheduling can be added when event credits are confirmed.

Free services have no dashboard shell. To seed an empty demo database, run `npm run db:seed` locally using its External Database URL in an uncommitted `.env.local`; restore local configuration afterward. Deployment does not automatically create demo data.

Cron sends an authenticated POST to `/api/cron/research`; it queues runs, and the worker performs discovery and AI processing. Missing cron configuration returns 503; missing/incorrect authorization returns 401 before database access. For a manual cron invocation, configure `APP_URL` and `CRON_SECRET`, then run `npm run cron:research`.

Deployment, live Postgres integration, and live Featherless output have not been verified here because credentials are supplied through Render. Select a model supporting instruct/chat JSON responses; mocks validate the adapter contract but cannot establish a particular model's quality. No account authentication is included in the agreed single-identity scope.

## Behavior and layout

Services preserve claims when AI checks fail, record conversations and cutoff changes atomically, and use only each person's selected topics for decks. Research retains source metadata, tolerates individual source failures, bounds requests, and deduplicates stored facts. Decks persist immutable input snapshots, model/prompt versions, evidence, and cache fingerprints. Durable Postgres jobs have leases, three attempts, and retry backoff.

```text
src/contracts/       Shared Zod DTOs and operation registry
src/components/      Frontend forms, controllers, prep/live modes, prop contracts
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
