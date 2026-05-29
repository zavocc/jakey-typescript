import { Message } from "discord.js";

export const TOOL_SCHEMAS = [
  {
    name: "react_message",
    description: "React to the user's current message with a single emoji. This tool only reacts to current message you're interacting with, and reactions are displayed below the user's message instead of a text message form.",
    parameters: {
      type: "object",
      properties: {
        emoji: {
          type: "string",
          description: "The emoji to react with, it can be a unicode emoji or a custom Discord emoji (if allowed through Emojis list in system instructions) using Discord emoji markdown format.",
        },
      },
      required: ["emoji"],
    }
  }
]

export async function react_message(discord_interaction: Message | undefined, params: { emoji: string }): Promise<string> {
  // We're only checking discord interaction but doesn't need to narrow down as SendableChannel type using getSendableChannel function since we're not sending anything
  if (!discord_interaction) {
    throw new Error("Discord interaction is required for this tool.");
  }

  // React with the specified emoji
  await discord_interaction.react(params.emoji);
  return "Message reacted with emoji.";
}
