import type { Message, SendableChannels } from "discord.js";

export function getSendableChannel(discord_interaction: Message): SendableChannels {
  const messageChannel = discord_interaction.channel?.isSendable() ? discord_interaction.channel : null;

  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  }

  return messageChannel;
}
