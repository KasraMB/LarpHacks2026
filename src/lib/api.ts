import type { AliasApi } from "@/contracts";
import { memoryApi } from "@/fixtures/memory-api";
import { mockApi } from "@/fixtures/mock-api";
import { createApiClient } from "./api-client";

/** Client-side API selection. Set NEXT_PUBLIC_ALIAS_API to "memory" or "mock" to develop without the backend.
 * Anything else uses the real HTTP API. Errors never fall back to a mock.
 */
export type ApiMode = "real" | "memory" | "mock";

const raw = process.env.NEXT_PUBLIC_ALIAS_API;
export const apiMode: ApiMode = raw === "memory" || raw === "mock" ? raw : "real";

export const api: AliasApi = apiMode === "memory" ? memoryApi : apiMode === "mock" ? mockApi : createApiClient();
