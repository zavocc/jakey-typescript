import type { Message, SendableChannels } from "discord.js";
import { callMcpTool } from "./apis/MCP/client";
import type { LoadedTool } from "./types";

export function getSendableChannel(discord_interaction: Message): SendableChannels {
  const messageChannel = discord_interaction.channel?.isSendable()
    ? discord_interaction.channel
    : null;

  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  }

  return messageChannel;
}

export async function executeToolCall(
  tool: LoadedTool,
  discord_interaction: Message,
  params: unknown,
): Promise<string> {
  if (tool.sourceType === "mcp") {
    return callMcpTool(tool.mcpServerName, tool.mcpToolName, params);
  }

  return tool.execute(discord_interaction, params);
}
