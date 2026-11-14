import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Studsmith: describe a game, open it in Roblox Studio";
const description = "Describe a game and Studsmith's AI builds the map and Luau scripts, checks them, and gives you a place file for Roblox Studio. Not affiliated with Roblox.";
export const metadata: Metadata = {
  title, description,
  openGraph: { title, description, siteName: "Studsmith", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};
export const viewport: Viewport = { themeColor: "#141a18" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
