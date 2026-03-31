import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { closeDB } from "../../lib/db/mongodb";

export default {
    data: new SlashCommandBuilder()
        .setName("shutdown")
        .setDescription("Shuts down the bot!"),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply("Shutting down...");
        // Use close method to shut down the bot
        await interaction.client.destroy();
        console.log("Bot has been shut down.");
        // Close DB connection if open
        // TODO: To centralize services
        await closeDB();
        process.exit(0);
    },
};
