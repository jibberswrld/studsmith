export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.PUBLIK_SELF_TEST === "1") {
    const { selfTest } = await import("./lib/server/publik");
    const result = await selfTest();
    const { writeSync } = await import("node:fs");
    writeSync(1, `${result}\n`);
    process.exit(result.includes(": ok ") ? 0 : 1);
  }
}
