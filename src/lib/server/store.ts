import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { current, GameSchema, type Game, type Project, type ProjectSummary } from "../project";

export function dataDir() {
  const base = platform() === "darwin" ? join(homedir(), "Library", "Application Support") : platform() === "win32" ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local") : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return process.env.STUDSMITH_DATA_DIR || join(base, "Studsmith");
}
function projectPath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid project ID.");
  return join(dataDir(), "projects", `${id}.json`);
}
export async function loadProject(id: string): Promise<Project | null> {
  try { return JSON.parse(await readFile(projectPath(id), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function persist(project: Project) {
  const path = projectPath(project.id);
  await mkdir(join(dataDir(), "projects"), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(project), { mode: 0o600 });
  await rename(temp, path);
  return project;
}
export async function listProjects(): Promise<ProjectSummary[]> {
  let files: string[];
  try { files = await readdir(join(dataDir(), "projects")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const projects = await Promise.all(files.filter((f) => /^[a-f0-9-]{36}\.json$/.test(f)).map((f) => loadProject(f.slice(0, -5))));
  return projects.filter((p): p is Project => !!p).map((p) => ({ id: p.id, title: current(p).game.title, description: current(p).game.description, updatedAt: p.updatedAt, revisionCount: p.revisions.length })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function createProject(game: Game, prompt: string) {
  const now = new Date().toISOString();
  return persist({ id: randomUUID(), createdAt: now, updatedAt: now, revisions: [{ id: randomUUID(), createdAt: now, prompt, summary: "Created project", game: GameSchema.parse(game) }] });
}
const locks = new Set<string>();
export async function withProjectLock<T>(id: string, fn: () => Promise<T>) {
  if (locks.has(id)) throw new Error("This project is already being updated. Try again when it finishes.");
  locks.add(id);
  try { return await fn(); } finally { locks.delete(id); }
}
export async function appendRevision(id: string, baseRevision: string, game: Game, prompt: string, summary: string) {
  const project = await loadProject(id);
  if (!project) throw new Error("Project not found.");
  if (current(project).id !== baseRevision) throw new Error("This project changed in another tab. Reload before saving.");
  const now = new Date().toISOString();
  project.updatedAt = now;
  project.revisions.push({ id: randomUUID(), createdAt: now, prompt, summary, game: GameSchema.parse(game) });
  return persist(project);
}
