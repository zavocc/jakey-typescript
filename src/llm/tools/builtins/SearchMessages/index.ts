import logger from "../../../../lib/pinoLogger.js";
import { uploadToGoogleFilesAPI } from "../../../fileUpload.js";
import { GoogleClient } from "../../../../lib/genAIClients.js";
import { getSendableChannel } from "../../functions.js";
import { createUserContent, createPartFromUri } from "@google/genai";
import { EmbedBuilder, Message, type SendableChannels } from "discord.js";

const childLogger = logger.child({ module: "llm.tools.builtins.search_messages" });

type ResultsShape = {
  id: string;
  content: string;
  author: string;
  author_id: string;
  author_display_name: string;
  timestamp: number;
  jump_url: string | null;
  message_snowflake: string;
  attachments: Array<{ filename: string, mime_type: string | null, attachment_url: string }> | null;
}

export const SEARCH_MESSAGE_TOOL_SCHEMA =
{
  type: "function",
  name: "search_messages",
  description: "Search through Discord messages in the current channel, this pulls the latest messages first.",
  parameters: {
    type: "object",
    properties: {
      searchTypes: {
        type: "string",
        enum: [
          "QUERIES",
          "ATTACHMENTS",
          "FIRST_FIFTY_MESSAGES"
        ],
        description: "Types of messages to pull from, QUERIES will search based on queries while the other two will ignore, ATTACHMENTS pulls and filters messages with files only, PULL_FIRST_FIFTY_MESSAGES will pull the first 50 messages regardless of criteria. It can be combined with before or after to paginate results."
      },
      queries: {
        type: "array",
        items: {
          type: "string"
        },
        description: "The search queries to look for in the messages. If possible, break down all possible queries based from user's intent like adding expanded abbreviations. You can also search by username or snowflake user ID when user mentioned, if it mentions multiple subjects, fan them out in queries seperately.",
      },
      before: {
        type: "string",
        description: "Search for messages before an existing message snowflake ID. Use a message_snowflake from prior search results, a snowflake ID provided by the user, calculate or imply the Discord snowflake from the user's specified date or time.",
      },
      after: {
        type: "string",
        description: "Search for messages after an existing message snowflake ID. Use a message_snowflake from prior search results, a snowflake ID provided by the user, calculate or imply the Discord snowflake from the user's specified date or time.",
      }
    },
    required: ["searchTypes"],
  }
}

export const MULTIMODAL_READ_DISCORD_CDN_TOOL_SCHEMA =
{
  type: "function",
  name: "read_attachments_cdn",
  description: "Reads attachment for precise search and verify passages from user's request, only use this after calling search_messages with attachments",
  parameters: {
    type: "object",
    properties: {
      assoc_message_url: {
        type: "string",
        description: "The Discord jump URL of the message containing attachments for citation",
      },
      filename: {
        type: "string",
        description: "The filename of the attachment",
      },
      mime_type: {
        type: "string",
        description: "The mime type of the attachment",
      },
      attachment_url: {
        type: "string",
        description: "The URL of the attachment to read",
      }
    },
    required: ["assoc_message_url", "attachment_url", "filename", "mime_type"],
  }
}

export async function search_messages(discord_interaction: Message, params: { searchTypes: "QUERIES" | "ATTACHMENTS" | "FIRST_FIFTY_MESSAGES", queries?: Array<string>, before?: string, after?: string}): Promise<string> {
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  // Detect if we're in a server
  const isGuild = discord_interaction.guildId !== null;
  if (!isGuild) {
    throw new Error("This command can only be used in a server.");
  }

  const searchResults: Array<ResultsShape> = [];

  // Determine optimal count based on showAllMessages
  let messageLimit = 100;
  if (params.searchTypes !== "QUERIES") {
    messageLimit = 50;
  }

  // Search through messages in the current channel
  const messagesResultList = await discord_interaction.channel.messages.fetch({ limit: messageLimit, before: params.before, after: params.after, cache: false });
  childLogger.debug({ tool: 'search_messages', mode: params.searchTypes, queries: params.queries, user_snowflake: discord_interaction.author.id }, "Searched for messages")
  if (params.searchTypes === "QUERIES") {
    // Check if params.queries is set  and has at least one query
    const queries = params.queries;

    if (!queries?.length) {
       throw new Error("No queries specified. Please provide at least one query to search for.");
     }

    // Perform iterative filtering from messages
    messagesResultList.forEach((message) => {
      // Check for each messages if it matches the query critieria, which includes content, author username, author display name, and author id
      // this check uses expression body to return boolean value if match found
      if (queries.some(query => message.content.includes(query) ||
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
          jump_url: message.url,
          message_snowflake: message.id,
          attachments: message.attachments.size > 0 ? message.attachments.map(attachment => ({ filename: attachment.name, mime_type: attachment.contentType, attachment_url: attachment.url })) : null,
        });
      }
    });
  } else if (params.searchTypes === "ATTACHMENTS") {
    messagesResultList.forEach((message) => {
      if (message.attachments.size > 0) {
        searchResults.push({
          id: message.id,
          content: message.content,
          author: message.author.username,
          author_id: message.author.id,
          author_display_name: message.author.displayName,
          timestamp: message.createdTimestamp,
          jump_url: message.url,
          message_snowflake: message.id,
          attachments: message.attachments.size > 0 ? message.attachments.map(attachment => ({ filename: attachment.name, mime_type: attachment.contentType, attachment_url: attachment.url })) : null,
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
        jump_url: message.url,
        message_snowflake: message.id,
        attachments: message.attachments.size > 0 ? message.attachments.map(attachment => ({ filename: attachment.name, mime_type: attachment.contentType, attachment_url: attachment.url, })) : null,
      });
    });
  }

  // Throw if there's empty results
  if (searchResults.length === 0) {
    throw new Error("No results found.");
  }

  // Count no of URLs
  const urlCount = searchResults.filter(result => result.jump_url).length;

  // Create embed to list URLs upto 10 results
  const efficientSlicedResults = searchResults.slice(0, 10);
  const resultBody = efficientSlicedResults.map((result) => {
    // Strip symbols from result.content and strip newlines
    const strippedContent = result.content.replace(/[^\w\s.]/gi, '').replace(/\r?\n/g, ' ').trim();

    // Check if we have URL
    if (result.jump_url) {
      // if strippedContent is blank, only show URL
      if (strippedContent === '') {
        return `- [No content](${result.jump_url})`;
      } else {
        return `- [${strippedContent.slice(0, 50)}](${result.jump_url})...`;
      }
    } else {
      return "- Found something but an error occurred"
    }
  }).join('\n');
  const resultsEmbed = new EmbedBuilder()
    .setTitle("References:")
    .setColor(0x0000FF)
    .setDescription(resultBody);

  if (params.searchTypes === "QUERIES") {
    await messageChannel.send({ content: `🔍 Found **${urlCount}** messages`, embeds: [resultsEmbed] });
  } else if (params.searchTypes === "ATTACHMENTS") {
    await messageChannel.send(`🔍 Pulled **${searchResults.length}** messages with attachments`);
  } else {
    await messageChannel.send("🔍 Searched last 50 messages for deeper analysis");
  }

  // Add guidelines
  const finalToolResult = {
    guidelines: {
      pagination: "Use the message_snowflake or based on user's specified date only if necessary to find messages before or after a specific message if initial search results are not sufficient.",
      file_attachments: "If any search result contains attachments that may be relevant to the user's request, you MUST call read_attachments_cdn for the relevant attachment(s) before answering. Do this even if the answer appears obvious from the message text, filename, attachment name, or surrounding context. Filenames and textual metadata can be incomplete or misleading, so never rely on them alone. If the user explicitly asks to read/check/open/inspect attachments, calling read_attachments_cdn is mandatory. Skipping this tool call before answering is a failure to follow these search result guidelines. In addition, if there is a file attachment but with less obvious hints like randomly named filenames and/or lack of context based on messages surrounds context with it, consider reading it before paginating.",
      subsequent_searches: "If you're planning to iterate more from initial search results, it's recommended to use before or after parameters with associated previous snowflake of its messages from initial search results to ensure consistency and results don't get mixed up with latest messages."
    },
    results: searchResults
  };

  return JSON.stringify(finalToolResult);
}

// For reading files
export async function read_attachments_cdn(discord_interaction: Message, params: { assoc_message_url: string; filename: string, mime_type: string, attachment_url: string }): Promise<string> {
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  // check if the domain ends with discordapp.com/attachments
  const isDiscordCDN = params.attachment_url.includes("discordapp.com/attachments/");
  if (!isDiscordCDN) {
    throw new Error("This command can only be used with attachments from the Discord CDN.");
  }

  // Detect if we're in a server
  const isGuild = discord_interaction.guildId !== null;
  if (!isGuild) {
    throw new Error("This command can only be used in a server.");
  }

  // Upload file
  childLogger.debug({ filename: params.filename, mime_type: params.mime_type, attachment_url: params.attachment_url, user_id: discord_interaction.author.id }, "Preparing to upload file using uploadToGoogleFilesAPI");
  const fileURL = await uploadToGoogleFilesAPI(params.filename, params.mime_type, params.attachment_url);
  childLogger.debug({ filename: params.filename, mime_type: params.mime_type, attachment_url: params.attachment_url, user_id: discord_interaction.author.id }, "File uploaded");

  // Send interstitial
  const initialSend = await messageChannel.send(`📄 Analyzing **${params.filename}** from message ${params.assoc_message_url}`);

  // Ask question using Flash Lite model
  const response = await GoogleClient.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: createUserContent([createPartFromUri(fileURL, params.mime_type), "Generate elaborate descriptions of this file, write a summary, and extract exact text from the screen if it's an image or video"]),
    config: {
      thinkingConfig: {
        thinkingBudget: 0
      }
    }
  });

  await initialSend.edit(`✅ Read **${params.filename}** from message ${params.assoc_message_url}`);

  if (!response.candidates?.length) {
    throw new Error("No response found");
  }

  const candidate = response.candidates[0];

  return JSON.stringify({
    guidelines: "If the following attachment matches the criteria, provide the attachment link either as Discord jump URL or direct CDN link.",
    subAgentresponse: candidate.content?.parts?.[0]?.text ?? "No response returned"
  });
}
