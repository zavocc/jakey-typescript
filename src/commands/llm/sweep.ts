import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { clearContext } from "../../lib/llm/chat/contextMemory";

export default {
  data: new SlashCommandBuilder()
    .setName("sweep")
    .setDescription("Clears the context history"),
  async execute(interaction: ChatInputCommandInteraction) {
    // Get user ID from the interaction
    const userId = interaction.user.id;

    // Clear the context for the user
    await clearContext(userId);

    // Reply to the user confirming the action
    await interaction.reply("Your context history has been cleared.");
  },
};
