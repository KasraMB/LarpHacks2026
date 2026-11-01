import "server-only";
import { operations, type AliasService, type OperationName } from "@/contracts";
import { createRuntime, type AliasRuntime } from "./runtime";
import { createService } from "./use-cases";
import { FEATHERLESS_PROMPT_VERSION } from "./ai";

let runtime: AliasRuntime | undefined;
export function getRuntime(): AliasRuntime { return runtime ??= createRuntime(); }

/** Request-local ownership; the process-wide worker runtime never changes user. */
export function serviceForUser(userId: string): AliasService {
  const { deps, repository } = getRuntime();
  return createService({ ...deps, repository: repository.forUser(userId) }, {
    model: process.env.FEATHERLESS_MODEL ?? "unconfigured", promptVersion: FEATHERLESS_PROMPT_VERSION,
  });
}

// Defer environment validation and database construction until the first request.
export const service = Object.fromEntries(Object.keys(operations).map(name => [name,
  (input: never) => (getRuntime().service[name as OperationName] as (input: never) => Promise<unknown>)(input),
])) as AliasService;
