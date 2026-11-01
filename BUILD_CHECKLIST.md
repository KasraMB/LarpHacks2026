# Alias build checklist

Suggested two-person split: **A (Carson) owns the interface**, **B owns data, research, and AI**. Swap the labels to fit your strengths. Work together on setup, shared types, integration, and the demo.

**Backend status (2026-11-01):** Checked backend items indicate implemented code and available checks, not live Render verification. Seven integration checks passed against real disposable PostgreSQL, including account isolation, legacy migration, and maintenance seed behavior; reruns require `DATABASE_URL_TEST`. Email/password auth, origin/session gating, persistent auth limits, verification/reset tests, Featherless adapter, build/start commands, and migrations are implemented. Production deployment, live provider/model output, live email delivery, and end-to-end validation remain pending. Carson items retain their existing status.

This checklist translates `alias.md` into build tasks. Current scope is email/password accounts with exactly one private persona per account. Public/private skills have creator-only edits; public research is shared while people, conversations, claims, and decks remain private.

## 1. Shared foundation — together, first

- [x] Create the Next.js App Router project with TypeScript and Tailwind.
- [x] Install and configure Drizzle, Zod, the OpenAI client, and research dependencies.
- [x] Add `.env.example` with database, provider, cron, auth secret/origin, and optional paired Resend settings; keep real secrets out of Git. Auth requires a secret of at least 32 characters and an explicit HTTPS production origin.
- [ ] Agree on shared Zod schemas and API request/response shapes for identities, interests, people, claims, research, decks, and cards. **[Carson]**
- [ ] Agree on how a person's interests are linked and how their last-conversation timestamp is recorded. **[Carson]**
- [x] Create sample API responses so A can build screens while B builds the services.
- [x] Document local setup and commands in the README.

Done when both people can run the app and use the same sample data shapes.

## 2. Database and persistence — B

- [x] Configure Postgres and Drizzle migrations.
- [x] Store the cover identity and its background details.
- [x] Enforce one persona per account, immutable request scope, and private resource isolation.
- [x] Add account/session/verification/rate-limit persistence and creator-only edits for public/private skills.
- [x] Preserve legacy singleton data as unowned and inaccessible; never adopt it on signup.
- [x] Create `people`, including last-conversation timestamps.
- [x] Create `interests` and links between people and relevant interests.
- [x] Create timestamped `claims`, linked to people and optionally interests.
- [x] Create `research_runs` with status, timing, and failure details.
- [x] Store extracted research facts with topic, source URL, publication date, and collection date.
- [x] Store decks and `cards`, linked to a person, with card type, topic, content, and supporting sources or claims.
- [x] Add queries for a person's claims and research since their last conversation.
- [x] Add a repeatable unowned maintenance seed, separate from the signed-in workspace.

The original table list needs additional storage for the identity, research facts, and deck grouping; agree on that schema before implementing dependent features.

## 3. Identity, interests, and people — A + B

### A: screens

- [ ] Build the app shell and navigation. **[Carson]**
- [ ] Build the cover identity setup/edit form. **[Carson]**
- [ ] Build interest creation, editing, and removal. **[Carson]**
- [ ] Build the people list and create/edit forms. **[Carson]**
- [ ] Build a person's detail page with interests, last conversation, claims, and a Build my deck button. **[Carson]**
- [ ] Add loading, empty, validation, and error states. **[Carson]**

### B: services

- [x] Implement validated create/read/update operations for the identity.
- [x] Implement validated create/read/update/delete operations for interests and people.
- [x] Implement email/password authentication, database session revocation, origin checks, and persistent auth limits; optional paired email configuration enables required verification and password reset.
- [x] Persist person-interest links and last-conversation timestamps.

Done when a user can create a cover, add a topic and a person, and reload without losing them.

## 4. Claims ledger and contradiction checks — A + B

### A: screens

- [ ] Add a timestamped claims ledger to each person's page. **[Carson]**
- [ ] Build the post-call form for logging new claims and recording when the conversation happened. **[Carson]**
- [ ] Display contradiction warnings with the conflicting earlier claim and an explanation. **[Carson]**
- [ ] Keep claim entry usable if the AI check fails; show the check status. **[Carson]**

### B: services

- [x] Implement claim creation and retrieval per person.
- [x] Configure the Featherless client and choose an available instruct model.
- [x] Compare a new claim with that person's previous claims.
- [x] Validate structured AI output and store contradiction results.
- [x] Handle timeouts and invalid model responses.

Done when logging a deliberately conflicting claim shows the earlier claim it contradicts.

## 5. Research pipeline — B

- [x] Define topic search terms and hand-picked RSS source packs.
- [x] Discover links through RSS packs and Google News RSS.
- [x] Add Hacker News Algolia discovery where relevant.
- [x] Add Reddit RSS/JSON for fan reactions and Wikipedia for context.
- [x] Fetch article text using Readability and jsdom, with Jina Reader as fallback.
- [x] Deduplicate articles and avoid storing the same facts on repeated runs.
- [x] Extract structured facts with Featherless and validate them with Zod.
- [x] Preserve source URLs and dates; distinguish reported facts from fan reactions.
- [x] Filter new known-date news to 30 days, preserve literal C++ topic matching, and require title/path relevance. Keep Wikipedia as background and unknown dates eligible; leave historical runs unchanged.
- [x] Report opaque Google News redirects as explicit source errors.
- [x] Store facts and update research-run status.
- [x] Make individual source failures recoverable and bound fetch/model work per run.
- [x] Expose an on-demand research operation and protect the cron endpoint with `CRON_SECRET`.

Done when one topic produces persisted, source-linked facts and a failed source does not discard the whole run.

## 6. Research timeline — A

- [ ] Build the topic research timeline with dates and source links. **[Carson]**
- [ ] Add a Run now button wired to the research operation. **[Carson]**
- [ ] Show running, completed, failed, and no-results states. **[Carson]**
- [ ] Refresh the timeline when a run completes. **[Carson]**

Depends on section 5's API contract; build against sample responses first.

## 7. Deck generation — B

- [x] Collect the person's claims, relevant interests, contradiction warnings, and research since their last conversation.
- [x] Define first-conversation behavior when there is no previous conversation date.
- [x] Generate all four card types: Back story, What changed, If she asks, and Don't say.
- [x] Attach topic tags and supporting source links or claim references to cards.
- [x] Validate the generated deck, persist it, and expose generation/retrieval operations.
- [x] Handle missing research and model failures with a clear result the UI can display.
- [x] Cache generated decks for reliable reuse and demo playback.

Done when Dana's saved claims and research produce a saved deck covering all four types, including a contradiction trap.

## 8. Flashcard experience — A

- [ ] Wire Build my deck to generation and show progress/errors. **[Carson]**
- [ ] Build cards with readable type labels, topic tags, and evidence links. **[Carson]**
- [ ] Build prep mode with question/answer reveal and next/previous controls. **[Carson]**
- [ ] Build a compact live mode suitable beside a call window. **[Carson]**
- [ ] Add keyboard shortcuts and topic jump/filter controls. **[Carson]**
- [ ] Make controls keyboard accessible and layouts usable on smaller screens. **[Carson]**
- [ ] Connect the post-call claim form back into the workflow. **[Carson]**

Depends on section 7's API contract; build the card views against sample decks first.

## 9. Deployment — B, with A (Carson) checking the deployed UI

- [x] Add a Free `render.yaml` Blueprint for the web service and Postgres, with a worker in the web process group.
- [x] Provide production build/start commands, database migrations, generated auth secret, and configurable origin/provider secrets.
- [ ] Configure the deployed HTTPS auth origin, provider/model secrets, and optional paired Resend settings; verify account email if enabled.
- [ ] Add daily cron when event credits are confirmed; the current Blueprint has none.
- [ ] Deploy from GitHub and verify production database persistence.
- [ ] Verify on-demand research and provider output in the deployed environment; verify scheduled research if added.

## 10. Integration and demo — together

- [x] Supply fictional Alex/Dana/interests/claims/research in explicit memory/mock UI modes; the database seed is an unowned maintenance fixture, not a sign-in demo.
- [x] Include a known contradiction and a Don't say card in fixtures.
- [x] Keep fictional research and a saved deck in explicit fixtures; real API failures never switch to them automatically.
- [ ] Test the complete path: setup → research → claim → deck → prep/live → new claim. **[Carson]**
- [x] Check that a research update does not move the last-conversation timestamp.
- [x] Check that research dates and person-specific claims select the right deck content.
- [x] Verify invalid AI output, missing research, source failures, and repeated research runs are handled.
- [ ] Rehearse the two-minute demo from `alias.md` on the deployed app. **[Carson]**

## Suggested order

1. Together: finish section 1 and agree on the schema and API contracts.
2. In parallel: A builds sections 3–4's screens with sample data; B builds sections 2–4's services.
3. In parallel: A builds the timeline and flashcard views; B builds research and deck generation.
4. Together: connect the screens to real services, deploy, and rehearse.

For the first working version, use one topic and one working RSS source to complete the whole flow. Then add the remaining planned research sources and daily scheduling.

## Scope to clarify later

`alias.md` lists AI “debrief” as a job but does not define its behavior. Manual post-call claim logging is covered above. If you want automatic extraction of claims from call notes, agree on that behavior and add it as a separate task.
