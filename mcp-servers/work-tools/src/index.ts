#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv } from "./env.js";
import type { ToolModule } from "./types.js";
import { outlook } from "./modules/outlook.js";
import { harvest } from "./modules/harvest.js";

// Load env vars (.env.local, ~/.work-tools.env)
loadEnv();

const server = new McpServer({ name: "work-tools", version: "2.0.0" });
const modules: ToolModule[] = [outlook, harvest];

// Register all module tools
for (const mod of modules) mod.register(server);

// Shared warmup — opens browser once for all services that need it
server.tool(
  "warmup",
  "Capture auth tokens for services that need browser auth (opens browser briefly)",
  {},
  async () => {
    const results = await Promise.allSettled(
      modules.filter((m) => m.warmup).map((m) => m.warmup!()),
    );
    const lines = results.map((r) =>
      r.status === "fulfilled" ? r.value : `FAILED: ${r.reason?.message}`,
    );
    const allOk = lines.every((l) => l.includes("OK"));
    return { content: [{ type: "text", text: lines.join("\n") }], isError: !allOk };
  },
);

// Log status and start
for (const mod of modules) {
  mod.status().then((s) => process.stderr.write(`[work-tools] ${s}\n`));
}

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[work-tools] Server ready.\n");
