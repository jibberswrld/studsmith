# Studsmith

A single-user local Roblox game builder. Keep work inside this project. Do not edit sibling apps or borrow their credentials. No remote repository or Publik listing has been created for this app yet.

- Next.js 16 App Router, React, TypeScript, Three.js, Zod, fflate; pnpm.
- Read the relevant installed Next.js docs under `node_modules/next/dist/docs/` before changing framework behavior.
- `pnpm start` and `pnpm dev` bind to `127.0.0.1:3018`. Never expose this local app as a hosted multi-user service.
- Publik base URL: `https://publikhq.com/api/v1`; model aliases: `publik-balanced`, `publik-smart`. Never send raw vendor model IDs to Publik.
- `src/lib/server/publik.ts` adapts the official Publik module. Keep sign-in, plan choice, app_opened/active_session telemetry, opt-out, and the built-app self-test working.
- The public token belongs in `publik-app-token.txt` or `PUBLIK_APP_TOKEN`. Never commit or log private install keys, own-provider keys, or browser approval credentials.
- Every API route checks loopback Host / Origin and server-side claimed-install state. The app is one local install, not a multi-tenant web server.
- Treat model output as untrusted. Validate through `GameSchema`; never execute generated source in Node or in the browser. Export XML must remain escaped, and ZIP paths must remain confined.
- `Workspace.World`, `ServerScriptService.Server`, `StarterPlayer.StarterPlayerScripts.Client`, and `ReplicatedStorage.Shared` must agree across the generation prompt and both export formats.
- Do not change live Roblox experiences, upload assets, publish games, or touch production services while testing. Do not launch additional Studio instances for export tests. The owner objected to the task opening three instances. Use Rojo validation unless a single specific scratch Studio session is authorized.
- Test data belongs under `.test-data/` with `STUDSMITH_DATA_DIR` and `STUDSMITH_PUBLIK_DIR` set. The fixture never calls a real model.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`. Verify user-facing changes in the running browser; verify export changes in Studio or Rojo as appropriate.
- A live Publik activation needs this app’s own registration/token and a live generation check. Never describe fixture success as a live integration test.
