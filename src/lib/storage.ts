import { current, DRAFT_SUMMARY, GameSchema, type Game, type Project, type ProjectSummary } from "./project";

async function database(scope: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(scope)) throw new Error("Sign in before opening projects.");
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`studsmith-${scope}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Browser project storage is unavailable. Enable site storage and retry."));
  });
}
export async function loadProject(scope: string, id: string): Promise<Project> {
  const db = await database(scope);
  try { return await new Promise((resolve, reject) => { const req = db.transaction("projects").objectStore("projects").get(id); req.onsuccess = () => req.result ? resolve(req.result) : reject(new Error("Project not found in this browser.")); req.onerror = () => reject(req.error); }); }
  finally { db.close(); }
}
export async function listProjects(scope: string): Promise<ProjectSummary[]> {
  const db = await database(scope);
  try {
    const all = await new Promise<Project[]>((resolve, reject) => { const req = db.transaction("projects").objectStore("projects").getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    return all.map((p) => ({ id: p.id, title: current(p).game.title, description: current(p).game.description, updatedAt: p.updatedAt, revisionCount: p.revisions.length, needsReview: current(p).summary === DRAFT_SUMMARY })).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}
async function write(scope: string, project: Project, base?: string) {
  const db = await database(scope);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      const store = tx.objectStore("projects");
      const request = store.get(project.id);
      let conflict = false;
      request.onsuccess = () => {
        const existing: Project | undefined = request.result;
        if (base && (!existing || current(existing).id !== base)) { conflict = true; tx.abort(); return; }
        store.put(project);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(conflict ? "This project changed in another tab. Reload before saving." : "Browser storage couldn't save this project. Download a backup and check available storage."));
      tx.onerror = () => reject(new Error("Browser storage couldn't save the project. Check available storage."));
    });
    return project;
  } finally { db.close(); }
}
export async function createProject(scope: string, input: Game, prompt: string, summary = "Created project") {
  const now = new Date().toISOString();
  return write(scope, { id: crypto.randomUUID(), createdAt: now, updatedAt: now, revisions: [{ id: crypto.randomUUID(), createdAt: now, prompt, summary, game: GameSchema.parse(input) }] });
}
/** Ask the browser not to evict site storage. Best effort: browsers may decline or ask the visitor. */
export async function requestPersistentStorage() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
export async function appendRevision(scope: string, id: string, base: string, input: Game, prompt: string, summary: string) {
  const p = await loadProject(scope, id);
  if (current(p).id !== base) throw new Error("This project changed in another tab. Reload before saving.");
  const now = new Date().toISOString();
  return write(scope, { ...p, updatedAt: now, revisions: [...p.revisions, { id: crypto.randomUUID(), createdAt: now, prompt, summary, game: GameSchema.parse(input) }] }, base);
}
