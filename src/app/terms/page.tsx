import type { Metadata } from "next";
import Link from "next/link";
import { LegalLinks, Logo, NOT_AFFILIATED } from "@/components/brand";

export const metadata: Metadata = { title: "Terms · Studsmith", description: "The plain-English terms for using Studsmith." };

export default function Terms() {
  return <main className="doc-page">
    <Link href="/" className="doc-home" aria-label="Studsmith home"><Logo /></Link>
    <span className="eyebrow">TERMS</span>
    <h1>The terms, in plain English.</h1>
    <p className="doc-lede">By using Studsmith you agree to these terms. If you don’t agree, don’t use it.</p>
    <h2>Provided as is</h2>
    <p>Studsmith is open-source software provided as is, without warranties of any kind. It may change, break, or stop being available.</p>
    <h2>AI output can be wrong</h2>
    <p>Games, maps, and scripts are written by AI and can contain bugs, broken gameplay, or code that doesn’t do what it says. Test everything in Roblox Studio before you publish. The AI check reads the project; it is not a playtest and doesn’t guarantee the game works or is fun.</p>
    <h2>No promised earnings</h2>
    <p>Game plans, offers, and launch ideas are suggestions. Studsmith doesn’t promise players, Robux, or income.</p>
    <h2>What you publish</h2>
    <p>You are responsible for what you publish and for following Roblox’s Terms of Use and Community Standards. Review generated content before anyone else plays it.</p>
    <h2>Paying for AI</h2>
    <p>AI usage is billed by your provider: Publik, or OpenAI if you use your own key. A build uses about $1 of AI usage, sometimes more. Studsmith doesn’t charge you and can’t refund AI usage, including builds that fail or are stopped. Billing questions go to your provider.</p>
    <h2>Age</h2>
    <p>People under 13 should use Studsmith with a parent or guardian. Paying for a plan or API key requires an adult.</p>
    <h2>Roblox</h2>
    <p>{NOT_AFFILIATED}</p>
    <h2>Contact</h2>
    <p>Open an issue at <a href="https://github.com/jibberswrld/studsmith/issues" target="_blank" rel="noreferrer">github.com/jibberswrld/studsmith</a>.</p>
    <footer className="gate-footer"><p className="legal-links"><Link href="/">Studsmith</Link><LegalLinks /></p></footer>
  </main>;
}
