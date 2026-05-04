import { getSendableChannel } from "../../functions.js";
import { Message, type SendableChannels } from "discord.js";

export const SEARCH_MESSAGE_TOOL_SCHEMA =
{
  type: "function",
  name: "search_messages",
  description: "Search through Discord messages in the current channel",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: {
          type: "string"
        },
        description: "The search queries to look for in the messages",
      },
    },
    required: ["queries"],
  }
}

export async function search_messages(discord_interaction: Message, params: { queries: Array<string> }): Promise<string> {
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);
  const searchResults: Array<Record<string, unknown>> = [];

  // Search through messages in the current channel
  const messages = await discord_interaction.channel.messages.fetch({ limit: 100 });
  messages.forEach((message) => {
    if (params.queries.some(query => message.content.includes(query))) {
      searchResults.push({
        id: message.id,
        content: message.content,
        author: message.author.username,
        timestamp: message.createdTimestamp,
        url: message.url
      });
    }
  });

  // Count no of URLs
  const urlCount = searchResults.filter(result => result.url).length;
  await messageChannel.send(`🔍 Found **${urlCount}** messages`);

  return JSON.stringify(searchResults);
}
