import "server-only";
import { createHash } from "node:crypto";
import { ApiError } from "./http";
import { DEFAULT_BASE_URL, gateWords, isConfigured, provision, readWallet } from "./publik";
import { clearSession, readSession, writeSession, type Session } from "./session";

export async function wallet() {
  const session = await readSession();
  if (!session) throw new ApiError(401, "Sign in with publik to continue.");
  const response = await readWallet(session.key);
  if (!response.wallet) throw new ApiError(response.status === 401 ? 401 : 503, response.status === 401 ? "Your session expired. Reconnect with Publik." : "publik is not reachable. Check your connection.");
  return { key: session.key, session, wallet: response.wallet };
}
export async function requireSignedIn() {
  const auth = await wallet();
  if (auth.wallet.claim_state !== "claimed") throw new ApiError(401, "Sign in with publik to continue.");
  return auth;
}
export async function gate() {
  try {
    if (!(await readSession())) {
      if (!isConfigured()) return { state: "setup", title: "Sign in with publik", body: "This deployment needs Studsmith's Publik app token configured." };
      const install = await provision({ persist: false });
      await writeSession({ ...install, choice: null });
    }
    const auth = await wallet();
    const w = auth.wallet, session = auth.session;
    if (w.claim_state !== "claimed") return { state: "sign_in", ...gateWords("sign_in", w), claimUrl: safeLink(w.claim_url || session.claim_url), topUpUrl: null };
    if (!session.choice || (session.choice === "own_key" && !session.ownKey)) return { state: "choose", ...gateWords("choose", w), hasPlan: w.plan.kind !== "none" || w.balance_micros > 0, topUpUrl: safeLink(w.top_up_url), claimUrl: null };
    const workspace = createHash("sha256").update(w.account?.handle || session.install_id).digest("hex").slice(0, 24);
    return { state: "ready", handle: w.account?.handle || null, workspace, provider: session.choice, testMode: !!process.env.PUBLIK_ORIGIN };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) await clearSession();
    return { state: "unreachable", title: "Sign in with publik", body: error instanceof ApiError ? error.message : "publik is not reachable. Check your connection." };
  }
}
export function safeLink(value: string | null | undefined) {
  try { const url = new URL(value || ""); return url.protocol === "https:" || (process.env.PUBLIK_ORIGIN && url.origin === new URL(process.env.PUBLIK_ORIGIN).origin) ? url.href : null; }
  catch { return null; }
}
export async function saveChoice(session: Session, choice: Session["choice"], ownKey?: Session["ownKey"]) {
  return writeSession({ ...session, choice, ownKey: choice === "own_key" ? ownKey : undefined });
}
export async function provider(tier: "publik-balanced" | "publik-smart") {
  const { session } = await requireSignedIn();
  if (session.choice === "own_key" && session.ownKey) return { ...session.ownKey, kind: "own" as const };
  if (session.choice !== "publik") throw new ApiError(401, "Choose how to pay for AI first.");
  return { kind: "publik" as const, apiKey: session.key, baseURL: session.base_url || DEFAULT_BASE_URL, model: tier };
}
