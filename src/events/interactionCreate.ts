import { Events, Interaction, MessageFlags } from "discord.js";

class UnauthorizedCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedCommandError";
  }
}

async function resolveApplicationOwnerId(interaction: Interaction): Promise<string | null> {
  const application = interaction.client.application;

  if (!application) return null;

  if (!application.owner) {
    await application.fetch().catch(() => null);
  }

  const owner = application.owner;
  if (!owner) return null;

  // Team applications expose ownerId, user-owned apps expose id.
  if ("ownerId" in owner) {
    return owner.ownerId ?? null;
  }

  return owner.id;
}

// CommonJS export
// taken from: https://discordjs.guide/legacy/app-creation/handling-commands#receiving-command-interactions
// Needed to recieve command interactions from user, this is ran on index.ts event loading
module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command?.autocomplete) {
        console.error(`No autocomplete handler for ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(error);
      }

      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }
    try {
      const ownerId = await resolveApplicationOwnerId(interaction);
      const isOwner = ownerId !== null && interaction.user.id === ownerId;

      if (!isOwner) {
        await interaction.reply({
          content: "You are not authorized to use this command.",
          flags: MessageFlags.Ephemeral,
        });
        throw new UnauthorizedCommandError(
          `Unauthorized slash command attempt by user ID: ${interaction.user.id}`,
        );
      }

      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (error instanceof UnauthorizedCommandError) return;

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
    }
  },
};
