// Development fixture, never a live AI provider. No external requests or paid usage.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { exampleGame } from "../src/lib/example";

const port = Number(process.env.MOCK_PUBLIK_PORT || 4556);
const origin = `http://127.0.0.1:${port}`;
const installs = new Map<string, { key: string; claimed: boolean }>();
// mode: ok | 402 | 402-<stage> | length-<stage> | invalid | invalid-build | repair | repair-twice | reject. delayMs slows every AI stage.
let mode = "ok", reviewCount = 0, delayMs = 0;
// One fixture wallet for every claimed install. New Publik accounts get $0.05 of free use; GET /wallet simulates buying a plan.
let wallet = { plan: { kind: "none", label: null as string | null }, balance_micros: 50_000 };
const requests: string[] = [];
const calls: { model: string; stage: string; hasCurrentGame: boolean; skills: string[] }[] = [];
const businessPlan = {
  audience: "Players who enjoy short skill challenges.", hook: "A short checkpoint race.", retentionLoop: "Replay to improve completion time.",
  offers: [{ name: "Trail color", purchaseType: "Cosmetic pass proposal", playerValue: "Express a personal style.", freeAlternative: "The entire course is free.", setupRequired: "Create a real pass, configure its ID, verify entitlement server-side, and test before enabling." }],
  metrics: [{ name: "First-loop completion", definition: "Players finishing at least once divided by new players in the same daily cohort.", decision: "Inspect difficulty and onboarding when players fail to finish." }],
  launchPlan: ["Test the free core loop before activating offers."],
};
const events: string[] = [];
const send = (res: import("node:http").ServerResponse, status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
createServer(async (req, res) => {
  const url = new URL(req.url || "/", origin);
  if (!url.pathname.startsWith("/mock/")) { requests.push(`${req.method} ${url.pathname}`); console.log(`fixture: ${req.method} ${url.pathname}`); }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const install = [...installs.entries()].find(([, value]) => req.headers.authorization === `Bearer ${value.key}`);
    if (url.pathname === "/api/v1/installs") {
      if (body.app_token !== "pat_studsmith_test" || body.app_slug !== "studsmith") return send(res, 401, { error: { message: "Incorrect fixture app token or slug." } });
      let saved = installs.get(body.install_id);
      const existed = !!saved;
      if (!saved) { saved = { key: `pk_test_${randomUUID()}`, claimed: false }; installs.set(body.install_id, saved); }
      return send(res, existed ? 200 : 201, { ...(existed ? {} : { key: saved.key }), install_id: body.install_id, base_url: `${origin}/api/v1`, claim_url: `${origin}/claim/${body.install_id}` });
    }
    if (url.pathname.startsWith("/claim/")) {
      const saved = installs.get(url.pathname.slice(7));
      if (!saved) return send(res, 404, {});
      saved.claimed = true;
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<!doctype html><title>Studsmith local test sign-in</title><p>Signed in to the local Publik fixture. Return to Studsmith. No real account was connected.</p>");
    }
    if (url.pathname === "/wallet") {
      wallet = { plan: { kind: "plan", label: "Fixture plan" }, balance_micros: 8_000_000 };
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<!doctype html><title>Studsmith local test top-up</title><p>The local Publik fixture now has an $8.00 test plan. No money moved. Return to Studsmith.</p>");
    }
    if (url.pathname === "/mock/mode") { mode = body.mode || "ok"; delayMs = Number(body.delayMs) || 0; reviewCount = 0; return send(res, 200, { mode, delayMs }); }
    if (url.pathname === "/mock/wallet") { wallet = { plan: { kind: body.kind || "none", label: body.label ?? null }, balance_micros: Number(body.balance_micros) || 0 }; return send(res, 200, wallet); }
    if (url.pathname === "/mock/state") return send(res, 200, { calls, events, requests, installs: installs.size });
    if (!install) return send(res, 401, { error: { message: "Invalid fixture key." } });
    if (url.pathname === "/api/v1/wallet") return send(res, 200, { claim_state: install[1].claimed ? "claimed" : "anonymous", claim_url: `${origin}/claim/${install[0]}`, account: install[1].claimed ? { handle: "local-test" } : null, plan: install[1].claimed ? wallet.plan : { kind: "none", label: null }, balance_micros: install[1].claimed ? wallet.balance_micros : 0, top_up_url: `${origin}/wallet`, linked_at: install[1].claimed ? new Date().toISOString() : null });
    if (url.pathname === "/api/v1/telemetry") { events.push(body.event); return send(res, 202, { ok: true }); }
    if (url.pathname === "/api/v1/chat/completions") {
      if (!install[1].claimed) return send(res, 401, { error: { message: "Claim first." } });
      if (!["publik-balanced", "publik-smart"].includes(body.model)) return send(res, 400, { error: { message: "Only Publik model aliases are supported." } });
      const request = JSON.parse(body.messages[body.messages.length - 1].content);
      const skillNames = [...String(body.messages[0].content).matchAll(/<design-skill name="([^"]+)">/g)].map((match) => match[1]);
      calls.push({ model: body.model, stage: request.stage, hasCurrentGame: !!request.currentGame, skills: skillNames });
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (res.destroyed) return;
      if (mode === "402" || mode === `402-${request.stage}`) return send(res, 402, { error: { message: "Your publik balance is empty.", top_up_url: `${origin}/wallet` } });
      if (mode === `length-${request.stage}`) return send(res, 200, { choices: [{ message: { content: "{}" }, finish_reason: "length" }] });
      if (mode === "invalid" || (mode === "invalid-build" && request.stage === "build")) return send(res, 200, { choices: [{ message: { content: "{\"title\":\"Incomplete\"}" }, finish_reason: "stop" }] });
      if (request.stage === "design") return send(res, 200, { choices: [{ message: { content: JSON.stringify({ concept: "A fixture obby", coreLoop: "Jump between checkpoints, finish, and restart.", firstThirtySeconds: "Spawn safely and reach the first checkpoint.", mechanics: ["Checkpoint progression", "Lava damage", "Race timer"], worldLayout: "Ten platforms between a start and finish island.", artDirection: "Mint and sandstone fixture palette.", playerFeedback: "A checkpoint and timer HUD.", replayAndProgression: "Reset after finishing to replay.", implementationChecks: ["Check respawn", "Check finish"], businessPlan }) }, finish_reason: "stop" }] });
      if (request.stage === "review") {
        reviewCount++;
        const needsRepair = mode === "reject" || (mode === "repair" && reviewCount === 1) || (mode === "repair-twice" && reviewCount <= 2);
        return send(res, 200, { choices: [{ message: { content: JSON.stringify({ summary: "Deterministic fixture review; not a quality or playtest result.", issues: needsRepair ? [{ severity: "major", location: "server/Obby.server.luau", problem: "Fixture asks for a repair to verify the pipeline.", fix: "Return a corrected complete project." }] : [] }) }, finish_reason: "stop" }] });
      }
      const game = structuredClone(request.currentGame || exampleGame);
      if (request.currentGame) { game.title = "Cloudstep Revised"; game.description = "A revised game returned by the local AI fixture."; }
      await new Promise((resolve) => setTimeout(resolve, 150));
      return send(res, 200, { choices: [{ message: { content: JSON.stringify(game) }, finish_reason: "stop" }] });
    }
    return send(res, 404, { error: { message: "Fixture endpoint not found." } });
  } catch { send(res, 500, { error: { message: "Fixture request failed." } }); }
}).listen(port, "127.0.0.1", () => console.log(`Studsmith local Publik fixture ready on ${origin} (no live AI)`));
