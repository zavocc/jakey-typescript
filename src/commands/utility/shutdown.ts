import logger from "../../lib/pinoLogger.js";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { stopServices } from "../../lib/services/index.js";

const childLogger = logger.child({ module: "commands.utility.shutdown" });

export default {
  data: new SlashCommandBuilder()
    .setName("shutdown")
    .setDescription("Shuts down the bot!"),
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.reply("Shutting down...");
    } catch (error) {
      // log it instead
      childLogger.error({ err: error }, "Failed to send message due to timeout, still proceeding anyway");
    }
    // Use close method to shut down the bot
    await interaction.client.destroy();

    // Stop all services before exiting
    await stopServices();

    // Successfully shut down
    console.log("Bot has been shut down.");
    process.exit(0);
  },
};
