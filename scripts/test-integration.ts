import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { current, type Project } from "../src/lib/project";

const port = 3019;
const base = `http://127.0.0.1:${port}`;
const mockBase = "http://127.0.0.1:4557";
const processes: ChildProcess[] = [];
await mkdir(".test-data", { recursive: true });
const dir = await mkdtemp(join(process.cwd(), ".test-data/integration-"));
const env = { ...process.env, STUDSMITH_DATA_DIR: dir, STUDSMITH_PUBLIK_DIR: join(dir, "publik"), PUBLIK_ORIGIN: mockBase, PUBLIK_APP_TOKEN: "pat_studsmith_test" };
function start(args: string[], extra: Record<string, string> = {}) {
  const tool = args[1];
  const executable = join(globalThis.process.cwd(), tool === "next" ? "node_modules/next/dist/bin/next" : "node_modules/tsx/dist/cli.mjs");
  const process = spawn(globalThis.process.execPath, [executable, ...args.slice(2)], { env: { ...env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
  processes.push(process);
  // Save test-only output for diagnosis without flooding the terminal.
  let output = "";
  process.stdout!.on("data", (chunk) => { output += chunk.toString(); });
  process.stderr!.on("data", (chunk) => { output += chunk.toString(); });
  return { process, output: () => output };
}
async function ready(url: string) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { await fetch(url); return; } catch { await delay(150); }
  }
  throw new Error(`Test server didn't start: ${url}`);
}
async function request(path: string, body?: unknown, method = "POST") {
  const response = await fetch(`${base}${path}`, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const mock = start(["exec", "tsx", "scripts/mock-publik.ts"], { MOCK_PUBLIK_PORT: "4557" });
const app = start(["exec", "next", "start", "-H", "127.0.0.1", "-p", String(port)]);
try {
  await Promise.all([ready(`${mockBase}/mock/state`), ready(base)]);
  let gate = await request("/api/publik");
  assert.equal(gate.body.state, "sign_in");
  assert.equal((await request("/api/projects")).status, 401);
  await fetch(gate.body.claimUrl);
  gate = await request("/api/publik");
  assert.equal(gate.body.state, "choose");
  assert.equal((await request("/api/projects", { action: "generate", prompt: "Build a platform game" })).status, 401);
  assert.equal((await request("/api/publik", { action: "choice", choice: "publik" })).body.state, "ready");
  const created = await request("/api/projects", { action: "generate", prompt: "Build a checkpoint obby", tier: "publik-smart" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  let project: Project = created.body;
  assert.equal(current(project).game.title, "Cloudstep");
  assert.equal(current(project).game.businessPlan?.offers[0].name, "Trail color");
  const originalId = current(project).id;
  const files = structuredClone(current(project).game.files);
  files[0].source += "\n-- Manual edit from integration test\n";
  const saved = await request(`/api/projects/${project.id}`, { action: "save", baseRevision: originalId, files }, "PATCH");
  assert.equal(saved.status, 200);
  project = saved.body;
  assert.equal(project.revisions.length, 2);
  assert.equal((await request(`/api/projects/${project.id}`, { action: "save", baseRevision: originalId, files }, "PATCH")).status, 409);
  const changed = await request(`/api/projects/${project.id}/generate`, { prompt: "Add another feature", baseRevision: current(project).id, tier: "publik-balanced" });
  assert.equal(changed.status, 200);
  project = changed.body;
  assert.equal(current(project).game.title, "Cloudstep Revised");
  const restored = await request(`/api/projects/${project.id}`, { action: "restore", baseRevision: current(project).id, revisionId: originalId }, "PATCH");
  assert.equal(restored.status, 200);
  project = restored.body;
  assert.equal(project.revisions.length, 4);
  assert.equal(current(project).game.title, "Cloudstep");
  for (const format of ["rbxlx", "zip", "json"]) {
    const response = await fetch(`${base}/api/projects/${project.id}/export?format=${format}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-disposition")?.includes(`.${format}`));
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(join(dir, `Cloudstep.${format}`), bytes);
    if (format === "rbxlx") assert.ok(new TextDecoder().decode(bytes).includes('<Item class="LocalScript"'));
    if (format === "zip") assert.equal(bytes[0], 80);
    if (format === "json") assert.equal(JSON.parse(new TextDecoder().decode(bytes)).title, "Cloudstep");
  }
  for (const mode of ["402", "invalid"]) {
    await fetch(`${mockBase}/mock/mode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
    const failed = await request(`/api/projects/${project.id}/generate`, { prompt: "Try changing the game", baseRevision: current(project).id });
    assert.equal(failed.status, mode === "402" ? 402 : 422);
    if (mode === "402") assert.equal(failed.body.error.topUpUrl, `${mockBase}/wallet`);
    assert.equal((await request(`/api/projects/${project.id}`)).body.revisions.length, 4);
  }
  const denied = await fetch(`${base}/api/publik`, { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings" }) });
  assert.equal(denied.status, 403);
  await request("/api/publik", { action: "telemetry", event: "app_opened" });
  const state = await (await fetch(`${mockBase}/mock/state`)).json();
  assert.equal(state.calls[0].model, "publik-smart");
  assert.deepEqual(state.calls.slice(0, 3).map((call: { stage: string }) => call.stage), ["design", "build", "review"]);
  for (const call of state.calls) assert.deepEqual(call.skills, ["roblox-game-design", "roblox-worldcraft", "roblox-economy-growth"]);
  assert.ok(state.calls.some((call: { stage: string; hasCurrentGame: boolean }) => call.stage === "build" && call.hasCurrentGame));
  assert.ok(state.events.includes("app_opened"));
  await fetch(`${mockBase}/mock/mode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "repair" }) });
  const repaired = await request(`/api/projects/${project.id}/generate`, { prompt: "Improve the game", baseRevision: current(project).id });
  assert.equal(repaired.status, 200, JSON.stringify(repaired.body));
  project = repaired.body;
  assert.equal(project.revisions.length, 5);
  const afterRepair = await (await fetch(`${mockBase}/mock/state`)).json();
  assert.deepEqual(afterRepair.calls.slice(-5).map((call: { stage: string }) => call.stage), ["design", "build", "review", "repair", "review"]);
  await fetch(`${mockBase}/mock/mode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "reject" }) });
  const rejected = await request(`/api/projects/${project.id}/generate`, { prompt: "Improve it again", baseRevision: current(project).id });
  assert.equal(rejected.status, 422);
  assert.match(rejected.body.error.message, /failed its AI review after repair/);
  assert.equal((await request(`/api/projects/${project.id}`)).body.revisions.length, 5);
  const self = start(["exec", "next", "start", "-H", "127.0.0.1", "-p", "3020"], { PUBLIK_SELF_TEST: "1" });
  await new Promise<void>((resolve, reject) => { self.process.once("exit", (code) => code === 0 ? resolve() : reject(new Error(self.output()))); });
  assert.match(self.output(), /publik self-test: ok studsmith 0.1.0/);
  console.log("Integration passed: sign-in → design → build → review → repair → re-review; unresolved findings rejected; save, edits, restore, exports, errors, origin checks, telemetry, built-app self-test. Local fixture only; no live quality claim.");
  console.log(`Studio test place: ${join(dir, "Cloudstep.rbxlx")}`);
} catch (error) {
  console.error(app.output(), mock.output());
  throw error;
} finally { for (const process of processes) process.kill("SIGTERM"); }
