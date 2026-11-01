import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
type Address = { address: string; family: number };
type LookupImpl = (hostname: string) => Promise<Address[]>;

export interface FetchOptions {
  /** Test seam. Production uses a pinned native HTTP(S) request after DNS validation. */
  fetchImpl?: typeof fetch;
  /** Test seam for deterministic, network-free lookup behavior. */
  lookupImpl?: LookupImpl;
  maxBytes?: number;
  timeoutMs?: number;
}

export function validatePublicUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only public HTTP(S) URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");
  const host = cleanHost(url.hostname);
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "metadata.google.internal" || host === "metadata" || host.endsWith(".internal")) {
    throw new Error("Private or local hosts are not allowed.");
  }
  if (isIP(host) && isPrivateIp(host)) throw new Error("Private or local hosts are not allowed.");
  return url;
}

function cleanHost(host: string): string { return host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, ""); }

function isPrivateIp(host: string): boolean {
  if (isIP(host) === 4) {
    const [a, b, c] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113);
  }
  if (isIP(host) !== 6) return false;
  const value = ipv6BigInt(host);
  const prefix = (bits: number, length: number) => value >> BigInt(128 - length) === BigInt(bits);
  if (value === 0n || value === 1n || prefix(0x3fa, 10) || prefix(0x7e, 7) || prefix(0xff, 8)) return true;
  // IPv4-mapped IPv6 uses the final 32 bits; apply the IPv4 deny ranges to it too.
  if (value >> 32n === 0xffffn) {
    const n = Number(value & 0xffffffffn);
    return isPrivateIp(`${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
  }
  // Only global-unicast 2000::/3 is publicly routable. Exclude documentation space.
  if (!prefix(1, 3) || (value >> 96n === 0x20010db8n)) return true;
  return false;
}

function ipv6BigInt(input: string): bigint {
  let address = input.toLowerCase();
  const embedded = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) {
    const parts = embedded[1]!.split(".").map(Number);
    address = address.slice(0, -embedded[1]!.length) + ((parts[0]! << 8) | parts[1]!).toString(16) + ":" + ((parts[2]! << 8) | parts[3]!).toString(16);
  }
  const halves = address.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const zeros = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array(Math.max(0, zeros)).fill("0"), ...right];
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group || "0"}`), 0n);
}

async function publicAddresses(hostname: string, lookupImpl: LookupImpl): Promise<Address[]> {
  const host = cleanHost(hostname);
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private or local hosts are not allowed.");
    return [{ address: host, family: isIP(host) }];
  }
  const addresses = await lookupImpl(host);
  if (!addresses.length || addresses.some(entry => isPrivateIp(entry.address))) throw new Error("Host resolves to a private or local address.");
  return addresses;
}

const systemLookup: LookupImpl = hostname => lookup(hostname, { all: true, verbatim: true });

export async function boundedFetch(input: string, options: FetchOptions = {}, signal?: AbortSignal): Promise<{ response: Response; text: string; finalUrl: string }> {
  let url = validatePublicUrl(input);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out.")), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const lookupImpl = options.lookupImpl ?? systemLookup;
    for (let redirects = 0; ; redirects++) {
      const addresses = await raceSignal(publicAddresses(url.hostname, lookupImpl), controller.signal);
      const response = options.fetchImpl
        ? await options.fetchImpl(url, { redirect: "manual", signal: controller.signal, headers: { "user-agent": "AliasResearch/1.0 (+https://example.invalid)" } })
        : await pinnedRequest(url, addresses, maxBytes, controller.signal);
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        if (redirects >= MAX_REDIRECTS) throw new Error("Too many redirects.");
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirect response did not include a location.");
        url = validatePublicUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}.`);
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Response exceeded the byte limit.");
      if (!response.body) return { response, text: "", finalUrl: url.toString() };
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("Response exceeded the byte limit.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { response, text: new TextDecoder().decode(bytes), finalUrl: url.toString() };
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Request aborted."));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason ?? new Error("Request aborted.")); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

async function pinnedRequest(url: URL, addresses: Address[], maxBytes: number, signal: AbortSignal): Promise<Response> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const lookupPinned = ((_: string, opts: { all?: boolean }, callback: (error: NodeJS.ErrnoException | null, address: string | Address[], family?: number) => void) => {
    if (opts?.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  }) as NonNullable<Parameters<typeof httpRequest>[1]>["lookup"];
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { "user-agent": "AliasResearch/1.0 (+https://example.invalid)" }, lookup: lookupPinned });
    const onAbort = () => req.destroy(signal.reason instanceof Error ? signal.reason : new Error("Request aborted."));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    req.on("error", error => { signal.removeEventListener("abort", onAbort); reject(error); });
    req.on("response", response => {
      const status = response.statusCode ?? 500;
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const declared = Number(headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) { req.destroy(new Error("Response exceeded the byte limit.")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { req.destroy(new Error("Response exceeded the byte limit.")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => {
        signal.removeEventListener("abort", onAbort);
        try { resolve(responseFromBytes(status, headers, Buffer.concat(chunks))); }
        catch (error) { reject(error); }
      });
      response.on("error", error => { signal.removeEventListener("abort", onAbort); reject(error); });
    });
    req.end();
  });
}

export function responseFromBytes(status: number, headers: Headers, body: Uint8Array): Response {
  const bodyless = status === 204 || status === 205 || status === 304;
  return new Response(bodyless ? null : Buffer.from(body), { status, headers });
}

export function configFromEnvironment(): Required<Pick<FetchOptions, "maxBytes" | "timeoutMs">> {
  const bytes = Number(process.env.RESEARCH_MAX_BYTES);
  const timeout = Number(process.env.RESEARCH_TIMEOUT_MS);
  return {
    maxBytes: Number.isSafeInteger(bytes) && bytes > 0 ? bytes : DEFAULT_MAX_BYTES,
    timeoutMs: Number.isSafeInteger(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}
