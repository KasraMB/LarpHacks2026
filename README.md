# Alias - LarpHacks2026

App for [alias.md](alias.md), with frontend screens connected to the shared backend API. Identity, people, claims, research, contradiction checks, persisted decks, and durable background jobs are implemented. See [interfaces](docs/INTERFACES.md) and [build checklist](BUILD_CHECKLIST.md).

## Local setup

Use Node.js 22.12+ and npm (validated on Node 24.18.0). On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm ci
```

Copy `.env.example` to `.env.local` and set `DATABASE_URL`, a random `BETTER_AUTH_SECRET` of at least 32 characters, and `BETTER_AUTH_URL` to the exact web origin (`http://localhost:3000` locally; HTTPS in production, without a path/query). Set `FEATHERLESS_API_KEY` and an available instruct model's exact ID in `FEATHERLESS_MODEL` for generated results. Next.js and the supplied scripts load `.env.local`; scripts also load `.env` without overwriting existing environment variables. Keep secrets out of Git.

```sh
npm run db:migrate
npm run dev
```

Run the worker in a second terminal:

```sh
npm run worker
```

Open http://localhost:3000 and create an email/password account (passwords require at least 10 characters). Each account has exactly one private persona. Create private or public skills/interests, add private people, assign their interests, then record claims/conversations, run research, and build a deck for prep or live mode. Public skills and their research are shared; only the creator can edit a skill. People, claims, conversations, and decks stay private to their account.

Optionally set both `RESEND_API_KEY` and `AUTH_EMAIL_FROM` to enable verification and password-reset email. With that pair configured, users must verify their address before signing in; without it, accounts can sign in immediately and password reset is unavailable. Session cookies are HttpOnly, sessions are checked against the database, and authentication limits persist there. No live email delivery has been verified.

For a frontend-only fictional demo, explicitly set `NEXT_PUBLIC_ALIAS_API=memory` (writable data that resets on refresh) or `mock` (static read-only fixtures) before starting/building. Leave this variable unset on Render to use accounts, Postgres, and real jobs; API errors never switch to demo data.

The typed client sends POST JSON to `/api/v1/<operationName>`, including reads. For example, `getIdentity` takes `{}`, and `listPeople` takes `{ "limit": 25 }`. Research/deck triggers return status immediately; the worker must run to complete them. The UI polls while jobs are queued or running, including automatic retry delays, and displays final failures. `npm run worker:once` claims and processes at most one eligible job.

`npm run db:seed` is an optional maintenance fixture for an empty database. It runs transactionally and can be repeated safely, but creates unowned fictional Alex/Dana/NBA records, seven dated fixture facts, a contradiction, and a cached deck. These records are inaccessible to signed-in accounts. Existing singleton records also remain unowned after migration and are never adopted when someone signs up. Use explicit memory mode for the fictional UI demo.

## Render

The [Blueprint](render.yaml) defines one Free web service and one Free Postgres database. The web service runs Next.js and the queue worker together. Import it from GitHub, then configure:

- Web: `BETTER_AUTH_URL` set to the exact HTTPS app origin, `FEATHERLESS_API_KEY`, `FEATHERLESS_MODEL`, and a random `CRON_SECRET`. The Blueprint generates `BETTER_AUTH_SECRET`; manual setup needs a random secret of at least 32 characters. Add both Resend variables above if account email is required.

For manual setup choose Web Service, Node, branch `main`, no root directory, build `npm ci --include=dev && npm run build`, start `npm run start:render`, and Free compute. Create Free Postgres in the same region and set the web service's `DATABASE_URL` to its Internal Database URL. Set `NODE_VERSION=24.18.0`. Keep Render's `PORT` setting.

Startup applies migrations under a database advisory lock before launching HTTP and the worker. Both processes share the web service's environment; if either exits the service stops so Render can restart it. Build installs include development dependencies because the scripts use tsx. Free services sleep after 15 minutes without incoming traffic, so queued jobs pause while asleep and resume after wake-up (an interrupted job may wait for its lease to expire). Free Postgres expires after 30 days. There is no paid worker or automatic daily cron in this configuration. Run research manually for the event; daily scheduling can be added when event credits are confirmed.

Deployment does not automatically create accounts or demo data. New accounts begin with their own empty workspace; the maintenance seed does not populate it.

Cron sends an authenticated POST to `/api/cron/research`; it queues runs, and the worker performs discovery and AI processing. Missing cron configuration returns 503; missing/incorrect authorization returns 401 before database access. For a manual cron invocation, configure `APP_URL` and `CRON_SECRET`, then run `npm run cron:research`.

Seven integration checks passed against a real disposable PostgreSQL database. Production deployment, live Featherless/provider output, and live email delivery remain unverified. Select a model supporting instruct/chat JSON responses; mocks validate the adapter contract but cannot establish a particular model's quality.

## Behavior and layout

Open a completed deck's **Go live** link and choose **Start listening** for interim speech-to-text, immediate saved-card matches, and streamed beginner-friendly suggestions. A typed fallback and manual card browsing remain available. Speech recognition needs a supporting browser over HTTPS (or localhost); the microphone hears nearby audio and does not automatically capture a remote call. **Stop** ends capture and requests. No new credentials are needed beyond Featherless. See the [Live integration contract](docs/LIVE_INTEGRATION.md) for browser support, privacy, cancellation, limits, and the streaming API.

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

Tests use mocked network, AI, and email transports. PostgreSQL integration tests run only when `DATABASE_URL_TEST` names a disposable test database; they create and remove isolated test schemas. Never use the production database for that setting. Seven real PostgreSQL checks passed, covering persistence/queues/seed behavior, account isolation, concurrent single-persona saves, creator-only skill edits, private snapshots, and migration of legacy unowned data. Auth tests cover session revocation, origin checks, rate limits, verification, and reset behavior.

Optional research settings: `RESEARCH_MAX_BYTES` (1,000,000), `RESEARCH_TIMEOUT_MS` (8,000), and `JINA_READER_ENABLED=false` to disable the fallback. Each research job considers at most six unique articles across discovered sources with an overall processing deadline. Long article text is capped before AI extraction; oversized deck/history inputs fail explicitly.

Deck generation allows up to 3,000 output tokens and 60 seconds per provider request; fact extraction and contradiction checks retain the 20-second timeout. Failed decks distinguish missing evidence, provider authentication/access/quota problems, request rejection, timeouts, truncated or invalid output, and oversized input using fixed messages that never expose provider bodies or credentials. After correcting evidence or configuration, build a new deck; previously failed snapshots keep their saved error.

The deck prompt (`featherless-deck-refs-v2`) supplies short evidence references such as `C1` and `F1`. The model returns exactly four distinct card types; the server restores saved claim/fact IDs, source URLs, selected topics, and positions from that snapshot. Unknown references fail validation. Malformed or invalid cards receive one corrective generation attempt with the same evidence; provider/transport failures and truncation do not trigger that extra attempt. Queued snapshots from an older prompt version must be rebuilt after deployment.

New research runs filter known-date news to the last 30 days and require topic relevance in article titles or URL paths. Literal topics such as C++ retain their punctuation; Wikipedia provides background context, and unknown publication dates remain eligible without invented dates. These discovery rules do not rewrite historical runs or facts. Google News must resolve to a readable publisher page; opaque redirects produce an explicit source error.

Set `COMPOSIO_API_KEY` on the Render web service to also discover articles with [Composio Search](https://docs.composio.dev/toolkits/composio_search). No custom feeds, OAuth connection, CLI, or additional package is required. The server calls `COMPOSIO_SEARCH_WEB` on the pinned `20260903_00` toolkit release, with a 15-second deadline and 1 MB response cap. Search citations supply candidate links; the existing safe article reader and Featherless fact extraction still verify and process the pages. Generated search summaries are never stored as facts. Missing publication dates remain unknown and use retrieval time under the existing cutoff rules. Google News, Hacker News, Reddit, Wikipedia and topic feeds continue running when Composio is absent or fails; individual failures appear in research run details. Composio usage is billed to the configured project. Live execution must be checked on Render because the local tests use mocked responses and no production credentials.

The current Drizzle Kit development-tool tree has four moderate advisories through its legacy esbuild loader. The web app does not expose that development server.
