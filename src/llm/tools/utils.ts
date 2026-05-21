import logger from "../../lib/pinoLogger.js";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchBuiltInToolPack } from "./builtins/index.js";
import { isFunctionToolSchema } from "./functions.js";
import type { Message } from "discord.js";

const childLogger = logger.child({ module: "llm.tools.utils" });

type ToolHandler = (discord_interaction: Message | undefined, params: Record<string, unknown>) => Promise<unknown>;

type ToolPack = {
  schemas: unknown[];
  functions: Record<string, ToolHandler>;
};

export async function fetchToolPack(selectedTool: string): Promise<ToolPack> {
  // if selectedTool name is "Disabled", we can only import built-in schemas from builtins/
  // Load built-in schemas by default and tool functions
  const builtInToolPack = await fetchBuiltInToolPack();
  let allSchemas: Array<unknown>;
  let allTools: Record<string, ToolHandler>;

  // Load tools if selected tool is disabled, otherwise we only load builtin tools
  if (selectedTool !== "Disabled") {
    const schemaS = await import(`./apis/${selectedTool}/schema.js`);

    // check if schemaS have TOOL_HUMAN_NAME otherwise we skip this tool
    if (!schemaS.TOOL_HUMAN_NAME) {
      childLogger.warn({ selected_tool: selectedTool }, "The selected tool does not have TOOL_HUMAN_NAME, skipping...");
      return {
        schemas: [...builtInToolPack.schemas],
        functions: { ...builtInToolPack.functions },
      };
    }

    // If any schema entry is an MCP server or Google Maps, we return early only with schemas with no built-in tools
    const hasExclusiveTool = Array.isArray(schemaS.TOOL_SCHEMAS) &&
    schemaS.TOOL_SCHEMAS.some((chkschema: unknown) =>
      typeof chkschema === "object" &&
      chkschema !== null &&
      "type" in chkschema &&
      (chkschema.type === "mcp_server" || chkschema.type === "google_maps"));

    if (hasExclusiveTool) {
      return {
        schemas: [...schemaS.TOOL_SCHEMAS],
        functions: {},
      };
    }

    // Load the built-in tools and schema first
    allSchemas = [...builtInToolPack.schemas, ...schemaS.TOOL_SCHEMAS];
    allTools = { ...builtInToolPack.functions };

    // Try to import functions — if the tool is schema-only (no index.js), skip
    try {
      const functionS = await import(`./apis/${selectedTool}/index.js`);

      // Check if each function schema tool names have matching function exports in the module functionS
      for (const _sel_schema of schemaS.TOOL_SCHEMAS) {
        // Warn if the schema is a function tool schema but there is no matching function export in the module
        if (isFunctionToolSchema(_sel_schema) && typeof functionS[_sel_schema.name] !== "function") {
          childLogger.warn({ selected_tool: selectedTool, tool_name: _sel_schema.name }, "Selected tool loaded exports a schema without a matching function.");
        }
      }

      // Look-up all exported functions only
      const toolapi_functions = Object.fromEntries(
        Object.entries(functionS)
          // Ignore the key as we can only check if the value is function
          // Returns after running Object.entries: [["web_search", async () => {}]]
          .filter(([, valueFunction]) => typeof valueFunction === "function")
      ) as Record<string, ToolHandler>;

      // Add the exported functions to registered functions so the agent can call later
      allTools = { ...allTools, ...toolapi_functions };
    } catch {
      // Schema-only tool (e.g. GoogleSearch) — no functions to import or an error has occurred
      // TODO: to log with errors properly
      // childLogger.info({ selected_tool: selectedTool }, "The selected tool does not have functions to import, this indicates this is might be a non-mcp hosted tool")
    }
  } else {
    allSchemas = [...builtInToolPack.schemas];
    allTools = { ...builtInToolPack.functions };
  }

  return {
    schemas: allSchemas,
    functions: allTools,
  };
}

// Function to fetch all available tools from apis/ and find schema.ts with TOOL_HUMAN_NAME
export async function fetchListAvailableTool(): Promise<Array<{ name: string; human_name: string }>> {
  const disabledTool = {
    name: "Disabled",
    human_name: "Disabled",
  };

  const apisPath = fileURLToPath(new URL("./apis/", import.meta.url));
  const entries = await readdir(apisPath, { withFileTypes: true });

  const toolList = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const schemaModule = await import(`./apis/${entry.name}/schema.js`);

          if (typeof schemaModule.TOOL_HUMAN_NAME !== "string") {
            return null;
          }

          return {
            name: entry.name,
            human_name: schemaModule.TOOL_HUMAN_NAME,
          };
        } catch {
          return null;
        }
      })
  );

  const availableTools = toolList
    .filter((tool): tool is { name: string; human_name: string } => tool !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return [disabledTool, ...availableTools];
}
