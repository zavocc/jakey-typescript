import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
// for resetting preferences
import { savePreferences, clearUserPreferences } from "../../lib/preferencesDBLoader.js";

export default {
  data: new SlashCommandBuilder()
    .setName("sweep")
    .setDescription("Clears the context history")
    .addBooleanOption(option =>
      option.setName("preferences")
        .setDescription("Clear all context history and your user settings")
        .setRequired(false)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    // Get user ID from the interaction
    const userId = interaction.user.id;

    // Defer
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.options.getBoolean("preferences")) {
      await clearUserPreferences(userId);
      await interaction.editReply("Your context history and user preferences have been cleared.");
    } else {
      // Only delete current_interaction_id
      await savePreferences(userId, "current_interaction_id", null);
      await interaction.editReply("Your context history has been cleared.");
    }
  },
};
