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
  hasServerTools: boolean;
  agentProviderExclusive?: string;
};

/**
 * Scans a directory for tool subdirectories, dynamically imports each `index.js`,
 * and collects `TOOL_SCHEMAS` arrays and exported functions.
 */
async function loadBuiltInToolDirectory(dirUrl: URL) {
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

export async function fetchToolPack(selectedTool: string, formatSchema?: "openai" | "google"): Promise<ToolPack> {
  // Always load built-in tools
  const builtInToolPack = await loadBuiltInToolDirectory(new URL("./builtins/", import.meta.url));

  // Import togglable module name
  let togglableModule;

  // Check for server tools
  let hasServerTools = false;

  let allSchemas: unknown[];
  if (formatSchema === "openai") {
    allSchemas = builtInToolPack.schemas.map((s) => ({ type: "function", function: s }));
  } else {
    allSchemas = [...builtInToolPack.schemas];
  }

  let allTools: Record<string, ToolHandler> = { ...builtInToolPack.functions };

  // Load togglable tool if selected
  if (selectedTool !== "Disabled") {
    togglableModule = await import(`./togglables/${selectedTool}/index.js`);
    try {
      if (!togglableModule.TOOL_HUMAN_NAME) {
        childLogger.warn({ selected_tool: selectedTool }, "The selected tool does not have TOOL_HUMAN_NAME, skipping...");
        return { schemas: allSchemas, functions: allTools, hasServerTools: hasServerTools };
      }

      // Togglables require both TOOL_SCHEMAS and TOOL_HUMAN_NAME
      if (Array.isArray(togglableModule.TOOL_SCHEMAS)) {
        // Server tools must disable builtin tools — mixed mode is not supported
        // This is cleaner and potentially future proof rather than relying solely on TOOL_SERVER_TOOL
        // But requires to be manually set for server tools
        if (togglableModule.TOOL_SERVER_TOOL && !togglableModule.TOOL_DISABLE_BUILTIN_TOOLS) {
          throw new Error("The selected tool is a server tool but does not disable builtin tools. Set TOOL_DISABLE_BUILTIN_TOOLS = true.");
        }

        // If the togglable tool disables builtin tools, clear all preloaded schemas and functions
        if (togglableModule.TOOL_DISABLE_BUILTIN_TOOLS) {
          childLogger.info({ selected_tool: selectedTool }, "The selected tool disables builtin tools, clearing builtin schemas and functions.");
          allSchemas = [];
          allTools = {};
        }

        // Add togglable tool schemas
        for (const _sel_schema of togglableModule.TOOL_SCHEMAS) {
          if (formatSchema === "openai") {
            allSchemas.push({ type: "function", function: _sel_schema });
          } else {
            allSchemas.push(_sel_schema);
          }
          // Warn if a function schema has no matching function export, we check if it's a standard custom function call schema
          if (isFunctionToolSchema(_sel_schema)) {
            if (typeof togglableModule[_sel_schema.name] !== "function") {
              childLogger.warn({ selected_tool: selectedTool, tool_name: _sel_schema.name }, "Selected tool exports a schema without a matching function.");
            }
          }
        }

        // Collect exported functions only if this is not a server-side tool
        if (togglableModule.TOOL_SERVER_TOOL) {
          // We indicate to agent that we only use their own server tools
          hasServerTools = true;
        } else {
          childLogger.info({ selected_tool: selectedTool }, "The selected tool is a client tool... importing functions");
          for (const [exportName, value] of Object.entries(togglableModule)) {
            if (typeof value === "function") {
              allTools[exportName] = value as ToolHandler;
            }
          }
        }

      // Skip if TOOL_SCHEMAS is not exported
      } else {
        childLogger.warn({ selected_tool: selectedTool }, "The selected tool does not export TOOL_SCHEMAS array, skipping...");
        return { schemas: allSchemas, functions: allTools, hasServerTools: hasServerTools };
      }
    } catch (error) {
      childLogger.error({ selected_tool: selectedTool, cause: error }, "Failed to load togglable tool.");
      throw error;
    }
  }

  return {
    schemas: allSchemas,
    functions: allTools,
    hasServerTools: hasServerTools,
    agentProviderExclusive: togglableModule?.TOOL_AGENT_PROVIDER_EXCLUSIVE ?? undefined
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
