import { Message } from "discord.js";

export const REACT_MESSAGE_TOOL_SCHEMA =
{
  type: "function",
  name: "react_message",
  description: "React to a message",
  parameters: {
    type: "object",
    properties: {
      emoji: {
        type: "string",
        description: "The emoji to react with, either a unicode, or custom emoji (if assigned) using <:emoji_name:emoji_id> format",
      },
    },
    required: ["emoji"],
  }
}

export async function react_message(discord_interaction: Message, params: { emoji: string }): Promise<string> {
  // React with the specified emoji
  await discord_interaction.react(params.emoji);
  return "Message reacted with emoji.";
}