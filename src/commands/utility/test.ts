import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("test")
    .setDescription("Test"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply("Test command executed!");
  },
};
