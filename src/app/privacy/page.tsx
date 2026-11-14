import type { Metadata } from "next";
import Link from "next/link";
import { LegalLinks, Logo, NOT_AFFILIATED } from "@/components/brand";

export const metadata: Metadata = { title: "Privacy · Studsmith", description: "What Studsmith does with your prompts, projects, and session." };

export default function Privacy() {
  return <main className="doc-page">
    <Link href="/" className="doc-home" aria-label="Studsmith home"><Logo /></Link>
    <span className="eyebrow">PRIVACY</span>
    <h1>What happens to your data.</h1>
    <p className="doc-lede">Studsmith is a small open-source app. It has no database and no accounts of its own. This page describes what the code does.</p>
    <h2>Your prompts and projects</h2>
    <p>When you build or change a game, your prompt and the current project source (map and scripts) are sent through Studsmith’s server to the AI provider you chose: Publik, or OpenAI with your own key. That provider processes them under its own privacy policy. Studsmith’s server passes them along and does not keep them.</p>
    <h2>Where projects are stored</h2>
    <p>Projects, revisions, and unsaved script edits are stored only in this browser, using its site storage. Studsmith asks the browser to keep that storage, but clearing site data, private browsing, or low device storage can still erase it. Download a JSON backup from the Export tab to keep a copy. There is no cloud sync.</p>
    <h2>Publik</h2>
    <p>Signing in with Publik creates a Publik install for this browser. Publik receives usage events (app opened, active session) with an install ID and the app version, but no prompts or project content. Publik handles your account, plan, and payments.</p>
    <h2>Your session</h2>
    <p>Your Publik key, and your own OpenAI key if you add one, are kept in an encrypted, HttpOnly cookie in your browser. Page scripts can’t read it. Studsmith’s server decrypts it only to make the requests you ask for. Signing out deletes the cookie.</p>
    <h2>What Studsmith’s server keeps</h2>
    <p>Nothing. There is no database, analytics, or advertising. The hosting provider (Vercel) may keep standard request logs, such as IP addresses and times. Fonts load from Google Fonts, so Google sees your IP address when the page opens.</p>
    <h2>Children</h2>
    <p>People under 13 should use Studsmith with a parent or guardian. Paying for AI usage requires an adult.</p>
    <h2>Questions</h2>
    <p>Open an issue at <a href="https://github.com/jibberswrld/studsmith/issues" target="_blank" rel="noreferrer">github.com/jibberswrld/studsmith</a>. The source code shows exactly what is sent where.</p>
    <footer className="gate-footer"><p className="legal-links"><Link href="/">Studsmith</Link><LegalLinks /></p><p>{NOT_AFFILIATED}</p></footer>
  </main>;
}
