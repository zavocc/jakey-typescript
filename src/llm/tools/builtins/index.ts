import { readdir } from "node:fs/promises";
import { Message } from "discord.js";
import { fileURLToPath } from "node:url";

type ToolHandler = (discord_interaction: Message, params: Record<string, unknown>) => Promise<string>;

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

      // Filter tool schemas that end with "_TOOL_SCHEMA" and add to schemas array
      // We convert toolModule (which is an object) into entries to iterate and filter
      // from {key: value} to [[key, value], ...]
      const toolSchemas = Object.entries(toolModule)
        .filter(([exportssName]) => exportssName.endsWith("TOOL_SCHEMA"))
        .map(([, value]) => value); // only get the value, skip the key

      // Add schema to schemas array
      for (const schema of toolSchemas) {
        schemas.push(schema);

        // Warn if the schema is a function tool schema but there is no matching function export in the module
        if (isFunctionToolSchema(schema) && typeof toolModule[schema.name] !== "function") {
          console.warn(`Built-in tool ${entry.name} exports schema ${schema.name} without a matching function.`);
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
