import { z } from "zod";
import { GameSchema } from "@/lib/project";
import { requireSignedIn } from "@/lib/server/auth";
import { generateGame } from "@/lib/server/generate";
import { handle, json, readJson } from "@/lib/server/http";
import { createProject, listProjects } from "@/lib/server/store";

export const maxDuration = 420;
export const GET = handle(async () => { await requireSignedIn(); return json(await listProjects()); });
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), prompt: z.string().trim().min(10).max(12000), tier: z.enum(["publik-balanced", "publik-smart"]).default("publik-smart") }),
  z.object({ action: z.literal("import"), game: GameSchema }),
]);
export const POST = handle(async (req: Request) => {
  await requireSignedIn();
  const body = Body.parse(await readJson(req));
  const game = body.action === "import" ? body.game : await generateGame(body.prompt, null, body.tier, req.signal);
  return json(await createProject(game, body.action === "import" ? "Imported project" : body.prompt), 201);
});
