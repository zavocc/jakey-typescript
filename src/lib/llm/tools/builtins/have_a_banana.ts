import { EmbedBuilder } from "discord.js";
import { Message, SendableChannels } from "discord.js";

export const HAVE_A_BANANA_TOOL_SCHEMA = 
  {
    type: "function",
    function: {
      name: "have_a_banana",
      description: "Banana"
  },
}

export async function have_a_banana(discord_interaction: Message, params: { }): Promise<string> {
  // We just send image of banana
  const messageChannel: SendableChannels | null = discord_interaction.channel?.isSendable() ? discord_interaction.channel : null;
  if (!messageChannel) {
    throw new Error("Message channel is not available.");
  } 

  // Ignore params
  params;

  const bananaEmbed = new EmbedBuilder()
    .setTitle("Have a banana 🍌")
    .setColor(0xFFFF00)
    .setImage("https://upload.wikimedia.org/wikipedia/commons/8/8a/Banana-Single.jpg");

  await messageChannel.send({ embeds: [bananaEmbed] });

  // Implementation for checking if the user has a banana
  return "You have a banana!";
}