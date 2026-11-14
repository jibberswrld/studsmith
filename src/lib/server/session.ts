import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError } from "./http";

const CookieSchema = z.object({
  os: z.enum(["macos", "windows", "linux"]).default("linux"),
  key: z.string(), base_url: z.string(), install_id: z.string(), claim_url: z.string().nullable(),
  choice: z.enum(["publik", "own_key"]).nullable().default(null),
  ownKey: z.object({ baseURL: z.string(), apiKey: z.string(), model: z.string() }).optional(),
  openedAt: z.number().default(0), activeAt: z.number().default(0), expiresAt: z.number(),
});
export type Session = z.infer<typeof CookieSchema>;
const NAME = "studsmith_session";
const developmentSecret = randomBytes(32).toString("hex");
function encryptionKey() {
  const secret = process.env.STUDSMITH_SESSION_SECRET;
  if (process.env.VERCEL && (!secret || secret.length < 32)) throw new ApiError(503, "This deployment needs its session secret configured.");
  return createHash("sha256").update(secret || developmentSecret).digest();
}
export async function readSession(): Promise<Session | null> {
  const value = (await cookies()).get(NAME)?.value;
  if (!value) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const data = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    const session = CookieSchema.parse(JSON.parse(data.toString("utf8")));
    return session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}
export async function writeSession(input: Omit<Session, "expiresAt" | "openedAt" | "activeAt" | "os"> & Partial<Session>) {
  const session = CookieSchema.parse({ openedAt: 0, activeAt: 0, ...input, expiresAt: Date.now() + 30 * 86400000 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
  if (value.length > 3800) throw new ApiError(400, "These provider settings are too long to store securely. Use a shorter URL or key.");
  (await cookies()).set(NAME, value, { httpOnly: true, secure: !!process.env.VERCEL || process.env.STUDSMITH_SECURE_COOKIE === "1", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return session;
}

export async function clearSession() { (await cookies()).delete(NAME); }
