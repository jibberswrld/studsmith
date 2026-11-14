---
name: roblox-worldcraft
description: Build and review authored Roblox environments with readable routes, coherent art direction, avatar-scale traversal, and practical performance budgets.
---

# Make an authored place

Treat primitive parts as building materials, not the finished visual idea. Compose recognizable structures and spaces: an arrival area, a focal landmark, purposeful routes, play zones, and supporting scenery. Match the requested fantasy. A line of floating boxes, one enormous baseplate, and randomly scattered props are not adequate substitutes for an environment.

## Decide before placing parts

Write a spatial plan with approximate dimensions, relative elevations, route direction, boundaries, landmarks, and safe respawn areas. Define a restrained palette, dominant materials, architectural shapes, and lighting mood. Give different gameplay zones recognizable silhouettes while keeping them in one visual world.

Build large forms first, then medium structures, then small accents. Use negative space to protect routes and camera visibility. Favor a few strong compositions over uniformly distributing decoration. Repeat motifs intentionally, then vary scale, orientation, and grouping. Include scenery in the declarative parts so it appears in the browser preview; do not hide the whole environment in a runtime script.

## Make the space playable

- Use the default avatar as the scale reference. Check actual gaps, landable area, overhead clearance, slopes, collision, and fall distance. Center-to-center distance is not the same as the gap a player must jump.
- Separate decoration from traversal collision. Thin accents, foliage, and lighting props should not invisibly block the player. Use shape and placement as well as color to distinguish danger and safe surfaces.
- Keep the objective or next route legible from the player's approach. A landmark, framing structure, contrasting shape, or breadcrumb can orient the player without an oversized arrow covering the screen.
- Place spawn locations on sufficiently large safe support. For checkpoints, use Player.RespawnLocation and valid SpawnLocations; teleporting immediately in CharacterAdded can race the engine's spawn placement.
- For moving hazards, telegraph the timing and provide a learnable pattern. Ensure every required jump has a plausible landing and that the level does not depend on accidental physics behavior.
- For an obby, vary traversal rhythm and give sections a distinct spatial identity. Difficulty should come from learnable interactions, not an unbroken row of increasingly distant platforms.

## Budget and verify

Use Studsmith's supported primitives and part budget deliberately. Decorative complexity must not overwhelm the playable area. Anchor static scenery, avoid unnecessary per-frame work, and use one shared update loop when several objects need the same timing. Keep important UI clear of device safe areas and Roblox controls.

Review the world and code together: named object references must exist, hazards must match the code, and the exported initial state must agree with the preview. A pleasing orbit-camera screenshot is not proof that ground-level routes or mobile controls work. Record the specific camera, traversal, and low-end-device checks still needed.

Reference: [Roblox game-design documentation](https://create.roblox.com/docs/production/game-design). Spatial composition guidance here is a design method, not a claimed Roblox policy or benchmark.
