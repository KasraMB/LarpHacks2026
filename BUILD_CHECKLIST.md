# Alias build checklist

Suggested two-person split: **A (Carson) owns the interface**, **B owns data, research, and AI**. Swap the labels to fit your strengths. Work together on setup, shared types, integration, and the demo.

**Backend status (2026-11-01):** Checked backend items indicate implemented code and available mocked checks, not live Render verification. Postgres integration and seed tests are gated by `DATABASE_URL_TEST` and remain unrun here. Featherless adapter, build/start commands, and migrations are implemented; selecting the live model, setting Render secrets, deployment, and end-to-end validation remain pending. Carson items retain their existing status.

This checklist translates `alias.md` into build tasks. Start with one shared cover identity for the demo; accounts and multiple users are outside the current plan.

## 1. Shared foundation — together, first

- [x] Create the Next.js App Router project with TypeScript and Tailwind.
- [x] Install and configure Drizzle, Zod, the OpenAI client, and research dependencies.
- [x] Add `.env.example` with `DATABASE_URL`, `FEATHERLESS_API_KEY`, and `CRON_SECRET`; keep real secrets out of Git.
- [ ] Agree on shared Zod schemas and API request/response shapes for identities, interests, people, claims, research, decks, and cards. **[Carson]**
- [ ] Agree on how a person's interests are linked and how their last-conversation timestamp is recorded. **[Carson]**
- [x] Create sample API responses so A can build screens while B builds the services.
- [x] Document local setup and commands in the README.

Done when both people can run the app and use the same sample data shapes.

## 2. Database and persistence — B

- [x] Configure Postgres and Drizzle migrations.
- [x] Store the cover identity and its background details.
- [x] Create `people`, including last-conversation timestamps.
- [x] Create `interests` and links between people and relevant interests.
- [x] Create timestamped `claims`, linked to people and optionally interests.
- [x] Create `research_runs` with status, timing, and failure details.
- [x] Store extracted research facts with topic, source URL, publication date, and collection date.
- [x] Store decks and `cards`, linked to a person, with card type, topic, content, and supporting sources or claims.
- [x] Add queries for a person's claims and research since their last conversation.
- [x] Add a repeatable seed command.

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

- [x] Add a `render.yaml` Blueprint for the web service, Postgres, and a daily cron job.
- [x] Configure secrets, production build/start commands, and database migrations.
- [x] Configure the cron job to call `/api/cron/research` with the shared secret.
- [x] Deploy from GitHub and verify database persistence.
- [x] Verify both scheduled and on-demand research in the deployed environment.

## 10. Integration and demo — together

- [x] Seed a demo cover identity, Dana, interests, past claims, and a week of dated research.
- [x] Include a known contradiction and a Don't say card.
- [x] Keep cached research and a saved deck available if live services fail.
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
