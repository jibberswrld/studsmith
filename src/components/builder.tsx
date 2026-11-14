"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { current, exportName, STARTER_PROMPTS, type GameFile, type Project, type ProjectSummary } from "@/lib/project";

const Scene = dynamic(() => import("./scene"), { ssr: false, loading: () => <div className="scene-loading">Opening 3D preview…</div> });
type Gate = { state: string; title?: string; body?: string; claimUrl?: string | null; topUpUrl?: string | null; hasPlan?: boolean; handle?: string | null; provider?: string; testMode?: boolean };
type Failure = { message: string; topUpUrl?: string | null };
type Tab = "preview" | "code" | "guide" | "history" | "export" | "plan";
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const body = await response.json();
  if (!response.ok) throw body.error || { message: "The request failed. Try again." };
  return body;
}
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
function Logo() { return <span className="brand"><span className="brand-mark" aria-hidden="true">s</span><span>studsmith<span className="brand-dot">.</span></span></span>; }

export default function Builder() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [prompt, setPrompt] = useState("");
  const [tier, setTier] = useState("publik-smart");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<Tab>("preview");
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState("");
  const [files, setFiles] = useState<GameFile[]>([]);
  const [ownForm, setOwnForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadingProject, setLoadingProject] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const revision = project ? current(project) : null;
  const game = revision?.game;
  const dirty = !!game && JSON.stringify(files) !== JSON.stringify(game.files);
  const locked = !!busy || loadingProject || dirty;

  const refreshGate = useCallback(async () => {
    try { setGate(await api<Gate>("/api/publik")); }
    catch (e) { setGate({ state: "unreachable", title: "Sign in with publik", body: (e as Failure).message || "publik is not reachable. Check your connection." }); }
  }, []);
  useEffect(() => {
    let active = true;
    api<Gate>("/api/publik").then((value) => { if (active) setGate(value); }).catch(() => { if (active) setGate({ state: "unreachable", title: "Sign in with publik", body: "publik is not reachable. Check your connection." }); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (gate?.state !== "sign_in" && gate?.state !== "choose") return;
    const end = Date.now() + 10 * 60 * 1000;
    const timer = setInterval(() => { if (Date.now() > end) clearInterval(timer); else if (!document.hidden) void refreshGate(); }, 3000);
    return () => clearInterval(timer);
  }, [gate?.state, refreshGate]);
  useEffect(() => {
    if (gate?.state !== "ready") return;
    void api<ProjectSummary[]>("/api/projects").then(setProjects).catch((e) => setFailure(e));
    void api("/api/publik", post({ action: "telemetry", event: "app_opened" })).catch(() => {});
    const timer = setInterval(() => { if (!document.hidden) void api("/api/publik", post({ action: "telemetry", event: "active_session" })).catch(() => {}); }, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [gate?.state]);
  useEffect(() => {
    if (!dirty || !project || !revision) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, project, revision]);
  useEffect(() => {
    if (!project || !revision) return;
    try {
      if (dirty) localStorage.setItem(`studsmith-draft-${project.id}`, JSON.stringify({ baseRevision: revision.id, files }));
      else localStorage.removeItem(`studsmith-draft-${project.id}`);
    } catch { /* Saved project data is on disk; browser draft storage may be unavailable. */ }
  }, [files, dirty, project, revision]);

  const acceptProject = (p: Project) => {
    setProject(p); setFiles(current(p).game.files); setSelectedFile(current(p).game.files[0]?.path || ""); setSelectedPart(null);
    history.replaceState(null, "", `/?project=${p.id}`);
  };
  const refreshProjects = async () => { setProjects(await api<ProjectSummary[]>("/api/projects")); };
  const receiveProject = useCallback((p: Project) => {
      acceptProject(p);
      try {
        const draft = localStorage.getItem(`studsmith-draft-${p.id}`);
        if (draft) {
          const parsed = JSON.parse(draft);
          if (parsed.baseRevision === current(p).id && Array.isArray(parsed.files)) { setFiles(parsed.files); setNotice("Recovered your unsaved script edits. Save them to create a revision."); }
          else setNotice("An older browser draft exists. The project has newer saved revisions.");
        }
      } catch {
        setNotice("Browser draft storage is unavailable. Saved project revisions are on disk.");
      }
  }, []);
  const load = useCallback(async (id: string) => {
    setLoadingProject(true); setFailure(null); setNotice("");
    try {
      receiveProject(await api<Project>(`/api/projects/${id}`));
    } catch (e) { setFailure(e as Failure); }
    finally { setLoadingProject(false); }
  }, [receiveProject]);
  const initialLoaded = useRef(false);
  useEffect(() => {
    if (gate?.state !== "ready" || initialLoaded.current) return;
    initialLoaded.current = true;
    const id = new URLSearchParams(location.search).get("project");
    if (id) api<Project>(`/api/projects/${id}`).then(receiveProject).catch((e) => setFailure(e));
  }, [gate?.state, receiveProject]);

  async function choose(choice: string, ownKey?: { baseURL: string; apiKey: string; model: string }) {
    setBusy("Connecting AI"); setFailure(null);
    try { setGate(await api<Gate>("/api/publik", post({ action: "choice", choice, ownKey }))); setOwnForm(false); }
    catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (dirty) { setFailure({ message: "Save your script edits before asking for changes." }); return; }
    if (prompt.trim().length < (project ? 3 : 10)) { setFailure({ message: project ? "Describe the change in at least 3 characters." : "Describe your game in at least 10 characters." }); promptInput.current?.focus(); return; }
    const controller = new AbortController(); abortRef.current = controller;
    setBusy(project ? "Updating your game…" : "Building your game…"); setFailure(null); setNotice("");
    try {
      const p = await api<Project>(project ? `/api/projects/${project.id}/generate` : "/api/projects", { ...post({ ...(project ? { baseRevision: revision!.id } : { action: "generate" }), prompt, tier }), signal: controller.signal });
      acceptProject(p); setPrompt(""); setTab("preview");
      setNotice("Project saved. Review its scripts and playtest in Studio before publishing.");
      await refreshProjects();
    } catch (e) { setFailure(controller.signal.aborted ? { message: "Stopped waiting. Reload projects to check whether generation finished saving." } : e as Failure); }
    finally { setBusy(""); abortRef.current = null; }
  }
  async function importGame(value: unknown) {
    setBusy("Importing project…"); setFailure(null);
    try { acceptProject(await api<Project>("/api/projects", post({ action: "import", game: value }))); setTab("preview"); await refreshProjects(); }
    catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  async function save() {
    if (!project || !revision) return;
    setBusy("Saving scripts…"); setFailure(null);
    try {
      const p = await api<Project>(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ action: "save", baseRevision: revision.id, files }) });
      setProject(p); setNotice("Scripts saved as a new revision."); await refreshProjects();
    } catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  async function restore(id: string) {
    if (!project || !revision) return;
    setBusy("Restoring revision…"); setFailure(null);
    try { acceptProject(await api<Project>(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ action: "restore", baseRevision: revision.id, revisionId: id }) })); setNotice("Restored as a new revision. Your previous versions are still in history."); await refreshProjects(); }
    catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  async function download(format: string) {
    if (!project || dirty) return;
    setFailure(null); setBusy("Preparing download…");
    try {
      const response = await fetch(`/api/projects/${project.id}/export?format=${format}`);
      if (!response.ok) throw (await response.json()).error;
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a"); a.href = url; a.download = `${exportName(game!.title)}.${format}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(`Downloaded ${format === "rbxlx" ? "Studio place" : format === "zip" ? "Rojo source ZIP" : "project backup"}.`);
    } catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  const errorBox = failure && <div className="error-message" role="alert"><span>{failure.message || "Something went wrong. Try again."}</span>{failure.topUpUrl && <a href={failure.topUpUrl} target="_blank" rel="noreferrer">Top up</a>}<button className="text-button" aria-label="Dismiss error" onClick={() => setFailure(null)}>×</button></div>;

  if (!gate || gate.state !== "ready") return <main className="gate-page"><div className="gate-card"><Logo /><div className="gate-copy"><span className="eyebrow">FROM IDEA TO ROBLOX STUDIO</span><h1>{gate?.title || "Opening Studsmith…"}</h1><p>{gate?.body || "Checking your Publik connection."}</p></div>{errorBox}
    {gate?.state === "setup" && <div className="setup-note"><strong>App setup required</strong><p>This build is wired to Publik, but Studsmith needs its own app registration and public app token. Other apps’ credentials are never reused.</p><code>publik-app-token.txt</code><p>Place the token in the project folder, then retry. See README.md for the setup details.</p></div>}
    {gate?.state === "sign_in" && gate.claimUrl && <a className="button primary full" href={gate.claimUrl} target="_blank" rel="noreferrer">Sign in with publik ↗</a>}
    {gate?.state === "choose" && <div className="gate-actions">{gate.hasPlan ? <button className="primary" disabled={!!busy} onClick={() => void choose("publik")}>Connect your plan</button> : gate.topUpUrl && <a className="button primary" href={gate.topUpUrl} target="_blank" rel="noreferrer">Get a plan ↗</a>}<button onClick={() => setOwnForm(!ownForm)}>Use my own key</button></div>}
    {ownForm && <form className="own-form" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void choose("own_key", { baseURL: String(values.get("url")), apiKey: String(values.get("key")), model: String(values.get("model")) }); }}><label>OpenAI-compatible base URL<input name="url" type="url" defaultValue="https://api.openai.com/v1" required /></label><label>Model<input name="model" placeholder="Your provider’s model name" required maxLength={120} /></label><label>API key<input name="key" type="password" autoComplete="off" required /></label><p className="muted">Stored on this computer. Sent only to your chosen provider.</p><button className="primary" disabled={!!busy}>Save provider</button></form>}
    {gate && <button className="text-button retry" onClick={() => void refreshGate()}>Retry connection</button>}<p className="gate-footer">Your projects stay on this computer. Prompts and code go to your chosen AI provider. Publik counts app usage without project content; set DO_NOT_TRACK=1 to opt out.</p></div></main>;

  const activePart = game?.parts.find((p) => p.id === selectedPart);
  const activeFile = files.find((f) => f.path === selectedFile);
  return <div className="app-shell">
    <aside className="sidebar"><Logo /><button className="new-project" disabled={locked} onClick={() => { setProject(null); setFiles([]); setPrompt(""); setFailure(null); setNotice(""); history.replaceState(null, "", "/"); }}>＋ New game</button><div className="sidebar-heading">YOUR PROJECTS <span>{projects.length}</span></div><nav aria-label="Projects">{projects.length === 0 && <p className="sidebar-empty">Your first world starts with an idea.</p>}{projects.map((p) => <button className={`project-link ${p.id === project?.id ? "active" : ""}`} key={p.id} disabled={locked} onClick={() => void load(p.id)}><span className="project-icon" aria-hidden="true">◇</span><span><strong>{p.title}</strong><small>{p.revisionCount} revision{p.revisionCount === 1 ? "" : "s"}</small></span></button>)}</nav><div className="sidebar-bottom"><input hidden type="file" accept=".json,application/json" ref={importInput} onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.size > 3 * 1024 * 1024) { setFailure({ message: "Choose a Studsmith JSON backup smaller than 3 MB." }); return; } try { await importGame(JSON.parse(await file.text())); } catch { setFailure({ message: "That isn't a valid JSON backup. Export a project backup from Studsmith first." }); } }} /><button disabled={locked} onClick={() => importInput.current?.click()}>↥ Import project</button><button disabled={locked} onClick={async () => { setFailure(null); try { setGate(await api<Gate>("/api/publik", post({ action: "settings" }))); } catch (e) { setFailure(e as Failure); } }}>AI settings <span>↗</span></button><div className="account"><span className="account-dot" />{gate.handle ? `@${gate.handle}` : "Connected to Publik"}<small>{gate.provider === "own_key" ? "Own provider" : "Publik connected"}</small></div></div></aside>
    <main className="main-workspace"><header className="topbar"><div><span className="breadcrumb">Workspace</span><span className="separator">/</span><strong>{game?.title || "New game"}</strong>{dirty && <span className="unsaved">Unsaved edits</span>}</div><span className="local-label"><span /> Saved locally</span></header>
      <div className="messages">{gate.testMode && <div className="notice">Local test mode: AI responses use a fixture. No live Publik account is connected.</div>}{errorBox}{notice && <div className="notice" role="status">{notice}<button className="text-button" aria-label="Dismiss notice" onClick={() => setNotice("")}>×</button></div>}{dirty && <div className="draft-banner"><span>Save your script edits before generating, exporting, or switching projects.</span><button disabled={!!busy} onClick={() => void save()}>Save edits</button><button disabled={!!busy} onClick={() => setFiles(game!.files)}>Discard edits</button></div>}</div>
      {loadingProject ? <div className="empty-state" role="status">Opening project…</div> : !game ? <section className="welcome"><div className="welcome-icon" aria-hidden="true">▱</div><span className="eyebrow">YOUR NEXT GAME STARTS HERE</span><h1>Imagine it.<br /><span>Build it in studs.</span></h1><p>Describe a world, its rules, and what makes it fun.<br />Get real Luau scripts and a place you can open in Studio.</p><div className="starter-list">{STARTER_PROMPTS.map((s, i) => <button disabled={!!busy} key={s.title} onClick={() => { setPrompt(s.prompt); promptInput.current?.focus(); }}><span className="starter-number">0{i + 1}</span><span>{s.title}</span><span aria-hidden="true">↗</span></button>)}</div></section> : <section className="project-workspace"><div className="project-heading"><div><span className="eyebrow">{game.parts.length} PARTS · {game.files.length} SCRIPTS · REVISION {project!.revisions.length}</span><h1>{game.title}</h1><p>{game.description}</p></div><button className="primary" disabled={locked} onClick={() => setTab("export")}>Export to Studio ↗</button></div><nav className="tabs" aria-label="Project views">{([ ["preview", "Scene"], ["code", "Scripts"], ["guide", "Play & test"], ["plan", "Game plan"], ["history", "History"], ["export", "Export"] ] as [Tab, string][]).map(([value, label]) => <button key={value} aria-current={tab === value ? "page" : undefined} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
        {tab === "preview" && <div className="preview-layout"><div className="preview-main"><div className="preview-label"><span className="status-dot" />Static scene preview<span>Play scripts in Roblox Studio</span></div><Scene game={game} selected={selectedPart} onSelect={setSelectedPart} /></div><aside className="inspector"><h2>World <span>{game.parts.length}</span></h2><div className="part-list">{game.parts.map((p) => <button key={p.id} className={selectedPart === p.id ? "selected" : ""} onClick={() => setSelectedPart(p.id)}><span className="part-swatch" style={{ background: p.color }} />{p.name}<small>{p.kind}</small></button>)}</div>{activePart && <div className="part-details"><h3>{activePart.name}</h3><dl><dt>Position</dt><dd>{activePart.position.join(", ")}</dd><dt>Size</dt><dd>{activePart.size.join(" × ")}</dd><dt>Material</dt><dd>{activePart.material}</dd><dt>Anchored</dt><dd>{activePart.anchored ? "Yes" : "No"}</dd></dl></div>}</aside></div>}
        {tab === "code" && <div className="code-layout"><nav className="file-list" aria-label="Script files">{files.map((file) => <button key={file.path} className={selectedFile === file.path ? "active" : ""} onClick={() => setSelectedFile(file.path)}><span className="file-type">{file.path.endsWith(".server.luau") ? "S" : file.path.endsWith(".client.luau") ? "C" : "M"}</span>{file.path}</button>)}</nav><div className="editor-panel"><div className="editor-heading"><code>{selectedFile}</code><span>Luau</span><button disabled={!dirty || !!busy} onClick={() => void save()}>Save scripts</button></div><label className="sr-only" htmlFor="source-editor">Luau source for {selectedFile}</label><textarea id="source-editor" className="source-editor" value={activeFile?.source || ""} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={!!busy} onChange={(event) => setFiles(files.map((f) => f.path === selectedFile ? { ...f, source: event.target.value } : f))} /><div className="editor-footer">{activeFile?.source.split("\n").length || 0} lines<span>Code is not executed on your computer.</span></div></div></div>}
        {tab === "guide" && <div className="reading-panel"><h2>How to play</h2><p className="preserve-lines">{game.instructions}</p><h2>Studio test plan</h2><p className="muted">Generated code needs a Studio playtest. Start with these checks.</p><ol className="test-plan">{game.testPlan.map((step, i) => <li key={i}>{step}</li>)}</ol>{game.notes.length > 0 && <><h2>Build notes</h2><ul>{game.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></>}</div>}
        {tab === "plan" && <div className="reading-panel">{game.businessPlan ? <><h2>Audience & hook</h2><p>{game.businessPlan.audience}</p><p>{game.businessPlan.hook}</p><h2>Why players return</h2><p>{game.businessPlan.retentionLoop}</p><h2>Proposed paid offers</h2><p className="muted">These are designs, not active products. Revenue depends on real player response.</p>{game.businessPlan.offers.length === 0 && <p>No paid offers proposed for this game.</p>}{game.businessPlan.offers.map((offer, i) => <article className="business-offer" key={i}><h3>{offer.name} · {offer.purchaseType}</h3><p>{offer.playerValue}</p><p><strong>Free experience: </strong>{offer.freeAlternative}</p><p><strong>Before activation: </strong>{offer.setupRequired}</p></article>)}<h2>What to measure</h2>{game.businessPlan.metrics.map((metric, i) => <article className="business-offer" key={i}><h3>{metric.name}</h3><p>{metric.definition}</p><p>{metric.decision}</p></article>)}<h2>Launch experiments</h2><ol>{game.businessPlan.launchPlan.map((step, i) => <li key={i}>{step}</li>)}</ol></> : <><h2>No game plan saved yet</h2><p>Build a new game or ask for an update to generate an audience, retention, monetization, and launch plan.</p></>}</div>}
        {tab === "history" && <div className="history-list">{[...project!.revisions].reverse().map((r, i) => <article key={r.id}><div className="revision-number">{String(project!.revisions.length - i).padStart(2, "0")}</div><div><h2>{r.summary}</h2><p>{r.prompt}</p><small>{new Date(r.createdAt).toLocaleString()}</small></div>{i === 0 ? <span className="current-revision">Current</span> : <button disabled={locked} onClick={() => void restore(r.id)}>Restore</button>}</article>)}</div>}
        {tab === "export" && <div className="export-panel"><div><span className="eyebrow">TAKE YOUR GAME WITH YOU</span><h2>From here to Studio.</h2><p>Your world and scripts travel together. No plugin required.</p><ol className="export-steps"><li><strong>Download your place</strong><p>A .rbxlx file containing the map, server scripts, client scripts, and shared modules.</p></li><li><strong>Open it in Roblox Studio</strong><p>Choose File → Open from File and select the downloaded .rbxlx.</p></li><li><strong>Press Play and test</strong><p>Follow the Play & test checklist. Review scripts before publishing to Roblox.</p></li></ol><button className="primary export-primary" disabled={locked} onClick={() => void download("rbxlx")}>↓ Download Studio place</button></div><aside className="export-extras"><h3>Keep building</h3><p>Prefer files and live sync? The source ZIP includes every script, the world model, a Rojo project, and setup instructions.</p><button disabled={locked} onClick={() => void download("zip")}>↓ Download Rojo source ZIP</button><hr /><h3>Back up your project</h3><p>Import this JSON file into Studsmith to keep editing on another computer. Contains the current game, without revision history.</p><button disabled={locked} onClick={() => void download("json")}>↓ Download project backup</button></aside></div>}
      </section>}
      <div className={`composer-wrap ${!game ? "composer-home" : ""}`}><form className="composer" onSubmit={generate}><label htmlFor="game-prompt">{game ? "What should we change?" : "Describe your game"}</label><textarea ref={promptInput} id="game-prompt" placeholder={game ? "Add moving platforms, a shop, a new level…" : "A floating-island obstacle course with checkpoints and a race timer…"} value={prompt} maxLength={12000} rows={3} disabled={!!busy || loadingProject} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="composer-bottom"><div><label className="sr-only" htmlFor="ai-tier">AI model tier</label><select id="ai-tier" value={tier} disabled={!!busy} onChange={(event) => setTier(event.target.value)}><option value="publik-smart">Publik Smart</option><option value="publik-balanced">Publik Balanced</option></select><span className="composer-hint">3–5 AI calls per build · {gate.provider === "own_key" ? "Your provider" : "Publik balance"}</span></div><button className="primary" type="submit" disabled={!!busy || loadingProject || dirty}>{busy ? busy : game ? "Build changes ↑" : "Build game ↑"}</button></div>{busy.includes("game") && <div className="generation-status" role="status"><span className="working-dot" />Designing, building, and reviewing your game. Allow up to 6 minutes.<button className="text-button" type="button" onClick={() => abortRef.current?.abort()}>Stop waiting</button></div>}</form><p className="composer-footnote">{dirty ? "Save edits before building changes." : "⌘ / Ctrl + Enter to build"}<span>Made for Roblox · Built with Publik</span></p></div>
    </main>
  </div>;
}
