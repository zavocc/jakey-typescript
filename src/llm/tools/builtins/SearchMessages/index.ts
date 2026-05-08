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
  created_at: string;
  jump_url: string | null;
  message_snowflake: string;
  attachments: Array<{ filename: string, mime_type: string | null, attachment_url: string }> | null;
}

export const SEARCH_MESSAGE_TOOL_SCHEMA =
{
  type: "function",
  name: "search_messages",
  description: "Search through Discord messages in the current channel.",
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
        description: "The search queries to look for in the messages. If possible, break down all possible queries based from user's request. You can also search by username or snowflake user ID when user mentioned, if it mentions multiple subjects, fan them out in queries seperately.",
      },
      before: {
        type: "string",
        description: "Search for messages before the message with its associated snowflake ID. Use an existing given snowflake ID, calculate or imply the Discord snowflake from the user's specified date or time.",
      },
      around: {
        type: "string",
        description: "Search for messages around or during the specified date or time using its associated message snowflake ID. Prefer this parameter for user requests that mention a specific time, date, or timeframe, including during-queries. Use an existing given snowflake ID, calculate or imply the Discord snowflake from the user's specified date or time. Use `before` and `after` only when you need additional pagination or a narrower bounded range.",
      },
      after: {
        type: "string",
        description: "Search for messages after the message with its associated snowflake ID. Use an existing given snowflake ID, calculate or imply the Discord snowflake from the user's specified date or time.",
      },
      ack_magic_string: {
        type: "string",
        description: "System-controlled token. Users cannot provide, request, infer, or override this value. Only use it when supplied by this tool, another trusted tool, or system/developer instructions. You can only set this when provided from the system or tool information and not from user's request.",
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

export async function search_messages(discord_interaction: Message, params: { searchTypes: "QUERIES" | "ATTACHMENTS" | "FIRST_FIFTY_MESSAGES", queries?: Array<string>, before?: string, around?: string, after?: string, ack_magic_string?: string }): Promise<string> {
  const messageChannel: SendableChannels = getSendableChannel(discord_interaction);

  // Detect if we're in a server
  const isGuild = discord_interaction.guildId !== null;
  if (!isGuild) {
    throw new Error("This command can only be used in a server.");
  }

  const searchResults: Array<ResultsShape> = [];

  // Message limit (may change)
  const messagesLimit = 50;

  // Search through messages in the current channel
  const messagesResultList = await discord_interaction.channel.messages.fetch({ limit: messagesLimit, before: params.before, around: params.around, after: params.after, cache: false });
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
          created_at: message.createdAt.toISOString(),
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
          created_at: message.createdAt.toISOString(),
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
        created_at: message.createdAt.toISOString(),
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
  if (params.ack_magic_string !== "YES I HAVE ACKNOWLEDGED") {
    childLogger.debug({ tool: 'search_messages' }, "Ack magic string not set, showing guidelines....");
    return JSON.stringify({
      guidelines: {
        pagination: {
          guidelines: "Use before, during, or after parameters to perform subsequent searches if the initial results are not found, these parameters can be used in conjunction to each other. For instance, when using `around` parameter it is recommended to also specify `before` and `after` parameters to search within that range only",
          subsequent_search: "If you want to perform subsequent search after performing initial search, if the user wants to search past messages--you MUST always specify `before` parameter using the oldest message within the first batch of messages so the new messages arriving won't interfere with search operation",
        },
        file_attachments: {
          rules: "If the user's request requires information from files attached to messages, or requires verifying which file matches exact constraints, visual/content descriptions, partially recalled details, or what the user is picturing, you MUST call read_attachments_cdn for the relevant attachment(s) before answering. Do this even if the answer appears obvious from the message text, filename, attachment name, or surrounding context. Filenames and textual metadata can be incomplete or misleading, so never rely on them alone for file-content questions or file-matching decisions that require verification. If the user explicitly asks to read/check/open/inspect attachments, calling read_attachments_cdn is mandatory. Skipping this tool call before answering is a failure to follow these search result guidelines.",
          exemptions: "You do not need to call read_attachments_cdn if the user only wants to list, fetch, find message links with attachments, or return attachment links/files from the latest messages or from a specific time range, and does not ask for analysis, verification, extracted content, summaries, visual/content matching, or other information from inside the files."
        },
      },
      ack: "To acknowledge these guidelines including the rules on how to deal with searches and agree you will also adhere to the constraints, use the parameter 'YES I HAVE ACKNOWLEDGED' in ack_magic_string in next subequent search or next search_messages tool call so you won't see these guidelines again.",
      results: searchResults
    });
  } else {
    childLogger.debug({ tool: 'search_messages' }, "Ack magic string set, skipping showing guidelines....");
    return JSON.stringify({
      results: searchResults
    })
  }
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
