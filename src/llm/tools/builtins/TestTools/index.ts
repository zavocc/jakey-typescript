import { getSendableChannel } from "../../functions.js";
import { EmbedBuilder, Message, SendableChannels } from "discord.js";

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


export const HAVE_A_BANANA_TOOL_SCHEMA =
{
  type: "function",
  name: "have_a_banana",
  description: "Banana",
  parameters: {
    type: "object",
    properties: {},
  }
}

export async function invoke_exception(discord_interaction: Message | undefined, params: { initiate_exception: boolean }): Promise<string> {
  void discord_interaction;
  if (params.initiate_exception) {
    throw new Error("Exception initiated");
  } else {
    return "Success";
  }
}

export async function have_a_banana(discord_interaction: Message, params: unknown): Promise<string> {
  // We just send image of banana
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  // Ignore params
  if (params) {
    //ignored
  }

  const bananaEmbed = new EmbedBuilder()
    .setTitle("Have a banana 🍌")
    .setColor(0xFFFF00)
    .setImage("https://upload.wikimedia.org/wikipedia/commons/8/8a/Banana-Single.jpg");

  await messageChannel.send({ embeds: [bananaEmbed] });

  // Implementation for checking if the user has a banana
  return "You have a banana!";
}
