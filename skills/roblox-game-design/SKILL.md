---
name: roblox-game-design
description: Design and review Roblox gameplay, onboarding, progression, and replay loops for a playable game with a clear audience and hook.
---

# Design a game players choose to replay

Start with a specific player fantasy and a one-sentence hook that can be shown in a short gameplay clip. Preserve the requested genre; do not convert every idea into a checkpoint obby or coin collector. A familiar genre needs a distinctive interaction, social situation, or progression choice, not just a new theme.

Describe the loop as an action, a decision, a consequence, and a new opportunity. Define what the player does moment to moment, what repeats during a session, and what changes as they progress. Make rewards alter a future choice, capability, collection, or social expression. An increasing number alone is weak progression.

Build the smallest complete version of that loop. Include a starting state, a meaningful challenge, visible feedback, a result, and a replay path. When a request exceeds the prototype's scope, complete one satisfying slice and name the omitted systems. Do not claim nonexistent enemies, upgrades, trading, or multiplayer cooperation in the description.

## First session and return session

- Give a new player a safe spawn, a visible immediate objective, and one low-risk action before presenting menus. Use contextual teaching instead of a long instruction wall. Treat a first reward within roughly 30 seconds as a design hypothesis, not a universal rule or benchmark.
- Introduce one mechanic, let the player demonstrate it, then combine it with a variation. Judge progression by decisions and mastery, not escalating grind alone.
- Communicate progress and why an attempt failed. Recover from failure near the next useful action. Make retrying an in-game action; resetting the character or relaunching Studio is not the normal replay loop.
- Give returning players a concrete next goal. Prefer new strategies, mastery, collection, or playing with friends over punitive streak loss and attendance chores. Never fabricate persistent progress when the build is session-only.
- For social games, make the solo test functional and specify how the loop changes with two or more players. Handle a player leaving without stranding the round.
- Design for touch and varied screens as well as keyboard/mouse. Prefer ContextActionService, ProximityPrompt, and GuiButton.Activated where appropriate. Avoid an essential action available only through a tiny UI target or desktop key.

## Review the actual implementation

Trace a new player from spawn through one whole loop and into the next attempt. Identify exact scripts and scene objects responsible for each step. Reject absent core mechanics, unwinnable progression, misleading descriptions, dead-end victory screens, and unhandled respawns. Separately list what static reasoning can establish and what needs Studio playtesting. Do not invent playtest observations.

Use testable hypotheses: first meaningful action time, tutorial completion, first loop completion, voluntary replay, and cohort retention. Set project-specific targets as assumptions until real data exists; do not promise virality, revenue, or universal retention rates.

Sources checked 2026-11-13:
- [Roblox core loops](https://create.roblox.com/docs/production/game-design/core-loops)
- [Roblox retention and onboarding](https://create.roblox.com/docs/production/analytics/retention)
