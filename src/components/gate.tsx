"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { placeXml } from "@/lib/export";
import { BUILD_ESTIMATE as COST, GameSchema, type Game } from "@/lib/project";
import { LegalLinks, Logo, NOT_AFFILIATED } from "./brand";

const Scene = dynamic(() => import("./scene"), { ssr: false, loading: () => <div className="scene-loading">Opening 3D preview…</div> });
export type GateState = { state: string; title?: string; body?: string; claimUrl?: string | null; topUpUrl?: string | null; hasPlan?: boolean; handle?: string | null; provider?: string; workspace?: string; balanceMicros?: number | null; testMode?: boolean };
type OwnKey = { baseURL: string; apiKey: string; model: string };

export default function Gate({ gate, busy, errorBox, onSignIn, onChoose, onRetry }: {
  gate: GateState | null; busy: boolean; errorBox: React.ReactNode;
  onSignIn: () => Promise<boolean>; onChoose: (choice: "publik" | "own_key", ownKey?: OwnKey) => void; onRetry: () => void;
}) {
  const [example, setExample] = useState<Game | null>(null);
  const [ownForm, setOwnForm] = useState(false);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    let active = true;
    void import("@/lib/examples/lantern-run.json").then((module) => { if (active) setExample(GameSchema.parse(module.default)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const state = gate?.state;
  const signIn = state === "sign_in" || !gate;

  function downloadExample() {
    if (!example) return;
    const url = URL.createObjectURL(new Blob([placeXml(example)], { type: "application/xml" }));
    const a = document.createElement("a"); a.href = url; a.download = "Lantern-Run.rbxlx"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return <main className="gate-page">
    <div className="gate-intro">
      <Logo />
      <div className="gate-copy">
        {signIn ? <><h1>Describe a game. Open it in Roblox Studio.</h1><p>Studsmith’s AI designs the map, writes the Luau scripts, checks its own work, and gives you a place file to open in Studio.</p></>
          : <><h1>{gate?.title}</h1><p>{gate?.body}</p></>}
      </div>
      {errorBox}
      {signIn && (gate?.claimUrl
        ? <a className="button primary full" href={gate.claimUrl} target="_blank" rel="noreferrer" onClick={() => setWaiting(true)}>Continue signing in with Publik ↗</a>
        : <button className="primary full" disabled={!gate || busy} onClick={async () => setWaiting(await onSignIn())}>{busy ? "Opening Publik…" : "Sign in with Publik"}</button>)}
      {signIn && <p className="gate-note">{waiting ? "Finish signing in on the Publik tab. This page continues by itself." : `Signing in is free. Each build uses about ${COST} of AI usage, paid by a Publik plan (from $8/month) or your own OpenAI key.`}</p>}
      {state === "choose" && <div className="gate-actions">
        {gate!.hasPlan ? <button className="primary" disabled={busy} onClick={() => onChoose("publik")}>Connect your plan</button>
          : gate!.topUpUrl && <a className="button primary" href={gate!.topUpUrl} target="_blank" rel="noreferrer">Get a Publik plan ↗</a>}
        <button onClick={() => setOwnForm(!ownForm)}>Use my own OpenAI key</button>
      </div>}
      {state === "choose" && !gate!.hasPlan && <p className="gate-note">New Publik accounts get $0.05 of free use. That isn’t enough for a build, so Studsmith won’t start one on it. This page updates once your plan is active.</p>}
      {ownForm && state === "choose" && <form className="own-form" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); onChoose("own_key", { baseURL: String(values.get("url")), apiKey: String(values.get("key")), model: String(values.get("model")) }); }}><label>OpenAI-compatible base URL<input name="url" type="url" defaultValue="https://api.openai.com/v1" required /></label><label>Model<input name="model" placeholder="Your provider’s model name" required maxLength={120} /></label><label>API key<input name="key" type="password" autoComplete="off" required /></label><p className="muted">Stored in an encrypted, HttpOnly session cookie. Sent only to your chosen provider, which bills you for usage.</p><button className="primary" disabled={busy}>Save provider</button></form>}
      {state === "setup" && <div className="setup-note"><strong>App setup required</strong><p>This build is wired to Publik, but Studsmith needs its own app registration and public app token. Other apps’ credentials are never reused.</p><code>publik-app-token.txt</code><p>Place the token in the project folder, then retry. See README.md for the setup details.</p></div>}
      {(state === "unreachable" || state === "setup") && <button className="text-button retry" onClick={onRetry}>Retry connection</button>}
    </div>
    <section className="gate-demo" aria-labelledby="demo-title">
      <div className="preview-label"><span className="status-dot" /><span id="demo-title">Lantern Run</span><span>A game Studsmith built · 77 parts · 2 scripts</span></div>
      {example ? <Scene game={example} turntable /> : <div className="scene-loading">Opening 3D preview…</div>}
      <div className="demo-caption"><p>A cozy delivery game in a lantern-lit village: pick up parcels, follow your beacon, earn a trail. The preview shows the map; the scripts run when you press Play in Studio.</p><button className="text-button" disabled={!example} onClick={downloadExample}>↓ Download it for Studio</button></div>
    </section>
    <div className="gate-more">
      <ol className="export-steps">
        <li><strong>Sign in and choose how AI is paid</strong><p>A Publik plan, from $8/month, or your own OpenAI key. Each build uses about {COST} of AI usage.</p></li>
        <li><strong>Describe your game</strong><p>The AI designs it, builds the map and scripts, checks them, and repairs what it finds. This takes 4–8 minutes.</p></li>
        <li><strong>Open it in Roblox Studio</strong><p>Look around the 3D preview, edit scripts, then download the place file and press Play. Test before you publish.</p></li>
      </ol>
      <footer className="gate-footer"><p>Projects are saved in this browser only. Prompts and project source go to the AI provider you choose.</p><p className="legal-links"><LegalLinks /></p><p>{NOT_AFFILIATED}</p></footer>
    </div>
  </main>;
}
