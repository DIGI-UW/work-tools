import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Load env vars from .env.local (repo root) and ~/.work-tools.env (home fallback).
 * Only sets vars not already in the environment. Call once at startup.
 */
export function loadEnv(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoEnv = resolve(__dirname, "../../../.env.local");
  const homeEnv = resolve(
    process.env.HOME ?? process.env.USERPROFILE ?? "",
    ".work-tools.env",
  );

  for (const path of [repoEnv, homeEnv]) {
    try {
      const lines = readFileSync(path, "utf-8").split("\n");
      for (const line of lines) {
        const match = line.match(
          /^\s*(?:export\s+)?(\w+)\s*=\s*"?([^"]*)"?\s*$/,
        );
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      }
      process.stderr.write(`[work-tools] Loaded env from ${path}\n`);
    } catch {
      // File doesn't exist — that's fine
    }
  }
}
