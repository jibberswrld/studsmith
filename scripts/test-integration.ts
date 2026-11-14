import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Game } from "../src/lib/project";
import { placeXml, sourceZip } from "../src/lib/export";

const port = 3019, base = `http://127.0.0.1:${port}`, mockBase = "http://127.0.0.1:4557";
const processes: ChildProcess[] = [];
await mkdir(".test-data", { recursive: true });
const dir = await mkdtemp(join(process.cwd(), ".test-data/integration-"));
const env = { ...process.env, STUDSMITH_PUBLIK_DIR: join(dir, "publik"), PUBLIK_ORIGIN: mockBase, PUBLIK_APP_TOKEN: "pat_studsmith_test", STUDSMITH_SESSION_SECRET: "deterministic-session-secret-for-local-tests-only", STUDSMITH_APP_ORIGIN: base };
function start(tool: "next" | "tsx", args: string[], extra: Record<string, string> = {}) {
  const executable = join(process.cwd(), tool === "next" ? "node_modules/next/dist/bin/next" : "node_modules/tsx/dist/cli.mjs");
  const child = spawn(process.execPath, [executable, ...args], { env: { ...env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
  processes.push(child);
  let output = "";
  child.stdout!.on("data", (chunk) => { output += chunk.toString(); }); child.stderr!.on("data", (chunk) => { output += chunk.toString(); });
  return { child, output: () => output };
}
async function ready(url: string) {
  for (let attempt = 0; attempt < 80; attempt++) { try { await fetch(url); return; } catch { await delay(150); } }
  throw new Error(`Test server didn't start: ${url}`);
}
function browser() {
  let cookie = "";
  return {
    async request(path: string, body?: unknown) {
      const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const saved = response.headers.get("set-cookie");
      if (saved) { assert.match(saved, /HttpOnly/i); assert.match(saved, /SameSite=lax/i); assert.ok(!saved.includes("pk_test_")); cookie = saved.split(";")[0]; }
      return { status: response.status, body: await response.json() };
    },
    cookie: () => cookie,
  };
}
async function mode(value: string) { await fetch(`${mockBase}/mock/mode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: value }) }); }
const mock = start("tsx", ["scripts/mock-publik.ts"], { MOCK_PUBLIK_PORT: "4557" });
const app = start("next", ["start", "-H", "127.0.0.1", "-p", String(port)]);
try {
  await Promise.all([ready(`${mockBase}/mock/state`), ready(base)]);
  const alice = browser(), bob = browser();
  const gen = { prompt: "Build a checkpoint obby", tier: "publik-smart" };
  assert.equal((await alice.request("/api/generate", gen)).status, 401);
  let gate = await alice.request("/api/publik");
  assert.equal(gate.body.state, "sign_in");
  const bobGate = await bob.request("/api/publik");
  assert.notEqual(bobGate.body.claimUrl, gate.body.claimUrl);
  await fetch(gate.body.claimUrl);
  gate = await alice.request("/api/publik");
  assert.equal(gate.body.state, "choose");
  assert.equal((await alice.request("/api/generate", gen)).status, 401);
  const connected = await alice.request("/api/publik", { action: "choice", choice: "publik" });
  assert.equal(connected.body.state, "ready", JSON.stringify(connected.body));
  assert.ok(connected.body.workspace);
  assert.equal((await bob.request("/api/generate", gen)).status, 401);
  assert.equal((await bob.request("/api/publik")).body.state, "sign_in");
  const created = await alice.request("/api/generate", gen);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  let game: Game = created.body;
  assert.equal(game.title, "Cloudstep"); assert.equal(game.businessPlan?.offers[0].name, "Trail color");
  const changed = await alice.request("/api/generate", { ...gen, currentGame: game, prompt: "Add another feature", tier: "publik-balanced" });
  assert.equal(changed.status, 200); game = changed.body;
  assert.equal(game.title, "Cloudstep Revised");
  for (const value of ["402", "invalid"]) {
    await mode(value);
    const failed = await alice.request("/api/generate", { ...gen, currentGame: game });
    assert.equal(failed.status, value === "402" ? 402 : 422);
    if (value === "402") assert.equal(failed.body.error.topUpUrl, `${mockBase}/wallet`);
  }
  for (const stage of ["design", "build", "review"]) {
    await mode(`length-${stage}`);
    const limited = await alice.request("/api/generate", gen);
    assert.equal(limited.status, 422);
    assert.match(limited.body.error.message, new RegExp(`AI ${stage} stage exceeded`));
  }
  await mode("repair");
  assert.equal((await alice.request("/api/generate", gen)).status, 200);
  const repairedState = await (await fetch(`${mockBase}/mock/state`)).json();
  assert.deepEqual(repairedState.calls.slice(-5).map((call: { stage: string }) => call.stage), ["design", "build", "review", "repair", "review"]);
  await mode("reject");
  const rejected = await alice.request("/api/generate", gen);
  assert.equal(rejected.status, 422); assert.match(rejected.body.error.message, /failed its AI review after repair/);
  const denied = await fetch(`${base}/api/publik`, { method: "POST", headers: { Origin: "https://untrusted.example", Cookie: alice.cookie(), "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings" }) });
  assert.equal(denied.status, 403);
  const tampered = await fetch(`${base}/api/generate`, { method: "POST", headers: { Origin: base, Cookie: "studsmith_session=tampered", "Content-Type": "application/json" }, body: JSON.stringify(gen) });
  assert.equal(tampered.status, 401);
  await alice.request("/api/publik", { action: "telemetry", event: "app_opened" });
  const state = await (await fetch(`${mockBase}/mock/state`)).json();
  for (const call of state.calls) assert.deepEqual(call.skills, ["roblox-game-design", "roblox-worldcraft", "roblox-economy-growth"]);
  assert.ok(state.events.includes("app_opened"));
  await writeFile(join(dir, "Cloudstep.rbxlx"), placeXml(game)); await writeFile(join(dir, "Cloudstep.zip"), sourceZip(game));
  const self = start("next", ["start", "-H", "127.0.0.1", "-p", "3020"], { PUBLIK_SELF_TEST: "1" });
  await new Promise<void>((resolve, reject) => self.child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(self.output()))));
  assert.match(self.output(), /publik self-test: ok studsmith 0.1.0/);
  console.log("Integration passed: isolated encrypted browser sessions, claim/plan gate, design/build/review/repair, rejection, skills loading, 402, tampering, cross-origin protection, telemetry, built self-test. Local fixture only.");
} catch (error) { console.error(app.output(), mock.output()); throw error; }
finally { for (const child of processes) child.kill("SIGTERM"); }
