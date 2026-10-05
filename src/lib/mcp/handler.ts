import "server-only";
import { createMcpHandler } from "mcp-handler";
import { mcpContext, resolveToken, type McpContext } from "./context";
import { buildInstructions, registerTools } from "./tools";

function handlerFor(ctx: McpContext) {
  return createMcpHandler(registerTools, {
    serverInfo: { name: "hem-hembrain", version: "1.2.0" },
    instructions: buildInstructions(ctx),
    // The tool list never changes, so no long-lived update streams: they held
    // Vercel functions open until the 300 s timeout.
    maxSubscriptions: 0,
  });
}

// Runs the MCP request for whoever owns this token, or returns null.
export async function serveMcp(request: Request, token: string | null | undefined) {
  const ctx = await resolveToken(token);
  if (!ctx) return null;
  return mcpContext.run(ctx, () => handlerFor(ctx)(request));
}
