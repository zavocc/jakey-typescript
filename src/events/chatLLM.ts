import { Events, Message } from "discord.js";
import { chatToLLM } from "../llm/chat/chatAgenticReceiver.js";

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
          console.error("Failed to refresh typing indicator:", typingError);
        });
      }, 8000);

      // Check if the message has attachments and get their URLs
      const attachmentUrls = message.attachments.map(attachment => ({
        fileName: attachment.name,
        mimeType: attachment.contentType ?? "application/octet-stream",
        fileURI: attachment.url
      }));

      try {
        await chatToLLM(strippedContent, userId, message, attachmentUrls);
      } catch (error) {
        // narrows to Error type
        if (error instanceof Error && error.message.includes("does not support file attachments")) {
          await textChannel.send(error.message);
        } else if (error instanceof Error && error.message.includes("Model unavailable")) {
          await textChannel.send("The model you have selected is currently unavailable, please select a different model");
        } else {
          console.error("Error generating response:", error);
          await textChannel.send("Sorry, I couldn't generate a response at the moment.");
        }
      } finally {
        clearInterval(typingInterval);
      }

    }
  },
};
