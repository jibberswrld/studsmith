# Studsmith

Describe a Roblox game, iterate on its world and Luau scripts, and export a place that opens in Roblox Studio.

Studsmith is an open-source local web app built for Publik. The name combines Roblox studs with the craft of building a game. It runs independently of the other projects in `Publik_Comp`.

## Run

Requires Node.js 22+ and pnpm.

```sh
pnpm install
pnpm build
pnpm start
```

Open **http://127.0.0.1:3018**. For development, run `pnpm dev`.

## What works

- Publik sign-in before the workspace, plan selection, and an optional OpenAI-compatible provider.
- A model-driven design → build → static review pipeline through `publik-smart` or `publik-balanced`. Major review findings trigger one repair and a second review. Unresolved major findings prevent saving over the current project. Follow-up requests receive the entire current project. Each build uses 3–5 AI calls.
- Orbitable 3D preview of the static world, a part inspector, and editable server, client, and shared Luau files.
- Local projects with saved revisions, stale-write protection, history restoration, and browser recovery of unsaved script edits.
- Direct `.rbxlx` place export, Rojo source ZIP export, and portable JSON backups that can be imported again.
- **Cloudstep** is retained solely as a deterministic test fixture. It is not offered as a user-facing example or evidence of AI game quality.
- Validation of generated project structure, safe source paths, size limits, XML escaping, and readable errors without overwriting the previous revision.

## Built-in AI design skills

The three project-owned skills in `skills/` are loaded from disk into every design, build, review, and repair request. The model applies them to the actual idea; there is no genre keyword router.

- `roblox-game-design`: player fantasy, core loop, onboarding, meaningful progression, replay, and mobile/social play.
- `roblox-worldcraft`: authored spaces, landmarks, primitive-based architecture, traversal scale, legible hazards, and performance.
- `roblox-economy-growth`: currencies, sustainable retention, offers with clear player value, receipt/entitlement requirements, pricing, discovery experiments, and defined metrics.

New builds include a **Game plan** with audience, hook, retention, proposed offers, setup requirements, and measurement/launch steps. The plan travels with the JSON backup and source ZIP. Paid offers are proposals: the default offline export does not activate purchases or invent real Roblox product IDs. The skills reference current Roblox Creator Hub documentation; revenue remains a hypothesis until validated with players.

## Publik activation

**The code integration is implemented; this new app has not been published or registered on Publik. No live AI call has been verified.** The initial test run uses a clearly labeled local fixture, not real AI.

Studsmith needs its own Publik listing and public app token. Do not copy a token or install credential from Sift, LooseEnds, Jarvis, or another product. Complete [Publik’s official setup flow](https://publikhq.com/skills/setup.md) for slug `studsmith`, app type `local_web`, product `ai.chat`, then save the minted public app token as `publik-app-token.txt` in this folder. `PUBLIK_APP_TOKEN` is also supported. The token file is intentionally distributable; private `pk_`/`pbt_` credentials must never be committed.

The app’s build command is `pnpm install && pnpm build`; its launch command is `pnpm start`, bound to loopback on port 3018. The Publik module is `src/lib/server/publik.ts`; the gate is served by `/api/publik` and rendered before the builder. A missing app token displays an explicit setup state.

After activation, verify the **built** app:

```sh
PUBLIK_SELF_TEST=1 pnpm start
```

Expected output only after `/wallet` succeeds: `publik self-test: ok studsmith 0.1.0`. The app exits with a nonzero status on failure. A successful wallet self-test does not prove that AI generation works; also generate and playtest a game through the live provider.

The install key stays in Publik’s per-app credential file (mode 0600); it is never returned to the browser. Only the selected AI provider receives prompts and project source. Publik receives `app_opened` and `active_session` usage events without project content. Set `DO_NOT_TRACK=1` or `PUBLIK_TELEMETRY=off` to disable telemetry. A 402 shows the provider’s message and its single top-up link.

## Export to Roblox Studio

1. Open a project and choose **Export to Studio**.
2. Download the Studio place (`.rbxlx`).
3. In Roblox Studio choose **File → Open from File**, select it, then **Play**.
4. Use the project’s **Play & test** checklist. Review generated scripts before publishing.

No plugin, Roblox API key, account connection, or automatic cloud publishing is required for this export.

The exported hierarchy is:

```text
Workspace
  World                    # Static scene parts
ServerScriptService
  Server                   # server/*.server.luau and modules
StarterPlayer
  StarterPlayerScripts
    Client                 # client/*.client.luau and modules
ReplicatedStorage
  Shared                   # shared/*.luau modules
```

The source ZIP includes the native place, `world.rbxmx`, `default.project.json`, `src/`, a game README, and `studsmith.json`. With [Rojo](https://rojo.space/docs/v7/) installed:

```sh
rojo build default.project.json -o game.rbxlx
rojo serve
```

Live sync requires Rojo’s Studio plugin. Opening the native place does not.

## Local storage

Projects and revisions are written atomically under:

- macOS: `~/Library/Application Support/Studsmith`
- Windows: `%LOCALAPPDATA%\Studsmith`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/Studsmith`

`STUDSMITH_DATA_DIR` overrides project storage. Publik install credentials are separate, under Publik’s `apps/studsmith.json`. An optional own-provider key is saved only in the local settings file (mode 0600).

The server is intended for one local user and one running process. It must not be exposed as a hosted multi-user service. API routes validate the loopback Host, reject cross-origin requests, and require a claimed Publik install. There is no hosted database.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
```

The integration test starts its own built server and local Publik fixture, uses scratch data under `.test-data/`, and checks sign-in, plan choice, design/build/review request shape, repair and rejection, iteration, script saves, stale revisions, restoration, all three downloads, malformed AI responses, 402 handling, origin protection, usage counting, and the built-app self-test. It makes no live paid AI requests. The Rojo build test runs when Rojo is installed.

For a manual fixture session, run `pnpm mock:publik` in one terminal. In another:

```sh
STUDSMITH_DATA_DIR="$PWD/.test-data/manual" \
STUDSMITH_PUBLIK_DIR="$PWD/.test-data/manual/publik" \
PUBLIK_ORIGIN=http://127.0.0.1:4556 \
PUBLIK_APP_TOKEN=pat_studsmith_test \
pnpm start
```

This fixture returns Cloudstep on generation and a deterministic revision on follow-up. It is deliberately labeled in the workspace and must not be used as a live backend. Use **Sign in with publik** to visit the fixture claim page, return, and choose **Connect your plan**.

## Current scope

The initial scene uses up to 500 primitive parts. Generated Luau can create additional gameplay, UI, and procedural objects at runtime. The browser preview does not execute Luau, Roblox physics, or client networking. Script syntax and gameplay correctness require a Studio playtest; arbitrary generated projects are not automatically certified as runnable. Asset marketplace imports, persistent online progress, direct publishing, and an automatic Studio plugin bridge are not part of this version.

## Implementation references

- [Publik API module](https://publikhq.com/sdk/publik.ts.md)
- [Rojo project format](https://rojo.space/docs/v7/project-format/)
- [Roblox XML format maintained by rbx-dom](https://github.com/rojo-rbx/rbx-dom/blob/master/docs/xml.md)
