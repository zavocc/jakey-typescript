import { readdir } from "node:fs/promises";
import { Message } from "discord.js";
import { fileURLToPath } from "node:url";
import { fetchBuiltInToolPack } from "./builtins/index.js";

type ToolHandler = (discord_interaction: Message, params: Record<string, unknown>) => Promise<string>;

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

  if (selectedTool !== "Disabled") {
    const schemaS = await import(`./apis/${selectedTool}/schema.js`);

    // If any schema entry is an MCP server, disable builtin tools and clear allSchemas and allTools
    const hasMcpServer = Array.isArray(schemaS.TOOL_SCHEMAS) &&
      schemaS.TOOL_SCHEMAS.some((chkschema: unknown) =>
        typeof chkschema === "object" &&
        chkschema !== null &&
        "type" in chkschema &&
        chkschema.type === "mcp_server");

    if (hasMcpServer) {
      allSchemas = [...schemaS.TOOL_SCHEMAS];
      allTools = {};
    } else {
      allSchemas = [...builtInToolPack.schemas, ...schemaS.TOOL_SCHEMAS];
      // We use Object.assign to perform shallow merge, and functions assigned are kept, if spread operator and reassignment was used, it will cause linter errors
      // For instance https://eslint.org/docs/latest/rules/no-useless-assignment
      // This is used for 1. allTools is used so it doesn't see it as wasteful and 2. It safely merges functions with new ones
      allTools = { ...builtInToolPack.functions };
    }

    // check if schemaS have TOOL_HUMAN_NAME otherwise we skip this tool
    if (!schemaS.TOOL_HUMAN_NAME) {
      console.warn({ selected_tool: selectedTool }, "The selected tool does not have TOOL_HUMAN_NAME, skipping...");
      return {
        schemas: allSchemas,
        functions: allTools,
      };
    }

    // Try to import functions — if the tool is schema-only (no index.js), skip
    // This will only load functions if there is no MCP Servers (remote), otherwise schema-only
    if (!hasMcpServer) {
      try {
        const functionS = await import(`./apis/${selectedTool}/index.js`);

        // Look-up all exported functions only
        const functions = Object.fromEntries(
          Object.entries(functionS)
            // Ignore the key as we can only check if the value is function
            // Returns after running Object.entries: [["web_search", async () => {}]]
            .filter(([, valueFunction]) => typeof valueFunction === "function")
        ) as Record<string, ToolHandler>;

        Object.assign(allTools, functions);
      } catch {
        // Schema-only tool (e.g. GoogleSearch) — no functions to import
      }
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
