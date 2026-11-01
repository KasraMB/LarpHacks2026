# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People maintaining a cover identity across repeat conversations with the same real-world contacts (such as a colleague or boss like "Dana"), where a bluff fails not in the first chat, but when the other person expects continuity on past claims and awareness of what has happened in shared topics since they last spoke. Also evaluated by hackathon judges during a live two-minute product walkthrough.

Primary audience: hackathon/demo users maintaining a fictional cover identity. Regular personal use is not the primary audience for current product decisions.

## Product Purpose

Alias helps a user keep a cover identity consistent across repeat conversations. It combines what the user previously told a person with recent research on that person's selected topics, then produces flashcards for preparation and reference during a call.

Demo success means an audience can follow the connection between a past claim, new information, a useful prep card, and a flagged contradiction within a short walkthrough.

## Positioning

The central mechanism is continuity per person: timestamped claims and the last recorded conversation determine which past statements and new research inform a deck. The four card types are Back story, What changed, If she asks, and Don't say.

## Operating Context

- Sign in with email/password, set up one private cover identity per account, add skills/interests, and assign relevant interests to private people.
- Record conversations and claims, inspect contradiction findings, and run research for a topic.
- Build a person's deck, rehearse in prep mode, and use compact live mode beside a call window. Keyboard navigation and topic jumps support quick reference.
- The planned two-minute demo uses fictional Alex/Dana/NBA content, a week of dated research, a Don't say card, and a contradictory claim. See `alias.md` for the original demo outline.
- Render Free is the event deployment constraint. The current configuration combines the web app and worker; research is triggered manually. Automatic daily research remains a future deployment option, not a current promise.

## Capabilities and Constraints

- Each email/password account has exactly one private persona. People, conversations, claims, and decks are private to that account.
- Skills/interests may be public or private; only their creator may edit them. Public skills and their research are shared across accounts; private research follows its skill's visibility.
- Account email verification and password reset require configured email delivery. When enabled, verification is required before sign-in.
- People have explicit topic assignments. Decks use those assignments rather than every identity interest.
- Saving a claim is independent of the AI contradiction check. Failed checks retain the claim.
- Recording a conversation advances its person's cutoff; adding a standalone claim does not. A first conversation has no prior cutoff.
- Research facts retain source metadata. Partial source failures can still produce results; duplicates are not new facts.
- New runs filter known-date news to 30 days and require topic relevance, preserving literal names such as C++. Wikipedia is background context; unknown dates remain eligible. Historical runs remain unchanged, and opaque Google News redirects report a source error.
- Research, checks, and deck generation run asynchronously. Queued/running work, retries, completed results, and final failures must remain understandable.
- Decks are persisted snapshots with traceable evidence. Later edits do not silently rewrite an existing deck.
- Prep mode reveals answers; live mode offers compact cards, keyboard navigation, and topic jumps.
- Real API access is the default. Browser memory and static fixtures are explicitly selected demo/development modes, never silent fallbacks from real API errors.
- Use explicit browser memory mode for a fictional demo without live providers. The database maintenance seed and migrated singleton data remain unowned and inaccessible to signed-in accounts; signup never adopts them. Generating new results requires configured providers and a running worker.
- The existing implementation uses Next.js App Router, React, TypeScript, Tailwind, Zod, Drizzle/Postgres, and Featherless. Preserve the shared operation contracts when changing the interface.
- AI debrief was mentioned in the initial plan but remains unspecified and unimplemented.

## Brand Commitments

- **Name**: Alias
- **Tagline / core premise**: "Keep your cover identity consistent over time." / "Stay in character."
- **Voice**: Direct, composed, tactical, and dryly matter-of-fact—treating cover stories, alibis, topic briefs, and contradiction traps with operational clarity.

## Evidence on Hand

- `alias.md`: original concept, workflows, feature list, and demo script. Its daily cron proposal is superseded by the current Free deployment described in `README.md`.
- `src/server/demo-seed.ts`: unowned maintenance fixture containing a fictional identity, person, claims, seven dated research facts, and a cached deck; not a signed-in demo workspace.
- `src/fixtures/demo.ts`, `src/fixtures/mock-api.ts`, and `src/fixtures/memory-api.ts`: explicit fictional UI examples and development modes. Example source URLs are not evidence of real reporting.
- `docs/INTERFACES.md`: implemented transport, data, and lifecycle rules.
- `README.md` and `render.yaml`: current setup and deployment configuration.
- Seven checks passed against disposable PostgreSQL, including account isolation and legacy migration. Production deployment, live provider output, and live email delivery remain unverified.
- No verified customer stories, usage benchmarks, or testimonials have been supplied. Demo content must not be presented as real customer evidence.

## Product Principles

1. **Delta-first briefing**: Surface what changed since the last conversation with this specific person, not an undifferentiated firehose of news.
2. **Glanceable under live-call pressure**: Live mode sits beside an active video call; keyboard navigation, instant topic filtering, and rapid visual scanning take precedence over dense prose.
3. **Non-blocking resilience**: User entry and demo flows never stall on AI or network failures—claims save even when contradiction checks fail, partial feed errors still yield research runs, and cached decks keep demos reliable.
4. **Every card has an receipt**: Every prompt and answer traces directly to a timestamped personal claim or a dated source link.
5. Show asynchronous progress and failure honestly while preserving saved user input.
6. Keep fictional demo content distinguishable from live research and persisted user data.

## Open Decisions

No product-specific accessibility standard or additional audience needs have been specified. Long-term daily scheduling and AI debrief behavior remain undecided. Multiple personas within an account are outside the current one-persona scope.
