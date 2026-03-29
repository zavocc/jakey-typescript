import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong!"),
    async execute(interaction: ChatInputCommandInteraction) {
        // log the ms
        const startTime = Date.now();

        await interaction.reply("Pong!");
        const endTime = Date.now();
        const ping = endTime - startTime;

        await interaction.editReply(`Pong! Latency: ${ping}ms`);
    },
};
