import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("leaveall")
    .setDescription("BETA INTERNAL"),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const keepIds = [
      "1264228356778623027",
      "1146369774490759208",
      "1051120439461683270",
    ];

    const guilds = interaction.client.guilds.cache.filter(
      (guild) => !keepIds.includes(guild.id),
    );

    let leftCount = 0;
    let failedCount = 0;

    for (const guild of guilds.values()) {
      try {
        await guild.leave();
        leftCount++;
      } catch {
        failedCount++;
      }
    }

    await interaction.editReply(
      `Done. Left ${leftCount} guild(s). Failed: ${failedCount}. Kept: ${keepIds.length}.`,
    );
  },
};
