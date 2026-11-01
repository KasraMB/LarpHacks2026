# Alias

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience: hackathon/demo users maintaining a fictional cover identity. Regular personal use is not the primary audience for current product decisions.

## Product Purpose

Alias helps a user keep a cover identity consistent across repeat conversations. It combines what the user previously told a person with recent research on that person's selected topics, then produces flashcards for preparation and reference during a call.

Demo success means an audience can follow the connection between a past claim, new information, a useful prep card, and a flagged contradiction within a short walkthrough.

## Positioning

The central mechanism is continuity per person: timestamped claims and the last recorded conversation determine which past statements and new research inform a deck. The four card types are Back story, What changed, If she asks, and Don't say.

## Operating Context

- Set up one cover identity, add interests, and assign relevant interests to individual people.
- Record conversations and claims, inspect contradiction findings, and run research for a topic.
- Build a person's deck, rehearse in prep mode, and use compact live mode beside a call window. Keyboard navigation and topic jumps support quick reference.
- The planned two-minute demo uses fictional Alex/Dana/NBA content, a week of dated research, a Don't say card, and a contradictory claim. See `alias.md` for the original demo outline.
- Render Free is the event deployment constraint. The current configuration combines the web app and worker; research is triggered manually. Automatic daily research remains a future deployment option, not a current promise.

## Capabilities and Constraints

- One shared identity; account authentication and multiple-user isolation are outside the agreed scope.
- People have explicit topic assignments. Decks use those assignments rather than every identity interest.
- Saving a claim is independent of the AI contradiction check. Failed checks retain the claim.
- Recording a conversation advances its person's cutoff; adding a standalone claim does not. A first conversation has no prior cutoff.
- Research facts retain source metadata. Partial source failures can still produce results; duplicates are not new facts.
- Research, checks, and deck generation run asynchronously. Queued/running work, retries, completed results, and final failures must remain understandable.
- Decks are persisted snapshots with traceable evidence. Later edits do not silently rewrite an existing deck.
- Prep mode reveals answers; live mode offers compact cards, keyboard navigation, and topic jumps.
- Real API access is the default. Browser memory and static fixtures are explicitly selected demo/development modes, never silent fallbacks from real API errors.
- Cached seeded decks require Postgres but can be retrieved without a live AI or research request. Generating new results requires configured providers and a running worker.
- The existing implementation uses Next.js App Router, React, TypeScript, Tailwind, Zod, Drizzle/Postgres, and Featherless. Preserve the shared operation contracts when changing the interface.
- AI debrief was mentioned in the initial plan but remains unspecified and unimplemented.

## Brand Commitments

The product name is Alias. The fictional cover-identity premise and hackathon/demo audience are confirmed. No additional visual direction or brand voice has been confirmed; the existing interface is implementation evidence, not approval for a new visual world.

## Evidence on Hand

- `alias.md`: original concept, workflows, feature list, and demo script. Its daily cron proposal is superseded by the current Free deployment described in `README.md`.
- `src/server/demo-seed.ts`: fictional identity, person, claims, seven dated research facts, and a cached deck.
- `src/fixtures/demo.ts`, `src/fixtures/mock-api.ts`, and `src/fixtures/memory-api.ts`: explicit fictional UI examples and development modes. Example source URLs are not evidence of real reporting.
- `docs/INTERFACES.md`: implemented transport, data, and lifecycle rules.
- `README.md` and `render.yaml`: current setup and deployment configuration.
- No verified customer stories, usage benchmarks, or testimonials have been supplied. Demo content must not be presented as real customer evidence.

## Product Principles

1. Make the demo's claim-to-research-to-card connection easy to follow.
2. Preserve continuity for the specific person and conversation.
3. Keep generated advice traceable to claims and sourced facts.
4. Show asynchronous progress and failure honestly while preserving saved user input.
5. Keep fictional demo content distinguishable from live research and persisted user data.

## Open Decisions

No product-specific accessibility standard or additional audience needs have been specified. Long-term daily scheduling, AI debrief behavior, and expansion beyond the single-identity demo scope remain undecided.
