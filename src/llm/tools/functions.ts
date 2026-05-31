import type { Message, SendableChannels } from "discord.js";

export function isFunctionToolSchema(value: unknown): value is {
  type: "function";
  name: string;
} {
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
