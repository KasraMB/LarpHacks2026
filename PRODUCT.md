# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People maintaining a cover identity across repeat conversations with the same real-world contacts (such as a colleague or boss like "Dana"), where a bluff fails not in the first chat, but when the other person expects continuity on past claims and awareness of what has happened in shared topics since they last spoke. Also evaluated by hackathon judges during a live two-minute product walkthrough.

## Product Purpose

Alias keeps a cover identity believable over time. It pairs per-topic daily research agents with a person-specific, contradiction-checked claims ledger, turning past claims and the latest news since the last conversation into a deck of flashcards for pre-call self-quizzing (Prep mode) and beside-call reference (Live mode). Success means staying in character across repeat encounters without self-contradiction or blind spots on recent events.

## Positioning

Unlike generic flashcard apps, CRM notes, or news aggregators, Alias joins a person-specific ledger of what you claimed with automated topic research filtered strictly to the time window since you last spoke (`lastConversationAt`), automatically flagging contradictions against earlier claims and generating four tactical card types (`back_story`, `what_changed`, `if_she_asks`, `dont_say`).

## Operating Context

- **Setup & maintenance**: Defining the cover identity (`Identity`), claimed topics (`Interest` with search terms and RSS feeds), and contacts (`Person` linked to relevant interests).
- **Automated & on-demand research**: Overnight scheduled runs (`/api/cron/research`) or manual "Run now" triggers pulling from RSS packs, Google News, Hacker News, Reddit, and Wikipedia into a dated research timeline.
- **Pre-call Prep mode**: Flipping through a person's generated deck to quiz yourself on your backstory, recent topic news, likely questions, and contradiction traps right before a meeting.
- **Beside-call Live mode**: A compact, glanceable view placed next to an active Zoom or video call window, operated via keyboard shortcuts and topic jump tags to answer questions in real time.
- **Post-call logging**: Recording when a conversation happened (`happenedAt`) and logging new claims made (`saidAt`), which immediately triggers an asynchronous contradiction check against that person's history.
- **Two-minute demo playback**: Seeded persona and cached research/decks so live demonstrations remain fast and resilient even if external feeds or AI calls fail.

## Capabilities and Constraints

- **Architecture & stack**: Full-stack Next.js (App Router) and TypeScript application styled with Tailwind CSS; shared Zod schemas (`src/contracts/*`) driving a unified `POST /api/v1/<operationName>` JSON transport; Drizzle ORM backed by Render Postgres; Featherless AI via the OpenAI client (`https://api.featherless.ai/v1`); deployed via Render Blueprint (`render.yaml`).
- **Single-identity scope**: Operates on one cover identity without multi-user accounts or authentication flows (`CRON_SECRET` protects only the scheduled research endpoint).
- **Research pipeline**: Uses free, keyless sources (`rss-parser`, Google News RSS, Hacker News Algolia API, Reddit RSS/JSON, Wikipedia REST API) and full-text extraction (`@mozilla/readability` + `jsdom`, with Jina Reader fallback). Facts are categorized as `reported_fact`, `fan_reaction`, or `context`, deduplicated per topic/source, and always preserve source URLs and timestamps. Research updates never alter a person's `lastConversationAt` cutoff.
- **Claims & contradiction lifecycle**: Claims save immediately and independently of their AI contradiction check (`queued → running → completed | failed`). Contradiction warnings reference the specific conflicting earlier claim and never block saving. Recording a conversation updates `lastConversationAt` to `max(existing, happenedAt)`.
- **Decks & flashcards**: Decks snapshot the identity, person, linked interests, claims, and facts since cutoff, caching by fingerprint. Cards use four fixed types (`back_story`, `what_changed`, `if_she_asks`, `dont_say`) and must cite either a logged `claimId` or a `factId` with its real `sourceUrl` (never fabricating news URLs for personal claims).
- **Explicitly undecided**: Automatic AI "debrief" (extracting claims automatically from unstructured call notes, mentioned in `alias.md` but left unspecified in `BUILD_CHECKLIST.md` and `docs/INTERFACES.md`) is undecided and out of scope until behavior and contracts are defined; post-call claim logging is manual.

## Brand Commitments

- **Name**: Alias
- **Tagline / core premise**: "Keep your cover identity consistent over time." / "Stay in character."
- **Voice**: Direct, composed, tactical, and dryly matter-of-fact—treating cover stories, alibis, topic briefs, and contradiction traps with operational clarity.

## Evidence on Hand

- Product concept, workflow, and two-minute demo script in `alias.md`.
- Implementation backlog and role boundaries in `BUILD_CHECKLIST.md`.
- Canonical entity schemas, operation contracts, and lifecycle rules in `docs/INTERFACES.md` and `src/contracts/*`.
- Static contract fixtures and opt-in preview adapters in `src/fixtures/demo.ts`, `src/fixtures/mock-api.ts`, and `src/fixtures/memory-api.ts` (cover identity "Alex", colleague "Dana", interest "NBA" / Raptors).
- No real customer testimonials, third-party press, or production usage metrics exist; future work must not fabricate external social proof or unverifiable claims.

## Product Principles

1. **Delta-first briefing**: Surface what changed since the last conversation with this specific person, not an undifferentiated firehose of news.
2. **Glanceable under live-call pressure**: Live mode sits beside an active video call; keyboard navigation, instant topic filtering, and rapid visual scanning take precedence over dense prose.
3. **Non-blocking resilience**: User entry and demo flows never stall on AI or network failures—claims save even when contradiction checks fail, partial feed errors still yield research runs, and cached decks keep demos reliable.
4. **Every card has an receipt**: Every prompt and answer traces directly to a timestamped personal claim or a dated source link.
