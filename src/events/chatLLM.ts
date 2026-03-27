import { Events } from "discord.js";
import { completion } from "../lib/llm/chat/generateContent";

// CommonJS export
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (!message.client.user) return;

    // Get user ID for chat context
    const userId = String(message.author.id);

    // Strip message, remove of the bot itself and trim whitespace
    const strippedContent = message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "").trim();

    // Only if the message is not ping only
    if (message.mentions.has(message.client.user) && strippedContent !== "") {
      // typing indicator
      await message.channel.sendTyping();

      try {
        const response = await completion(strippedContent, userId);
        // send as message but not reply
        await message.channel.send(response);
      } catch (error) {
        console.error("Error generating response:", error);
        await message.channel.send("Sorry, I couldn't generate a response at the moment.");
      }

    }
  },
};
