import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { exampleGame } from "../src/lib/example";
import { current, GameSchema } from "../src/lib/project";
import { placeXml, sourceZip } from "../src/lib/export";
import { appendRevision, createProject, listProjects, loadProject } from "../src/lib/storage";

test("rejects unsafe source paths, duplicate Studio names, and invalid scenes", () => {
  const invalid = ["server/../../secret.luau", "/server/Main.luau", "shared/constructor.luau", "server/init.server.luau", "shared/Foo.client.luau", "server/Foo.client.luau"];
  for (const path of invalid) assert.equal(GameSchema.safeParse({ ...exampleGame, files: [{ path, source: "return {}" }] }).success, false, path);
  assert.equal(GameSchema.safeParse({ ...exampleGame, files: [{ path: "server/A.luau", source: "return {}" }, { path: "server/A.server.luau", source: "print(1)" }] }).success, false);
  assert.equal(GameSchema.safeParse({ ...exampleGame, files: [{ path: "server/A.luau", source: "return {}" }, { path: "server/A/B.luau", source: "return {}" }] }).success, false);
  assert.equal(GameSchema.safeParse({ ...exampleGame, parts: [exampleGame.parts[0]] }).success, false);
  assert.equal(GameSchema.safeParse({ ...exampleGame, parts: [...exampleGame.parts, exampleGame.parts[0]] }).success, false);
  assert.equal(GameSchema.safeParse({ ...exampleGame, files: [{ path: "server/Bad.server.luau", source: "bad\u0000" }] }).success, false);
});

test("escapes XML and preserves script source in the portable ZIP", () => {
  const game = structuredClone(exampleGame);
  game.title = 'Test <game> & "name"';
  game.files.push({ path: "shared/Config.luau", source: 'return { text = "<&> ]]>" }' });
  const xml = placeXml(game);
  assert.ok(xml.includes("&lt;&amp;&gt; ]]&gt;"));
  assert.ok(xml.includes('<Item class="SpawnLocation"'));
  const entries = unzipSync(sourceZip(game));
  assert.equal(strFromU8(entries["src/shared/Config.luau"]), game.files.at(-1)!.source);
  assert.equal(JSON.parse(strFromU8(entries["studsmith.json"])).title, game.title);
  assert.ok(entries["default.project.json"]);
});

test("browser storage preserves revisions, isolates workspaces, and rejects concurrent stale writes", async () => {
  const scope = crypto.randomUUID();
  const project = await createProject(scope, exampleGame, "Create example");
  const base = current(project).id;
  const writes = await Promise.allSettled([
    appendRevision(scope, project.id, base, { ...exampleGame, title: "First" }, "Change title", "Updated"),
    appendRevision(scope, project.id, base, { ...exampleGame, title: "Second" }, "Change title", "Updated"),
  ]);
  assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(writes.filter((r) => r.status === "rejected").length, 1);
  assert.equal((await loadProject(scope, project.id)).revisions.length, 2);
  assert.equal((await listProjects(scope))[0].revisionCount, 2);
  assert.equal((await listProjects("different-workspace")).length, 0);
  await assert.rejects(loadProject("different-workspace", project.id), /not found/);
  await assert.rejects(appendRevision(scope, project.id, base, exampleGame, "Stale", "Stale"), /changed in another tab/);
  assert.equal((await loadProject(scope, project.id)).revisions[0].game.title, "Cloudstep");
});

test("Rojo builds the exported source bundle, including world geometry and scripts", async (t) => {
  try { execFileSync("rojo", ["--version"]); } catch { t.skip("Rojo is not installed; schema and ZIP tests still run."); return; }
  await mkdir(".test-data", { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), ".test-data/rojo-"));
  const game = structuredClone(exampleGame);
  game.parts.push({ ...game.parts[0], id: "rotated", name: "RotatedWedge", kind: "wedge", position: [10, 7, -15], rotation: [15, 30, 45] });
  game.files.push({ path: "shared/Config.luau", source: "return { test = true }" });
  const entries = unzipSync(sourceZip(game));
  for (const [path, bytes] of Object.entries(entries)) { await mkdir(join(dir, path, ".."), { recursive: true }); await writeFile(join(dir, path), bytes); }
  const result = execFileSync("rojo", ["build", "default.project.json", "-o", "rebuilt.rbxlx"], { cwd: dir, encoding: "utf8" });
  assert.match(result, /Built/);
});

test("the committed Lantern Run example is a valid, exportable game", async () => {
  const { default: lantern } = await import("../src/lib/examples/lantern-run.json", { with: { type: "json" } });
  const game = GameSchema.parse(lantern);
  assert.equal(game.parts.length, 77);
  assert.ok(placeXml(game).includes('<Item class="SpawnLocation"'));
  assert.doesNotMatch(JSON.stringify(lantern), /pk_|pat_|sk-|Bearer|https?:\/\//);
});
