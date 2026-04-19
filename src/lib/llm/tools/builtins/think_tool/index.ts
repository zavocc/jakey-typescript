import { getSendableChannel } from "../../functions";
import { Message, SendableChannels } from "discord.js";

export const THINK_TOOL_SCHEMA =
{
  type: "function",
  name: "think_tool",
  description: "Tool to show thoughts before responding",
  parameters: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "The thought content to show to the user. Can be multiple sentences.",
      },
    },
    required: ["thought"],
  }
}

export async function think_tool(discord_interaction: Message, params: { thought: string }): Promise<string> {
  // Narrow to a channel type that is allowed to send messages
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  // Send the thought as a message to the user
  await messageChannel.send(`> ${params.thought}`);
  return "[Thought]: " + params.thought;
}