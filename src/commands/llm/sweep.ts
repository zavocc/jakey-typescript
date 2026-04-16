import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { clearContext } from "../../lib/llm/chat/contextMemory";

// for resetting preferences
import { clearUserPreferences } from "../../lib/preferencesDBLoader";

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

    // Clear the context for the user
    await clearContext(userId);

    if (interaction.options.getBoolean("preferences")) {
      await clearUserPreferences(userId);
      await interaction.reply("Your context history and user preferences have been cleared.");
    } else {
      await interaction.reply("Your context history has been cleared.");
    }
  },
};
