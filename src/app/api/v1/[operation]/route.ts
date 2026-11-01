import { dispatchOperation } from "@/server/http";
import { service } from "@/server/service";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  const { operation } = await context.params;
  return dispatchOperation(service, operation, request);
}
