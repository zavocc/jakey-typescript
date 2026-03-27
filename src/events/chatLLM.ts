const { Events } = require("discord.js");
const { completion } = require("../lib/llm/chat/generateContent");

// CommonJS export
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (!message.client.user) return;

    // Strip message, remove of the bot itself and trim whitespace
    const strippedContent = message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "").trim();

    // Only if the message is not ping only
    if (message.mentions.has(message.client.user) && strippedContent !== "") {
      const response = await completion(strippedContent);

      // send as message but not reply
      await message.channel.send(response);
    }
  },
};
