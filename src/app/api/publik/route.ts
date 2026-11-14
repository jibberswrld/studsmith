import { z } from "zod";
import { gate, requireSignedIn, safeLink, saveSettings, settings, wallet } from "@/lib/server/auth";
import { ApiError, handle, json, readJson } from "@/lib/server/http";
import { sendEvent } from "@/lib/server/publik";

export const GET = handle(async () => json(await gate()));
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("choice"), choice: z.enum(["publik", "own_key"]), ownKey: z.object({ baseURL: z.url().max(500), apiKey: z.string().min(8).max(1000), model: z.string().min(1).max(120) }).optional() }),
  z.object({ action: z.literal("settings") }),
  z.object({ action: z.literal("telemetry"), event: z.enum(["app_opened", "active_session"]) }),
]);
let lastOpened = 0, lastActive = 0;
export const POST = handle(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  const auth = await requireSignedIn();
  if (body.action === "telemetry") {
    const now = Date.now();
    const last = body.event === "app_opened" ? lastOpened : lastActive;
    if (now - last > 30 * 60 * 1000) {
      if (body.event === "app_opened") lastOpened = now; else lastActive = now;
      await sendEvent(body.event, { key: auth.key });
    }
    return json({ ok: true });
  }
  const config = await settings();
  if (body.action === "settings") { await saveSettings({ ...config, choice: null }); return json(await gate()); }
  if (body.choice === "publik") {
    const fresh = await wallet(true);
    if (fresh.wallet.plan.kind === "none" && fresh.wallet.balance_micros <= 0) throw new ApiError(402, "Get a publik plan, or use your own key.", safeLink(fresh.wallet.top_up_url));
  } else if (!body.ownKey) {
    throw new ApiError(400, "Enter your provider URL, model, and API key.");
  } else {
    const url = new URL(body.ownKey.baseURL);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) throw new ApiError(400, "Use an HTTPS provider URL, or a local provider on this computer.");
    if (url.username || url.password || url.search || url.hash) throw new ApiError(400, "Use a base URL without credentials, query parameters, or a fragment.");
  }
  await saveSettings({ choice: body.choice, ...(body.choice === "own_key" ? { ownKey: body.ownKey } : {}) });
  return json(await gate());
});
