import { z } from "zod";
import { current, exportName } from "@/lib/project";
import { requireSignedIn } from "@/lib/server/auth";
import { placeXml, sourceZip } from "@/lib/server/export";
import { ApiError, handle } from "@/lib/server/http";
import { loadProject } from "@/lib/server/store";

export const GET = handle(async (req: Request, context: { params: Promise<{ id: string }> }) => {
  await requireSignedIn();
  const project = await loadProject(z.uuid().parse((await context.params).id));
  if (!project) throw new ApiError(404, "Project not found.");
  const format = z.enum(["rbxlx", "zip", "json"]).parse(new URL(req.url).searchParams.get("format") || "rbxlx");
  const game = current(project).game;
  const bytes = format === "zip" ? Buffer.from(sourceZip(game)) : format === "json" ? JSON.stringify(game, null, 2) : placeXml(game);
  return new Response(bytes, { headers: { "Content-Type": format === "zip" ? "application/zip" : format === "json" ? "application/json" : "application/xml", "Content-Disposition": `attachment; filename="${exportName(game.title)}.${format}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
});
