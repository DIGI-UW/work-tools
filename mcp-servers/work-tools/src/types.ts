import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Every service module implements this interface. Drop in a new file, done. */
export interface ToolModule {
  name: string;
  register(server: McpServer): void;
  status(): Promise<string>;
  warmup?(): Promise<string>;
}
