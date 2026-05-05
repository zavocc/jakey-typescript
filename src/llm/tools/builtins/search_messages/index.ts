import { getSendableChannel } from "../../functions.js";
import { EmbedBuilder, Message, type SendableChannels } from "discord.js";

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
        description: "The search queries to look for in the messages. If possible, break down all possible queries based from user's intent like adding expanded abbreviations. You can also search by username or snowflake user ID when user mentioned",
      },
      before: {
        type: "string",
        description: "Search for messages before the message and its associated snowflake. Do not use this unless there is a previous tool result present with message snowflakes.",
      },
      after: {
        type: "string",
        description: "Search for messages after the message and its associated snowflake. Do not use this unless there is a previous tool result present with message snowflakes.",
      },
      showAllMessages: {
        type: "boolean",
        description: "Shows all message results upto 50, may increase irrelevancy and consumes more context. Do not use this unless deeper search is required (e.g. message snowflake inclusion or exclusion)",
      }
    },
    required: ["queries"],
  }
}

type ResultsShape = {
  id: string;
  content: string;
  author: string;
  author_id: string;
  author_display_name: string;
  timestamp: number;
  url: string | null;
  message_snowflake: string;
}

export async function search_messages(discord_interaction: Message, params: { queries: Array<string>, before?: string, after?: string, showAllMessages?: boolean }): Promise<string> {
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  // Detect if we're in a server
  const isGuild = discord_interaction.guildId !== null;
  if (!isGuild) {
    return "This command can only be used in a server.";
  }

  const searchResults: Array<ResultsShape> = [];

  // Determine optimal count based on showAllMessages
  let messageLimit = 100;
  if (params.showAllMessages) {
    messageLimit = 50;
  }

  // Search through messages in the current channel
  const messagesResultList = await discord_interaction.channel.messages.fetch({ limit: messageLimit, before: params.before, after: params.after });

  if (!params.showAllMessages) {
    // Perform iterative filtering from messages
    messagesResultList.forEach((message) => {
      // Check for each messages if it matches the query critieria, which includes content, author username, author display name, and author id
      // this check uses expression body to return boolean value if match found
      if (params.queries.some(query => message.content.includes(query) ||
      message.author.username.includes(query) ||
      message.author.id.includes(query) || message.author.displayName.includes(query))) {
        // Add matching results
        searchResults.push({
          id: message.id,
          content: message.content,
          author: message.author.username,
          author_id: message.author.id,
          author_display_name: message.author.displayName,
          timestamp: message.createdTimestamp,
          url: message.url,
          message_snowflake: message.id
        });
      }
    });
  } else {
    // This does lazyily pull all first 50 messages to context regardless of search query match
    messagesResultList.forEach((message) => {
      searchResults.push({
        id: message.id,
        content: message.content,
        author: message.author.username,
        author_id: message.author.id,
        author_display_name: message.author.displayName,
        timestamp: message.createdTimestamp,
        url: message.url,
        message_snowflake: message.id
      });
    });
  }

  // Count no of URLs
  const urlCount = searchResults.filter(result => result.url).length;

  // Create embed to list URLs upto 10 results
  const efficientSlicedResults = searchResults.slice(0, 10);
  const resultBody = efficientSlicedResults.map((result) => {
    // Strip symbols from result.content and strip newlines
    const strippedContent = result.content.replace(/[^\w\s.]/gi, '').replace(/\r?\n/g, ' ').trim();

    // Check if we have URL
    if (result.url) {
      // if strippedContent is blank, only show URL
      if (strippedContent === '') {
        return `- [No content](${result.url})`;
      } else {
        return `- [${strippedContent.slice(0, 50)}](${result.url})...`;
      }
    } else {
      return "- Found something but an error occurred"
    }
  }).join('\n');
  const resultsEmbed = new EmbedBuilder()
    .setTitle("References:")
    .setColor(0x0000FF)
    .setDescription(resultBody);

  if (!params.showAllMessages) {
    await messageChannel.send({ content: `🔍 Found **${urlCount}** messages`, embeds: [resultsEmbed] });
  } else {
    await messageChannel.send("🔍 Searched last 50 messages for deeper analysis");
  }

  // Add guidelines
  const finalToolResult = {
    protip: "Use the message_snowflake only if necessary to find messages before or after a specific message",
    results: searchResults
  }

  return JSON.stringify(finalToolResult);
}
