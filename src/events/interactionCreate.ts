import { createModuleLogger } from "../lib/pinoLogger.js";
import { Events, Interaction, MessageFlags } from "discord.js";

const childLogger = createModuleLogger(import.meta.url);

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command?.autocomplete) {
        childLogger.warn({ commandName: interaction.commandName }, "No autocomplete handler found for command");
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        childLogger.error({ err: error, commandName: interaction.commandName, userID: interaction.user.id }, "Error executing autocomplete command");
      }

      return;
    }

    // Ignore interactions that's not either chat input (e.g. slash commands, events) or message context menu commands
    if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) {
      childLogger.debug({ interactionType: interaction.type }, "Ignoring unsupported interaction type");
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      childLogger.warn({ commandName: interaction.commandName }, "No matching command found.");
      return;
    }

    // Check and handle errors for interaction execution
    try {
      await command.execute(interaction);
    } catch (error) {
      childLogger.error({ err: error, commandName: interaction.commandName, userID: interaction.user.id }, "Error executing command");
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
        childLogger.error({ err: replyError, commandName: interaction.commandName, userID: interaction.user.id }, "Failed to send interaction error response");
      }
    }
  },
};
