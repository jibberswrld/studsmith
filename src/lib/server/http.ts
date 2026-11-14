import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public topUpUrl?: string | null) { super(message); }
}
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

/** STUDSMITH_APP_ORIGIN (a comma-separated list of exact origins) plus Vercel's own deployment, branch, and production domains. */
export function configuredOrigins() {
  const listed = (process.env.STUDSMITH_APP_ORIGIN || "").split(",").map((value) => value.trim()).filter(Boolean);
  const platform = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean).map((domain) => `https://${domain}`);
  const origins: URL[] = [];
  for (const value of [...listed, ...platform]) {
    try {
      const url = new URL(value);
      // Exact origins only: no paths, credentials, or wildcards.
      if ((url.protocol === "https:" || url.protocol === "http:") && url.origin === value.replace(/\/$/, "")) origins.push(url);
    } catch { /* Ignore malformed entries rather than trusting them. */ }
  }
  return origins;
}
export function localRequest(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host");
  let expected: URL;
  const trustedOrigins = configuredOrigins();
  if (process.env.VERCEL || trustedOrigins.length) {
    const match = trustedOrigins.find((value) => value.host === host?.toLowerCase());
    if (!match) throw new ApiError(403, "Open Studsmith directly to continue.");
    expected = match;
  } else {
    expected = new URL(`${url.protocol}//${host}`);
    if (!host || expected.host !== host.toLowerCase() || !["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname)) throw new ApiError(403, "Open Studsmith directly to continue.");
  }
  const origin = req.headers.get("origin");
  if ((origin && origin !== expected.origin) || req.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Open Studsmith directly to continue.");
}
export async function readJson(req: Request) {
  const limit = 3 * 1024 * 1024;
  if (Number(req.headers.get("content-length")) > limit) throw new ApiError(413, "The project is too large (maximum 3 MB).");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new ApiError(413, "The project is too large (maximum 3 MB)."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new ApiError(400, "Could not read the JSON. Check the file and try again."); }
}
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try { localRequest(args[0] as Request); return await fn(...args); }
    catch (e) {
      const { status, ...error } = publicError(e);
      return json({ error }, status);
    }
  };
}
/** The status and visitor-safe message for an error. Never echoes unexpected upstream bodies or secrets. */
export function publicError(e: unknown): { status: number; message: string; topUpUrl?: string | null } {
  if (e instanceof ApiError) return { status: e.status, message: e.message, topUpUrl: e.topUpUrl };
  if (e instanceof z.ZodError) return { status: 400, message: e.issues.slice(0, 4).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const message = e instanceof Error ? e.message : "Unknown error";
  if (/already being updated|changed in another tab/.test(message)) return { status: 409, message };
  return { status: 500, message: "Studsmith couldn't finish this request. Retry; your saved project is intact." };
}
