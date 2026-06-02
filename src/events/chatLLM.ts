import { createModuleLogger } from "../lib/pinoLogger.js";
import { loadPreferences } from "../lib/preferencesDBLoader.js";
import { Events, Message } from "discord.js";
import { pullAgent, type LLMExecuteFn } from "../llm/agentLoader.js";
import { getModelProps } from "../llm/chat/modelsSelection.js";
import { AgentProviderExclusiveError } from "../llm/tools/agentProviderExclusive.js";
import type { FileMetadata } from "../llm/types.js";
import type { ModelProps } from "../types/schemas.js";

const childLogger = createModuleLogger(import.meta.url);

export default {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (message.author.bot) return; // Ignore messages from bots
    if (!message.client.user) return; // check if the bot's user is available
    if (!message.channel?.isSendable()) return; // type-guard for channel and check if it's sendable
    const textChannel = message.channel; // Preserve narrowed sendable channel type for later send/sendTyping calls

    // Get user ID for chat context
    const userId = String(message.author.id);

    // Strip message, remove of the bot itself and trim whitespace
    const strippedContent = message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "").trim();

    // Check appropriate channel type
    const isDM = message.channel.isDMBased();
    const isMentionInGuild = message.mentions.has(message.client.user);

    // Trigger in DMs directly, or in guilds only when the bot is mentioned
    if ((isDM || isMentionInGuild) && (strippedContent !== "" || message.attachments.size > 0)) {
      // Keep typing alive for long LLM calls (Discord clears it after a short timeout).
      await textChannel.sendTyping();
      const typingInterval = setInterval(() => {
        void textChannel.sendTyping().catch((typingError) => {
          childLogger.error({ err: typingError }, "Failed to refresh typing indicator:");
        });
      }, 8000);

      // Check if the message has attachments and get their URLs
      const attachmentUrls: FileMetadata[] = message.attachments.map(attachment => ({
        fileName: attachment.name,
        mimeType: attachment.contentType ?? "application/octet-stream",
        fileURI: attachment.url,
        AltText: attachment.description
      }));

      try {
        // Load model properties
        const modelProps: ModelProps = await getModelProps(userId);
        // Log ModelProps debug
        childLogger.debug({ model_props: modelProps, user_snowflake: userId }, "ModelProps loaded");

        // Pull Agent
        const agentSdkProvider: LLMExecuteFn = await pullAgent(modelProps.provider);

        await agentSdkProvider(strippedContent, modelProps, userId, message, attachmentUrls);
      } catch (error) {
        // narrows to Error type
        if (
          error instanceof AgentProviderExclusiveError ||
          (error instanceof Error && error.message.includes("does not support file attachments"))
        ) {
          await textChannel.send(error.message);
        } else if (error instanceof Error && error.message.includes("Model unavailable")) {
          const modelUsed = await loadPreferences(userId, "user_choice_model_alias")
          childLogger.warn({ model_used: modelUsed, user_snowflake: userId }, "The user selected a model that is unavailable from models.json");
          await textChannel.send("The model you have selected is currently unavailable, please select a different model");
        } else {
          const normalizedError = error instanceof Error ? error : new Error(String(error));
          childLogger.error({ err: normalizedError, user_snowflake: userId }, "Error generating response");

          // Send generic error message to the user
          await textChannel.send("Sorry, I couldn't generate a response at the moment.");
        }
      } finally {
        clearInterval(typingInterval);
      }

    }
  },
};
