import { z } from "zod";
import { gate, requireSignedIn, safeLink, saveChoice } from "@/lib/server/auth";
import { ApiError, handle, json, readJson } from "@/lib/server/http";
import { sendEvent } from "@/lib/server/publik";
import { clearSession, writeSession } from "@/lib/server/session";

export const GET = handle(async () => json(await gate()));
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("choice"), choice: z.enum(["publik", "own_key"]), ownKey: z.object({ baseURL: z.url().max(300), apiKey: z.string().min(8).max(512), model: z.string().min(1).max(120) }).optional() }),
  z.object({ action: z.literal("settings") }),
  z.object({ action: z.literal("sign_out") }),
  z.object({ action: z.literal("telemetry"), event: z.enum(["app_opened", "active_session"]) }),
]);
export const POST = handle(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  if (body.action === "sign_out") { await clearSession(); return json({ ok: true }); }
  const auth = await requireSignedIn();
  if (body.action === "telemetry") {
    const field = body.event === "app_opened" ? "openedAt" : "activeAt";
    if (Date.now() - auth.session[field] > 30 * 60 * 1000) {
      await sendEvent(body.event, { key: auth.key, installId: auth.session.install_id });
      await writeSession({ ...auth.session, [field]: Date.now() });
    }
    return json({ ok: true });
  }
  if (body.action === "settings") { await saveChoice(auth.session, null); return json(await gate()); }
  if (body.choice === "publik") {
    if (auth.wallet.plan.kind === "none" && auth.wallet.balance_micros <= 0) throw new ApiError(402, "Get a publik plan, or use your own key.", safeLink(auth.wallet.top_up_url));
  } else if (!body.ownKey) throw new ApiError(400, "Enter your provider URL, model, and API key.");
  else {
    const url = new URL(body.ownKey.baseURL);
    // Hosted users cannot turn the application into a proxy to internal services.
    if (process.env.VERCEL && body.ownKey.baseURL.replace(/\/$/, "") !== "https://api.openai.com/v1") throw new ApiError(400, "The hosted own-key option supports https://api.openai.com/v1. Source installs can use other compatible providers.");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) throw new ApiError(400, "Use an HTTPS provider URL or a local provider.");
    if (url.username || url.password || url.search || url.hash) throw new ApiError(400, "Use a base URL without credentials or query parameters.");
  }
  await saveChoice(auth.session, body.choice, body.ownKey);
  return json(await gate());
});
