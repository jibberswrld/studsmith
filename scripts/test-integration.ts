import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { BuildEvent, Game } from "../src/lib/project";
import { placeXml, sourceZip } from "../src/lib/export";

const port = 3019, base = `http://127.0.0.1:${port}`, mockBase = "http://127.0.0.1:4557";
const tightPort = 3021, tightBase = `http://127.0.0.1:${tightPort}`;
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
type Final = Extract<BuildEvent, { type: "result" | "error" }>;
function browser() {
  let cookie = "";
  return {
    async request(path: string, body?: unknown, at = base) {
      const response = await fetch(`${at}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Origin: at, ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const saved = response.headers.get("set-cookie");
      if (saved) { assert.match(saved, /HttpOnly/i); assert.match(saved, /SameSite=lax/i); assert.ok(!saved.includes("pk_test_")); cookie = saved.split(";")[0]; }
      return { status: response.status, body: await response.json() };
    },
    /** POST /api/generate. Returns the parsed NDJSON stream, or the JSON error sent before the build started. */
    async generate(body: unknown, at = base) {
      const response = await fetch(`${at}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", Origin: at, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
      if (!response.headers.get("content-type")?.includes("ndjson")) return { status: response.status, events: [] as BuildEvent[], final: null, error: (await response.json()).error };
      const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as BuildEvent);
      const final = events.at(-1) as Final;
      assert.ok(final.type === "result" || final.type === "error");
      return { status: response.status, events, final, error: final.type === "error" ? final.error : null };
    },
    cookie: () => cookie,
  };
}
const result = (final: Final | null) => { assert.equal(final?.type, "result", JSON.stringify(final)); return final as Extract<Final, { type: "result" }>; };
async function mode(value: string, delayMs = 0) { await fetch(`${mockBase}/mock/mode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: value, delayMs }) }); }
async function setWallet(balance_micros: number, kind = "none") { await fetch(`${mockBase}/mock/wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ balance_micros, kind }) }); }
const mockState = async () => (await fetch(`${mockBase}/mock/state`)).json();
const stages = async (count: number) => (await mockState()).calls.slice(-count).map((call: { stage: string }) => call.stage);
const mock = start("tsx", ["scripts/mock-publik.ts"], { MOCK_PUBLIK_PORT: "4557" });
const app = start("next", ["start", "-H", "127.0.0.1", "-p", String(port)]);
try {
  await Promise.all([ready(`${mockBase}/mock/state`), ready(base)]);
  const alice = browser(), bob = browser();
  const gen = { prompt: "Build a checkpoint obby", tier: "publik-smart" };
  assert.equal((await alice.generate(gen)).status, 401);
  // Auth is checked before the body is read: an oversized anonymous request is 401, not 413.
  const huge = await fetch(`${base}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ ...gen, prompt: "x".repeat(4 * 1024 * 1024) }) });
  assert.equal(huge.status, 401);
  // Opening the gate never creates a Publik install; only clicking Sign in does.
  const installsBefore = (await mockState()).installs;
  let gate = await alice.request("/api/publik");
  assert.equal(gate.body.state, "sign_in"); assert.equal(gate.body.claimUrl, null);
  for (let i = 0; i < 3; i++) await browser().request("/api/publik");
  assert.equal((await mockState()).installs, installsBefore);
  gate = await alice.request("/api/publik", { action: "sign_in" });
  assert.equal(gate.body.state, "sign_in"); assert.ok(gate.body.claimUrl);
  assert.equal((await mockState()).installs, installsBefore + 1);
  assert.equal((await alice.request("/api/publik", { action: "sign_in" })).body.claimUrl, gate.body.claimUrl, "a second click reuses the install");
  assert.equal((await mockState()).installs, installsBefore + 1);
  const bobGate = await bob.request("/api/publik", { action: "sign_in" });
  assert.notEqual(bobGate.body.claimUrl, gate.body.claimUrl);
  await fetch(gate.body.claimUrl);
  // The $0.05 of free Publik use can't cover a build: the gate says so instead of offering to connect it.
  await setWallet(50_000);
  gate = await alice.request("/api/publik");
  assert.equal(gate.body.state, "choose"); assert.equal(gate.body.hasPlan, false);
  assert.match(gate.body.title, /costs about \$1 of AI usage/); assert.match(gate.body.body, /\$0\.05/);
  const refused = await alice.request("/api/publik", { action: "choice", choice: "publik" });
  assert.equal(refused.status, 402); assert.equal(refused.body.error.topUpUrl, `${mockBase}/wallet`);
  assert.equal((await alice.generate(gen)).status, 401);
  await setWallet(8_000_000, "plan");
  gate = await alice.request("/api/publik");
  assert.equal(gate.body.hasPlan, true);
  const connected = await alice.request("/api/publik", { action: "choice", choice: "publik" });
  assert.equal(connected.body.state, "ready", JSON.stringify(connected.body));
  assert.ok(connected.body.workspace); assert.equal(connected.body.balanceMicros, 8_000_000);
  assert.equal((await bob.generate(gen)).status, 401);
  assert.equal((await bob.request("/api/publik")).body.state, "sign_in");
  const created = await alice.generate(gen);
  assert.equal(created.status, 200, JSON.stringify(created.error));
  assert.deepEqual(created.events.filter((e) => e.type === "stage").map((e) => e.type === "stage" && `${e.stage}${e.attempt}:${e.status}`), ["design1:started", "design1:finished", "build1:started", "build1:finished", "review1:started", "review1:finished"]);
  let game: Game = result(created.final).game;
  assert.equal(result(created.final).draft, null);
  assert.equal(game.title, "Cloudstep"); assert.equal(game.businessPlan?.offers[0].name, "Trail color");
  const changed = await alice.generate({ ...gen, currentGame: game, prompt: "Add another feature", tier: "publik-balanced" });
  game = result(changed.final).game;
  assert.equal(game.title, "Cloudstep Revised");
  // A balance that drops below one build is refused before any AI call.
  await setWallet(400_000, "plan");
  const callsBefore = (await mockState()).calls.length;
  const low = await alice.generate(gen);
  assert.equal(low.status, 402); assert.match(low.error.message, /\$0\.40/); assert.equal(low.error.topUpUrl, `${mockBase}/wallet`);
  assert.equal((await mockState()).calls.length, callsBefore);
  await setWallet(8_000_000, "plan");
  // Failures before any valid game: an error line, nothing to save.
  for (const value of ["402", "402-build", "invalid"]) {
    await mode(value);
    const failed = await alice.generate({ ...gen, currentGame: game });
    assert.equal(failed.final?.type, "error", value);
    if (value.startsWith("402")) assert.equal(failed.error?.topUpUrl, `${mockBase}/wallet`);
    else assert.match(failed.error!.message, /couldn.t produce a complete game design/);
  }
  for (const stage of ["design", "build"]) {
    await mode(`length-${stage}`);
    const limited = await alice.generate(gen);
    assert.match(limited.error!.message, new RegExp(`AI ${stage} stage exceeded`));
  }
  // Failures after a valid game: the game comes back as a labelled draft instead of being discarded.
  await mode("length-review");
  const unreviewed = result((await alice.generate(gen)).final);
  assert.match(unreviewed.draft!.reason, /AI review stage exceeded/);
  await mode("402-review");
  const unpaid = result((await alice.generate(gen)).final);
  assert.match(unpaid.draft!.reason, /balance is empty/); assert.equal(unpaid.draft!.topUpUrl, `${mockBase}/wallet`);
  await mode("repair");
  assert.equal(result((await alice.generate(gen)).final).draft, null);
  assert.deepEqual(await stages(5), ["design", "build", "review", "repair", "review"]);
  await mode("repair-twice");
  const twice = await alice.generate(gen);
  assert.equal(result(twice.final).draft, null);
  assert.deepEqual(await stages(7), ["design", "build", "review", "repair", "review", "repair", "review"]);
  assert.ok(twice.events.some((e) => e.type === "stage" && e.stage === "repair" && e.attempt === 2 && e.status === "finished"));
  await mode("reject");
  const rejected = result((await alice.generate(gen)).final);
  assert.match(rejected.draft!.reason, /still found problems after two repairs/);
  assert.equal(rejected.draft!.findings[0].severity, "major");
  assert.ok(rejected.game.notes.some((note) => note.startsWith("AI check (major)")));
  // A draft built on top of a draft replaces Studsmith's old notes instead of stacking them.
  await mode("402-review");
  const stacked = result((await alice.generate({ ...gen, currentGame: rejected.game })).final);
  assert.match(stacked.game.notes[0], /balance is empty.*didn't finish on this version/);
  assert.ok(!stacked.game.notes.some((note) => /still found problems|^AI check \(/.test(note)), JSON.stringify(stacked.game.notes));
  // Closing the connection mid-build stops the pipeline: no further model calls after the stage in flight.
  await mode("ok", 1500);
  const callsAtStart = (await mockState()).calls.length;
  const leaving = new AbortController();
  const response = await fetch(`${base}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: alice.cookie() }, body: JSON.stringify(gen), signal: leaving.signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (let seen = ""; !seen.includes('"stage":"build","attempt":1,"status":"started"');) seen += (await reader.read()).value ?? "";
  leaving.abort();
  await delay(5000); // design + build + review would have been requested by now if the run kept going
  assert.deepEqual((await mockState()).calls.slice(callsAtStart).map((call: { stage: string }) => call.stage), ["design", "build"]);
  await mode("ok");
  // With a short budget the run stops before a repair it couldn't finish, and keeps the reviewed game.
  const tight = start("next", ["start", "-H", "127.0.0.1", "-p", String(tightPort)], { STUDSMITH_GENERATION_BUDGET_MS: "3000", STUDSMITH_APP_ORIGIN: `${base},${tightBase}` });
  await ready(tightBase);
  await mode("reject", 700);
  const stopped = result((await alice.generate(gen, tightBase)).final);
  assert.match(stopped.draft!.reason, /stopped before another repair/);
  assert.deepEqual(await stages(3), ["design", "build", "review"]);
  await mode("ok", 1100);
  const late = result((await alice.generate(gen, tightBase)).final);
  assert.match(late.draft!.reason, /time limit/);
  // A structurally broken first build reserves time for the review its repair still needs, so no repair starts.
  await mode("invalid-build", 700);
  const broken = await alice.generate(gen, tightBase);
  assert.match(broken.error!.message, /ran out of time/);
  assert.deepEqual(await stages(2), ["design", "build"]);
  tight.child.kill("SIGTERM");
  await mode("ok");
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
  console.log("Integration passed: no install before Sign in, low-balance gate and pre-flight 402, auth before body, isolated encrypted browser sessions, claim/plan gate, streamed stages, drafts after late failures, deadline reserve, design/build/review/repair, rejection, skills loading, 402, tampering, cross-origin protection, telemetry, built self-test. Local fixture only.");
} catch (error) { console.error(app.output(), mock.output()); throw error; }
finally { for (const child of processes) child.kill("SIGTERM"); }
