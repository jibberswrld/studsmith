import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { exampleGame } from "../src/lib/example";
import { current, GameSchema } from "../src/lib/project";
import { placeXml, sourceZip } from "../src/lib/server/export";
import { appendRevision, createProject, listProjects, loadProject, withProjectLock } from "../src/lib/server/store";

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

test("local persistence keeps history and rejects stale writes and concurrent edits", async () => {
  await mkdir(".test-data", { recursive: true });
  process.env.STUDSMITH_DATA_DIR = await mkdtemp(join(process.cwd(), ".test-data/store-"));
  const project = await createProject(exampleGame, "Create example");
  const base = current(project).id;
  const next = await appendRevision(project.id, base, { ...exampleGame, title: "Revised" }, "Change title", "Updated");
  assert.equal(next.revisions.length, 2);
  assert.equal(current((await loadProject(project.id))!).game.title, "Revised");
  assert.equal((await listProjects())[0].revisionCount, 2);
  await assert.rejects(appendRevision(project.id, base, exampleGame, "Stale", "Stale"), /changed in another tab/);
  let release!: () => void;
  const waiting = withProjectLock(project.id, () => new Promise<void>((resolve) => { release = resolve; }));
  await assert.rejects(withProjectLock(project.id, async () => {}), /already being updated/);
  release(); await waiting;
  assert.equal((await loadProject(project.id))!.revisions[0].game.title, "Cloudstep");
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
