import { readdir } from "node:fs/promises";
import path from "node:path";
import { BUILTIN_TOOL_SCHEMAS, BuiltInToolFunctions } from "./builtins";
import type { LoadedTool, LocalToolHandler, ToolPack } from "./types";

function createLocalLoadedTools(
  functions: Record<string, LocalToolHandler>,
  sourceType: "builtin" | "api",
): Record<string, LoadedTool> {
  return Object.fromEntries(
    Object.entries(functions).map(([name, execute]) => [
      name,
      {
        sourceType,
        name,
        interstitialLabel: name,
        execute,
      },
    ])
  ) as Record<string, LoadedTool>;
}

export async function fetchToolPack(selectedTool: string): Promise<ToolPack> {
  // if selectedTool name is "Disabled", we can only import built-in schemas from builtins/

  // Schemas
  let allSchemas: Array<unknown> = [...BUILTIN_TOOL_SCHEMAS];
  let allTools: Record<string, LoadedTool> = createLocalLoadedTools(
    BuiltInToolFunctions,
    "builtin",
  );

  if (selectedTool !== "Disabled") {
    const schemaModule = await import(`./apis/${selectedTool}/schema.js`);

    // check if schemaS have TOOL_HUMAN_NAME otherwise we skip this tool
    if (!schemaModule.TOOL_HUMAN_NAME) {
      console.warn(`Tool ${selectedTool} does not have TOOL_HUMAN_NAME, skipping...`);
      return {
        schemas: allSchemas,
        tools: allTools,
      };
    }

    if (typeof schemaModule.getDynamicToolPack === "function") {
      const dynamicToolPack = await schemaModule.getDynamicToolPack();

      allSchemas = [
        ...allSchemas,
        ...dynamicToolPack.schemas,
      ];

      allTools = {
        ...allTools,
        ...dynamicToolPack.tools,
      };
    } else {
      const functionModule = await import(`./apis/${selectedTool}/index.js`);

      // Look-up all exported functions only
      const functions = Object.fromEntries(
        Object.entries(functionModule)
          // Ignore the key as we can only check if the value is function
          // Returns after running Object.entries: [["web_search", async () => {}]]
          .filter(([, valueFunction]) => typeof valueFunction === "function")
      ) as Record<string, LocalToolHandler>;

      allSchemas = [
        ...allSchemas,
        ...schemaModule.TOOL_SCHEMAS,
      ];

      allTools = {
        ...allTools,
        ...createLocalLoadedTools(functions, "api"),
      };
    }
  }

  return {
    schemas: allSchemas,
    tools: allTools,
  };
}

// Function to fetch all available tools from apis/ and find schema.ts with TOOL_HUMAN_NAME
export async function fetchListAvailableTool(): Promise<Array<{ name: string; human_name: string }>> {
  const disabledTool = {
    name: "Disabled",
    human_name: "Disabled",
  };

  const apisPath = path.join(__dirname, "apis");
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

          if (typeof schemaModule.isToolAvailable === "function") {
            const isToolAvailable = await schemaModule.isToolAvailable();

            if (!isToolAvailable) {
              return null;
            }
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
