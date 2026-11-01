import { createHash } from "node:crypto";
import { claimSchema, deckSchema, researchFactSchema, type Failure } from "@/contracts";
import type { ServerDependencies, ResearchWorker, DeckWorker, ClaimCheckWorker } from "./ports";
import { collectPages } from "./use-cases";
import { FEATHERLESS_PROMPT_VERSION } from "./ai";

const failure = (message: string): Failure => ({ code: "UPSTREAM_ERROR", message, retryable: true });
const within = () => AbortSignal.timeout(220_000);
export function createWorkers(deps: ServerDependencies): { research: ResearchWorker; deck: DeckWorker; claimCheck: ClaimCheckWorker } {
  const r = deps.repository;
  return {
    research: { async execute(runId, attempt) {
      const run = await r.research.getRun(runId);
      if (!run || run.status === "completed") return;
      const interest = await r.interests.get(run.interestId);
      if (!interest) return;
      const running = { ...run, status: "running" as const, startedAt: deps.clock.now(), finishedAt: null, failure: null, sourceErrors: [] };
      await r.research.saveRun(running);
      const signal = within();
      const errors: typeof run.sourceErrors = [];
      let successfulArticles = 0;
      let factCount = run.factCount;
      try {
        const discoveries = await Promise.allSettled(deps.discovery.map(source => source.discover(interest, signal)));
        const articles = new Map<string, Awaited<ReturnType<ServerDependencies["discovery"][number]["discover"]>>[number]>();
        discoveries.forEach((result, index) => {
          if (result.status === "rejected") errors.push({ ...failure(`Discovery source ${deps.discovery[index]!.kind} failed.`), url: null });
        });
        // Round-robin sources so a long RSS feed cannot crowd out reactions/context.
        for (let index = 0; index < 25 && articles.size < 6; index++) {
          for (const result of discoveries) {
            const article = result.status === "fulfilled" ? result.value[index] : undefined;
            if (article && !articles.has(article.url)) articles.set(article.url, article);
            if (articles.size >= 6) break;
          }
        }
        for (const article of [...articles.values()].slice(0, 6)) {
          if (signal.aborted) break;
          try {
            const read = await deps.reader.read(article, signal);
            const extracted = await deps.ai.extractFacts(read, interest, signal);
            const facts = extracted.map(f => researchFactSchema.parse({ ...f, id: createHash("sha256").update(`${interest.id}\0${read.source.url}\0${f.text.trim().replace(/\s+/g, " ").toLowerCase()}`).digest("hex"), interestId: interest.id, runId, source: read.source, createdAt: deps.clock.now() }));
            factCount += await r.research.upsertFacts(facts);
            successfulArticles++;
          } catch { errors.push({ ...failure("Article reading or fact extraction failed."), url: article.url }); }
        }
        if (signal.aborted) errors.push({ ...failure("Research time budget exhausted."), url: null });
        if (!successfulArticles && errors.length) throw new Error("No source could be processed.");
        await r.research.saveRun({ ...running, status: "completed", factCount, sourceErrors: errors, finishedAt: deps.clock.now() });
      } catch (error) {
        // Pending retries retain the active uniqueness slot and keep clients polling.
        await r.research.saveRun(attempt?.willRetry
          ? { ...running, status: "queued", factCount, sourceErrors: errors }
          : { ...running, status: "failed", factCount, sourceErrors: errors, finishedAt: deps.clock.now(), failure: failure("Research failed; retry is available.") });
        throw error;
      }
    } },
    claimCheck: { async execute(claimId, attempt) {
      const claim = await r.claims.get(claimId);
      if (!claim || claim.checkStatus === "completed") return;
      await r.claims.saveCheck(claimId, { checkStatus: "running", checkFailure: null, contradictions: [] });
      try {
        const prior = (await collectPages(page => r.claims.list(claim.personId, page)))
          .filter(c => c.id !== claim.id && Date.parse(c.saidAt) <= Date.parse(claim.saidAt) && (Date.parse(c.saidAt) < Date.parse(claim.saidAt) || Date.parse(c.createdAt) < Date.parse(claim.createdAt)));
        const contradictions = prior.length ? await deps.ai.checkContradictions(claim, prior, within()) : [];
        const checked = claimSchema.parse({ ...claim, checkStatus: "completed", checkFailure: null, contradictions });
        if (checked.contradictions.some(c => !prior.some(p => p.id === c.earlierClaimId))) throw new Error("Unknown earlier claim.");
        await r.claims.saveCheck(claimId, checked);
      } catch (error) {
        await r.claims.saveCheck(claimId, attempt?.willRetry
          ? { checkStatus: "queued", contradictions: [], checkFailure: null }
          : { checkStatus: "failed", contradictions: [], checkFailure: failure("Contradiction check failed; the claim remains saved.") });
        throw error;
      }
    } },
    deck: { async execute(deckId, attempt) {
      const deck = await r.decks.get(deckId);
      if (!deck || deck.status === "completed") return;
      const snapshot = await r.decks.getSnapshot(deckId);
      if (!snapshot) throw new Error("Deck snapshot missing.");
      const save = async (value: typeof deck) => r.decks.save({ deck: value, snapshot, fingerprint: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") });
      await save({ ...deck, status: "running", finishedAt: null, failure: null });
      try {
        if (!snapshot.context.claims.length && !snapshot.context.facts.length) throw new Error("No evidence available.");
        if (snapshot.model !== process.env.FEATHERLESS_MODEL && process.env.FEATHERLESS_MODEL) throw new Error("Snapshot model is no longer configured.");
        if (snapshot.promptVersion !== FEATHERLESS_PROMPT_VERSION) throw new Error("Snapshot prompt version is no longer supported.");
        const output = await deps.ai.generateDeck(snapshot.context, within());
        const completed = deckSchema.parse({ ...deck, status: "completed", finishedAt: deps.clock.now(), failure: null,
          cards: output.cards.map(card => ({ ...card, id: deps.ids.next(), deckId })).sort((a, b) => a.position - b.position), warnings: [...new Set([...deck.warnings, ...output.warnings])] });
        if (new Set(completed.cards.map(c => c.type)).size !== 4) throw new Error("Incomplete card types.");
        for (const card of completed.cards) {
          if (card.interestIds.some(id => !snapshot.context.interests.some(i => i.id === id))) throw new Error("Unknown topic.");
          for (const e of card.evidence) if (e.kind === "research" && !snapshot.context.facts.some(f => f.id === e.factId && f.source.url === e.sourceUrl)) throw new Error("Invalid evidence URL.");
        }
        await save(completed);
      } catch (error) {
        await save(attempt?.willRetry
          ? { ...deck, status: "queued", cards: [], finishedAt: null, failure: null }
          : { ...deck, status: "failed", cards: [], finishedAt: deps.clock.now(), failure: { ...failure("Deck generation failed. Check evidence and provider configuration before retrying."), code: !snapshot.context.claims.length && !snapshot.context.facts.length ? "NO_EVIDENCE" : "UPSTREAM_ERROR" } });
        throw error;
      }
    } },
  };
}
