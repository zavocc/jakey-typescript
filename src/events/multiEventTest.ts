const { Events } = require("discord.js");

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
      await message.reply({
        content: `The user said: ${strippedContent}`,
      });
    }
  },
};
