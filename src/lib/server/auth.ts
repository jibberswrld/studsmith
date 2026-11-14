import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "./store";
import { ApiError } from "./http";
import { DEFAULT_BASE_URL, gateWords, installKey, isConfigured, provision, readCredential, readWallet, type Wallet } from "./publik";

const SettingsSchema = z.object({ choice: z.enum(["publik", "own_key"]).nullable().default(null), ownKey: z.object({ baseURL: z.url(), apiKey: z.string().min(1), model: z.string().min(1) }).optional() });
export async function settings() {
  try { return SettingsSchema.parse(JSON.parse(await readFile(join(dataDir(), "settings.json"), "utf8"))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return SettingsSchema.parse({}); throw e; }
}
export async function saveSettings(value: z.infer<typeof SettingsSchema>) {
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  await writeFile(join(dataDir(), "settings.json"), JSON.stringify(SettingsSchema.parse(value)), { mode: 0o600 });
}
let provisioning: ReturnType<typeof provision> | null = null;
let walletCache: { key: string; wallet: Wallet; time: number } | null = null;
export async function wallet(fresh = false) {
  let key = installKey();
  if (!key) {
    if (!isConfigured()) throw new ApiError(503, "Studsmith needs its own Publik app token. Complete the app listing and add publik-app-token.txt, then retry.");
    provisioning ??= provision().finally(() => { provisioning = null; });
    key = (await provisioning).key;
  }
  if (!fresh && walletCache?.key === key && Date.now() - walletCache.time < 15000) return { key, wallet: walletCache.wallet };
  const response = await readWallet(key);
  if (response.status === 401 && !process.env.PUBLIK_API_KEY) {
    provisioning ??= provision().finally(() => { provisioning = null; });
    key = (await provisioning).key;
    const retried = await readWallet(key);
    if (!retried.wallet) throw new ApiError(401, "Sign in with publik to continue.");
    walletCache = { key, wallet: retried.wallet, time: Date.now() };
  } else {
    if (!response.wallet) throw new ApiError(503, "publik is not reachable. Check your connection.");
    walletCache = { key, wallet: response.wallet, time: Date.now() };
  }
  return { key, wallet: walletCache.wallet };
}
export async function requireSignedIn() {
  const auth = await wallet();
  if (auth.wallet.claim_state !== "claimed") throw new ApiError(401, "Sign in with publik to continue.");
  return auth;
}
export async function gate() {
  try {
    const auth = await wallet(true);
    const config = await settings();
    const w = auth.wallet;
    if (w.claim_state !== "claimed") return { state: "sign_in", ...gateWords("sign_in", w), claimUrl: safeLink(w.claim_url), topUpUrl: null };
    if (!config.choice || (config.choice === "own_key" && !config.ownKey)) return { state: "choose", ...gateWords("choose", w), hasPlan: w.plan.kind !== "none" || w.balance_micros > 0, topUpUrl: safeLink(w.top_up_url), claimUrl: null };
    return { state: "ready", handle: w.account?.handle || null, provider: config.choice, testMode: !!process.env.PUBLIK_ORIGIN, telemetry: process.env.DO_NOT_TRACK !== "1" && process.env.PUBLIK_TELEMETRY !== "off" };
  } catch (error) {
    return { state: !isConfigured() && !installKey() ? "setup" : "unreachable", title: "Sign in with publik", body: error instanceof ApiError ? error.message : "publik is not reachable. Check your connection.", claimUrl: null, topUpUrl: null };
  }
}
export function safeLink(value: string | null | undefined) {
  try { const url = new URL(value || ""); return url.protocol === "https:" || (process.env.PUBLIK_ORIGIN && url.origin === new URL(process.env.PUBLIK_ORIGIN).origin) ? url.href : null; }
  catch { return null; }
}
export async function provider(tier: "publik-balanced" | "publik-smart") {
  const auth = await requireSignedIn();
  const config = await settings();
  if (config.choice === "own_key" && config.ownKey) return { ...config.ownKey, kind: "own" as const };
  if (config.choice !== "publik") throw new ApiError(401, "Choose how to pay for AI first.");
  return { kind: "publik" as const, apiKey: auth.key, baseURL: process.env.PUBLIK_API_BASE_URL || readCredential()?.base_url || DEFAULT_BASE_URL, model: tier };
}
