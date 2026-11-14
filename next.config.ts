import type { NextConfig } from "next";
const config: NextConfig = { poweredByHeader: false, outputFileTracingIncludes: { "/*": ["./skills/**/SKILL.md", "./publik-app-token.txt"] } };
export default config;
