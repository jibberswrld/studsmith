"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { listProjects, loadProject, createProject, appendRevision, requestPersistentStorage } from "@/lib/storage";
import { placeXml, sourceZip } from "@/lib/export";
import { BUILD_ESTIMATE, BUILD_ESTIMATE_MICROS, current, dollars, DRAFT_SUMMARY, exportName, needsReview, STARTER_PROMPTS, type BuildEvent, type Game, type GameFile, type Project, type ProjectSummary } from "@/lib/project";
import { LegalLinks, Logo, NOT_AFFILIATED } from "./brand";
import GatePage, { type GateState as Gate } from "./gate";

const Scene = dynamic(() => import("./scene"), { ssr: false, loading: () => <div className="scene-loading">Opening 3D preview…</div> });
type Failure = { message: string; topUpUrl?: string | null };
type Tab = "preview" | "code" | "guide" | "history" | "export" | "plan";
type StageEvent = Extract<BuildEvent, { type: "stage" }>;
type BuildResult = Extract<BuildEvent, { type: "result" }>;
const OFFLINE: Failure = { message: "Couldn’t reach Studsmith. Check your connection and try again." };
const CUT_OFF: Failure = { message: "The connection closed before the build finished, so nothing was saved. AI usage already spent isn’t refunded. Keep this tab open and the screen on while a build runs." };
const BACKUP_NOTICE_KEY = "studsmith-backup-notice-dismissed";

/** A readable error from any response, including platform HTML pages such as a 504. */
async function readError(response: Response): Promise<Failure> {
  const text = await response.text().catch(() => "");
  try { const body = JSON.parse(text); if (typeof body?.error?.message === "string") return body.error; } catch { /* not JSON */ }
  if (response.status === 504 || response.status === 408) return { message: "The server ran out of time and closed the connection. Nothing from this request was saved. Try again, or start with a smaller game." };
  return { message: `Studsmith’s server sent an unexpected response (${response.status}). Try again in a moment.` };
}
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } }).catch(() => { throw OFFLINE; });
  if (!response.ok) throw await readError(response);
  try { return await response.json(); } catch { throw { message: "Studsmith’s server sent an unreadable response. Try again." }; }
}
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
/** POST /api/generate and follow its newline-delimited JSON stream until the final result. */
async function streamBuild(body: unknown, signal: AbortSignal, onStage: (event: StageEvent) => void): Promise<BuildResult> {
  const response = await fetch("/api/generate", { ...post(body), headers: { "Content-Type": "application/json" }, signal }).catch((e) => { throw signal.aborted ? e : OFFLINE; });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("ndjson")) throw await readError(response);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "", final: BuildEvent | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!line) continue;
        let event: BuildEvent;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "stage") onStage(event);
        // Stop at the terminal event, so a connection reset after it can't discard the result.
        else if (event.type === "result" || event.type === "error") { final = event; break; }
      }
      if (final) break;
    }
  } catch (e) { if (final) { /* already have the result */ } else if (signal.aborted) throw e; else throw CUT_OFF; }
  finally { reader.cancel().catch(() => {}); }
  if (!final) throw CUT_OFF;
  if (final.type === "error") throw final.error;
  return final as BuildResult;
}
const STAGE_LABEL: Record<StageEvent["stage"], string> = { design: "Design", build: "Build map and scripts", review: "AI check", repair: "Repair" };
function BuildProgress({ events }: { events: StageEvent[] }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const repairs = events.filter((e) => e.stage === "repair" && e.status === "started").length;
  const steps: [StageEvent["stage"], number][] = [["design", 1], ["build", 1], ["review", 1]];
  for (let n = 1; n <= repairs; n++) steps.push(["repair", n], ["review", n + 1]);
  const has = (stage: string, attempt: number, status: string) => events.some((e) => e.stage === stage && e.attempt === attempt && e.status === status);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return <div className="build-progress">
    <ol>{steps.map(([stage, attempt]) => { const done = has(stage, attempt, "finished"), active = !done && has(stage, attempt, "started");
      return <li key={`${stage}${attempt}`} className={done ? "done" : active ? "active" : ""}>{done ? <span aria-hidden="true">✓</span> : active ? <span className="working-dot" /> : <span aria-hidden="true">·</span>}{STAGE_LABEL[stage]}{stage === "repair" ? ` ${attempt}` : stage === "review" && attempt > 1 ? " again" : ""}<span className="sr-only">{done ? " (done)" : active ? " (in progress)" : " (waiting)"}</span></li>; })}</ol>
    <p><span className="elapsed">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span> Usually 4–8 minutes. Keep this tab open and the screen on. Leaving, reloading, or switching apps for long can stop the build, and AI usage already spent isn’t refunded.</p>
  </div>;
}

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
  const [notice, setNotice] = useState("");
  const [stages, setStages] = useState<StageEvent[] | null>(null);
  const [backupNotice, setBackupNotice] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const revision = project ? current(project) : null;
  const game = revision?.game;
  const dirty = !!game && JSON.stringify(files) !== JSON.stringify(game.files);
  const locked = !!busy || loadingProject || dirty;
  const building = stages !== null;
  const lowBalance = gate?.provider === "publik" && typeof gate.balanceMicros === "number" && gate.balanceMicros < BUILD_ESTIMATE_MICROS;

  const refreshGate = useCallback(async () => {
    try { setGate(await api<Gate>("/api/publik")); }
    catch (e) { setGate({ state: "unreachable", title: "Publik isn’t reachable right now.", body: (e as Failure).message || "Check your connection." }); }
  }, []);
  useEffect(() => {
    let active = true;
    api<Gate>("/api/publik").then((value) => { if (active) setGate(value); }).catch((e) => { if (active) setGate({ state: "unreachable", title: "Publik isn’t reachable right now.", body: (e as Failure).message || "Check your connection." }); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (gate?.state !== "sign_in" && gate?.state !== "choose") return;
    const end = Date.now() + 10 * 60 * 1000;
    const timer = setInterval(() => { if (Date.now() > end) clearInterval(timer); else if (!document.hidden) void refreshGate(); }, 3000);
    // Coming back from the Publik tab updates the gate right away.
    const back = () => { if (!document.hidden) void refreshGate(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [gate?.state, refreshGate]);
  useEffect(() => {
    if (gate?.state !== "ready") return;
    void listProjects(gate.workspace!).then(setProjects).catch((e) => setFailure(e));
    void api("/api/publik", post({ action: "telemetry", event: "app_opened" })).catch(() => {});
    const timer = setInterval(() => { if (!document.hidden) void api("/api/publik", post({ action: "telemetry", event: "active_session" })).catch(() => {}); }, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [gate?.state, gate?.workspace]);
  // A Publik user who left to buy a plan (or top up) comes back to a fresh balance, even while Build is blocked.
  useEffect(() => {
    if (gate?.state !== "ready" || gate.provider !== "publik") return;
    const back = () => { if (!document.hidden) void refreshGate(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [gate?.state, gate?.provider, refreshGate]);
  // While a build runs: hold a screen wake lock where supported, and warn before the tab is closed or reloaded.
  useEffect(() => {
    if (!building) return;
    let lock: WakeLockSentinel | null = null, active = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      try { lock = await navigator.wakeLock.request("screen"); if (!active) void lock.release(); } catch { /* Low battery or unsupported. */ }
    };
    const visible = () => { if (document.visibilityState === "visible") void acquire(); };
    const leaving = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    void acquire();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("beforeunload", leaving);
    return () => { active = false; document.removeEventListener("visibilitychange", visible); window.removeEventListener("beforeunload", leaving); void lock?.release().catch(() => {}); };
  }, [building]);
  useEffect(() => {
    if (!dirty || !project || !revision) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, project, revision]);
  useEffect(() => {
    if (!project || !revision) return;
    try {
      if (dirty) localStorage.setItem(`studsmith-draft-${gate?.workspace}-${project.id}`, JSON.stringify({ baseRevision: revision.id, files }));
      else localStorage.removeItem(`studsmith-draft-${gate?.workspace}-${project.id}`);
    } catch { /* Saved project data is in IndexedDB; browser draft storage may be unavailable. */ }
  }, [files, dirty, project, revision, gate?.workspace]);

  const acceptProject = (p: Project) => {
    setProject(p); setFiles(current(p).game.files); setSelectedFile(current(p).game.files[0]?.path || ""); setSelectedPart(null);
    history.replaceState(null, "", `/?project=${p.id}`);
  };
  const refreshProjects = async () => { setProjects(await listProjects(gate!.workspace!)); };
  const receiveProject = useCallback((p: Project) => {
      acceptProject(p);
      try {
        const draft = localStorage.getItem(`studsmith-draft-${gate?.workspace}-${p.id}`);
        if (draft) {
          const parsed = JSON.parse(draft);
          if (parsed.baseRevision === current(p).id && Array.isArray(parsed.files)) { setFiles(parsed.files); setNotice("Recovered your unsaved script edits. Save them to create a revision."); }
          else setNotice("An older browser draft exists. The project has newer saved revisions.");
        }
      } catch {
        setNotice("Browser draft storage is unavailable. Saved project revisions are in browser storage.");
      }
  }, [gate?.workspace]);
  const load = useCallback(async (id: string) => {
    setLoadingProject(true); setFailure(null); setNotice("");
    try {
      receiveProject(await loadProject(gate!.workspace!, id));
    } catch (e) { setFailure(e as Failure); }
    finally { setLoadingProject(false); }
  }, [receiveProject, gate]);
  const initialLoaded = useRef(false);
  useEffect(() => {
    if (gate?.state !== "ready" || initialLoaded.current) return;
    initialLoaded.current = true;
    const id = new URLSearchParams(location.search).get("project");
    if (id) loadProject(gate.workspace!, id).then(receiveProject).catch((e) => setFailure(e));
  }, [gate?.state, gate?.workspace, receiveProject]);

  async function choose(choice: string, ownKey?: { baseURL: string; apiKey: string; model: string }) {
    setBusy("Connecting AI"); setFailure(null);
    try { setGate(await api<Gate>("/api/publik", post({ action: "choice", choice, ownKey }))); }
    catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  /** Creates this browser's Publik install only now, then opens Publik's sign-in in a new tab. */
  async function signIn() {
    // Open the tab inside the click so popup blockers allow it; point it at Publik once the link exists.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setBusy("Opening Publik"); setFailure(null);
    try {
      const next = await api<Gate>("/api/publik", post({ action: "sign_in" }));
      setGate(next);
      if (!next.claimUrl) { tab?.close(); return false; }
      if (tab) tab.location.href = next.claimUrl; else location.href = next.claimUrl;
      return true;
    } catch (e) { tab?.close(); setFailure(e as Failure); return false; }
    finally { setBusy(""); }
  }
  function saved() {
    void requestPersistentStorage();
    try { if (!localStorage.getItem(BACKUP_NOTICE_KEY)) setBackupNotice(true); } catch { setBackupNotice(true); }
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (dirty) { setFailure({ message: "Save your script edits before asking for changes." }); return; }
    if (prompt.trim().length < (project ? 3 : 10)) { setFailure({ message: project ? "Describe the change in at least 3 characters." : "Describe your game in at least 10 characters." }); promptInput.current?.focus(); return; }
    const controller = new AbortController(); abortRef.current = controller;
    setBusy(project ? "Updating your game…" : "Building your game…"); setFailure(null); setNotice("");
    setStages([]);
    requestAnimationFrame(() => promptInput.current?.form?.scrollIntoView({ block: "end", behavior: "smooth" }));
    try {
      const { game: built, draft } = await streamBuild({ currentGame: game || null, prompt, tier }, controller.signal, (stage) => setStages((list) => [...(list || []), stage]));
      const summary = draft ? DRAFT_SUMMARY : project ? "Updated game" : "Created project";
      const p = project ? await appendRevision(gate!.workspace!, project.id, revision!.id, built, prompt, summary, !!draft) : await createProject(gate!.workspace!, built, prompt, summary, !!draft);
      acceptProject(p); setPrompt(""); setTab(draft ? "guide" : "preview");
      // The draft banner explains a draft; only a balance problem needs the extra message and its top-up link.
      if (draft?.topUpUrl) setFailure({ message: `Saved as a draft. ${draft.reason}`, topUpUrl: draft.topUpUrl });
      else if (!draft) setNotice("Project saved. Review its scripts and playtest in Studio before publishing.");
      saved();
      await refreshProjects();
    } catch (e) { setFailure(controller.signal.aborted ? { message: "Build stopped. Your saved project is unchanged." } : e as Failure); }
    finally { setBusy(""); setStages(null); abortRef.current = null; void refreshGate(); }
  }
  async function importGame(value: unknown) {
    setBusy("Importing project…"); setFailure(null);
    try { acceptProject(await createProject(gate!.workspace!, value as Game, "Imported project")); setTab("preview"); await refreshProjects(); }
    catch (e) {
      const issue = (e as { issues?: { path: PropertyKey[]; message: string }[] }).issues?.[0];
      setFailure(issue ? { message: `That file isn’t a Studsmith project backup, so nothing was imported. First problem${issue.path.length ? ` at ${issue.path.join(".")}` : ""}: ${issue.message}` } : e as Failure);
    }
    finally { setBusy(""); }
  }
  async function save() {
    if (!project || !revision) return;
    setBusy("Saving scripts…"); setFailure(null);
    try {
      const p = await appendRevision(gate!.workspace!, project.id, revision.id, { ...game!, files }, "Manual script edits", "Saved script edits", needsReview(revision));
      setProject(p); setNotice("Scripts saved as a new revision."); await refreshProjects();
    } catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  async function restore(id: string) {
    if (!project || !revision) return;
    setBusy("Restoring revision…"); setFailure(null);
    try { const target = project.revisions.find((r) => r.id === id);
      if (!target) throw new Error("Revision not found.");
      acceptProject(await appendRevision(gate!.workspace!, project.id, revision.id, target.game, "Restored previous revision", "Restored previous revision", needsReview(target))); setNotice("Restored as a new revision. Your previous versions are still in history."); await refreshProjects(); }
    catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  async function download(format: string) {
    if (!project || dirty) return;
    setFailure(null); setBusy("Preparing download…");
    try {
      const data = format === "zip" ? sourceZip(game!).slice().buffer as ArrayBuffer : format === "json" ? JSON.stringify(game, null, 2) : placeXml(game!);
      const url = URL.createObjectURL(new Blob([data], { type: format === "zip" ? "application/zip" : format === "json" ? "application/json" : "application/xml" }));
      const a = document.createElement("a"); a.href = url; a.download = `${exportName(game!.title)}.${format}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(`Downloaded ${format === "rbxlx" ? "Studio place" : format === "zip" ? "Rojo source ZIP" : "project backup"}.`);
      if (format === "json") dismissBackupNotice();
    } catch (e) { setFailure(e as Failure); }
    finally { setBusy(""); }
  }
  function dismissBackupNotice() { setBackupNotice(false); try { localStorage.setItem(BACKUP_NOTICE_KEY, "1"); } catch { /* storage unavailable */ } }
  const errorBox = failure && <div className="error-message" role="alert"><span>{failure.message || "Something went wrong. Try again."}</span>{failure.topUpUrl && <a href={failure.topUpUrl} target="_blank" rel="noreferrer">Top up</a>}<button className="text-button" aria-label="Dismiss error" onClick={() => setFailure(null)}>×</button></div>;

  if (!gate || gate.state !== "ready") return <GatePage gate={gate} busy={!!busy} errorBox={errorBox} onSignIn={signIn} onChoose={(choice, ownKey) => void choose(choice, ownKey)} onRetry={() => void refreshGate()} />;

  const activePart = game?.parts.find((p) => p.id === selectedPart);
  const activeFile = files.find((f) => f.path === selectedFile);
  return <div className="app-shell">
    <aside className="sidebar"><Logo /><button className="new-project" disabled={locked} onClick={() => { setProject(null); setFiles([]); setPrompt(""); setFailure(null); setNotice(""); history.replaceState(null, "", "/"); }}>＋ New game</button><div className="sidebar-heading">YOUR PROJECTS <span>{projects.length}</span></div><nav aria-label="Projects">{projects.length === 0 && <p className="sidebar-empty">Your first world starts with an idea.</p>}{projects.map((p) => <button className={`project-link ${p.id === project?.id ? "active" : ""}`} key={p.id} disabled={locked} onClick={() => void load(p.id)}><span className="project-icon" aria-hidden="true">◇</span><span><strong>{p.title}</strong><small>{p.needsReview ? "Needs review · " : ""}{p.revisionCount} revision{p.revisionCount === 1 ? "" : "s"}</small></span></button>)}</nav><div className="sidebar-bottom"><input hidden type="file" accept=".json,application/json" ref={importInput} onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.size > 3 * 1024 * 1024) { setFailure({ message: "Choose a Studsmith JSON backup smaller than 3 MB." }); return; } try { await importGame(JSON.parse(await file.text())); } catch { setFailure({ message: "That isn't a valid JSON backup. Export a project backup from Studsmith first." }); } }} /><button disabled={locked} onClick={() => importInput.current?.click()}>↥ Import project</button><button disabled={locked} onClick={async () => { setFailure(null); try { setGate(await api<Gate>("/api/publik", post({ action: "settings" }))); } catch (e) { setFailure(e as Failure); } }}>AI settings <span>↗</span></button><button disabled={locked} onClick={async () => { try { await api("/api/publik", post({ action: "sign_out" })); setProject(null); setFiles([]); setProjects([]); setPrompt(""); setNotice(""); initialLoaded.current = false; history.replaceState(null, "", "/"); await refreshGate(); } catch (e) { setFailure(e as Failure); } }}>Sign out</button><div className="account"><span className="account-dot" />{gate.handle ? `@${gate.handle}` : "Connected to Publik"}<small>{gate.provider === "own_key" ? "Own provider" : "Publik connected"}</small></div></div></aside>
    <main className="main-workspace"><header className="topbar"><div><span className="breadcrumb">Workspace</span><span className="separator">/</span><strong>{game?.title || "New game"}</strong>{dirty && <span className="unsaved">Unsaved edits</span>}</div><span className="local-label"><span /> Saved in this browser only</span></header>
      <div className="messages">{gate.testMode && <div className="notice">Local test mode: AI responses use a fixture. No live Publik account is connected.</div>}{errorBox}{notice && <div className="notice" role="status">{notice}<button className="text-button" aria-label="Dismiss notice" onClick={() => setNotice("")}>×</button></div>}{backupNotice && game && <div className="notice backup-notice" role="status"><span>This game is saved only in this browser. Clearing site data, private browsing, or a full phone can erase it. Download a backup to keep a copy.</span><button disabled={locked} onClick={() => void download("json")}>Download backup</button><button className="text-button" aria-label="Dismiss backup reminder" onClick={dismissBackupNotice}>×</button></div>}{revision && needsReview(revision) && !dirty && <div className="draft-banner"><span><strong>{DRAFT_SUMMARY}.</strong> The AI check didn’t pass or didn’t finish on this version. Read Build notes, ask for fixes below, and test in Studio.</span>{tab !== "guide" && <button onClick={() => setTab("guide")}>See findings</button>}</div>}{dirty && <div className="draft-banner"><span>Save your script edits before generating, exporting, or switching projects.</span><button disabled={!!busy} onClick={() => void save()}>Save edits</button><button disabled={!!busy} onClick={() => setFiles(game!.files)}>Discard edits</button></div>}</div>
      {loadingProject ? <div className="empty-state" role="status">Opening project…</div> : !game ? <section className="welcome"><div className="welcome-icon" aria-hidden="true">▱</div><span className="eyebrow">YOUR NEXT GAME STARTS HERE</span><h1>Imagine it.<br /><span>Build it in studs.</span></h1><p>Describe a world, its rules, and what makes it fun.<br />Get real Luau scripts and a place you can open in Studio.</p><div className="starter-list">{STARTER_PROMPTS.map((s, i) => <button disabled={!!busy} key={s.title} onClick={() => { setPrompt(s.prompt); promptInput.current?.focus(); }}><span className="starter-number">0{i + 1}</span><span>{s.title}</span><span aria-hidden="true">↗</span></button>)}</div></section> : <section className="project-workspace"><div className="project-heading"><div><span className="eyebrow">{game.parts.length} PARTS · {game.files.length} SCRIPTS · REVISION {project!.revisions.length}</span><h1>{game.title}</h1><p>{game.description}</p></div><button className="primary" disabled={locked} onClick={() => setTab("export")}>Export to Studio ↗</button></div><nav className="tabs" aria-label="Project views">{([ ["preview", "Scene"], ["code", "Scripts"], ["guide", "Play & test"], ["plan", "Game plan"], ["history", "History"], ["export", "Export"] ] as [Tab, string][]).map(([value, label]) => <button key={value} aria-current={tab === value ? "page" : undefined} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
        {tab === "preview" && <div className="preview-layout"><div className="preview-main"><div className="preview-label"><span className="status-dot" />Static scene preview<span>Play scripts in Roblox Studio</span></div><Scene game={game} selected={selectedPart} onSelect={setSelectedPart} /></div><aside className="inspector"><h2>World <span>{game.parts.length}</span></h2><div className="part-list">{game.parts.map((p) => <button key={p.id} className={selectedPart === p.id ? "selected" : ""} onClick={() => setSelectedPart(p.id)}><span className="part-swatch" style={{ background: p.color }} />{p.name}<small>{p.kind}</small></button>)}</div>{activePart && <div className="part-details"><h3>{activePart.name}</h3><dl><dt>Position</dt><dd>{activePart.position.join(", ")}</dd><dt>Size</dt><dd>{activePart.size.join(" × ")}</dd><dt>Material</dt><dd>{activePart.material}</dd><dt>Anchored</dt><dd>{activePart.anchored ? "Yes" : "No"}</dd></dl></div>}</aside></div>}
        {tab === "code" && <div className="code-layout"><nav className="file-list" aria-label="Script files">{files.map((file) => <button key={file.path} className={selectedFile === file.path ? "active" : ""} onClick={() => setSelectedFile(file.path)}><span className="file-type">{file.path.endsWith(".server.luau") ? "S" : file.path.endsWith(".client.luau") ? "C" : "M"}</span>{file.path}</button>)}</nav><div className="editor-panel"><div className="editor-heading"><code>{selectedFile}</code><span>Luau</span><button disabled={!dirty || !!busy} onClick={() => void save()}>Save scripts</button></div><label className="sr-only" htmlFor="source-editor">Luau source for {selectedFile}</label><textarea id="source-editor" className="source-editor" value={activeFile?.source || ""} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={!!busy} onChange={(event) => setFiles(files.map((f) => f.path === selectedFile ? { ...f, source: event.target.value } : f))} /><div className="editor-footer">{activeFile?.source.split("\n").length || 0} lines<span>Code is not executed on your computer.</span></div></div></div>}
        {tab === "guide" && <div className="reading-panel"><h2>How to play</h2><p className="preserve-lines">{game.instructions}</p><h2>Studio test plan</h2><p className="muted">Generated code needs a Studio playtest. Start with these checks.</p><ol className="test-plan">{game.testPlan.map((step, i) => <li key={i}>{step}</li>)}</ol>{game.notes.length > 0 && <><h2>Build notes</h2><ul>{game.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></>}</div>}
        {tab === "plan" && <div className="reading-panel">{game.businessPlan ? <><h2>Audience & hook</h2><p>{game.businessPlan.audience}</p><p>{game.businessPlan.hook}</p><h2>Why players return</h2><p>{game.businessPlan.retentionLoop}</p><h2>Proposed paid offers</h2><p className="muted">These are designs, not active products. Revenue depends on real player response.</p>{game.businessPlan.offers.length === 0 && <p>No paid offers proposed for this game.</p>}{game.businessPlan.offers.map((offer, i) => <article className="business-offer" key={i}><h3>{offer.name} · {offer.purchaseType}</h3><p>{offer.playerValue}</p><p><strong>Free experience: </strong>{offer.freeAlternative}</p><p><strong>Before activation: </strong>{offer.setupRequired}</p></article>)}<h2>What to measure</h2>{game.businessPlan.metrics.map((metric, i) => <article className="business-offer" key={i}><h3>{metric.name}</h3><p>{metric.definition}</p><p>{metric.decision}</p></article>)}<h2>Launch experiments</h2><ol>{game.businessPlan.launchPlan.map((step, i) => <li key={i}>{step}</li>)}</ol></> : <><h2>No game plan saved yet</h2><p>Build a new game or ask for an update to generate an audience, retention, monetization, and launch plan.</p></>}</div>}
        {tab === "history" && <div className="history-list">{[...project!.revisions].reverse().map((r, i) => <article key={r.id}><div className="revision-number">{String(project!.revisions.length - i).padStart(2, "0")}</div><div><h2>{r.summary}</h2><p>{r.prompt}</p><small>{new Date(r.createdAt).toLocaleString()}</small></div>{i === 0 ? <span className="current-revision">Current</span> : <button disabled={locked} onClick={() => void restore(r.id)}>Restore</button>}</article>)}</div>}
        {tab === "export" && <div className="export-panel"><div><span className="eyebrow">TAKE YOUR GAME WITH YOU</span><h2>From here to Studio.</h2><p>Your world and scripts travel together. No plugin required.</p><ol className="export-steps"><li><strong>Download your place</strong><p>A .rbxlx file containing the map, server scripts, client scripts, and shared modules.</p></li><li><strong>Open it in Roblox Studio</strong><p>Choose File → Open from File and select the downloaded .rbxlx.</p></li><li><strong>Press Play and test</strong><p>Follow the Play & test checklist. Review scripts before publishing to Roblox.</p></li></ol><button className="primary export-primary" disabled={locked} onClick={() => void download("rbxlx")}>↓ Download Studio place</button></div><aside className="export-extras"><h3>Keep building</h3><p>Prefer files and live sync? The source ZIP includes every script, the world model, a Rojo project, and setup instructions.</p><button disabled={locked} onClick={() => void download("zip")}>↓ Download Rojo source ZIP</button><hr /><h3>Back up your project</h3><p>Import this JSON file into Studsmith to keep editing on another computer. Contains the current game, without revision history.</p><button disabled={locked} onClick={() => void download("json")}>↓ Download project backup</button></aside></div>}
      </section>}
      <div className={`composer-wrap ${!game ? "composer-home" : ""}`}><form className="composer" onSubmit={generate}><label htmlFor="game-prompt">{game ? "What should we change?" : "Describe your game"}</label><textarea ref={promptInput} id="game-prompt" placeholder={game ? "Add moving platforms, a shop, a new level…" : "A floating-island obstacle course with checkpoints and a race timer…"} value={prompt} maxLength={12000} rows={3} disabled={!!busy || loadingProject} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="composer-bottom"><div><label className="sr-only" htmlFor="ai-tier">AI model tier</label><select id="ai-tier" value={tier} disabled={!!busy} onChange={(event) => setTier(event.target.value)}><option value="publik-smart">Publik Smart</option><option value="publik-balanced">Publik Balanced</option></select><span className="composer-hint">3–7 AI calls per build</span></div><div className="build-action"><span className={`build-cost ${lowBalance ? "low" : ""}`}>{lowBalance ? <>Balance {dollars(gate.balanceMicros!)}: not enough for a build. {gate.topUpUrl && <a href={gate.topUpUrl} target="_blank" rel="noreferrer">Get a plan ↗</a>}</> : <>About {BUILD_ESTIMATE} per build{gate.provider === "own_key" ? ", billed by your provider" : typeof gate.balanceMicros === "number" ? ` · balance ${dollars(gate.balanceMicros)}` : ""}</>}</span><button className="primary" type="submit" disabled={!!busy || loadingProject || dirty || lowBalance}>{busy ? busy : game ? "Build changes ↑" : "Build game ↑"}</button></div></div>{building && <div className="generation-status" role="status"><BuildProgress events={stages} /><button className="text-button" type="button" onClick={() => abortRef.current?.abort()}>Stop build</button></div>}</form><div className="composer-footnote"><span>{dirty ? "Save edits before building changes." : "⌘ / Ctrl + Enter to build"}</span><span className="legal-links">Exports to Roblox Studio · Built with Publik · <LegalLinks /></span></div><p className="disclaimer">{NOT_AFFILIATED}</p></div>
    </main>
  </div>;
}
