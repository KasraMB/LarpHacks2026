# Briefing, evidence and live navigation

Implemented the layout, clarification and onboarding changes from the critique, followed by the live navigation brief explicitly confirmed by the user.

- Home prioritizes a real person's latest prep deck; first use guides identity → interests → person.
- Person pages lead with the conversation cutoff, prep/live actions and recent claim. Recording, past-claim entry and settings use disclosures.
- “Why this card?” resolves the deck's referenced claims and research, shows quoted evidence and dates, and explains the saved research cutoff. Missing details preserve the card and any saved source link.
- Live offers all four card types within the selected topic, marks the current type, and disables unavailable types. Previous/Next and arrows remain. Prep ends with “Ready? Go live.”
- Conversation recording and past-claim entry explain their different effects on the cutoff.

## Verification

| Layout criterion | Evidence |
| --- | --- |
| Primary reading path | `PersonController` renders briefing and deck before recording, history and settings; the duplicate generic Person heading was removed. Mobile prep actions moved from roughly 1,670px down to the first viewport. |
| Meaningful grouping | Cutoff, deck and latest claim share the briefing. Separate disclosures hold maintenance tasks. |
| Rhythm | Briefing uses tight groups; major task groups use `space-y-8`, borders and disclosure boundaries. |
| Density | Secondary forms start closed; home offers one preparation entry instead of three equal inventory cards. |
| Adaptation | Home/person and deck flows rendered at 390, 768 and 1440px without horizontal overflow. Home/person also checked at 720×450 CSS pixels, equivalent to 200% reflow of 1440×900; native browser zoom was not exercised. DOM order matches visible order. |
| Content extremes | Browser-only fixtures tested first-use branches and 190-character unbroken person/identity names; no horizontal overflow. |
| Keyboard interaction | Evidence summary Enter/Space toggles its disclosure while preserving the revealed answer. Live type jumps, arrows and Previous/Next were exercised. |
| Mechanical scan | Separate final layout scans of `src/app` and `src/components` returned `[]`. |

Selected type and large live prompt contrast measured 20.16:1; evidence cutoff text measured 7.58:1. Screenshots and machine-readable browser results are in `evidence/final-*`, `evidence/verify-*`, `evidence/deck-live-loaded-*`, and `evidence/deck-visual-verification.json`. Loading-only early screenshots are superseded by the `deck-live-loaded-*` captures.

Browser verification used headless Chromium and the explicit memory demo. No real-user onboarding study, screen-reader session or live database/provider exercise was performed.

Production build (including TypeScript) passed. The existing test suite passed 34 tests, with two database integration tests skipped because `DATABASE_URL_TEST` is not configured. `git diff --check` passed. Local preview servers were stopped after verification. Missing card types for a second topic and evidence-request failures were reviewed in source but were not fault-injected in the browser.
