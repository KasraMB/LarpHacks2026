import OpenAI from "openai";
import { ZodError } from "zod";
import type { Failure } from "@/contracts";

const knownFailures = {
  AI_MISSING_KEY: { message: "FEATHERLESS_API_KEY is missing on the server. Configure it on the Render web service, redeploy, then rebuild the deck.", retryable: false },
  AI_MISSING_MODEL: { message: "FEATHERLESS_MODEL is missing on the server. Set an available model's exact ID, redeploy, then rebuild the deck.", retryable: false },
  AI_INPUT_TOO_LARGE: { message: "This deck has more evidence than the generation input limit allows. Reduce the person's assigned skills or history before rebuilding.", retryable: false },
  AI_OUTPUT_TRUNCATED: { message: "Featherless stopped at the output token limit before finishing the deck. Try rebuilding with fewer assigned skills or a more concise model.", retryable: true },
  AI_EMPTY_OUTPUT: { message: "Featherless returned no usable JSON. Try again or choose a model that supports JSON chat output.", retryable: true },
  AI_OUTPUT_REFUSED: { message: "The selected model declined to generate this deck. Review the supplied content or choose another model.", retryable: false },
} as const;

export class FeatherlessGenerationError extends Error {
  constructor(readonly code: keyof typeof knownFailures) {
    super(knownFailures[code].message);
    this.name = "FeatherlessGenerationError";
  }
}

/** Never expose provider messages, response bodies, prompts, or credentials. */
export function deckGenerationFailure(error: unknown): Failure {
  if (error instanceof FeatherlessGenerationError) return { code: error.code, ...knownFailures[error.code] };
  const detail = (code: string, message: string, retryable = true): Failure => ({ code, message, retryable });
  if (error instanceof OpenAI.APIConnectionTimeoutError || error instanceof OpenAI.APIUserAbortError || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))) {
    return detail("AI_TIMEOUT", "Featherless generation timed out or was interrupted. Retry, or choose a faster model.");
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return detail("AI_AUTHENTICATION", "Featherless rejected the API key (HTTP 401). Check FEATHERLESS_API_KEY on the Render web service, then redeploy.", false);
    if (error.status === 403) return detail("AI_ACCESS_DENIED", "Featherless denied access (HTTP 403). Check the key's permissions and whether your account can use the selected model.", false);
    if (error.status === 402) return detail("AI_PAYMENT_REQUIRED", "Featherless requires account credit or a subscription (HTTP 402). Check your provider account.", false);
    if (error.status === 404) return detail("AI_MODEL_UNAVAILABLE", "Featherless could not find the configured model (HTTP 404). Check FEATHERLESS_MODEL against the models available to your account.", false);
    if (error.status === 429) return detail("AI_RATE_LIMIT", "Featherless rate limit or quota reached (HTTP 429). Check your account limits and retry later.");
    if (error.status === 400 || error.status === 422) return detail("AI_REQUEST_REJECTED", "Featherless rejected the generation request. Check the selected model's chat/JSON support and context limit.", false);
    if (error instanceof OpenAI.APIConnectionError) return detail("AI_CONNECTION", "The server could not connect to Featherless. Retry later.");
    return detail("AI_PROVIDER_ERROR", "Featherless could not complete the generation request. Check provider availability and retry later.");
  }
  const message = error instanceof Error ? error.message : "";
  if (error instanceof SyntaxError || error instanceof ZodError || /^Featherless deck (?:omitted required card type|has duplicate card position|contains an unknown interest ID|references an unknown claim|evidence must reference)/.test(message) || ["Incomplete card types.", "Unknown topic.", "Invalid evidence URL."].includes(message)) {
    return detail("AI_INVALID_OUTPUT", "The model returned an invalid deck or unsupported evidence references. Retry, or choose a model that reliably follows JSON instructions.");
  }
  if (["Snapshot model is no longer configured.", "Snapshot prompt version is no longer supported."].includes(message)) {
    return detail("DECK_CONFIG_CHANGED", "The AI configuration changed after this deck was queued. Build a new deck using the current configuration.", false);
  }
  return detail("UPSTREAM_ERROR", "Deck generation failed unexpectedly. Check server configuration and retry.");
}
