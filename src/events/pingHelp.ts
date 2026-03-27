const { Events } = require("discord.js");
const { HELP_MESSAGE } = require("../constants");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (!message.client.user) return;

    if (message.mentions.has(message.client.user)) {
      await message.reply({
        content: HELP_MESSAGE(message.author.id, message.client.user.username),
      });
    }
  },
};
