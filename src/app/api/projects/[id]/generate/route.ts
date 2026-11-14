import { z } from "zod";
import { current } from "@/lib/project";
import { generateGame } from "@/lib/server/generate";
import { ApiError, handle, json, readJson } from "@/lib/server/http";
import { requireSignedIn } from "@/lib/server/auth";
import { appendRevision, loadProject, withProjectLock } from "@/lib/server/store";

export const maxDuration = 420;
const Body = z.object({ prompt: z.string().trim().min(3).max(12000), baseRevision: z.uuid(), tier: z.enum(["publik-balanced", "publik-smart"]).default("publik-smart") });
export const POST = handle(async (req: Request, context: { params: Promise<{ id: string }> }) => {
  await requireSignedIn();
  const id = z.uuid().parse((await context.params).id);
  const body = Body.parse(await readJson(req));
  return withProjectLock(id, async () => {
    const project = await loadProject(id);
    if (!project) throw new ApiError(404, "Project not found.");
    if (current(project).id !== body.baseRevision) throw new ApiError(409, "This project changed in another tab. Reload before generating.");
    const game = await generateGame(body.prompt, current(project).game, body.tier, req.signal);
    return json(await appendRevision(id, body.baseRevision, game, body.prompt, "Updated game"));
  });
});
