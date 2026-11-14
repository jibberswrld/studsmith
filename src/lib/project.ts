import { z } from "zod";

const vector = z.tuple([z.number().finite().min(-100000).max(100000), z.number().finite().min(-100000).max(100000), z.number().finite().min(-100000).max(100000)]);
export const PartSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  name: z.string().min(1).max(80).regex(/^[a-zA-Z0-9 _-]+$/),
  kind: z.enum(["block", "ball", "cylinder", "wedge", "spawn"]).default("block"),
  position: vector,
  size: z.tuple([z.number().min(0.05).max(2048), z.number().min(0.05).max(2048), z.number().min(0.05).max(2048)]),
  rotation: vector.default([0, 0, 0]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  material: z.enum(["SmoothPlastic", "Plastic", "Neon", "Wood", "Grass", "Metal", "Concrete", "Glass", "Ice", "Sand", "Slate", "Brick"]).default("SmoothPlastic"),
  anchored: z.boolean().default(true),
  canCollide: z.boolean().default(true),
  transparency: z.number().min(0).max(1).default(0),
});
export const FileSchema = z.object({
  path: z.string().max(180).regex(/^(server|client|shared)\/(?:[A-Za-z][A-Za-z0-9_-]*\/)*[A-Za-z][A-Za-z0-9_-]*(?:\.server|\.client)?\.luau$/),
  source: z.string().min(1).max(100000).refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(s), "Source contains characters that cannot be exported to Studio."),
});
export const BusinessPlanSchema = z.object({
  audience: z.string().min(1).max(2000),
  hook: z.string().min(1).max(2000),
  retentionLoop: z.string().min(1).max(3000),
  offers: z.array(z.object({
    name: z.string().min(1).max(150),
    purchaseType: z.string().min(1).max(150),
    playerValue: z.string().min(1).max(1500),
    freeAlternative: z.string().min(1).max(1500),
    setupRequired: z.string().min(1).max(2000),
  })).max(6),
  metrics: z.array(z.object({ name: z.string().min(1).max(150), definition: z.string().min(1).max(1500), decision: z.string().min(1).max(1500) })).min(1).max(8),
  launchPlan: z.array(z.string().min(1).max(1500)).min(1).max(10),
});
export const GameSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(2000),
  parts: z.array(PartSchema).min(1).max(500),
  files: z.array(FileSchema).min(1).max(50),
  lighting: z.object({
    clockTime: z.number().min(0).max(24).default(14),
    brightness: z.number().min(0).max(10).default(2),
    ambient: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#8c9bb0"),
  }).default({ clockTime: 14, brightness: 2, ambient: "#8c9bb0" }),
  instructions: z.string().min(1).max(4000),
  testPlan: z.array(z.string().min(1).max(1000)).min(1).max(20),
  notes: z.array(z.string().max(1000)).max(20).default([]),
  businessPlan: BusinessPlanSchema.optional(),
}).superRefine((game, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  for (const field of ["id", "name"] as const) {
    if (new Set(game.parts.map((p) => p[field])).size !== game.parts.length) issue(`Part ${field}s must be unique.`);
  }
  if (!game.parts.some((p) => p.kind === "spawn")) issue("Include a spawn location.");
  const paths = new Set<string>();
  const scriptNames = new Set<string>();
  const folders = new Set<string>();
  for (const file of game.files) {
    const path = file.path.toLowerCase();
    if (paths.has(path)) issue(`Duplicate file: ${file.path}`);
    paths.add(path);
    if (/(^|\/)(init|__proto__|prototype|constructor)(\.|\/)/i.test(path)) issue(`Reserved filename: ${file.path}`);
    if ((path.startsWith("server/") && path.endsWith(".client.luau")) || (path.startsWith("client/") && path.endsWith(".server.luau")) || (path.startsWith("shared/") && /\.(server|client)\.luau$/.test(path))) issue(`Wrong script location: ${file.path}`);
    const stem = path.replace(/(?:\.server|\.client)?\.luau$/, "");
    if (scriptNames.has(stem)) issue(`Two scripts have the same Studio name: ${file.path}`);
    scriptNames.add(stem);
    const segments = stem.split("/");
    for (let i = 1; i < segments.length; i++) folders.add(segments.slice(0, i).join("/"));
  }
  for (const name of scriptNames) if (folders.has(name)) issue(`A script and folder share a name: ${name}`);
});

export type Game = z.infer<typeof GameSchema>;
export type Part = z.infer<typeof PartSchema>;
export type GameFile = z.infer<typeof FileSchema>;
/** needsReview marks a saved game that didn't pass the AI check. Older revisions only have the DRAFT_SUMMARY label. */
export type Revision = { id: string; createdAt: string; prompt: string; summary: string; game: Game; needsReview?: boolean };
export type Project = { id: string; createdAt: string; updatedAt: string; revisions: Revision[] };
export type ProjectSummary = { id: string; title: string; description: string; updatedAt: string; revisionCount: number; needsReview: boolean };

/** Conservative AI cost of one build on publik-smart (observed $0.45–$1.60). Shown to visitors and used to gate Publik builds. */
export const BUILD_ESTIMATE_MICROS = 1_000_000;
export const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;
/** "$1" for whole dollars, used for the rough build estimate. */
export const BUILD_ESTIMATE = dollars(BUILD_ESTIMATE_MICROS).replace(/\.00$/, "");
/** Revision label for a schema-valid game that did not pass the AI check. */
export const DRAFT_SUMMARY = "Needs review — failed AI check";
export type Finding = { severity: "blocker" | "major" | "minor"; location: string; problem: string; fix: string };
export type Draft = { reason: string; findings: Finding[]; topUpUrl?: string | null };
/** One line of the newline-delimited JSON stream from POST /api/generate. The last line is "result" or "error". */
export type BuildEvent =
  | { type: "stage"; stage: "design" | "build" | "review" | "repair"; attempt: number; status: "started" | "finished" }
  | { type: "ping" }
  | { type: "result"; game: Game; draft: Draft | null }
  | { type: "error"; error: { message: string; topUpUrl?: string | null } };
export const current = (project: Project) => project.revisions[project.revisions.length - 1];
export const needsReview = (revision: Revision) => revision.needsReview ?? revision.summary === DRAFT_SUMMARY;
export const exportName = (title: string) => title.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "game";

export const STARTER_PROMPTS = [
  { title: "Sky-island obby", prompt: "Build a sky-island obby with 12 reachable jumps, checkpoints, lava hazards, a timer, and a finish platform. Give it a bright mint and sandstone palette and a clear on-screen HUD." },
  { title: "Crystal collector", prompt: "Build a crystal collecting game in a forest arena. Crystals respawn, the server tracks scores, and the HUD shows progress toward 20 crystals. Include a win message and a restart loop." },
  { title: "Last platform standing", prompt: "Build a round-based survival game: platforms turn red before disappearing, with an intermission, countdown HUD, safe lobby spawn, and server-controlled winners. Handle a solo player for testing." },
];
