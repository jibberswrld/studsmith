import { z } from "zod";
import { GameSchema } from "@/lib/project";
import { generateGame } from "@/lib/server/generate";
import { handle, json, readJson } from "@/lib/server/http";
export const maxDuration = 540;
const Body = z.object({ prompt: z.string().trim().min(3).max(12000), currentGame: GameSchema.nullable().default(null), tier: z.enum(["publik-balanced", "publik-smart"]).default("publik-smart") });
export const POST = handle(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  return json(await generateGame(body.prompt, body.currentGame, body.tier, req.signal));
});
