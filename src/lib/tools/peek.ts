import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import type { Tool, ToolExecutionOptions } from "ai";

const DEFAULT_PEEK_URL = "https://mcp.peek.com";
const CONNECT_TIMEOUT_MS = 5_000;

let peekPromise: Promise<{
  tools: Record<string, Tool>;
  close: () => void | Promise<void>;
}> | null = null;

function peekMcpUrl(): string {
  const u = process.env.PEEK_MCP_ENDPOINT?.trim();
  return u && u.length > 0 ? u : DEFAULT_PEEK_URL;
}

/**
 * Peek's API returns HTTP 500 for some invalid inputs (wrong regionId, tagId, categoryId).
 * That makes the MCP client throw → AI SDK marks the tool as output-error with no guidance.
 * Convert failures into a normal tool result with isError + recovery hints.
 */
function wrapSearchExperiencesTool(tool: Tool): Tool {
  const execute = tool.execute;
  if (!execute) return tool;

  return {
    ...tool,
    async execute(input: unknown, options: ToolExecutionOptions) {
      try {
        return await execute.call(tool, input, options);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text:
                `Peek search_experiences failed (${detail}).\n\n` +
                `Recovery:\n` +
                `- Call search_regions for each place, then pass the exact region ID from the line "ID: …" (short codes like r0dakr). Never pass city names, slugs, or "Tokyo" as regionId.\n` +
                `- Only use tagId or categoryId if you have a real ID from Peek; otherwise omit them (invalid IDs trigger server errors).\n` +
                `- Prefer startDate/endDate in YYYY-MM-DD when filtering by trip dates.\n` +
                `- Fallback: search_tours, deep_research, or latLng + dates for "near here" queries.`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}

function wrapSearchRegionsTool(tool: Tool): Tool {
  const execute = tool.execute;
  if (!execute) return tool;

  return {
    ...tool,
    async execute(input: unknown, options: ToolExecutionOptions) {
      try {
        return await execute.call(tool, input, options);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text:
                `Peek search_regions failed (${detail}).\n\n` +
                `Recovery:\n` +
                `- Retry with a simpler query string (city + country), or omit optional filters that might be invalid.\n` +
                `- For bookable experiences, fall back to search_tours, search_places + dates, or deep_research instead of Peek.\n` +
                `- If search_experiences failed earlier, do not assume region IDs — Peek may be temporarily unavailable.`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}

function wrapPeekTools(tools: Record<string, Tool>): Record<string, Tool> {
  const next = { ...tools };
  if (next.search_experiences) {
    next.search_experiences = wrapSearchExperiencesTool(next.search_experiences);
  }
  if (next.search_regions) {
    next.search_regions = wrapSearchRegionsTool(next.search_regions);
  }
  return next;
}

function connectPeek() {
  if (!peekPromise) {
    peekPromise = (async () => {
      const client = await createMCPClient({
        transport: { type: "http", url: peekMcpUrl() },
      });
      const tools = wrapPeekTools((await client.tools()) as Record<string, Tool>);
      return { tools, close: () => client.close() };
    })().catch((error) => {
      console.error("Peek MCP connection failed:", error);
      peekPromise = null;
      return { tools: {} as Record<string, Tool>, close: () => {} };
    });
  }
  return peekPromise;
}

export async function createPeekClient(): Promise<{
  tools: Record<string, Tool>;
  close: () => void | Promise<void>;
}> {
  try {
    const result = await Promise.race([
      connectPeek(),
      new Promise<{ tools: Record<string, Tool>; close: () => void | Promise<void> }>((resolve) =>
        setTimeout(
          () => resolve({ tools: {} as Record<string, Tool>, close: () => {} }),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ]);
    return { tools: result.tools, close: result.close };
  } catch {
    return { tools: {} as Record<string, Tool>, close: () => {} };
  }
}
