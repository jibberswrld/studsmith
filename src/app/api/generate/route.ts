import { z } from "zod";
import { GameSchema, type BuildEvent } from "@/lib/project";
import { providerFor, requireSignedIn } from "@/lib/server/auth";
import { generateGame } from "@/lib/server/generate";
import { handle, publicError, readJson } from "@/lib/server/http";
export const maxDuration = 540;
const Body = z.object({ prompt: z.string().trim().min(3).max(12000), currentGame: GameSchema.nullable().default(null), tier: z.enum(["publik-balanced", "publik-smart"]).default("publik-smart") });

// Auth, body, and balance errors return JSON with an HTTP status. Once the build starts, the response is
// newline-delimited JSON: stage events, a ping every 15 s, then exactly one "result" or "error" line.
export const POST = handle(async (req: Request) => {
  const auth = await requireSignedIn(); // before reading up to 3 MB of body
  const body = Body.parse(await readJson(req));
  const config = providerFor(auth, body.tier);
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: BuildEvent) => {
        if (!open) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { open = false; }
      };
      const ping = setInterval(() => send({ type: "ping" }), 15_000);
      try { send({ type: "result", ...(await generateGame(body.prompt, body.currentGame, config, req.signal, send)) }); }
      catch (error) { const { message, topUpUrl } = publicError(error); send({ type: "error", error: { message, topUpUrl } }); }
      finally {
        clearInterval(ping);
        if (open) { open = false; try { controller.close(); } catch { /* The visitor already left. */ } }
      }
    },
    cancel() { open = false; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
});
