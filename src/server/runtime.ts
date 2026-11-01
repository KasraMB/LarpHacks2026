import { randomUUID } from "node:crypto";
import { createPostgresRepository } from "./db/repository";
import { createFeatherlessProvider, FEATHERLESS_PROMPT_VERSION } from "./ai";
import { createArticleReader, createDiscoverySources } from "./research";
import { createResearchScheduler, createService } from "./use-cases";
import { createWorkers } from "./workers";
import type { ServerDependencies } from "./ports";

/** No sockets or credentials are touched until this factory is called. */
export function createRuntime() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  const repository = createPostgresRepository(url);
  const base = { repository, ids: { next: randomUUID }, clock: { now: () => new Date().toISOString() } };
  const deps: ServerDependencies = { ...base, ai: createFeatherlessProvider(), reader: createArticleReader(), discovery: createDiscoverySources(),
    queue: { enqueue: repository.jobs.enqueue }, scheduler: createResearchScheduler(base) };
  return { deps, repository, service: createService(base, { model: process.env.FEATHERLESS_MODEL ?? "unconfigured", promptVersion: FEATHERLESS_PROMPT_VERSION }),
    workers: createWorkers(deps), close: () => repository.close() };
}
export type AliasRuntime = ReturnType<typeof createRuntime>;
