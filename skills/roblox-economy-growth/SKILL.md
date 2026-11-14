---
name: roblox-economy-growth
description: Design sustainable Roblox retention, economies, paid offers, discovery tests, and launch measurement without promising revenue or compromising free gameplay.
---

# Build earning potential around player value

Make the free core loop worth playing before optimizing sales. Identify the intended audience, the hook that attracts them, the reason to return, and what they might voluntarily value enough to buy. Explain the commercial hypothesis rather than claiming the game will make money.

## Economy and offers

For each currency, specify how it enters, what it buys, what removes it, and the expected progression experience. Check that repeatable rewards cannot be farmed through respawn, remote spam, reconnects, or multiple claims. Keep game authority on the server. Avoid infinite inflation and progression that becomes deliberately unpleasant to pressure spending.

For each proposed offer, name its player benefit, appropriate purchase mechanism, free alternative, presentation moment, and required setup. Permanent entitlements normally fit passes; repeatable consumables fit developer products. Cosmetic expression, customization, and useful optional convenience can support the game's identity. Private servers may suit experiences whose value comes from playing with a chosen group. Choose based on the game, not a fixed shop catalog.

Prices are hypotheses, not benchmarks. When implementing real offers, read current product information at runtime and display the player's returned price; do not bake a storefront's Robux price into client text. Regional and personalized pricing can differ. Show exactly what is purchased, when it is delivered, and whether it persists. Avoid fabricated scarcity, obstructive purchase popups, paid random rewards, and pressure aimed at children. Do not make an unsafe or broken mechanic the reason a player must pay.

## Implementation boundary

Studsmith's default export is an offline prototype. Produce concrete offer designs in businessPlan, but do not invent product IDs, process purchases, call DataStores, or label revenue systems as live. Keep unconfigured real-money paths absent or disabled, and describe the exact published-game setup they require. A working soft-currency shop is acceptable if it is fully implemented and accurately labeled as session-only.

In a separately authorized production integration, developer-product rewards must come from MarketplaceService.ProcessReceipt on the server. Persist receipt identity and entitlement changes reliably; return PurchaseGranted only after the grant is durable. A canceled prompt or client purchase-finished callback is not proof of a grant. Do not activate real sales without the owner's configured products, persistence, and testing.

## Retention, discovery, and measurement

Design return value through mastery, content variety, collection, cooperative goals, or meaningful progression. Identify the main onboarding drop-offs and the next experiment that would diagnose them. Track acquisition quality and device/performance differences before interpreting cohort movement.

Plan an honest thumbnail and short gameplay clip around the actual hook. Test whether incoming players reach and enjoy that mechanic before paying to acquire more of them. Do not clone another game's branding or claim an unimplemented mechanic in the title or thumbnail.

Use defined metrics: onboarding completion, first-loop completion, replay rate, D1/D7 cohort retention, payer conversion, revenue per user, and revenue per payer. Model revenue as traffic × conversion × spend per payer over the same time window. Separate gross Robux, platform proceeds, and cash-out assumptions. Never turn a forecast into a guarantee or hardcode platform fee/cash-out rules that need current verification.

For each metric, state its denominator, window, the event or data source, and which decision it informs. Roblox funnel events require a published game and server calls; Studio cannot demonstrate live analytics delivery. If telemetry is not implemented, label it as a measurement plan, not tracked data.

Sources checked 2026-11-13:
- [Monetization foundations](https://create.roblox.com/docs/production/game-design/monetization-foundations)
- [Developer products and receipts](https://create.roblox.com/docs/production/monetization/developer-products)
- [Regional pricing](https://create.roblox.com/docs/production/monetization/regional-pricing)
- [Retention](https://create.roblox.com/docs/production/analytics/retention)
- [Funnel events](https://create.roblox.com/docs/production/analytics/funnel-events)
