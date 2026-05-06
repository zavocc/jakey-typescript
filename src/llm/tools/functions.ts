import type { Message, SendableChannels } from "discord.js";

export function getSendableChannel(discord_interaction: Message | undefined): SendableChannels {
  if (!discord_interaction) {
    throw new Error("Discord interaction is required for this tool.");
  }

  const messageChannel = discord_interaction.channel?.isSendable() ? discord_interaction.channel : null;

  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  }

  return messageChannel;
}
