export type PublikOS = "macos" | "windows" | "linux";

export function osFromUA(ua: string): PublikOS {
  if (/Windows/i.test(ua)) return "windows";
  if (/Android|CrOS/i.test(ua)) return "linux";
  if (/Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua)) return "macos";
  return "linux";
}

export function deviceName(ua: string): string {
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? "Edge" : /Firefox\/|FxiOS\//i.test(ua) ? "Firefox" : /Chrome\/|CriOS\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : "Browser";
  const os = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /iPod/i.test(ua) ? "iPod" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /CrOS/i.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "web";
  return `${browser} on ${os}`.slice(0, 120);
}
