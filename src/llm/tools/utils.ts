import logger from "../../lib/pinoLogger.js";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isFunctionToolSchema } from "./functions.js";
import type { Message } from "discord.js";

const childLogger = logger.child({ module: "llm.tools.utils" });

type ToolHandler = (discord_interaction: Message | undefined, params: Record<string, unknown>) => Promise<unknown>;

type ToolPack = {
  schemas: unknown[];
  functions: Record<string, ToolHandler>;
};

/**
 * Scans a directory for tool subdirectories, dynamically imports each `index.js`,
 * and collects `TOOL_SCHEMAS` arrays and exported functions.
 */
async function loadBuiltInToolDirectory(dirUrl: URL): Promise<ToolPack> {
  const dirPath = fileURLToPath(dirUrl);
  const entries = await readdir(dirPath, { withFileTypes: true });
  const toolDirectories = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const schemas: unknown[] = [];
  const functions: Record<string, ToolHandler> = {};

  await Promise.all(
    toolDirectories.map(async (entry) => {
      try {
        const toolModule = await import(`${dirUrl.href}${entry.name}/index.js`);

        // Skip modules that don't export TOOL_SCHEMAS
        if (!Array.isArray(toolModule.TOOL_SCHEMAS)) {
          childLogger.warn({ tool_directory_name: entry.name }, "Tool directory does not export TOOL_SCHEMAS array, skipping...");
          return;
        }

        // Push each schema from the TOOL_SCHEMAS array
        for (const _sel_schema of toolModule.TOOL_SCHEMAS) {
          schemas.push(_sel_schema);

          // Warn if the schema is a function tool schema but there is no matching function export
          if (isFunctionToolSchema(_sel_schema) && typeof toolModule[_sel_schema.name] !== "function") {
            childLogger.warn({ tool_directory_name: entry.name, tool_name: _sel_schema.name }, "Tool exports a schema without a matching function.");
          }
        }

        // Collect all exported functions
        for (const [exportName, value] of Object.entries(toolModule)) {
          if (typeof value === "function") {
            functions[exportName] = value as ToolHandler;
          }
        }
      } catch (error) {
        childLogger.error({ tool_directory_name: entry.name, cause: error }, "Failed to load tool directory.");
      }
    })
  );

  return { schemas, functions };
}

export async function fetchToolPack(selectedTool: string): Promise<ToolPack> {
  // Always load built-in tools
  const builtInToolPack = await loadBuiltInToolDirectory(new URL("./builtins/", import.meta.url));

  const allSchemas: unknown[] = [...builtInToolPack.schemas];
  const allTools: Record<string, ToolHandler> = { ...builtInToolPack.functions };

  // Load togglable tool if selected
  if (selectedTool !== "Disabled") {
    try {
      const togglableModule = await import(`./togglables/${selectedTool}/index.js`);

      // Togglables require both TOOL_SCHEMAS and TOOL_HUMAN_NAME
      if (!Array.isArray(togglableModule.TOOL_SCHEMAS)) {
        childLogger.warn({ selected_tool: selectedTool }, "The selected tool does not export TOOL_SCHEMAS array, skipping...");
        return { schemas: allSchemas, functions: allTools };
      }

      if (!togglableModule.TOOL_HUMAN_NAME) {
        childLogger.warn({ selected_tool: selectedTool }, "The selected tool does not have TOOL_HUMAN_NAME, skipping...");
        return { schemas: allSchemas, functions: allTools };
      }

      // Add schemas
      for (const _sel_schema of togglableModule.TOOL_SCHEMAS) {
        allSchemas.push(_sel_schema);

        // Warn if a function schema has no matching function export
        if (isFunctionToolSchema(_sel_schema) && typeof togglableModule[_sel_schema.name] !== "function") {
          childLogger.warn({ selected_tool: selectedTool, tool_name: _sel_schema.name }, "Selected tool exports a schema without a matching function.");
        }
      }

      // Collect exported functions
      for (const [exportName, value] of Object.entries(togglableModule)) {
        if (typeof value === "function") {
          allTools[exportName] = value as ToolHandler;
        }
      }
    } catch (error) {
      childLogger.error({ selected_tool: selectedTool, cause: error }, "Failed to load togglable tool.");
    }
  }

  return {
    schemas: allSchemas,
    functions: allTools,
  };
}

// Function to fetch all available togglable tools and find index.ts with TOOL_SCHEMAS and TOOL_HUMAN_NAME
export async function fetchListAvailableTool(): Promise<Array<{ name: string; human_name: string }>> {
  const disabledTool = {
    name: "Disabled",
    human_name: "Disabled",
  };

  const togglablesPath = fileURLToPath(new URL("./togglables/", import.meta.url));
  const entries = await readdir(togglablesPath, { withFileTypes: true });

  const toolList = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const toolModule = await import(`./togglables/${entry.name}/index.js`);

          if (!Array.isArray(toolModule.TOOL_SCHEMAS) || typeof toolModule.TOOL_HUMAN_NAME !== "string") {
            return null;
          }

          return {
            name: entry.name,
            human_name: toolModule.TOOL_HUMAN_NAME,
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
