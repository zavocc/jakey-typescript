import { Message } from "discord.js";

export const EXCEPTION_INVOKE_TOOL_SCHEMA =
{
  type: "function",
  name: "invoke_exception",
  description: "Invoke Exception, for testing logs",
  parameters: {
    type: "object",
    properties: {
      initiate_exception: {
        type: "boolean",
        description: "Invoke an exception",
      },
    },
  }
}

export async function invoke_exception(discord_interaction: Message, params: { initiate_exception: boolean }): Promise<string> {
  // Ignore discord interaction
  if (discord_interaction) {
    //ignored
  }

  if (params.initiate_exception) {
    throw new Error("Exception initiated");
  } else {
    return "Success";
  }
}
