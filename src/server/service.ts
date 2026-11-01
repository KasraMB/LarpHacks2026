import "server-only";
import { operations, type AliasService, type OperationName } from "@/contracts";
import { createRuntime, type AliasRuntime } from "./runtime";

let runtime: AliasRuntime | undefined;
export function getRuntime(): AliasRuntime { return runtime ??= createRuntime(); }

// Defer environment validation and database construction until the first request.
export const service = Object.fromEntries(Object.keys(operations).map(name => [name,
  (input: never) => (getRuntime().service[name as OperationName] as (input: never) => Promise<unknown>)(input),
])) as AliasService;
