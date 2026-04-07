import { Message } from "discord.js";
import { BUILTIN_TOOL_SCHEMAS, BuiltInToolFunctions } from "./builtins";

type ToolHandler = (discord_interaction: Message, params: any) => Promise<string>;

type ToolPack = {
  schemas: unknown[];
  functions: Record<string, ToolHandler>;
};

export async function fetchToolPack(selectedTool: string): Promise<ToolPack> {
  // if selectedTool name is "Disabled", we can only import built-in schemas from builtins/

  // Schemas
  let allSchemas: Array<unknown> = [...BUILTIN_TOOL_SCHEMAS];
  let allTools: Record<string, ToolHandler> = { ...BuiltInToolFunctions };

  if (selectedTool !== "Disabled") {
    const schemaS = await import(`./apis/${selectedTool}/schema.js`);
    const functionS = await import(`./apis/${selectedTool}/index.js`);

    // Look-up all exported functions only
    const functions = Object.fromEntries(
      Object.entries(functionS)
        // Ignore the key as we can only check if the value is function
        // Returns after running Object.entries: [["web_search", async () => {}]]
        .filter(([, valueFunction]) => typeof valueFunction === "function")
    ) as Record<string, ToolHandler>;

    allSchemas = [
      ...allSchemas,
      ...schemaS.TOOL_SCHEMAS
    ];

    allTools = {
      ...allTools,
      ...functions,
    };
  }

  return {
    schemas: allSchemas,
    functions: allTools,
  };
}
