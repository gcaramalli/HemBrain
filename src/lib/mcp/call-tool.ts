import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { mcpContext, type McpContext } from "./context";
import { registerTools } from "./tools";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;

// Runs one connector tool in-process, as `ctx`, and returns its text. Lets the
// in-app "Ask Hem" buttons read exactly what the family's Claude reads.
export async function callTool(ctx: McpContext, name: string, args: Record<string, unknown> = {}) {
  const handlers = new Map<string, Handler>();
  registerTools({ registerTool: (n: string, _config: unknown, h: Handler) => void handlers.set(n, h) } as unknown as McpServer);
  const handler = handlers.get(name);
  if (!handler) throw new Error(`Unknown tool ${name}`);
  const result = await mcpContext.run(ctx, () => handler(args));
  return result.content.map((c) => c.text).join("\n");
}
