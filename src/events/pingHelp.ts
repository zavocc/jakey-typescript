import { Events } from "discord.js";
import { HELP_MESSAGE } from "../data/constants";

// CommonJS export
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (!message.client.user) return;

    // Strip message, remove of the bot itself and trim whitespace
    const strippedContent = message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "").trim();

    // Trigger help only when the bot is pinged with no other text and no attachments
    if (message.mentions.has(message.client.user) && strippedContent === "" && message.attachments.size === 0) {
      await message.reply({
        content: HELP_MESSAGE(message.author.id, message.client.user.username),
      });
    }
  },
};
