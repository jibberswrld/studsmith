import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public topUpUrl?: string | null) { super(message); }
}
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export function localRequest(req: Request) {
  const url = new URL(req.url);
  // Next.js may normalize req.url to localhost even when the browser uses 127.0.0.1.
  // Validate the actual Host as loopback, then compare Origin against that authority.
  const host = req.headers.get("host");
  let authority: URL;
  try { authority = new URL(`${url.protocol}//${host}`); }
  catch { throw new ApiError(403, "Studsmith runs on this computer only."); }
  if (!host || authority.host !== host.toLowerCase() || !["localhost", "127.0.0.1", "[::1]"].includes(authority.hostname) || authority.port !== url.port) throw new ApiError(403, "Studsmith runs on this computer only.");
  const origin = req.headers.get("origin");
  if ((origin && origin !== authority.origin) || req.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Open Studsmith directly to continue.");
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
      if (e instanceof ApiError) return json({ error: { message: e.message, topUpUrl: e.topUpUrl } }, e.status);
      if (e instanceof z.ZodError) return json({ error: { message: e.issues.slice(0, 4).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, 400);
      const message = e instanceof Error ? e.message : "Unknown error";
      if (/already being updated|changed in another tab/.test(message)) return json({ error: { message } }, 409);
      // Never echo unexpected upstream bodies or secrets to logs or the browser.
      return json({ error: { message: "Studsmith couldn't finish this request. Retry; your saved project is intact." } }, 500);
    }
  };
}
