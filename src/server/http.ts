import { operations, type AliasService, type ApiError, type OperationName } from "@/contracts";
import { NotImplementedError } from "@/lib/not-implemented";

export class ServiceError extends Error {
  constructor(public readonly detail: ApiError, public readonly status: number) {
    super(detail.message);
  }
}
export function apiFailure(code: ApiError["code"], message: string, status: number, retryable = false): Response {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}

export async function dispatchOperation(service: AliasService, name: string, request: Request): Promise<Response> {
  if (!Object.hasOwn(operations, name)) return apiFailure("NOT_FOUND", "Unknown operation.", 404);
  const key = name as OperationName;
  let json: unknown;
  try { json = await request.json(); }
  catch { return apiFailure("VALIDATION_ERROR", "Expected a JSON body.", 400); }
  const input = operations[key].input.safeParse(json);
  if (!input.success) return apiFailure("VALIDATION_ERROR", input.error.message, 400);
  try {
    // The runtime registry validates the key/input pairing before invoking a handler.
    const handler = service[key] as (value: unknown) => Promise<unknown>;
    const data = operations[key].output.parse(await handler(input.data));
    return Response.json({ ok: true, data });
  } catch (error) {
    if (error instanceof NotImplementedError) return apiFailure("NOT_IMPLEMENTED", error.message, 501);
    if (error instanceof ServiceError) return Response.json({ ok: false, error: error.detail }, { status: error.status });
    // Never expose DB/provider exceptions or invalid service output to the caller.
    return apiFailure("INTERNAL_ERROR", "The operation failed.", 500);
  }
}
