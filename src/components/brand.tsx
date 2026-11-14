import Link from "next/link";

export function Logo() { return <span className="brand"><span className="brand-mark" aria-hidden="true">s</span><span>studsmith<span className="brand-dot">.</span></span></span>; }

export const NOT_AFFILIATED = "Studsmith is not affiliated with or endorsed by Roblox Corporation. Roblox is a trademark of Roblox Corporation.";

export function LegalLinks() {
  return <><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="https://github.com/jibberswrld/studsmith" target="_blank" rel="noreferrer">Source</a></>;
}
