import { z } from "zod";
import { current, FileSchema } from "@/lib/project";
import { requireSignedIn } from "@/lib/server/auth";
import { ApiError, handle, json, readJson } from "@/lib/server/http";
import { appendRevision, loadProject, withProjectLock } from "@/lib/server/store";

type Context = { params: Promise<{ id: string }> };
const idSchema = z.uuid();
export const GET = handle(async (_req: Request, context: Context) => {
  await requireSignedIn();
  const project = await loadProject(idSchema.parse((await context.params).id));
  if (!project) throw new ApiError(404, "Project not found.");
  return json(project);
});
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), baseRevision: z.uuid(), files: z.array(FileSchema).min(1).max(50) }),
  z.object({ action: z.literal("restore"), baseRevision: z.uuid(), revisionId: z.uuid() }),
]);
export const PATCH = handle(async (req: Request, context: Context) => {
  await requireSignedIn();
  const id = idSchema.parse((await context.params).id);
  const body = Body.parse(await readJson(req));
  return withProjectLock(id, async () => {
    const project = await loadProject(id);
    if (!project) throw new ApiError(404, "Project not found.");
    const target = body.action === "restore" ? project.revisions.find((r) => r.id === body.revisionId) : null;
    if (body.action === "restore" && !target) throw new ApiError(404, "Revision not found.");
    const game = target ? target.game : { ...current(project).game, files: body.action === "save" ? body.files : current(project).game.files };
    return json(await appendRevision(id, body.baseRevision, game, body.action === "save" ? "Manual script edits" : "Restored a previous revision", target ? `Restored ${target.game.title}` : "Saved script edits"));
  });
});
