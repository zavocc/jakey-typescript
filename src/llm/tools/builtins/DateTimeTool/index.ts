import { Message } from "discord.js";

export const DATE_TIME_TOOL_SCHEMA =
{
  type: "function",
  name: "fetch_date_time",
  description: "Fetch current date time",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "Timezone in Area/Location format, use UTC for defaults",
      },
    },
    required: ["timezone"]
  }
}

export async function fetch_date_time(discord_interaction: Message, params: { timezone: string }): Promise<string> {
  // Ignore discord_interaction
  if (discord_interaction) {
    //ignored
  }

  return new Date().toLocaleString("en-US", { timeZone: params.timezone });
}
