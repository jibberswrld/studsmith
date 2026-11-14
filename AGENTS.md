# Studsmith

Browser-based AI Roblox builder. Repo: https://github.com/jibberswrld/studsmith. Publik slug `studsmith` is registered. Work only in this project; never borrow sibling apps' credentials.

- Next.js 16 App Router, React, TypeScript, Three.js, Zod, fflate, IndexedDB; pnpm. Read relevant installed Next.js docs before framework changes.
- `pnpm start` / `pnpm dev` bind to 127.0.0.1:3018. Vercel hosts the browser app; users' projects and revisions stay in account-scoped browser storage, not shared server files. No cloud sync is implemented.
- Publik API is https://publikhq.com/api/v1. Generation uses `publik-balanced` / `publik-smart`, never vendor model IDs.
- `src/lib/server/publik.ts` adapts the reference protocol. Normal visitors provision with `persist: false`; `src/lib/server/session.ts` stores their credentials in encrypted, HttpOnly, SameSite cookies. Never restore server-global install credentials, AI choices, or project state in request handlers.
- Keep the gate, plan choice, app_opened/active_session telemetry, opt-out, and built-app self-test working. Every generation verifies the current visitor's claimed install.
- The public app token is distributed in `publik-app-token.txt`. Private install keys, own-provider keys, builder approval tokens, and STUDSMITH_SESSION_SECRET must never be committed or logged.
- Hosted sessions require a strong stable STUDSMITH_SESSION_SECRET. Hosted origins must match exact configured/platform-owned domains. Do not permit arbitrary provider URLs on hosted deployments or follow provider redirects.
- All three `skills/*/SKILL.md` files are loaded in every AI stage. Keep guidance and businessPlan output aligned; proposed paid offers are not activated sales. Never promise revenue or label an AI review as a playtest.
- Treat model output as untrusted. Validate GameSchema, escape XML, confine ZIP paths, and never execute generated Luau in Node or the browser.
- Keep Workspace.World, ServerScriptService.Server, StarterPlayer.StarterPlayerScripts.Client, and ReplicatedStorage.Shared consistent across generation and exports.
- Do not touch live Roblox experiences or open extra Studio instances. The owner objected to three test instances; use Rojo checks unless one specific scratch session is authorized.
- Test scratch files belong under ignored `.test-data/`. The fixture never calls a real model. Never call fixture success a live generation test.
- Checks: pnpm lint, pnpm typecheck, pnpm test, pnpm build, pnpm test:integration. Verify browser flows and cookieless hosted access. For PRs, fix/push/reply/resolve review threads and link the PR with T3 Code. Never merge unasked.
