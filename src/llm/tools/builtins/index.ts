import logger from "../../../lib/pinoLogger.js";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Message } from "discord.js";


const childLogger = logger.child({ module: "llm.tools.builtins" })

type ToolHandler = (discord_interaction: Message | undefined, params: Record<string, unknown>) => Promise<string>;

type FunctionToolSchema = {
  type: "function";
  name: string;
};

type ToolPack = {
  schemas: unknown[];
  functions: Record<string, ToolHandler>;
};

function isFunctionToolSchema(value: unknown): value is FunctionToolSchema {
  return (
    // check if value is an object and has type and name properties, and type is "function" and name is a string
    typeof value === "object" &&
    value !== null && // ensure it's not null
    // ensure if the key "type" and "name" exist in the object and type is "function" and name is a string
    "type" in value &&
    "name" in value &&
    value.type === "function" &&
    typeof value.name === "string"
  );
}

export async function fetchBuiltInToolPack(): Promise<ToolPack> {
  const builtinsPath = fileURLToPath(new URL("./", import.meta.url));
  const entries = await readdir(builtinsPath, { withFileTypes: true });
  const toolDirectories = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)); // sort by name alphabetically to ensure consistent order

  const schemas: unknown[] = [];
  const functions: Record<string, ToolHandler> = {};

  // Iterate and wait for all imports to finish before returning the ToolPack
  await Promise.all(
    toolDirectories.map(async (entry) => {
      const toolModule = await import(`./${entry.name}/index.js`);

      // Everything is an object in javascript
      // When importing tool module, Object.entries reveal the module is just an object, which the "const SAMPLE_TOOL_SCHEMA = []" becomes { SAMPLE_TOOL_SCHEMA: [<schema_here>] }
      // Using Object.entries converts them into Array and turns like this [ [SAMPLE_TOOL_SCHEMA, [<schema_here>]] ]
      // The .map extracts only the value so we can place actual schema to be pushed into schema array
      const toolSchemas = Object.entries(toolModule)
        .filter(([exportssName]) => exportssName.endsWith("TOOL_SCHEMA"))
        .map(([, value]) => value);

      // Iterate on toolSchemas and add schema object to schemas array
      for (const _sel_schema of toolSchemas) {
        schemas.push(_sel_schema);

        // Warn if the schema is a function tool schema but there is no matching function export in the module
        if (isFunctionToolSchema(_sel_schema) && typeof toolModule[_sel_schema.name] !== "function") {
          childLogger.warn({ tool_directory_name: entry.name, tool_name: _sel_schema.name }, "Built-in tool loaded exports a schema without a matching function.");
        }
      }

      // iterate and append the functions to functions array
      for (const [exportName, value] of Object.entries(toolModule)) {
        if (typeof value !== "function") {
          continue;
        }

        functions[exportName] = value as ToolHandler;
      }
    })
  );

  return {
    schemas,
    functions,
  };
}
