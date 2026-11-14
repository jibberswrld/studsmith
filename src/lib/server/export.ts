import { strToU8, zipSync } from "fflate";
import { exportName, GameSchema, type Game, type GameFile, type Part } from "../project";

const xml = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const prop = (type: string, name: string, value: unknown) => `<${type} name="${name}">${xml(value)}</${type}>`;
const vector = (name: string, values: number[]) => `<Vector3 name="${name}"><X>${values[0]}</X><Y>${values[1]}</Y><Z>${values[2]}</Z></Vector3>`;
const color = (name: string, hex: string) => `<Color3 name="${name}"><R>${parseInt(hex.slice(1, 3), 16) / 255}</R><G>${parseInt(hex.slice(3, 5), 16) / 255}</G><B>${parseInt(hex.slice(5, 7), 16) / 255}</B></Color3>`;
const materials: Record<Part["material"], number> = { Plastic: 256, SmoothPlastic: 272, Neon: 288, Wood: 512, Grass: 1280, Metal: 1088, Concrete: 816, Glass: 1568, Ice: 1536, Sand: 1296, Slate: 800, Brick: 848 };
function cframe(part: Part) {
  const [x, y, z] = part.rotation.map((n) => n * Math.PI / 180);
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const matrix = [c * e, -c * f, d, a * f + b * e * d, a * e - b * f * d, -b * c, b * f - a * e * d, b * e + a * f * d, a * c];
  return `<CoordinateFrame name="CFrame"><X>${part.position[0]}</X><Y>${part.position[1]}</Y><Z>${part.position[2]}</Z>${matrix.map((v, i) => `<R${Math.floor(i / 3)}${i % 3}>${v}</R${Math.floor(i / 3)}${i % 3}>`).join("")}</CoordinateFrame>`;
}
function encoder() {
  let id = 0;
  return (className: string, name: string, props = "", children = "") => `<Item class="${className}" referent="RBX${++id}"><Properties>${prop("string", "Name", name)}${props}</Properties>${children}</Item>`;
}
type Item = ReturnType<typeof encoder>;
function world(game: Game, item: Item) {
  return item("Model", "World", "", game.parts.map((p) => {
    const className = p.kind === "spawn" ? "SpawnLocation" : p.kind === "wedge" ? "WedgePart" : "Part";
    let props = vector("size", p.size) + cframe(p) + prop("Color3uint8", "Color3uint8", parseInt(p.color.slice(1), 16)) + prop("bool", "Anchored", p.anchored) + prop("bool", "CanCollide", p.canCollide) + prop("float", "Transparency", p.transparency) + prop("token", "Material", materials[p.material]) + prop("token", "TopSurface", 0) + prop("token", "BottomSurface", 0);
    if (className === "Part") props += prop("token", "shape", p.kind === "ball" ? 0 : p.kind === "cylinder" ? 2 : 1);
    if (className === "SpawnLocation") props += prop("bool", "Neutral", true) + prop("bool", "Enabled", true) + prop("bool", "AllowTeamChangeOnTouch", false) + prop("int", "Duration", 0);
    return item(className, p.name, props);
  }).join(""));
}
function scripts(files: GameFile[], prefix: string, item: Item): string {
  const direct = files.filter((f) => f.path.startsWith(prefix)).map((f) => ({ ...f, relative: f.path.slice(prefix.length) }));
  const folders = [...new Set(direct.filter((f) => f.relative.includes("/")).map((f) => f.relative.split("/")[0]))];
  return folders.map((name) => item("Folder", name, "", scripts(files, `${prefix}${name}/`, item))).join("") + direct.filter((f) => !f.relative.includes("/")).map((f) => {
    const className = f.path.endsWith(".server.luau") ? "Script" : f.path.endsWith(".client.luau") ? "LocalScript" : "ModuleScript";
    return item(className, f.relative.replace(/(?:\.server|\.client)?\.luau$/, ""), prop("ProtectedString", "Source", f.source));
  }).join("");
}
const document = (content: string) => `<?xml version="1.0" encoding="utf-8"?><roblox version="4"><External>null</External><External>nil</External>${content}</roblox>`;
export function placeXml(input: Game) {
  const game = GameSchema.parse(input);
  const item = encoder();
  return document(
    item("Workspace", "Workspace", prop("float", "Gravity", 196.2), world(game, item)) +
    item("Lighting", "Lighting", prop("float", "ClockTime", game.lighting.clockTime) + prop("float", "Brightness", game.lighting.brightness) + color("Ambient", game.lighting.ambient)) +
    item("ServerScriptService", "ServerScriptService", "", item("Folder", "Server", "", scripts(game.files, "server/", item))) +
    item("ReplicatedStorage", "ReplicatedStorage", "", item("Folder", "Shared", "", scripts(game.files, "shared/", item))) +
    item("StarterPlayer", "StarterPlayer", "", item("StarterPlayerScripts", "StarterPlayerScripts", "", item("Folder", "Client", "", scripts(game.files, "client/", item))))
  );
}
export function sourceZip(input: Game) {
  const game = GameSchema.parse(input);
  const name = exportName(game.title);
  const project = { name, tree: {
    $className: "DataModel",
    Workspace: { $className: "Workspace", $properties: { Gravity: 196.2 }, World: { $path: "world.rbxmx" } },
    Lighting: { $className: "Lighting", $properties: { ClockTime: game.lighting.clockTime, Brightness: game.lighting.brightness, Ambient: [1, 3, 5].map((i) => parseInt(game.lighting.ambient.slice(i, i + 2), 16) / 255) } },
    ServerScriptService: { $className: "ServerScriptService", Server: { $path: "src/server" } },
    ReplicatedStorage: { $className: "ReplicatedStorage", Shared: { $path: "src/shared" } },
    StarterPlayer: { $className: "StarterPlayer", StarterPlayerScripts: { $className: "StarterPlayerScripts", Client: { $path: "src/client" } } },
  } };
  const entries: Record<string, Uint8Array> = {
    "default.project.json": strToU8(JSON.stringify(project, null, 2)),
    "world.rbxmx": strToU8(document(world(game, encoder()))),
    [`${name}.rbxlx`]: strToU8(placeXml(game)),
    "studsmith.json": strToU8(JSON.stringify(game, null, 2)),
    "README.md": strToU8(`# ${game.title}\n\n${game.description}\n\n## Open in Studio\n\nOpen ${name}.rbxlx in Roblox Studio using File > Open from File. Press Play. No plugin is required. Review generated scripts before publishing.\n\n## Controls and objective\n\n${game.instructions}\n\n## Test plan\n\n${game.testPlan.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n## Rojo\n\nWith Rojo installed, run: rojo build default.project.json -o game.rbxlx\nFor live sync, run rojo serve and connect using the Rojo Studio plugin.\n\n## Notes\n\n${game.notes.join("\n")}\n\nGenerated scripts have not been automatically playtested. Import studsmith.json in Studsmith to continue editing.\n`),
  };
  for (const folder of ["server", "client", "shared"]) entries[`src/${folder}/.gitkeep`] = strToU8("");
  for (const file of game.files) entries[`src/${file.path}`] = strToU8(file.source);
  return zipSync(entries, { level: 6 });
}
