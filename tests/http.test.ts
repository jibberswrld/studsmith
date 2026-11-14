import assert from "node:assert/strict";
import { test } from "node:test";
import { localRequest } from "../src/lib/server/http";

const request = (host: string, origin?: string) => new Request(`https://${host}/api/publik`, { headers: { host, ...(origin ? { origin } : {}) } });
const allowed = (host: string, origin?: string) => { try { localRequest(request(host, origin)); return true; } catch { return false; } };

test("STUDSMITH_APP_ORIGIN accepts a comma-separated list of exact origins alongside Vercel's domains", () => {
  const saved = { ...process.env };
  try {
    process.env.VERCEL = "1";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "studsmith-theta.vercel.app";
    process.env.STUDSMITH_APP_ORIGIN = " https://studsmith-jibberswrlds-projects.vercel.app, https://studsmith.example/ ,not a url, https://evil.example/path";
    assert.ok(allowed("studsmith-theta.vercel.app", "https://studsmith-theta.vercel.app"));
    assert.ok(allowed("studsmith-jibberswrlds-projects.vercel.app", "https://studsmith-jibberswrlds-projects.vercel.app"));
    assert.ok(allowed("studsmith.example"));
    assert.equal(allowed("evil.example"), false, "entries with paths are not exact origins");
    assert.equal(allowed("other.vercel.app"), false);
    assert.equal(allowed("studsmith.example", "https://other.example"), false);
  } finally { process.env = saved; }
});
