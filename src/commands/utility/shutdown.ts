import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { stopServices } from "../../lib/services/services";

export default {
  data: new SlashCommandBuilder()
    .setName("shutdown")
    .setDescription("Shuts down the bot!"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply("Shutting down...");
    // Use close method to shut down the bot
    await interaction.client.destroy();
    
    // Stop all services before exiting
    await stopServices();

    // Successfully shut down
    console.log("Bot has been shut down.");
    process.exit(0);
  },
};
