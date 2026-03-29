import { Events, Message } from "discord.js";
import { completion } from "../lib/llm/chat/generateContent";

// CommonJS export
module.exports = {
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
            // typing indicator
            await textChannel.sendTyping();

            // Check if the message has attachments and get their URLs
            const attachmentUrls = message.attachments.map(attachment => attachment.url);

            try {
                const response = await completion(strippedContent, userId, attachmentUrls);
                // send as message but not reply
                await textChannel.send(response);
            } catch (error) {
                console.error("Error generating response:", error);
                await textChannel.send("Sorry, I couldn't generate a response at the moment.");
            }

        }
    },
};
