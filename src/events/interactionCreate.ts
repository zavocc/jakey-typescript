import { Events, Interaction, MessageFlags } from "discord.js";

// CommonJS export
// taken from: https://discordjs.guide/legacy/app-creation/handling-commands#receiving-command-interactions
// Needed to recieve command interactions from user, this is ran on index.ts event loading
module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command?.autocomplete) {
        console.error(`No autocomplete handler for ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(error);
      }

      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    // Check and handle errors for interaction execution
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error while executing this command!',
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: 'There was an error while executing this command!',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error("Failed to send interaction error response:", replyError);
      }
    }
  },
};
