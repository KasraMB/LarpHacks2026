import { z } from "zod";
import { apiErrorSchema, operations, type AliasApi, type ApiError, type Input, type OperationName, type Output } from "@/contracts";

export class AliasApiError extends Error {
  constructor(public readonly detail: ApiError, public readonly status: number) {
    super(detail.message);
    this.name = "AliasApiError";
  }
}

export interface ApiClientOptions {
  /** Empty in browsers; use an absolute origin in Node. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient(options: ApiClientOptions = {}): AliasApi {
  const fetcher = options.fetch ?? globalThis.fetch;
  async function call<K extends OperationName>(name: K, input: Input<K>): Promise<Output<K>> {
    const body = operations[name].input.parse(input);
    const response = await fetcher(`${options.baseUrl ?? ""}/api/v1/${name}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store",
    });
    const envelope = z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), data: z.unknown() }),
      z.object({ ok: z.literal(false), error: apiErrorSchema }),
    ]).parse(await response.json());
    if (!envelope.ok) throw new AliasApiError(envelope.error, response.status);
    if (!response.ok) throw new Error(`Unexpected HTTP status ${response.status}`);
    return operations[name].output.parse(envelope.data) as Output<K>;
  }
  // Object.fromEntries loses the correlation between each key and its schema.
  return Object.fromEntries(Object.keys(operations).map((key) => {
    const name = key as OperationName;
    return [name, (input: Input<typeof name>) => call(name, input)];
  })) as AliasApi;
}
