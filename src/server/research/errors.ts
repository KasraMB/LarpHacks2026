/** Only fixed, bounded explanations cross into persisted/client-visible errors. */
export function researchErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const status = /^(?:Request failed with|Composio search failed with) HTTP (\d{3})\.$/.exec(message)?.[1];
  if (status === "401") return "HTTP 401: provider authentication failed; check its server configuration.";
  if (status === "403") return "HTTP 403: provider blocked this request; try another source or retry later.";
  if (status === "429") return "HTTP 429: provider rate limit or quota reached; retry later.";
  if (status) return `HTTP ${status}: provider request failed; retry later.`;
  if (error instanceof Error && (/timeout|timed out/i.test(message) || error.name === "TimeoutError")) return "Provider timed out; retry later.";
  if (/^(?:Private or local|Host resolves to a private|Only public HTTP|URLs with credentials)/.test(message)) return "Source URL was blocked by public-network validation.";
  if (/byte limit/.test(message)) return "Provider response exceeded the configured size limit.";
  if (message === "Google News did not expose a readable publisher URL.") return "Google News did not expose a readable publisher URL; another source may cover this story.";
  if (/^Composio search returned an? (?:unsupported|unsuccessful|invalid)|^Composio search did not return article/.test(message)) return "Composio returned an unsupported or unsuccessful result; check provider configuration.";
  if (error instanceof SyntaxError || /^(?:Non-whitespace before first tag|Invalid character in entity name|Unexpected close tag|Non-whitespace before first tag|Invalid XML)/.test(message)) return "Provider returned invalid structured content; retry later.";
  if (/^(?:No readable article text|Reddit response contained no post text)/.test(message)) return "Source did not provide readable article text.";
  return "Provider could not be reached or processed; retry later or use another source.";
}
