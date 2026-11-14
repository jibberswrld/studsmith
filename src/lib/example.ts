import { GameSchema } from "./project";

// A hand-built playable example, also used as the deterministic export test fixture.
export const exampleGame = GameSchema.parse({
  title: "Cloudstep", description: "A ten-stage sky obby with checkpoints, a timer, and a finish line.",
  parts: [
    { id: "start", name: "StartIsland", kind: "block", position: [0, 0, 0], size: [22, 3, 22], color: "#b9d8ca", material: "Grass" },
    { id: "spawn", name: "Spawn", kind: "spawn", position: [0, 2, 0], size: [6, 1, 6], color: "#e8f1eb" },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `step-${i + 1}`, name: `Stage${i + 1}`, kind: "spawn", position: [(i + 1) * 10, 1 + Math.floor(i / 3) * 2, Math.sin(i * 0.8) * 6], size: [7, 2, 8], color: i % 3 === 2 ? "#e5b86c" : "#70c6a0", material: "SmoothPlastic" })),
    { id: "finish", name: "Finish", kind: "block", position: [112, 7, Math.sin(9 * 0.8) * 6], size: [16, 2, 16], color: "#f0cf77", material: "Neon" },
    { id: "lava", name: "Lava", kind: "block", position: [56, -20, 0], size: [180, 1, 100], color: "#d36d59", material: "Neon" },
  ],
  lighting: { clockTime: 14, brightness: 2, ambient: "#9eb8c5" },
  files: [
    { path: "server/Obby.server.luau", source: `-- Cloudstep: authoritative checkpoints and finish handling.
local Players = game:GetService("Players")
local world = workspace:WaitForChild("World")
local lastTouch = {}

local function setup(player)
    if player:FindFirstChild("leaderstats") then return end
    local stats = Instance.new("Folder")
    stats.Name = "leaderstats"
    stats.Parent = player
    local stage = Instance.new("IntValue")
    stage.Name = "Stage"
    stage.Parent = stats
    player.RespawnLocation = world.Spawn
    player:SetAttribute("StartedAt", workspace:GetServerTimeNow())
    player:SetAttribute("Finished", false)
    player.CharacterAdded:Connect(function()
        if player:GetAttribute("Finished") then
            stage.Value = 0
            player:SetAttribute("Finished", false)
        end
        if stage.Value == 0 then player:SetAttribute("StartedAt", workspace:GetServerTimeNow()) end
    end)
end
Players.PlayerAdded:Connect(setup)
for _, player in Players:GetPlayers() do setup(player) end
Players.PlayerRemoving:Connect(function(player) lastTouch[player] = nil end)

for index = 1, 10 do
    local checkpoint = world:WaitForChild("Stage" .. index)
    checkpoint.Touched:Connect(function(hit)
        local character = hit:FindFirstAncestorOfClass("Model")
        local player = character and Players:GetPlayerFromCharacter(character)
        if not player or not player:FindFirstChild("leaderstats") then return end
        local stage = player.leaderstats.Stage
        if index == stage.Value + 1 then
            stage.Value = index
            player.RespawnLocation = checkpoint
        end
    end)
end
world.Lava.Touched:Connect(function(hit)
    local character = hit:FindFirstAncestorOfClass("Model")
    local humanoid = character and character:FindFirstChildOfClass("Humanoid")
    if humanoid then humanoid.Health = 0 end
end)
world.Finish.Touched:Connect(function(hit)
    local character = hit:FindFirstAncestorOfClass("Model")
    local player = character and Players:GetPlayerFromCharacter(character)
    if not player or not player:FindFirstChild("leaderstats") then return end
    if player.leaderstats.Stage.Value < 10 or player:GetAttribute("Finished") then return end
    local now = os.clock()
    if lastTouch[player] and now - lastTouch[player] < 1 then return end
    lastTouch[player] = now
    player.RespawnLocation = world.Spawn
    player:SetAttribute("FinishTime", workspace:GetServerTimeNow() - (player:GetAttribute("StartedAt") or workspace:GetServerTimeNow()))
    player:SetAttribute("Finished", true)
end)
` },
    { path: "client/Hud.client.luau", source: `local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "CloudstepHUD"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel")
label.Size = UDim2.new(0.8, 0, 0, 78)
label.Position = UDim2.new(0.1, 0, 0, 16)
label.BackgroundColor3 = Color3.fromRGB(24, 42, 36)
label.BackgroundTransparency = 0.15
label.TextColor3 = Color3.fromRGB(240, 250, 245)
label.TextSize = 20
label.Font = Enum.Font.GothamMedium
label.TextWrapped = true
label.Parent = gui
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 10)
corner.Parent = label
local stage = player:WaitForChild("leaderstats"):WaitForChild("Stage")
RunService.RenderStepped:Connect(function()
    if player:GetAttribute("Finished") then
        label.Text = string.format("Finished in %.1fs! Reset your character to race again.", player:GetAttribute("FinishTime") or 0)
    else
        local elapsed = workspace:GetServerTimeNow() - (player:GetAttribute("StartedAt") or workspace:GetServerTimeNow())
        label.Text = string.format("CLOUDSTEP   |   Checkpoint %d / 10   |   %.1fs\\nWASD to move · Space to jump · Reach the gold island", stage.Value, math.max(0, elapsed))
    end
end)
` },
  ],
  instructions: "Move with WASD and jump with Space. Land on each platform in order to save your checkpoint. Reach the gold finish island. Falling into lava sends you to your latest checkpoint. Reset your character after finishing to race again.",
  testPlan: ["Press Play in Roblox Studio. Confirm the HUD shows checkpoint 0 / 10 and a running timer.", "Jump to Stage1, then fall into lava. Confirm respawn returns you to Stage1.", "Touch all ten stages in order and reach the gold Finish. Confirm the timer stops and shows Finished.", "Reset your character after finishing. Confirm you restart at Spawn with checkpoint 0."],
  notes: ["Progress lasts for the current session; no DataStore or external assets are required.", "The browser previews static geometry. Play the game in Roblox Studio to test physics and scripts."],
});
