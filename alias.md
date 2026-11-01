# Alias

## Tech stack

### App
| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript, full-stack in one repo |
| Styling / UI | Tailwind CSS, keyboard shortcuts for the flashcard views |
| Validation | `zod` |

### Data
| Layer | Choice |
|---|---|
| Database | Render Postgres |
| ORM | Drizzle |
| Tables | `people`, `interests`, `claims`, `research_runs`, `cards` |

### AI
| Layer | Choice |
|---|---|
| Provider | Featherless AI, via the `openai` npm client with `baseURL` set to `https://api.featherless.ai/v1` |
| Model | One open-weight instruct model from their catalog |
| Jobs | Fact extraction, deck generation, debrief, contradiction check |

### Research pipeline (free, no keys)
| Step | Tool |
|---|---|
| Discover | Hand-picked RSS packs per topic (`rss-parser`), Google News RSS, Hacker News Algolia API |
| Fan reaction | Reddit RSS / `.json` |
| Context | Wikipedia current events and REST API |
| Read full text | `@mozilla/readability` + `jsdom`, with Jina Reader as a fallback |

### Infrastructure (Render)
| Piece | Choice |
|---|---|
| Web service | Next.js app |
| Database | Render Postgres |
| Scheduler | Render Cron Job calling `/api/cron/research`, protected by `CRON_SECRET` |
| Config | `render.yaml` Blueprint, deployed from GitHub |
| Secrets | `FEATHERLESS_API_KEY`, `DATABASE_URL`, `CRON_SECRET` |

---

## The idea

Larping is hard when you see the same person twice. A bluff rarely fails in the first conversation, it fails when the other person expects you to know what's happened since. Alias keeps a fake identity believable over time. You set up a cover with claimed interests, and a research agent per interest follows that topic every day. Before a Zoom call, Alias turns your past claims and the latest news into a deck of flashcards you can glance at while you talk.

## Workflow

**1. Setup (once)**
- Create your cover identity.
- Add claimed interests (NBA, wine, F1). Each one becomes a research agent.
- Add the people you're keeping the cover up with (Dana, your boss).

**2. Daily research (automatic)**
- A Render cron job runs each agent overnight.
- The agent discovers links from RSS packs, Google News, Hacker News and Reddit, then fetches the full article text.
- Featherless extracts structured facts with source links, and they're stored in Postgres as a running timeline.

**3. Logging claims**
- After you talk to someone, log what you told them ("told Dana I love the Raptors' coach").
- Each new claim is checked against that person's past claims, and contradictions are flagged.

**4. Before a call**
- Open the person's page and hit "Build my deck."
- Featherless combines their claims with the research since you last spoke.
- The result is a deck of flashcards.

**5. Prep mode**
- Flip through the deck and quiz yourself before joining the call.

**6. Live mode**
- A small, glanceable card view sits beside the Zoom window.
- Keyboard shortcuts move between cards, and topic tags let you jump to the one the other person just raised.

**7. After the call**
- Log the new claims you made, and the cycle repeats.

## Feature list

### Core
- Cover identity setup
- Interest agents, one per claimed topic
- People profiles
- Claims Ledger with a timestamped log per person
- Daily research pipeline (RSS, Google News, Hacker News, Reddit, Wikipedia, full-text extraction)
- Research timeline per topic, with source links
- "Run now" button to trigger research on demand
- Deck builder ("Build my deck") per person
- Consistency check that flags contradictions between claims

### Flashcards
- Four card types:
  - Back story (what you claimed)
  - What changed (news since you last spoke)
  - If she asks (likely question with a safe, in-character answer)
  - Don't say (outdated facts or contradiction traps)
- Prep mode for self-quizzing
- Live mode with a compact view, keyboard shortcuts and topic jump tags
- Source link on every fact

### Infrastructure and demo support
- Render deployment with a web service, Postgres and a cron job
- Seeded demo persona with a week of backfilled research
- Cached results so the demo doesn't depend on live fetches

## Demo (2 minutes)
1. Pitch: "Larping is hard when you see the same person twice."
2. Open Dana's page with seeded claims and a week of research.
3. Build the deck and flip through a few cards, including a "don't say" trap.
4. Log a contradicting claim and show the consistency check catch it.
5. Close on the live Render deployment.
