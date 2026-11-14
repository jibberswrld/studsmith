import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Studsmith — Build Roblox games", description: "Turn an idea into a playable Roblox prototype. Build with Publik and export directly to Roblox Studio." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
