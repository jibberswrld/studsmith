import "server-only";
import { headers } from "next/headers";
import { osFromUA, deviceName } from "./visitor";
import { createHash } from "node:crypto";
import { BUILD_ESTIMATE, BUILD_ESTIMATE_MICROS, dollars } from "../project";
import { ApiError } from "./http";
import { DEFAULT_BASE_URL, gateWords, isConfigured, provision, readWallet, type Wallet } from "./publik";
import { clearSession, readSession, writeSession, type Session } from "./session";

export async function wallet() {
  const session = await readSession();
  if (!session) throw new ApiError(401, "Sign in with Publik to continue.");
  const response = await readWallet(session.key);
  if (!response.wallet) throw new ApiError(response.status === 401 ? 401 : 503, response.status === 401 ? "Your session expired. Reconnect with Publik." : "Publik is not reachable. Check your connection.");
  return { key: session.key, session, wallet: response.wallet };
}
export async function requireSignedIn() {
  const auth = await wallet();
  if (auth.wallet.claim_state !== "claimed") throw new ApiError(401, "Sign in with Publik to continue.");
  return auth;
}
/** Whether the Publik balance (which includes plan money left this month) plausibly covers one build. */
export const canAffordBuild = (w: Wallet) => w.balance_micros >= BUILD_ESTIMATE_MICROS;
const lowBalanceMessage = (w: Wallet) => `A build costs about ${BUILD_ESTIMATE} of AI usage, and your Publik balance is ${dollars(w.balance_micros)}. Get a Publik plan (from $8/month), or use your own OpenAI key in AI settings.`;

const unreachable = (body: string) => ({ state: "unreachable", title: "Publik isn’t reachable right now.", body });
/** The gate. A visitor without a session gets no Publik install until they click Sign in (see signIn). */
export async function gate() {
  try {
    if (!(await readSession())) {
      if (!isConfigured()) return { state: "setup", title: "This copy of Studsmith isn’t set up yet.", body: "This deployment needs Studsmith's Publik app token configured." };
      return { state: "sign_in", claimUrl: null, topUpUrl: null };
    }
    const auth = await wallet();
    const w = auth.wallet, session = auth.session;
    if (w.claim_state !== "claimed") return { state: "sign_in", claimUrl: safeLink(w.claim_url || session.claim_url), topUpUrl: null };
    if (!session.choice || (session.choice === "own_key" && !session.ownKey)) {
      if (canAffordBuild(w)) return { state: "choose", ...gateWords("choose", w), hasPlan: true, topUpUrl: safeLink(w.top_up_url), claimUrl: null };
      const who = w.account?.handle ? `You’re signed in as @${w.account.handle}.` : "You’re signed in to Publik.";
      return { state: "choose", title: `A build costs about ${BUILD_ESTIMATE} of AI usage.`, body: `${who} Your Publik balance is ${dollars(w.balance_micros)}, which isn’t enough for one build. Get a Publik plan (from $8/month), or use your own OpenAI key.`, hasPlan: false, topUpUrl: safeLink(w.top_up_url), claimUrl: null };
    }
    const workspace = createHash("sha256").update(w.account?.handle || session.install_id).digest("hex").slice(0, 24);
    return { state: "ready", handle: w.account?.handle || null, workspace, provider: session.choice, balanceMicros: session.choice === "publik" ? w.balance_micros : null, topUpUrl: safeLink(w.top_up_url), testMode: !!process.env.PUBLIK_ORIGIN };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) { await clearSession(); return { state: "sign_in", claimUrl: null, topUpUrl: null }; }
    return unreachable(error instanceof ApiError ? error.message : "Publik is not reachable. Check your connection.");
  }
}
/** Sign in was clicked: create this browser's Publik install once, then return its sign-in link. */
export async function signIn() {
  if (!isConfigured()) throw new ApiError(503, "This deployment needs Studsmith's Publik app token configured.");
  let session = await readSession();
  if (!session) {
    const ua = (await headers()).get("user-agent") ?? "";
    const os = osFromUA(ua);
    const install = await provision({ persist: false, os, deviceName: deviceName(ua) }).catch(() => { throw new ApiError(503, "Publik is not reachable. Check your connection."); });
    session = await writeSession({ ...install, os, choice: null });
  }
  const next = await gate();
  // A freshly written cookie isn't readable in this request, so gate() still says sign_in without a link.
  return next.state === "sign_in" ? { ...next, claimUrl: next.claimUrl || safeLink(session.claim_url) } : next;
}
export function safeLink(value: string | null | undefined) {
  try { const url = new URL(value || ""); return url.protocol === "https:" || (process.env.PUBLIK_ORIGIN && url.origin === new URL(process.env.PUBLIK_ORIGIN).origin) ? url.href : null; }
  catch { return null; }
}
export function assertCanUsePublik(w: Wallet) {
  if (!canAffordBuild(w)) throw new ApiError(402, lowBalanceMessage(w), safeLink(w.top_up_url));
}
export async function saveChoice(session: Session, choice: Session["choice"], ownKey?: Session["ownKey"]) {
  return writeSession({ ...session, choice, ownKey: choice === "own_key" ? ownKey : undefined });
}
export type ProviderConfig = { kind: "own" | "publik"; apiKey: string; baseURL: string; model: string };
/** The AI provider for one build. Publik builds are refused up front when the balance can't cover one. */
export function providerFor(auth: Awaited<ReturnType<typeof requireSignedIn>>, tier: "publik-balanced" | "publik-smart"): ProviderConfig {
  const { session } = auth;
  if (session.choice === "own_key" && session.ownKey) return { ...session.ownKey, kind: "own" };
  if (session.choice !== "publik") throw new ApiError(401, "Choose how to pay for AI first.");
  assertCanUsePublik(auth.wallet);
  return { kind: "publik", apiKey: session.key, baseURL: session.base_url || DEFAULT_BASE_URL, model: tier };
}
